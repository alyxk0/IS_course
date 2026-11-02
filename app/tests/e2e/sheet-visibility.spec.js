import { test, expect } from "@playwright/test";
import { io } from "socket.io-client";
test("hidden sheets synchronize, retain formulas, switch active editors safely, unhide through View and reject concurrent last-visible hides",async({page,browser})=>{
 const editorContext=await browser.newContext(),viewerContext=await browser.newContext(),editor=await editorContext.newPage(),viewer=await viewerContext.newPage(),stamp=Date.now(),errors=[];
 for(const p of [page,editor,viewer])p.on("pageerror",e=>errors.push(e.message));
 try{
  for(const [client,name]of[[page.request,"owner"],[editorContext.request,"editor"],[viewerContext.request,"viewer"]])expect((await client.post("/api/auth/register",{data:{name,email:`hidden-${name}-${stamp}@example.com`,password:"HiddenPass123"}})).ok()).toBeTruthy();
  const doc=await(await page.request.post("/api/documents",{data:{}})).json(),first=doc.state.sheets[0].id;
  for(const role of ["editor","viewer"])expect((await page.request.put(`/api/documents/${doc.id}/members`,{data:{email:`hidden-${role}-${stamp}@example.com`,role}})).ok()).toBeTruthy();
  async function write(client,operation){
   if(process.env.TEST_RUNTIME==="worker")return await(await client.post(`/api/documents/${doc.id}/operations`,{data:{operation,requestId:crypto.randomUUID()}})).json();
   const{cookies}=await client.storageState(),socket=io(test.info().project.use.baseURL,{transports:["websocket"],extraHeaders:{Cookie:cookies.map(c=>`${c.name}=${c.value}`).join("; ")},reconnection:false});
   try{await new Promise((resolve,reject)=>{socket.on("connect",resolve);socket.on("connect_error",reject);});await socket.timeout(10000).emitWithAck("join",doc.id);return await socket.timeout(10000).emitWithAck("operation",operation);}finally{socket.disconnect();}
  }
  const read=async()=>await(await page.request.get(`/api/documents/${doc.id}`)).json();
  expect((await write(page.request,{type:"sheet-add"})).ok).toBeTruthy();const second=(await read()).state.sheets[1].id;
  for(const [sheetId,name]of[[first,"Расчёты"],[second,"Итоги"]])expect((await write(page.request,{type:"sheet-rename",sheetId,name})).ok).toBeTruthy();
  expect((await write(page.request,{type:"cells",sheetId:first,changes:[{key:"0,0",cell:{value:"7"}}]})).ok).toBeTruthy();
  expect((await write(page.request,{type:"cells",sheetId:second,changes:[{key:"0,0",cell:{value:"='Расчёты'!A1*2"}}]})).ok).toBeTruthy();
  expect((await write(page.request,{type:"named-range-set",namedRange:{name:"Исходные",sheetId:first,range:{r:0,r2:0,c:0,c2:0}}})).ok).toBeTruthy();
  for(const p of [page,editor,viewer])await p.goto(`/?doc=${doc.id}`);
  await editor.locator('[data-cell="0,0"]').dblclick();await editor.getByLabel("Редактирование A1",{exact:true}).fill("DRAFT");
  await page.getByRole("button",{name:"Меню Расчёты",exact:true}).click();const menu=page.getByRole("menu",{name:"Действия с листом Расчёты",exact:true});
  expect(await menu.boundingBox()).toMatchObject({width:215.375,height:319});await page.screenshot({path:"artifacts/sheet-menu-app.png"});
  await menu.getByRole("menuitem",{name:"Скрыть лист",exact:true}).click();
  for(const p of [page,editor,viewer]){await expect(p.locator(".sheet-tab.active")).toHaveText("Итоги");await expect(p.getByRole("button",{name:"Меню Расчёты",exact:true})).toHaveCount(0);await expect(p.locator('[data-cell="0,0"] .cell-text')).toHaveText("14");}
  await expect(editor.getByLabel("Редактирование A1",{exact:true})).toHaveCount(0);expect((await read()).state.sheets[0].cells["0,0"].value).toBe("7");
  await viewer.reload();await expect(viewer.locator(".sheet-tab.active")).toHaveText("Итоги");
  await page.getByLabel("Диапазон",{exact:true}).fill("Исходные");await page.getByLabel("Диапазон",{exact:true}).press("Enter");await expect(page.locator(".sheet-tab.active")).toHaveText("Итоги");await expect(page.getByLabel("Диапазон",{exact:true})).toHaveValue("A1");
  await page.getByRole("button",{name:"Все листы",exact:true}).click();await expect(page.getByRole("menu",{name:"Все листы",exact:true}).getByRole("menuitemcheckbox")).toHaveCount(1);await page.keyboard.press("Escape");
  await viewer.getByRole("button",{name:"Вид",exact:true}).click();await expect(viewer.getByRole("menuitem",{name:"Скрытые листы",exact:true})).toBeDisabled();await viewer.keyboard.press("Escape");
  await page.getByRole("button",{name:"Меню Итоги",exact:true}).click();await expect(page.getByRole("menuitem",{name:"Скрыть лист",exact:true})).toBeDisabled();await expect(page.getByRole("menuitem",{name:"Удалить",exact:true})).toBeDisabled();await page.keyboard.press("Escape");
  await editor.getByRole("button",{name:"Вид",exact:true}).click();const hidden=editor.getByRole("menuitem",{name:"Скрытые листы",exact:true});await hidden.focus();await hidden.press("ArrowRight");await expect(editor.getByRole("menuitem",{name:"Расчёты",exact:true})).toBeFocused();await editor.screenshot({path:"artifacts/hidden-sheets-app.png"});await editor.keyboard.press("Enter");
  await expect(editor.locator(".sheet-tab.active")).toHaveText("Расчёты");await expect(page.getByRole("button",{name:"Меню Расчёты",exact:true})).toBeVisible();
  const race=await Promise.all([write(page.request,{type:"sheet-visibility",sheetId:first,hidden:true}),write(editorContext.request,{type:"sheet-visibility",sheetId:second,hidden:true})]);expect(race.filter(r=>r.ok)).toHaveLength(1);expect((await read()).state.sheets.filter(s=>!s.hidden)).toHaveLength(1);
  for(const sheet of (await read()).state.sheets)if(sheet.hidden)expect((await write(page.request,{type:"sheet-visibility",sheetId:sheet.id,hidden:false})).ok).toBeTruthy();
  await page.getByRole("button",{name:"Меню Расчёты",exact:true}).click();await page.getByRole("menuitem",{name:"Защитить лист",exact:true}).click();
  const panel=page.getByRole("complementary",{name:"Защищенные листы и диапазоны",exact:true});await expect(panel.getByRole("tab",{name:"Лист",exact:true})).toHaveAttribute("aria-selected","true");await expect(panel.getByLabel("Защищаемый лист",{exact:true})).toHaveValue(first);
  await panel.getByRole("button",{name:"Задать разрешения",exact:true}).click();await page.getByRole("dialog",{name:"Доступ к редактированию диапазонов",exact:true}).getByRole("button",{name:"Готово",exact:true}).click();
  expect((await write(editorContext.request,{type:"sheet-visibility",sheetId:first,hidden:true})).code).toBe("protected_range");
  await page.request.put(`/api/documents/${doc.id}/members`,{data:{email:`hidden-editor-${stamp}@example.com`,role:"viewer"}});
  expect((await write(editorContext.request,{type:"sheet-visibility",sheetId:first,hidden:true})).error).toContain("Недостаточно прав");
  expect(errors).toEqual([]);
 }finally{await editorContext.close();await viewerContext.close();}
});
