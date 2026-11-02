import { test, expect } from "@playwright/test";
import { io } from "socket.io-client";
test("named-range panel matches native geometry; Cyrillic formulas, shared rename, stale edits, navigation, picker and deletion work", async ({ page, browser }) => {
  const editContext = await browser.newContext(), viewContext = await browser.newContext(), editor = await editContext.newPage(), viewer = await viewContext.newPage(), stamp = Date.now(), errors = [];
  for (const p of [page, editor, viewer]) p.on("pageerror", error => errors.push(error.message));
  try {
    for (const [client, name] of [[page.request, "owner"], [editContext.request, "editor"], [viewContext.request, "viewer"]]) expect((await client.post("/api/auth/register", { data: { name, email: `named-${name}-${stamp}@example.com`, password: "NamedRangesPass123" } })).ok()).toBeTruthy();
    const doc = await (await page.request.post("/api/documents", { data: {} })).json(), sheetId = doc.state.sheets[0].id;
    for (const role of ["editor", "viewer"]) await page.request.put(`/api/documents/${doc.id}/members`, { data: { email: `named-${role}-${stamp}@example.com`, role } });
    async function write(operation) {
      if (process.env.TEST_RUNTIME === "worker") return await (await page.request.post(`/api/documents/${doc.id}/operations`, { data: { operation, requestId: crypto.randomUUID() } })).json();
      const { cookies } = await page.request.storageState(), socket = io(test.info().project.use.baseURL, { transports: ["websocket"], extraHeaders: { Cookie: cookies.map(c => `${c.name}=${c.value}`).join("; ") }, reconnection: false });
      try { await new Promise((resolve, reject) => { socket.on("connect", resolve); socket.on("connect_error", reject); }); await socket.timeout(10000).emitWithAck("join", doc.id); return await socket.timeout(10000).emitWithAck("operation", operation); } finally { socket.disconnect(); }
    }
    expect((await write({ type: "cells", sheetId, changes: [{ key: "0,0", cell: { value: "2" } }, { key: "1,0", cell: { value: "3" } }, { key: "0,2", cell: { value: "=SUM(Бюджет)" } }, { key: "0,3", cell: { value: "=1E-3+IF(TRUE,2,3)" } }] })).ok).toBeTruthy();
    await Promise.all([page, editor, viewer].map(p => p.goto(`/?doc=${doc.id}`)));
    const select = async (p, range) => { await p.getByLabel("Диапазон", { exact: true }).fill(range); await p.getByLabel("Диапазон", { exact: true }).press("Enter"); };
    const open = async p => { await p.getByRole("button", { name: "Данные", exact: true }).click(); await p.getByRole("menuitem", { name: "Настроить именованные диапазоны", exact: true }).click(); };
    const panel = p => p.getByRole("complementary", { name: "Именованные диапазоны", exact: true });
    await select(page, "G10:H11"); await open(page); await expect(panel(page)).toBeVisible();
    expect(await panel(page).boundingBox()).toMatchObject({ x: 1104, y: 65, width: 320, height: 797 });
    expect(await panel(page).getByLabel("Название диапазона", { exact: true }).boundingBox()).toMatchObject({ x: 1124, y: 142, width: 280, height: 36 });
    await page.screenshot({ path: "artifacts/named-add-app.png" });
    await panel(page).getByRole("button", { name: "Выбрать диапазон данных", exact: true }).click();
    await expect(panel(page).getByRole("button", { name: "Готово", exact: true })).toBeDisabled();
    await page.screenshot({ path: "artifacts/named-picker-app.png" });
    await select(page, "B4:C6"); await expect(panel(page).getByLabel("Адрес именованного диапазона", { exact: true })).toHaveValue("Лист1!B4:C6");
    await panel(page).getByRole("button", { name: "ОК", exact: true }).click(); await panel(page).getByRole("button", { name: "Отмена", exact: true }).click();
    await page.screenshot({ path: "artifacts/named-empty-app.png" });
    await panel(page).getByRole("button", { name: "Добавить диапазон", exact: true }).click();
    await panel(page).getByLabel("Название диапазона", { exact: true }).fill("Бюджет"); await panel(page).getByLabel("Адрес именованного диапазона", { exact: true }).fill("Лист1!A1:A2"); await panel(page).getByRole("button", { name: "Готово", exact: true }).click();
    await expect(viewer.locator('[data-cell="0,2"] .cell-text')).toHaveText("5");
    await expect(viewer.locator('[data-cell="0,3"] .cell-text')).toHaveText("2.001");
    await open(viewer); await expect(panel(viewer).getByRole("button", { name: "Добавить диапазон", exact: true })).toBeDisabled();
    await panel(viewer).getByRole("button", { name: /Бюджет/ }).click(); await expect(viewer.getByLabel("Диапазон", { exact: true })).toHaveValue("Бюджет");
    await open(editor); await panel(editor).getByRole("button", { name: "Изменить диапазон Бюджет", exact: true }).click();
    await panel(page).getByRole("button", { name: "Изменить диапазон Бюджет", exact: true }).click(); await panel(page).getByLabel("Название диапазона", { exact: true }).fill("Доходы"); await panel(page).getByRole("button", { name: "Готово", exact: true }).click();
    await expect(panel(viewer).getByRole("button", { name: /Доходы/ })).toBeVisible(); await expect(viewer.locator('[data-cell="0,2"] .cell-text')).toHaveText("5");
    await panel(editor).getByRole("button", { name: "Готово", exact: true }).click(); await expect(panel(editor).getByRole("alert")).toContainText("Не удалось сохранить"); await panel(editor).getByRole("button", { name: "Отмена", exact: true }).click();
    let saved = await (await page.request.get(`/api/documents/${doc.id}`)).json(); expect(saved.state.sheets[0].cells["0,2"].value).toBe("=SUM(Доходы)"); expect(JSON.stringify(saved)).not.toContain("_osnr_");
    await select(page, "доходы"); await expect(page.getByLabel("Диапазон", { exact: true })).toHaveValue("Доходы");
    expect((await write({ type: "sheet-add" })).ok).toBeTruthy();
    saved = await (await page.request.get(`/api/documents/${doc.id}`)).json(); const other = saved.state.sheets[1];
    expect((await write({ type: "cells", sheetId: other.id, changes: [{ key: "0,0", cell: { value: "7" } }] })).ok).toBeTruthy();
    await select(editor, "D4"); await editor.getByRole("grid").press("F2"); await editor.getByLabel("Редактирование D4", { exact: true }).fill("Черновик");
    expect((await write({ type: "named-range-set", namedRange: { name: "Расходы", sheetId: other.id, range: { r: 0, r2: 0, c: 0, c2: 0 } } })).ok).toBeTruthy();
    await expect(panel(viewer).getByRole("button", { name: /Расходы/ })).toBeVisible();
    await expect(editor.getByLabel("Редактирование D4", { exact: true })).toHaveValue("Черновик"); await editor.getByLabel("Редактирование D4", { exact: true }).press("Escape");
    await select(viewer, "расходы"); await expect(viewer.getByLabel("Диапазон", { exact: true })).toHaveValue("Расходы"); await expect(viewer.locator('[data-cell="0,0"] .cell-text')).toHaveText("7");
    await select(viewer, "доходы"); await expect(viewer.locator('[data-cell="0,0"] .cell-text')).toHaveText("2");
    await page.reload(); await expect(page.locator('[data-cell="0,2"] .cell-text')).toHaveText("5");
    await open(page); await panel(page).getByRole("button", { name: "Изменить диапазон Доходы", exact: true }).click(); await panel(page).getByRole("button", { name: "Удалить диапазон", exact: true }).click();
    await panel(page).getByRole("alertdialog").getByRole("button", { name: "Удалить", exact: true }).click(); await expect(viewer.locator('[data-cell="0,2"] .cell-text')).toHaveText("#NAME?");
    expect(errors).toEqual([]);
  } finally { await editContext.close(); await viewContext.close(); }
});
