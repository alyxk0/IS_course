import { test, expect } from "@playwright/test";
import { io } from "socket.io-client";
test("tab color palette matches native geometry; colors and stable-ID menu/drag moves synchronize without changing formulas or active edits",async({page,browser})=>{
 const context=await browser.newContext(),peer=await context.newPage(),stamp=Date.now(),errors=[];
 for(const p of[page,peer])p.on("pageerror",e=>errors.push(e.message));
 try{
  for(const[client,name]of[[page.request,"owner"],[context.request,"editor"]])expect((await client.post("/api/auth/register",{data:{name,email:`tabs-${name}-${stamp}@example.com`,password:"TabsPassword123"}})).ok()).toBeTruthy();
  const doc=await(await page.request.post("/api/documents",{data:{}})).json();await page.request.put(`/api/documents/${doc.id}/members`,{data:{email:`tabs-editor-${stamp}@example.com`,role:"editor"}});
  async function write(client,operation){
   if(process.env.TEST_RUNTIME==="worker")return await(await client.post(`/api/documents/${doc.id}/operations`,{data:{operation,requestId:crypto.randomUUID()}})).json();
   const{cookies}=await client.storageState(),socket=io(test.info().project.use.baseURL,{transports:["websocket"],extraHeaders:{Cookie:cookies.map(c=>`${c.name}=${c.value}`).join("; ")},reconnection:false});
   try{await new Promise((resolve,reject)=>{socket.on("connect",resolve);socket.on("connect_error",reject);});await socket.timeout(10000).emitWithAck("join",doc.id);return await socket.timeout(10000).emitWithAck("operation",operation);}finally{socket.disconnect();}
  }
  const read=async()=>await(await page.request.get(`/api/documents/${doc.id}`)).json();
  for(let i=0;i<3;i++)expect((await write(page.request,{type:"sheet-add"})).ok).toBeTruthy();const[a,h,b,c]=(await read()).state.sheets.map(s=>s.id);
  for(const[sheetId,name]of[[a,"Север"],[h,"Скрытый"],[b,"Итоги"],[c,"Последний"]])expect((await write(page.request,{type:"sheet-rename",sheetId,name})).ok).toBeTruthy();
  expect((await write(page.request,{type:"sheet-visibility",sheetId:h,hidden:true})).ok).toBeTruthy();
  for(const[sheetId,value]of[[a,"7"],[b,"='Север'!A1*2"]])expect((await write(page.request,{type:"cells",sheetId,changes:[{key:"0,0",cell:{value}}]})).ok).toBeTruthy();
  await page.goto(`/?doc=${doc.id}`);await peer.goto(`/?doc=${doc.id}`);
  const tab=(p,id)=>p.locator(`.sheet-tab[data-sheet-id="${id}"]`),palette=page.getByRole("dialog",{name:"Цвет вкладки листа",exact:true});
  const openColor=async()=>{await page.getByRole("button",{name:"Меню Север",exact:true}).click();await page.getByRole("menuitem",{name:"Изменить цвет",exact:true}).hover();await expect(palette).toBeVisible();};
  await openColor();expect(await palette.boundingBox()).toMatchObject({width:243,height:282});
  await expect(page.getByRole("menuitem",{name:"Сдвинуть влево",exact:true})).toBeDisabled();await expect(page.getByRole("menuitem",{name:"Сдвинуть вправо",exact:true})).toBeEnabled();
  const box=await palette.boundingBox(),grid=palette.getByRole("grid",{name:"Палитра цветов вкладки",exact:true});expect(await grid.boundingBox()).toMatchObject({x:box.x+11,y:box.y+43,width:221,height:179});expect(await grid.getByRole("gridcell").first().boundingBox()).toMatchObject({x:box.x+12,y:box.y+45,width:21,height:21});await expect(grid.getByRole("gridcell")).toHaveCount(80);
  await page.screenshot({path:"artifacts/tab-color-app.png"});await grid.getByRole("gridcell",{name:"красный",exact:true}).click();
  await expect(tab(peer,a)).toHaveAttribute("data-tab-color","#ff0000");expect(await tab(peer,a).evaluate(el=>getComputedStyle(el,"::after").height)).toBe("4px");
  await page.reload();await expect(tab(page,a)).toHaveAttribute("data-tab-color","#ff0000");
  await page.getByRole("button",{name:"Меню Север",exact:true}).click();const colorItem=page.getByRole("menuitem",{name:"Изменить цвет",exact:true});await colorItem.focus();await colorItem.press("ArrowRight");await expect(palette.getByRole("gridcell",{name:"красный",exact:true})).toBeFocused();
  const revision=(await read()).revision;await page.keyboard.press("ArrowRight");await expect(palette.getByRole("gridcell",{name:"оранжевый",exact:true})).toBeFocused();await page.keyboard.press("Escape");await expect(colorItem).toBeFocused();await page.keyboard.press("Escape");expect((await read()).revision).toBe(revision);
  await openColor();await palette.getByLabel("Добавить пользовательский цвет вкладки",{exact:true}).fill("#123abc");await expect(tab(peer,a)).toHaveAttribute("data-tab-color","#123abc");await page.reload();await openColor();await expect(palette.getByRole("gridcell",{name:"#123abc",exact:true})).toHaveAttribute("aria-selected","true");await page.keyboard.press("Escape");await page.keyboard.press("Escape");
  await openColor();await palette.getByRole("button",{name:"Сбросить параметры",exact:true}).click();await expect(tab(peer,a)).not.toHaveAttribute("data-tab-color");
  await peer.locator('[data-cell="0,0"]').dblclick();await peer.getByLabel("Редактирование A1",{exact:true}).fill("DRAFT");
  await page.getByLabel("Диапазон",{exact:true}).fill("C3");await page.getByLabel("Диапазон",{exact:true}).press("Enter");
  await page.getByRole("button",{name:"Меню Север",exact:true}).click();await page.getByRole("menuitem",{name:"Сдвинуть вправо",exact:true}).click();
  for(const p of[page,peer])await expect(p.locator(".sheet-tab > button:first-child")).toHaveText(["Итоги","Север","Последний"]);
  await expect(page.getByLabel("Диапазон",{exact:true})).toHaveValue("C3");await expect(peer.getByLabel("Редактирование A1",{exact:true})).toHaveValue("DRAFT");await peer.keyboard.press("Escape");
  await tab(page,c).dragTo(tab(page,b),{targetPosition:{x:2,y:18}});for(const p of[page,peer])await expect(p.locator(".sheet-tab > button:first-child")).toHaveText(["Последний","Итоги","Север"]);
  await peer.getByRole("button",{name:"Итоги",exact:true}).click();await expect(peer.locator('[data-cell="0,0"] .cell-text')).toHaveText("14");
  const concurrent=await Promise.all([write(page.request,{type:"sheet-move",sheetId:a,relativeTo:c,position:"before"}),write(context.request,{type:"sheet-move",sheetId:b,relativeTo:a,position:"after"})]);expect(concurrent.every(r=>r.ok)).toBeTruthy();const saved=await read();expect(saved.state.sheets.map(s=>s.id).sort()).toEqual([a,h,b,c].sort());expect(saved.state.sheets.find(s=>s.id===h).hidden).toBeTruthy();expect(saved.state.sheets.find(s=>s.id===a).cells["0,0"].value).toBe("7");
  for(const p of[page,peer])await expect(p.locator(".sheet-tab > button:first-child")).toHaveText(saved.state.sheets.filter(s=>!s.hidden).map(s=>s.name));
  await page.setViewportSize({width:360,height:640});await openColor();const narrow=await palette.boundingBox();expect(narrow.x).toBeGreaterThanOrEqual(8);expect(narrow.x+narrow.width).toBeLessThanOrEqual(352);expect(narrow.y).toBeGreaterThanOrEqual(8);expect(narrow.y+narrow.height).toBeLessThanOrEqual(632);await page.keyboard.press("Escape");
  await page.request.put(`/api/documents/${doc.id}/members`,{data:{email:`tabs-editor-${stamp}@example.com`,role:"viewer"}});await peer.getByRole("button",{name:"Меню Север",exact:true}).click();await expect(peer.getByRole("menuitem",{name:"Изменить цвет",exact:true})).toBeDisabled();await expect(tab(peer,a)).toHaveAttribute("draggable","false");
  expect((await write(context.request,{type:"sheet-color",sheetId:a,color:"#ff0000"})).error).toContain("Недостаточно прав");expect(errors).toEqual([]);
 }finally{await context.close();}
});
