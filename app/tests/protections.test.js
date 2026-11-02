import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../server/store.js";
const range = { r: 1,r2: 3,c: 1,c2: 2 };
function fixture() {
  const store = createStore(":memory:"), owner = { id:"owner",email:"owner@example.com",name:"Owner" }, editor = { id:"editor",email:"editor@example.com",name:"Editor" }, peer = { id:"peer",email:"peer@example.com",name:"Peer" };
  for (const user of [owner,editor,peer]) store.db.prepare("INSERT INTO users VALUES(?,?,?,?)").run(user.id,user.email,user.name,"hash");
  const doc = store.createDoc(owner), sheetId = doc.state.sheets[0].id;
  for (const user of [editor,peer]) store.db.prepare("INSERT INTO permissions VALUES(?,?,?)").run(doc.id,user.email,"editor");
  const apply = (op,user=owner) => store.apply(doc.id,user,{ sheetId,...op }), read=()=>store.getDoc(doc.id);
  const protect = (patch={},user=owner) => apply({type:"protection-set",protection:{type:"range",sheetId,range,description:"Budget",warningOnly:false,editors:[owner.email],exceptions:[],...patch}},user);
  return {store,owner,editor,peer,doc,sheetId,apply,read,protect};
}
test("server protection checks every cell and formatting patch atomically, permits owner and chosen editors and checks revoked access",()=>{
  const f=fixture();try{
    f.apply({type:"cells",changes:[{key:"1,1",cell:{value:"Original"}}]});f.protect();const before=f.read();
    for(const cell of [{value:"blocked"},{style:{bold:true}},null]) {
      assert.throws(()=>f.apply({type:"cells",changes:[{key:"0,0",cell:{value:"must roll back"}},{key:"1,1",cell}]},f.editor),/защищён/);assert.deepEqual(f.read(),before);
    }
    f.apply({type:"cells",changes:[{key:"1,1",cell:{value:"Owner"}}]});
    let rule=f.read().state.protections[0];f.apply({type:"protection-set",id:rule.id,expected:rule,protection:{...rule,editors:[f.editor.email]}});
    f.apply({type:"cells",changes:[{key:"1,1",cell:{value:"Editor"}}]},f.editor);
    f.store.db.prepare("UPDATE permissions SET role='viewer' WHERE email=?").run(f.editor.email);
    assert.throws(()=>f.apply({type:"cells",changes:[{key:"1,1",cell:{value:"Revoked"}}]},f.editor),/Недостаточно прав/);
    assert.equal(f.read().state.sheets[0].cells["1,1"].value,"Editor");
  }finally{f.store.db.close();}
});
test("whole-sheet exceptions allow input but overlapping protections, merge, rules, import, deletion and restore cannot bypass restrictions",()=>{
  const f=fixture();try{
    f.protect({type:"sheet",range:undefined,exceptions:[{r:0,r2:0,c:0,c2:1}]});
    f.apply({type:"cells",changes:[{key:"0,0",cell:{value:"allowed"}}]},f.editor);
    const before=f.read();
    for(const op of [
      {type:"cells",changes:[{key:"0,2",cell:{value:"blocked"}}]},
      {type:"merge",range:{r:0,r2:0,c:1,c2:2},mode:"all",action:"merge"},
      {type:"validation-set",rule:{type:"list",range:{r:1,r2:1,c:0,c2:0},values:["One"],reject:false}},
      {type:"import-range",changes:[{key:"1,0",cell:{value:"imported"}}],merges:[]},
      {type:"structure",axis:"row",action:"delete",index:1,count:1},
      {type:"resize",col:0,width:180},
      {type:"restore",revision:0,expectedRevision:before.revision},
      {type:"protection-set",protection:{type:"range",range,description:"Bypass",sheetId:f.sheetId,editors:[f.editor.email],warningOnly:false,exceptions:[]}},
    ]){assert.throws(()=>f.apply(op,f.editor),/защит|защищ|защиты/);assert.deepEqual(f.read(),before);}
    f.protect({range:{r:0,r2:0,c:0,c2:0}});assert.throws(()=>f.apply({type:"cells",changes:[{key:"0,0",cell:{value:"overlap"}}]},f.editor),/защищ/);
    f.apply({type:"cells",changes:[{key:"1,1",cell:{value:"owner"}}]});
  }finally{f.store.db.close();}
});
test("warning-only protection requires fresh acknowledgement and does not grant access to a restricted overlap",()=>{
  const f=fixture();try{
    f.protect({warningOnly:true});const before=f.read(),op={type:"cells",changes:[{key:"1,1",cell:{value:"confirmed"}}]};
    assert.throws(()=>f.apply(op,f.editor),error=>error.code==="protection_warning"&&error.revision===before.revision&&error.protectionWarnings.length===1);assert.deepEqual(f.read(),before);
    f.apply({...op,protectionAcknowledgement:before.revision},f.editor);
    assert.throws(()=>f.apply({...op,changes:[{key:"1,1",cell:{value:"stale"}}],protectionAcknowledgement:before.revision},f.editor),error=>error.code==="protection_warning");
    f.protect();assert.throws(()=>f.apply({...op,changes:[{key:"1,1",cell:{value:"bypass"}}],protectionAcknowledgement:f.read().revision},f.editor),error=>error.code==="protected_range");
  }finally{f.store.db.close();}
});
test("protections follow structure and named ranges, survive deleting a name, reject stale updates and cannot be removed by an unlisted editor",()=>{
  const f=fixture();try{
    f.apply({type:"named-range-set",namedRange:{name:"Budget",sheetId:f.sheetId,range}});let named=f.read().state.namedRanges[0];
    f.protect({namedRangeId:named.id});let rule=f.read().state.protections[0];
    assert.throws(()=>f.apply({type:"protection-delete",id:rule.id,expected:rule},f.editor),/защит/);
    f.apply({type:"named-range-set",namedRange:{name:"InputArea",sheetId:f.sheetId,range:{r:6,r2:7,c:1,c2:2}}});let input=f.read().state.namedRanges.find(item=>item.name==="InputArea");
    f.protect({description:"Editor area",namedRangeId:input.id,editors:[f.editor.email]});
    assert.throws(()=>f.apply({type:"named-range-set",id:input.id,expected:input,namedRange:{...input,range}},f.editor),/защищ/);
    assert.throws(()=>f.apply({type:"named-range-set",id:named.id,expected:named,namedRange:{...named,range:{r:5,r2:6,c:1,c2:2}}},f.editor),/защит/);
    f.apply({type:"structure",axis:"row",action:"insert",index:0,count:1},f.editor);named=f.read().state.namedRanges[0];assert.equal(named.range.r,2);
    f.apply({type:"named-range-delete",id:named.id,expected:named},f.editor);rule=f.read().state.protections[0];assert(!rule.namedRangeId);assert.equal(rule.range.r,2);
    f.apply({type:"protection-set",id:rule.id,expected:rule,protection:{...rule,description:"Updated"}});
    assert.throws(()=>f.apply({type:"protection-delete",id:rule.id,expected:rule}),/изменена/);
    const latest=f.read().state.protections[0];f.apply({type:"protection-delete",id:latest.id,expected:latest});assert(!f.read().state.protections.some(item=>item.id===latest.id));
  }finally{f.store.db.close();}
});
test("restoring only protection metadata cannot add a new restriction over a range the editor cannot manage",()=>{
  const f=fixture();try{
    f.protect();f.protect({description:"Historical overlap"});const historical=f.read(),extra=historical.state.protections[1];
    f.apply({type:"protection-delete",id:extra.id,expected:extra});const before=f.read();
    assert.throws(()=>f.apply({type:"restore",revision:historical.revision,expectedRevision:before.revision},f.editor),/защищён/);assert.deepEqual(f.read(),before);
    f.apply({type:"restore",revision:historical.revision,expectedRevision:before.revision});assert.equal(f.read().state.protections.length,2);
  }finally{f.store.db.close();}
});
test("implicit growth beyond the current grid and restoring blank grid dimensions cannot bypass sheet or whole-column protection",()=>{
  for(const type of ["sheet","range","named"]){
    const f=fixture();try{
      if(type==="named") {
        f.apply({type:"named-range-set",namedRange:{name:"FullColumn",sheetId:f.sheetId,range:{r:0,r2:999,c:1,c2:1},allRows:true}});const named=f.read().state.namedRanges[0];
        f.protect({namedRangeId:named.id});f.apply({type:"named-range-delete",id:named.id,expected:named});assert(f.read().state.protections[0].allRows);
      }else f.protect(type==="sheet"?{type:"sheet",range:undefined}:{allRows:true,range:{r:0,r2:999,c:1,c2:1}});
      const historical=f.read();
      for(const op of [{type:"cells",changes:[{key:"2000,1",cell:{value:"Bypass"}}]},{type:"import-range",changes:[{key:"2000,1",cell:{value:"Bypass"}}],merges:[]}]){assert.throws(()=>f.apply(op,f.editor),/защищён/);assert.deepEqual(f.read(),historical);}
      f.apply({type:"grow",rows:100});const before=f.read();
      assert.throws(()=>f.apply({type:"restore",revision:historical.revision,expectedRevision:before.revision},f.editor),/защищён/);assert.deepEqual(f.read(),before);
      f.apply({type:"restore",revision:historical.revision,expectedRevision:before.revision});assert.equal(f.read().state.sheets[0].rows,1000);
    }finally{f.store.db.close();}
  }
});
