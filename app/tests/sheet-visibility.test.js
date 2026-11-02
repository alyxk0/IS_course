import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../server/store.js";
import { formulaEngine } from "../shared/formulaEngine.js";
import { exportWorkbook } from "../src/files.js";
import ExcelJS from "exceljs";
function fixture(){
 const store=createStore(":memory:"),owner={id:"owner",email:"owner@example.com",name:"Owner"},editor={id:"editor",email:"editor@example.com",name:"Editor"},viewer={id:"viewer",email:"viewer@example.com",name:"Viewer"};
 for(const user of [owner,editor,viewer])store.db.prepare("INSERT INTO users VALUES(?,?,?,?)").run(user.id,user.email,user.name,"hash");
 const doc=store.createDoc(owner),first=doc.state.sheets[0].id;
 for(const [user,role]of[[editor,"editor"],[viewer,"viewer"]])store.db.prepare("INSERT INTO permissions VALUES(?,?,?)").run(doc.id,user.email,role);
 const read=()=>store.getDoc(doc.id),apply=(op,user=owner)=>store.apply(doc.id,user,{sheetId:first,...op});
 apply({type:"sheet-add"});return{store,owner,editor,viewer,first,second:read().state.sheets[1].id,read,apply};
}
test("hidden sheets retain formulas, names and data; every mutation leaves a visible sheet",()=>{
 const f=fixture();try{
  f.apply({type:"cells",changes:[{key:"0,0",cell:{value:"7"}}]});f.apply({type:"cells",sheetId:f.second,changes:[{key:"0,0",cell:{value:"=Лист1!A1*2"}}]});
  f.apply({type:"named-range-set",namedRange:{name:"Исходные",sheetId:f.first,range:{r:0,r2:0,c:0,c2:0}}});
  f.apply({type:"sheet-visibility",hidden:true},f.editor);const before=f.read();assert.equal(before.state.sheets[0].hidden,true);assert.equal(before.state.namedRanges[0].range.r,0);
  const engine=formulaEngine(before.state);try{assert.equal(engine.getCellValue({sheet:engine.getSheetId("Лист2"),row:0,col:0}),14);}finally{engine.destroy();}
  for(const op of [{type:"sheet-visibility",sheetId:f.second,hidden:true},{type:"sheet-delete",sheetId:f.second}]){assert.throws(()=>f.apply(op),/видимый лист/);assert.deepEqual(f.read(),before);}
  for(const hidden of [null,1,"true",undefined])assert.throws(()=>f.apply({type:"sheet-visibility",hidden}),/Неверные/);
  f.apply({type:"sheet-visibility",hidden:false});assert.equal(f.read().state.sheets[0].cells["0,0"].value,"7");
  f.apply({type:"sheet-visibility",hidden:true});f.apply({type:"sheet-delete"});assert.equal(f.read().state.sheets.length,1);
 }finally{f.store.db.close();}
});
test("visibility obeys current role and sheet protections including restore; range protection remains a cell restriction",()=>{
 const f=fixture();try{
  assert.throws(()=>f.apply({type:"sheet-visibility",hidden:true},f.viewer),/Недостаточно прав/);
  f.apply({type:"protection-set",protection:{type:"range",sheetId:f.first,range:{r:0,r2:0,c:0,c2:0},description:"Cell",warningOnly:false,editors:[f.owner.email],exceptions:[]}});
  f.apply({type:"sheet-visibility",hidden:true},f.editor);f.apply({type:"sheet-visibility",hidden:false},f.editor);
  f.apply({type:"protection-set",protection:{type:"sheet",sheetId:f.first,description:"Sheet",warningOnly:false,editors:[f.owner.email],exceptions:[]}});
  const visible=f.read();assert.throws(()=>f.apply({type:"sheet-visibility",hidden:true},f.editor),/защищён/);assert.deepEqual(f.read(),visible);
  f.apply({type:"sheet-visibility",hidden:true});const hidden=f.read();assert.throws(()=>f.apply({type:"sheet-visibility",hidden:false},f.editor),/защищён/);
  assert.throws(()=>f.apply({type:"restore",revision:visible.revision,expectedRevision:hidden.revision},f.editor),/защищён/);assert.deepEqual(f.read(),hidden);
  f.apply({type:"restore",revision:visible.revision,expectedRevision:hidden.revision});assert.equal(f.read().state.sheets[0].hidden,false);
  f.store.db.prepare("UPDATE permissions SET role='commenter' WHERE email=?").run(f.editor.email);assert.throws(()=>f.apply({type:"sheet-visibility",hidden:true},f.editor),/Недостаточно прав/);
 }finally{f.store.db.close();}
});
test("XLSX stores native hidden worksheet state alongside its formulas and visible worksheets",async()=>{
 const f=fixture();try{
  f.apply({type:"cells",changes:[{key:"0,0",cell:{value:"7"}}]});f.apply({type:"sheet-visibility",hidden:true});
  const book=new ExcelJS.Workbook();await book.xlsx.load(await exportWorkbook(f.read(),()=>7));
  assert.equal(book.worksheets[0].state,"hidden");assert.equal(book.worksheets[1].state,"visible");assert.equal(book.worksheets[0].getCell("A1").value,7);
 }finally{f.store.db.close();}
});
