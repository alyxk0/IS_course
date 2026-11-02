import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../server/store.js";
import { formulaEngine } from "../shared/formulaEngine.js";
import { duplicateSheet, duplicateSheetName } from "../server/duplicateSheet.js";
import { namedRangeDisplay } from "../shared/namedRanges.js";
import { relocateClipboard, captureClipboard } from "../src/clipboard.js";
import { exportWorkbook } from "../src/files.js";
import ExcelJS from "exceljs";
import JSZip from "jszip";
function fixture(){
 const store=createStore(":memory:"),owner={id:"owner",email:"owner@example.com",name:"Owner"},editor={id:"editor",email:"editor@example.com",name:"Editor"};for(const u of[owner,editor])store.db.prepare("INSERT INTO users VALUES(?,?,?,?)").run(u.id,u.email,u.name,"hash");
 const doc=store.createDoc(owner),source=doc.state.sheets[0].id;store.db.prepare("INSERT INTO permissions VALUES(?,?,?)").run(doc.id,editor.email,"editor");
 const read=()=>store.getDoc(doc.id),apply=(op,user=owner)=>store.apply(doc.id,user,{sheetId:source,...op});apply({type:"sheet-rename",name:"Шаблон"});apply({type:"sheet-add"});const other=read().state.sheets[1].id;
 const value=(sheetId,row,col)=>{const engine=formulaEngine(read().state);try{const sheet=read().state.sheets.find(s=>s.id===sheetId);const v=engine.getCellValue({sheet:engine.getSheetId(sheet.name),row,col});return v&&typeof v==="object"?v.value:v;}finally{engine.destroy();}};
 return{store,owner,editor,source,other,apply,read,value};
}
test("duplicate sheets deep-copy features and allocate independent IDs, unique bounded names and visible neighbours",()=>{
 const state={sheets:[{id:"a",name:"😀".repeat(30),cells:{"0,0":{value:"7",style:{bold:true}}},rows:1000,cols:26,widths:{0:130},heights:{0:35},frozen:1,frozenCols:1,hideGridlines:true,tabColor:"#ff0000",merges:[{r:2,r2:2,c:0,c2:1}],filter:{range:{r:0,r2:1,c:0,c2:1},criteria:{}},charts:[{id:"chart",range:{r:0,r2:1,c:0,c2:1}}],validations:[{id:"validation",values:["One"]}],conditionalFormats:[{id:"condition"}],bandedRanges:[{id:"band"}]}]};
 const copy=duplicateSheet(state,"a","copy"),source=state.sheets[0];assert.equal(state.sheets[1],copy);assert.equal(copy.name.length<=60,true);assert.equal(/[\ud800-\udbff]$/.test(copy.name),false);
 for(const prop of["rows","cols","frozen","frozenCols","hideGridlines","tabColor","widths","heights","merges","filter"])assert.deepEqual(copy[prop],source[prop]);
 for(const property of["charts","validations","conditionalFormats","bandedRanges"])assert.notEqual(copy[property][0].id,source[property][0].id);
 copy.cells["0,0"].style.bold=false;copy.validations[0].values.push("Two");assert.equal(source.cells["0,0"].style.bold,true);assert.deepEqual(source.validations[0].values,["One"]);
 assert.notEqual(duplicateSheet(state,"a","copy2").name,copy.name);assert.throws(()=>duplicateSheet(state,"a","copy"),/идентификатор/);assert.equal(duplicateSheetName("Лист1",[]),"Копия листа Лист1");
 state.sheets=Array.from({length:30},(_,i)=>({...source,id:String(i)}));assert.throws(()=>duplicateSheet(state,"0"),/30/);
});
test("copy scoped names compute locally, rename independently and survive clipboard, structure and original-sheet deletion",()=>{
 const f=fixture();try{
  f.apply({type:"cells",sheetId:f.other,changes:[{key:"0,0",cell:{value:"5"}}]});
  for(const[name,sheetId]of[["Доход",f.source],["Общий",f.other]])f.apply({type:"named-range-set",namedRange:{name,sheetId,range:{r:0,r2:0,c:0,c2:0}}});
  f.apply({type:"cells",changes:[{key:"0,0",cell:{value:"7"}},{key:"0,1",cell:{value:"=A1*2"}},{key:"0,2",cell:{value:"=Доход+Общий"}},{key:"0,3",cell:{value:"='Шаблон'!Доход+Доход"}},{key:"0,4",cell:{value:'="Доход"'}},{key:"0,5",cell:{value:"='Шаблон'!A1"}},{key:"0,6",cell:{value:"=Доход",literal:true}}]});
  f.apply({type:"sheet-duplicate",newSheetId:"copy"},f.editor);let doc=f.read(),copy=doc.state.sheets.find(s=>s.id==="copy"),local=doc.state.namedRanges.find(n=>n.scopeSheetId==="copy");assert.equal(local.name,"Доход");assert.equal(local.sheetId,"copy");assert.equal(doc.state.namedRanges.length,3);
  f.apply({type:"cells",sheetId:"copy",changes:[{key:"0,0",cell:{value:"10"}}]},f.editor);assert.equal(f.value("copy",0,1),20);assert.equal(f.value("copy",0,2),15);assert.equal(f.value("copy",0,3),20);assert.equal(f.value("copy",0,4),"Доход");assert.equal(f.value("copy",0,5),7);assert.equal(f.value("copy",0,6),"=Доход");assert.equal(f.value(f.source,0,2),12);
  f.apply({type:"named-range-set",id:local.id,expected:local,namedRange:{...local,name:"ДоходКопии"}});assert.equal(f.value("copy",0,2),15);assert.match(f.read().state.sheets.find(s=>s.id==="copy").cells["0,2"].value,/ДоходКопии/);assert.equal(f.value(f.source,0,2),12);
  f.apply({type:"sheet-rename",sheetId:"copy",name:"O'Brien"});assert.equal(f.value("copy",0,2),15);assert.match(f.read().state.sheets.find(s=>s.id==="copy").cells["0,2"].value,/O''Brien/);
  doc=f.read();copy=doc.state.sheets.find(s=>s.id==="copy");const pasted=relocateClipboard(captureClipboard(copy,{r:0,r2:0,c:2,c2:2}),doc.state.sheets.find(s=>s.id===f.other),{r:2,c:0},doc.state.sheets,doc.state.namedRanges);f.apply({type:"cells",sheetId:f.other,changes:pasted.changes});assert.equal(f.value(f.other,2,0),15);
  f.apply({type:"structure",sheetId:"copy",axis:"row",action:"insert",index:0,count:1});assert.equal(f.value("copy",1,2),15);assert.equal(f.value(f.other,2,0),15);
  f.apply({type:"sheet-duplicate",sheetId:"copy",newSheetId:"copy2"});f.apply({type:"cells",sheetId:"copy2",changes:[{key:"1,0",cell:{value:"20"}}]});assert.equal(f.value("copy2",1,2),25);assert.equal(f.value("copy",1,2),15);
  f.apply({type:"sheet-delete",sheetId:"copy"});assert.equal(f.value(f.other,2,0),"#REF!");assert.equal(f.value("copy2",1,2),25);
 }finally{f.store.db.close();}
});
test("copying protected data leaves original restrictions intact, carries warnings and enforces current role and atomic limits",()=>{
 const f=fixture();try{
  f.apply({type:"protection-set",protection:{type:"sheet",sheetId:f.source,description:"Locked",warningOnly:false,editors:[f.owner.email],exceptions:[]}});
  f.apply({type:"protection-set",protection:{type:"range",sheetId:f.source,description:"Warning",range:{r:2,r2:2,c:0,c2:0},warningOnly:true,editors:[f.owner.email],exceptions:[]}});
  const original=f.read();f.apply({type:"sheet-duplicate",newSheetId:"copy"},f.editor);const doc=f.read();assert.deepEqual(doc.state.sheets.find(s=>s.id===f.source),original.state.sheets[0]);assert.deepEqual(doc.state.protections.filter(p=>p.sheetId===f.source),original.state.protections);
  assert.equal(doc.state.protections.filter(p=>p.sheetId==="copy").length,1);assert.equal(doc.state.protections.find(p=>p.sheetId==="copy").warningOnly,true);
  f.apply({type:"cells",sheetId:"copy",changes:[{key:"0,0",cell:{value:"editable copy"}}]},f.editor);assert.throws(()=>f.apply({type:"cells",changes:[{key:"0,0",cell:{value:"blocked"}}]},f.editor),/защищён/);
  assert.throws(()=>f.apply({type:"cells",sheetId:"copy",changes:[{key:"2,0",cell:{value:"warning"}}]},f.editor),error=>error.code==="protection_warning");
  for(const role of["viewer","commenter"]){f.store.db.prepare("UPDATE permissions SET role=? WHERE email=?").run(role,f.editor.email);assert.throws(()=>f.apply({type:"sheet-duplicate"},f.editor),/Недостаточно прав/);}
  const before=f.read();assert.throws(()=>f.apply({type:"sheet-duplicate",newSheetId:"copy"}),/идентификатор/);assert.deepEqual(f.read(),before);
 }finally{f.store.db.close();}
});
test("XLSX writes sheet-local definitions against the physical worksheet index including helper sheets",async()=>{
 const f=fixture();try{
  f.apply({type:"named-range-set",namedRange:{name:"Доход",sheetId:f.source,range:{r:0,r2:0,c:0,c2:0}}});f.apply({type:"validation-set",rule:{type:"list",range:{r:2,r2:2,c:0,c2:0},values:["One","Two"],reject:false}});f.apply({type:"sheet-duplicate",newSheetId:"copy"});
  const doc=f.read(),buffer=await exportWorkbook(doc,()=>0),book=new ExcelJS.Workbook();await book.xlsx.load(buffer);
  const copy=doc.state.sheets.find(s=>s.id==="copy"),index=book.worksheets.findIndex(s=>s.name===copy.name),zip=await JSZip.loadAsync(buffer),xml=await zip.file("xl/workbook.xml").async("string");
  assert.match(xml,new RegExp(`name="Доход" localSheetId="${index}"`));assert.match(xml,/Копия листа/);assert.equal(namedRangeDisplay(doc.state.namedRanges.find(n=>n.scopeSheetId==="copy"),doc.state.sheets),`'${copy.name}'!Доход`);
 }finally{f.store.db.close();}
});
test("deleting a local name never silently redirects a bare formula to the global original",()=>{
 const f=fixture();try{
  f.apply({type:"cells",changes:[{key:"0,0",cell:{value:"7"}}]});f.apply({type:"named-range-set",namedRange:{name:"Доход",sheetId:f.source,range:{r:0,r2:0,c:0,c2:0}}});f.apply({type:"sheet-duplicate",newSheetId:"copy"});
  f.apply({type:"cells",sheetId:"copy",changes:[{key:"0,0",cell:{value:"10"}},{key:"0,1",cell:{value:"=Доход"}}]});assert.equal(f.value("copy",0,1),10);
  const local=f.read().state.namedRanges.find(n=>n.scopeSheetId==="copy");f.apply({type:"named-range-delete",id:local.id,expected:local});assert.equal(f.value("copy",0,1),"#NAME?");assert.equal(f.value(f.source,0,0),7);
 }finally{f.store.db.close();}
});
test("copied warning ranges bind to copied names or detach with full-column coverage when the name belongs to another scope",()=>{
 const range={r:0,r2:999,c:0,c2:0},state={sheets:[{id:"source",name:"Source",rows:1000,cols:26,cells:{}},{id:"other",name:"Other",rows:1000,cols:26,cells:{}}],namedRanges:[{id:"global",name:"Income",sheetId:"source",range,allRows:true},{id:"foreign",name:"Foreign",sheetId:"source",scopeSheetId:"other",range,allRows:true}],protections:[{id:"w1",sheetId:"source",type:"range",range,namedRangeId:"global",warningOnly:true,description:"Own name",editors:[],exceptions:[]},{id:"w2",sheetId:"source",type:"range",range,namedRangeId:"foreign",warningOnly:true,description:"Foreign name",editors:[],exceptions:[]}]};
 duplicateSheet(state,"source","copy");const local=state.namedRanges.find(n=>n.scopeSheetId==="copy"),warnings=state.protections.filter(p=>p.sheetId==="copy");assert.equal(warnings[0].namedRangeId,local.id);assert.notEqual(warnings[0].id,"w1");assert.equal(warnings[1].namedRangeId,undefined);assert.equal(warnings[1].allRows,true);assert.deepEqual(warnings[1].range,range);assert.equal(state.protections[1].namedRangeId,"foreign");
});
test("sheet IDs differing only by case keep separate local-name namespaces",()=>{
 const f=fixture();try{
  f.apply({type:"cells",changes:[{key:"0,0",cell:{value:"7"}},{key:"0,1",cell:{value:"=Доход"}}]});f.apply({type:"named-range-set",namedRange:{name:"Доход",sheetId:f.source,range:{r:0,r2:0,c:0,c2:0}}});
  for(const[id,value]of[["Copy","10"],["copy","20"]]){f.apply({type:"sheet-duplicate",newSheetId:id});f.apply({type:"cells",sheetId:id,changes:[{key:"0,0",cell:{value}}]});}
  assert.equal(f.value("Copy",0,1),10);assert.equal(f.value("copy",0,1),20);assert.equal(f.value(f.source,0,1),7);
 }finally{f.store.db.close();}
});
