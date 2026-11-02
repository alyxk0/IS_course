import { test } from "node:test";
import assert from "node:assert/strict";
import { freezePatch, shiftFrozen, frozenColumnLeft } from "../shared/sheetView.js";
import { normalizeView } from "../src/viewPreferences.js";
import { createStore } from "../server/store.js";
import { exportWorkbook } from "../src/files.js";
import ExcelJS from "exceljs";
test("XLSX exports native two-axis frozen panes and hidden gridlines",async()=>{
  const book=new ExcelJS.Workbook();
  await book.xlsx.load(await exportWorkbook({state:{sheets:[{id:"s",name:"Sheet",rows:1000,cols:26,widths:{},cells:{"0,0":{value:"42"}},frozen:11,frozenCols:8,hideGridlines:true}]}},()=>42));
  assert.equal(book.worksheets[0].views[0].xSplit,8);assert.equal(book.worksheets[0].views[0].ySplit,11);assert.equal(book.worksheets[0].views[0].showGridLines,false);
});
test("freeze axes preserve each other, accept selection extents and reject invalid counts or split merges",()=>{
  const sheet={rows:1000,cols:26,frozen:3,frozenCols:2,widths:{0:180},merges:[]};
  assert.deepEqual(freezePatch(sheet,{rows:11}),{frozen:11,frozenCols:2});
  assert.deepEqual(freezePatch(sheet,{cols:8}),{frozen:3,frozenCols:8});
  for(const patch of [{},{rows:null},{cols:1.5},{rows:1001},{cols:-1}])assert.throws(()=>freezePatch(sheet,patch));
  sheet.merges=[{r:4,r2:6,c:3,c2:5}];
  assert.throws(()=>freezePatch(sheet,{rows:5}),/объедин/);assert.throws(()=>freezePatch(sheet,{cols:4}),/объедин/);
  assert.equal(frozenColumnLeft(sheet,2),326);
  shiftFrozen(sheet,"row",1,4,false);assert.equal(sheet.frozen,7);
  shiftFrozen(sheet,"row",5,9,true);assert.equal(sheet.frozen,5);
  shiftFrozen(sheet,"col",0,4,true);assert.equal(sheet.frozenCols,0);
});
test("sheet display and both freeze axes persist, shift with structure and obey protected sheet permissions",()=>{
  const store=createStore(":memory:"),owner={id:"owner",email:"owner@example.com",name:"Owner"},editor={id:"editor",email:"editor@example.com",name:"Editor"};
  try{
    for(const user of [owner,editor])store.db.prepare("INSERT INTO users VALUES(?,?,?,?)").run(user.id,user.email,user.name,"hash");
    const doc=store.createDoc(owner),sheetId=doc.state.sheets[0].id;
    store.db.prepare("INSERT INTO permissions VALUES(?,?,?)").run(doc.id,editor.email,"editor");
    const apply=(op,user=owner)=>store.apply(doc.id,user,{sheetId,...op}),sheet=()=>store.getDoc(doc.id).state.sheets[0];
    apply({type:"freeze",rows:11,cols:8});apply({type:"sheet-display",hideGridlines:true});
    assert.equal(sheet().frozen,11);assert.equal(sheet().frozenCols,8);assert.equal(sheet().hideGridlines,true);
    apply({type:"structure",axis:"col",action:"insert",index:2,count:2});assert.equal(sheet().frozenCols,10);
    apply({type:"structure",axis:"row",action:"delete",index:9,count:5});assert.equal(sheet().frozen,9);
    apply({type:"freeze",rows:0});assert.equal(sheet().frozenCols,10);
    for(const op of [{type:"merge",range:{r:0,r2:0,c:9,c2:10},mode:"all",action:"merge"},{type:"import-range",changes:[],merges:[{r:0,r2:0,c:9,c2:10}]}])assert.throws(()=>apply(op),/закреп/);
    apply({type:"protection-set",protection:{type:"sheet",sheetId,description:"View",warningOnly:false,editors:[owner.email],exceptions:[]}});
    for(const op of [{type:"freeze",cols:0},{type:"sheet-display",hideGridlines:false}])assert.throws(()=>apply(op,editor),/защищён/);
    const revision=store.getDoc(doc.id).revision;apply({type:"freeze",cols:0});apply({type:"sheet-display",hideGridlines:false});
    const before=store.getDoc(doc.id);assert.throws(()=>apply({type:"restore",revision,expectedRevision:before.revision},editor),/защищён/);assert.deepEqual(store.getDoc(doc.id),before);
    store.db.prepare("UPDATE permissions SET role='viewer' WHERE email=?").run(editor.email);
    assert.throws(()=>apply({type:"sheet-display",hideGridlines:false},editor),/Недостаточно прав/);
  }finally{store.db.close();}
});
test("view preferences validate persisted values without trusting unrelated keys",()=>{
  assert.deepEqual(normalizeView({formulas:true,formulaBar:false,comments:"none",protections:"yes",unknown:true}),{formulas:true,formulaBar:false,comments:"none",protections:false});
  assert.equal(normalizeView(null).formulaBar,true);
});
