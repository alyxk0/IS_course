import {test,expect} from "@playwright/test";
import {io} from "socket.io-client";
test("sheet duplication clones rich content, scopes names, preserves original access and activates only the initiating collaborator",async({page,browser})=>{
 const editorContext=await browser.newContext(),viewerContext=await browser.newContext(),peer=await editorContext.newPage(),viewer=await viewerContext.newPage(),stamp=Date.now(),errors=[];
 for(const p of[page,peer,viewer])p.on("pageerror",e=>errors.push(e.message));
 try{
  for(const[client,name]of[[page.request,"owner"],[editorContext.request,"editor"],[viewerContext.request,"viewer"]])expect((await client.post("/api/auth/register",{data:{name,email:`copy-${name}-${stamp}@example.com`,password:"CopyPassword123"}})).ok()).toBeTruthy();
  const doc=await(await page.request.post("/api/documents",{data:{}})).json(),source=doc.state.sheets[0].id;
  for(const role of["editor","viewer"])await page.request.put(`/api/documents/${doc.id}/members`,{data:{email:`copy-${role}-${stamp}@example.com`,role}});
  async function write(client,operation){
   if(process.env.TEST_RUNTIME==="worker")return await(await client.post(`/api/documents/${doc.id}/operations`,{data:{operation,requestId:crypto.randomUUID()}})).json();
   const{cookies}=await client.storageState(),socket=io(test.info().project.use.baseURL,{transports:["websocket"],extraHeaders:{Cookie:cookies.map(c=>`${c.name}=${c.value}`).join("; ")},reconnection:false});
   try{await new Promise((resolve,reject)=>{socket.on("connect",resolve);socket.on("connect_error",reject);});await socket.timeout(10000).emitWithAck("join",doc.id);return await socket.timeout(10000).emitWithAck("operation",operation);}finally{socket.disconnect();}
  }
  const read=async()=>await(await page.request.get(`/api/documents/${doc.id}`)).json(),apply=async op=>expect((await write(page.request,{sheetId:source,...op})).ok).toBeTruthy();
  await apply({type:"sheet-rename",name:"Шаблон"});await apply({type:"sheet-add"});const other=(await read()).state.sheets[1].id;
  await apply({type:"named-range-set",namedRange:{name:"Доход",sheetId:source,range:{r:0,r2:0,c:0,c2:0}}});
  await apply({type:"cells",changes:[{key:"0,0",cell:{value:"7",style:{bold:true}}},{key:"0,1",cell:{value:"=A1*2"}},{key:"0,2",cell:{value:"=Доход*3"}},{key:"1,0",cell:{value:"9"}},{key:"1,1",cell:{value:"=A2*2"}}]});
  await apply({type:"cells",sheetId:other,changes:[{key:"0,0",cell:{value:"='Шаблон'!A1"}}]});
  for(const op of[
   {type:"resize",col:0,width:150},{type:"freeze",rows:1,cols:1},{type:"sheet-color",color:"#ff0000"},{type:"sheet-display",hideGridlines:true},
   {type:"merge",range:{r:3,r2:3,c:3,c2:4},mode:"all",action:"merge"},
   {type:"filter",filter:{range:{r:0,r2:1,c:0,c2:1},criteria:{}}},
   {type:"validation-set",rule:{type:"list",range:{r:2,r2:2,c:0,c2:0},values:["One","Two"],reject:false}},
   {type:"conditional-set",rule:{range:{r:0,r2:1,c:0,c2:1},condition:{type:"gt",value:8},style:{background:"#ffff00"}}},
   {type:"banding-set",rule:{range:{r:5,r2:8,c:0,c2:1},header:null,footer:null,first:"#ffffff",second:"#f3f3f3"}},
   {type:"chart-set",chart:{id:"original-chart",type:"column",range:{r:0,r2:1,c:0,c2:1},title:"Template",header:false,labels:false,legend:true,includeHidden:false,x:500,y:200,width:320,height:220}},
   {type:"comment",key:"0,0",text:"Original discussion"},
   {type:"protection-set",protection:{type:"sheet",sheetId:source,description:"Original locked",warningOnly:false,editors:[`copy-owner-${stamp}@example.com`],exceptions:[]}},
   {type:"protection-set",protection:{type:"range",sheetId:source,description:"Warning",range:{r:2,r2:2,c:2,c2:2},warningOnly:true,editors:[`copy-owner-${stamp}@example.com`],exceptions:[]}},
  ])await apply(op);
  const before=await read();for(const p of[page,peer,viewer])await p.goto(`/?doc=${doc.id}`);
  await page.getByRole("button",{name:"Меню Шаблон",exact:true}).click();await page.getByRole("menuitem",{name:"Создать копию",exact:true}).click();await expect(page.locator(".sheet-tab.active > button:first-child")).toHaveText("Копия листа Шаблон");
  for(const p of[peer,viewer]){await expect(p.locator(".sheet-tab.active > button:first-child")).toHaveText("Шаблон");await expect(p.locator(".sheet-tab")).toHaveCount(3);}
  let saved=await read(),copy=saved.state.sheets[1];expect(saved.state.sheets[0]).toEqual(before.state.sheets[0]);expect(copy.cells["0,0"]).toEqual(before.state.sheets[0].cells["0,0"]);
  for(const property of["widths","frozen","frozenCols","hideGridlines","tabColor","merges","filter"])expect(copy[property]).toEqual(before.state.sheets[0][property]);
  for(const property of["validations","conditionalFormats","bandedRanges","charts"])expect(copy[property][0].id).not.toBe(before.state.sheets[0][property][0].id);
  expect(saved.state.comments).toEqual(before.state.comments);expect(saved.state.protections.filter(p=>p.sheetId===copy.id).every(p=>p.warningOnly)).toBeTruthy();
  await expect(page.locator('[data-cell="0,0"]')).toHaveCSS("font-weight","700");await expect(page.getByLabel("Список A3",{exact:true})).toBeVisible();await page.screenshot({path:"artifacts/duplicate-sheet-app.png"});
  const select=async(p,range)=>{await p.getByLabel("Диапазон",{exact:true}).fill(range);await p.getByLabel("Диапазон",{exact:true}).press("Enter");};
  await select(page,"A1");await page.getByLabel("Строка формул",{exact:true}).fill("10");await page.getByLabel("Строка формул",{exact:true}).press("Enter");await expect(page.locator('[data-cell="0,2"] .cell-text')).toHaveText("30");await expect(peer.locator('[data-cell="0,2"] .cell-text')).toHaveText("21");
  await page.getByRole("button",{name:"Данные",exact:true}).click();await page.getByRole("menuitem",{name:"Настроить именованные диапазоны",exact:true}).click();
  const panel=page.getByRole("complementary",{name:"Именованные диапазоны",exact:true});await panel.getByRole("button",{name:`Изменить диапазон '${copy.name}'!Доход`,exact:true}).click();await panel.getByLabel("Название диапазона",{exact:true}).fill("ДоходКопии");await panel.getByRole("button",{name:"Готово",exact:true}).click();await expect(page.locator('[data-cell="0,2"] .cell-text')).toHaveText("30");await panel.getByRole("button",{name:"Закрыть боковую панель",exact:true}).click();
  await page.getByRole("button",{name:`Меню ${copy.name}`,exact:true}).click();await page.getByRole("menuitem",{name:"Переименовать",exact:true}).click();const rename=page.getByRole("dialog",{name:"Переименовать лист",exact:true});await rename.getByLabel("Имя листа",{exact:true}).fill("Рабочая копия");await rename.getByRole("button",{name:"Сохранить",exact:true}).click();await expect(page.locator('[data-cell="0,2"] .cell-text')).toHaveText("30");
  await expect(rename).toBeHidden();
  await expect(page.locator(".sheet-tab.active > button:first-child")).toHaveText("Рабочая копия");
  await select(page,"'Рабочая копия'!ДоходКопии");await expect(page.getByLabel("Диапазон",{exact:true})).not.toHaveValue("#REF!");await expect(page.locator(".active-cell")).toHaveAttribute("data-cell","0,0");
  await peer.getByRole("button",{name:"Меню Шаблон",exact:true}).click();await peer.getByRole("menuitem",{name:"Создать копию",exact:true}).click();await expect(peer.locator(".sheet-tab.active > button:first-child")).toHaveText("Копия листа Шаблон");await expect(page.locator(".sheet-tab.active > button:first-child")).toHaveText("Рабочая копия");
  await select(peer,"A1");await peer.getByLabel("Строка формул",{exact:true}).fill("20");await peer.getByLabel("Строка формул",{exact:true}).press("Enter");await expect(peer.locator('[data-cell="0,2"] .cell-text')).toHaveText("60");
  expect((await write(editorContext.request,{type:"cells",sheetId:source,changes:[{key:"0,0",cell:{value:"BLOCKED"}}]})).code).toBe("protected_range");
  const parallel=await Promise.all([write(page.request,{type:"sheet-duplicate",sheetId:source,newSheetId:crypto.randomUUID()}),write(editorContext.request,{type:"sheet-duplicate",sheetId:source,newSheetId:crypto.randomUUID()})]);expect(parallel.every(r=>r.ok)).toBeTruthy();saved=await read();expect(new Set(saved.state.sheets.map(s=>s.id)).size).toBe(6);expect(new Set(saved.state.sheets.map(s=>s.name.toLowerCase())).size).toBe(6);expect(saved.state.sheets[0].cells["0,0"].value).toBe("7");
  await viewer.getByRole("button",{name:"Меню Шаблон",exact:true}).click();await expect(viewer.getByRole("menuitem",{name:"Создать копию",exact:true})).toBeDisabled();expect((await write(viewerContext.request,{type:"sheet-duplicate",sheetId:source})).error).toContain("Недостаточно прав");
  await page.reload();await expect(page.locator(".sheet-tab")).toHaveCount(6);expect(errors).toEqual([]);
 }finally{await editorContext.close();await viewerContext.close();}
});
