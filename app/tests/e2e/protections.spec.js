import { test, expect } from "@playwright/test";
import { io } from "socket.io-client";
test("range and sheet protection enforce permissions, custom editors, warning confirmation and exceptions on both transports", async ({page,browser})=>{
  const context=await browser.newContext(),peer=await context.newPage(),stamp=Date.now(),errors=[];
  for(const p of [page,peer])p.on("pageerror",error=>errors.push(error.message));
  try{
    for(const [client,name] of [[page.request,"owner"],[context.request,"editor"]])expect((await client.post("/api/auth/register",{data:{name,email:`protect-${name}-${stamp}@example.com`,password:"ProtectionPass123"}})).ok()).toBeTruthy();
    const doc=await(await page.request.post("/api/documents",{data:{}})).json(),sheetId=doc.state.sheets[0].id;
    await page.request.put(`/api/documents/${doc.id}/members`,{data:{email:`protect-editor-${stamp}@example.com`,role:"editor"}});
    async function write(client,operation){
      if(process.env.TEST_RUNTIME==="worker")return await(await client.post(`/api/documents/${doc.id}/operations`,{data:{operation,requestId:crypto.randomUUID()}})).json();
      const {cookies}=await client.storageState(),socket=io(test.info().project.use.baseURL,{transports:["websocket"],extraHeaders:{Cookie:cookies.map(c=>`${c.name}=${c.value}`).join("; ")},reconnection:false});
      try{await new Promise((resolve,reject)=>{socket.on("connect",resolve);socket.on("connect_error",reject);});await socket.timeout(10000).emitWithAck("join",doc.id);return await socket.timeout(10000).emitWithAck("operation",operation);}finally{socket.disconnect();}
    }
    expect((await write(page.request,{type:"cells",sheetId,changes:[{key:"1,1",cell:{value:"Original"}}]})).ok).toBeTruthy();
    await page.goto(`/?doc=${doc.id}`);await peer.goto(`/?doc=${doc.id}`);
    const select=async(p,range)=>{await p.getByLabel("Диапазон",{exact:true}).fill(range);await p.getByLabel("Диапазон",{exact:true}).press("Enter");};
    const input=async(p,range,value)=>{await select(p,range);await p.getByLabel("Строка формул",{exact:true}).fill(value);await p.getByLabel("Строка формул",{exact:true}).press("Enter");};
    const open=async()=>{await page.getByRole("button",{name:"Данные",exact:true}).click();await page.getByRole("menuitem",{name:"Защитить листы и диапазоны",exact:true}).click();};
    const panel=page.getByRole("complementary",{name:"Защищенные листы и диапазоны",exact:true});
    const dialog=page.getByRole("dialog",{name:"Доступ к редактированию диапазонов",exact:true});
    await select(page,"G10:H11");await open();
    expect(await panel.boundingBox()).toMatchObject({x:1104,y:65,width:320,height:797});
    expect(await panel.getByLabel("Введите описание",{exact:true}).boundingBox()).toMatchObject({x:1120,y:142,width:288,height:36});
    await page.screenshot({path:"artifacts/protection-range-app.png"});
    await panel.getByLabel("Введите описание",{exact:true}).fill("Бюджет");await panel.getByLabel("Выберите диапазон",{exact:true}).fill("Лист1!B2:C4");
    await panel.getByRole("button",{name:"Задать разрешения",exact:true}).click();await dialog.getByRole("button",{name:"Готово",exact:true}).click();await expect(dialog).not.toBeVisible();await select(page,"A1");
    await input(peer,"B2","Blocked");await expect(peer.locator(".error-banner")).toContainText("защищён");await expect(peer.locator('[data-cell="1,1"] .cell-text')).toHaveText("Original");
    await input(peer,"A1","Outside");await expect(page.locator('[data-cell="0,0"] .cell-text')).toHaveText("Outside");
    const denied=await write(context.request,{type:"cells",sheetId,changes:[{key:"0,0",cell:{value:"ROLLBACK"}},{key:"1,1",cell:{value:"BYPASS"}}]});expect(denied.code).toBe("protected_range");
    await panel.getByRole("button",{name:"Изменить защиту Бюджет",exact:true}).click();await panel.getByRole("button",{name:"Изменить разрешения",exact:true}).click();
    await dialog.getByLabel("Кто может редактировать",{exact:true}).selectOption("custom");await dialog.getByRole("checkbox",{name:"editor",exact:true}).check();await dialog.getByRole("button",{name:"Готово",exact:true}).click();
    await input(peer,"B2","Allowed");await expect(page.locator('[data-cell="1,1"] .cell-text')).toHaveText("Allowed");
    await panel.getByRole("button",{name:"Изменить защиту Бюджет",exact:true}).click();await panel.getByRole("button",{name:"Изменить разрешения",exact:true}).click();
    await dialog.getByRole("radio",{name:"Показывать предупреждение во время редактирования этого диапазона",exact:true}).check();await dialog.getByRole("button",{name:"Готово",exact:true}).click();
    await input(peer,"B2","Cancelled");const warning=peer.getByRole("dialog",{name:"Защищённый диапазон",exact:true});await expect(warning).toBeVisible();await warning.getByRole("button",{name:"Отмена",exact:true}).click();await expect(page.locator('[data-cell="1,1"] .cell-text')).toHaveText("Allowed");
    await input(peer,"B2","Confirmed");await warning.getByRole("button",{name:"Изменить всё равно",exact:true}).click();await expect(page.locator('[data-cell="1,1"] .cell-text')).toHaveText("Confirmed");
    await panel.getByRole("button",{name:"Изменить защиту Бюджет",exact:true}).click();await panel.getByRole("button",{name:"Удалить защиту",exact:true}).click();await page.getByRole("dialog",{name:"Удалить защиту?",exact:true}).getByRole("button",{name:"Удалить",exact:true}).click();
    await panel.getByRole("button",{name:"Добавить лист или диапазон",exact:true}).click();await panel.getByLabel("Введите описание",{exact:true}).fill("Лист с вводом");await panel.getByRole("tab",{name:"Лист",exact:true}).click();await panel.getByRole("checkbox",{name:"Исключить отдельные ячейки",exact:true}).check();await panel.getByLabel("Исключение 1",{exact:true}).fill("Лист1!A1");
    await page.screenshot({path:"artifacts/protection-sheet-app.png"});await panel.getByRole("button",{name:"Задать разрешения",exact:true}).click();await dialog.getByRole("button",{name:"Готово",exact:true}).click();
    await input(peer,"A1","Exception");await expect(page.locator('[data-cell="0,0"] .cell-text')).toHaveText("Exception");await input(peer,"D5","Blocked");await expect(peer.locator(".error-banner")).toContainText("защищён");
    expect((await write(context.request,{type:"cells",sheetId,changes:[{key:"2000,3",cell:{value:"GROWTH BYPASS"}}]})).code).toBe("protected_range");
    let saved=await(await page.request.get(`/api/documents/${doc.id}`)).json();expect(saved.state.sheets[0].rows).toBe(1000);expect(saved.state.sheets[0].cells["4,3"]?.value||"").toBe("");const rule=saved.state.protections[0];
    expect((await write(context.request,{type:"protection-delete",id:rule.id,expected:rule})).code).toBe("protected_range");
    expect((await write(page.request,{type:"protection-delete",id:rule.id,expected:rule})).ok).toBeTruthy();await input(peer,"D5","Unblocked");await expect(page.locator('[data-cell="4,3"] .cell-text')).toHaveText("Unblocked");
    expect(errors).toEqual([]);
  }finally{await context.close();}
});
