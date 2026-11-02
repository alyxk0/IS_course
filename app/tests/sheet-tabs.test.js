import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../server/store.js";
import { formulaEngine } from "../shared/formulaEngine.js";
import { exportWorkbook } from "../src/files.js";
import { normalizeTabColor, moveSheet, tabMoveTarget } from "../shared/sheetTabs.js";
import ExcelJS from "exceljs";
function fixture(){
 const store=createStore(":memory:"),owner={id:"owner",email:"owner@example.com",name:"Owner"},editor={id:"editor",email:"editor@example.com",name:"Editor"};
 for(const user of [owner,editor])store.db.prepare("INSERT INTO users VALUES(?,?,?,?)").run(user.id,user.email,user.name,"hash");
 const doc=store.createDoc(owner);store.db.prepare("INSERT INTO permissions VALUES(?,?,?)").run(doc.id,editor.email,"editor");
 const read=()=>store.getDoc(doc.id),apply=(op,user=owner)=>store.apply(doc.id,user,op);
 for(let i=0;i<3;i++)apply({type:"sheet-add"});return{store,owner,editor,read,apply,ids:read().state.sheets.map(s=>s.id)};
}
test("stable-ID sheet moves preserve hidden sheets and reject stale targets; menu neighbours skip hidden tabs",()=>{
 const sheets=[{id:"a"},{id:"h",hidden:true},{id:"b"},{id:"c"}];
 assert.equal(tabMoveTarget(sheets,"a",1).id,"b");assert.equal(tabMoveTarget(sheets,"c",-1).id,"b");assert.equal(tabMoveTarget(sheets,"a",-1),null);assert.equal(tabMoveTarget(sheets,"h",1),null);
 assert.deepEqual(moveSheet(sheets,"a","c","after").map(s=>s.id),["h","b","c","a"]);assert.deepEqual(sheets.map(s=>s.id),["a","h","b","c"]);
 for(const args of [["missing","a","before"],["a","missing","after"],["a","a","before"],["a","b","left"]])assert.throws(()=>moveSheet(sheets,...args));
 assert.equal(normalizeTabColor("#Ab12CD"),"#ab12cd");assert.equal(normalizeTabColor(null),null);
 for(const value of [undefined,"red","#abc","#12345678","url(x)",0,{}])assert.throws(()=>normalizeTabColor(value));
});
test("moves and tab colors persist without rewriting formulas, metadata or cross-sheet named references",()=>{
 const f=fixture();try{
  const[a,h,b,c]=f.ids;f.apply({type:"sheet-visibility",sheetId:h,hidden:true});
  f.apply({type:"cells",sheetId:a,changes:[{key:"0,0",cell:{value:"7",style:{bold:true}}}]});
  f.apply({type:"named-range-set",namedRange:{name:"Источник",sheetId:a,range:{r:0,r2:0,c:0,c2:0}}});
  f.apply({type:"cells",sheetId:b,changes:[{key:"0,0",cell:{value:"=Источник*2"}},{key:"1,0",cell:{value:"=Лист1!A1*3"}}]});
  f.apply({type:"comment",sheetId:a,key:"0,0",text:"Keep me"});f.apply({type:"sheet-color",sheetId:a,color:"#AB12CD"},f.editor);
  const before=f.read();f.apply({type:"sheet-move",sheetId:a,relativeTo:c,position:"after"},f.editor);const after=f.read();
  assert.deepEqual(after.state.sheets.map(s=>s.id),[h,b,c,a]);
  for(const sheet of before.state.sheets)assert.deepEqual(after.state.sheets.find(s=>s.id===sheet.id),sheet);
  assert.deepEqual(after.state.namedRanges,before.state.namedRanges);assert.deepEqual(after.state.comments,before.state.comments);
  const engine=formulaEngine(after.state);try{const id=engine.getSheetId("Лист3");assert.equal(engine.getCellValue({sheet:id,row:0,col:0}),14);assert.equal(engine.getCellValue({sheet:id,row:1,col:0}),21);}finally{engine.destroy();}
  f.apply({type:"sheet-color",sheetId:a,color:null});assert.equal(Object.hasOwn(f.read().state.sheets.find(s=>s.id===a),"tabColor"),false);
  const saved=f.read();for(const op of [{type:"sheet-color",sheetId:a,color:"bad"},{type:"sheet-move",sheetId:a,relativeTo:"deleted",position:"before"}]){assert.throws(()=>f.apply(op));assert.deepEqual(f.read(),saved);}
 }finally{f.store.db.close();}
});
test("current permissions and whole-sheet protections cover tab color, movement, and snapshot-only metadata restore",()=>{
 const f=fixture();try{
  const[a,,b,c]=f.ids,ops=[{type:"sheet-color",sheetId:a,color:"#ff0000"},{type:"sheet-move",sheetId:a,relativeTo:b,position:"after"}];
  f.apply({type:"protection-set",protection:{type:"range",sheetId:a,range:{r:0,r2:0,c:0,c2:0},description:"Cell",warningOnly:false,editors:[f.owner.email],exceptions:[]}});
  for(const op of ops)f.apply(op,f.editor);
  f.apply({type:"protection-set",protection:{type:"sheet",sheetId:a,description:"Sheet",warningOnly:false,editors:[f.owner.email],exceptions:[]}});
  const old=f.read();for(const op of ops)assert.throws(()=>f.apply(op,f.editor),/защищён/);
  f.apply({type:"sheet-move",sheetId:c,relativeTo:a,position:"before"},f.editor);
  const moved=f.read();assert.throws(()=>f.apply({type:"restore",revision:old.revision,expectedRevision:moved.revision},f.editor),/защищён/);
  f.apply({type:"restore",revision:old.revision,expectedRevision:moved.revision});
  f.apply({type:"sheet-color",sheetId:a,color:"#00ff00"});const colored=f.read();
  assert.throws(()=>f.apply({type:"restore",revision:old.revision,expectedRevision:colored.revision},f.editor),/защищён/);assert.deepEqual(f.read(),colored);
  for(const role of ["viewer","commenter"]){f.store.db.prepare("UPDATE permissions SET role=? WHERE email=?").run(role,f.editor.email);for(const op of ops)assert.throws(()=>f.apply(op,f.editor),/Недостаточно прав/);}
 }finally{f.store.db.close();}
});
test("XLSX exports worksheet ordering and native tab colors alongside hidden state",async()=>{
 const f=fixture();try{
  const[a,h,,c]=f.ids;f.apply({type:"sheet-color",sheetId:a,color:"#Ab12Cd"});f.apply({type:"sheet-visibility",sheetId:h,hidden:true});f.apply({type:"sheet-move",sheetId:c,relativeTo:a,position:"before"});
  const doc=f.read(),book=new ExcelJS.Workbook();await book.xlsx.load(await exportWorkbook(doc,()=>""));
  assert.deepEqual(book.worksheets.map(s=>s.name),doc.state.sheets.map(s=>s.name));assert.equal(book.getWorksheet("Лист1").properties.tabColor.argb,"FFab12cd");assert.equal(book.getWorksheet("Лист2").state,"hidden");
 }finally{f.store.db.close();}
});
