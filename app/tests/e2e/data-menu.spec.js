import { test, expect } from "@playwright/test";
import { io } from "socket.io-client";
test("Data menu geometry, sheet and multi-key range sorting, stale dialogs, trim and permissions work across two browsers", async ({ page, browser }) => {
  const context = await browser.newContext(), peer = await context.newPage(), stamp = Date.now(), errors = [];
  for (const p of [page, peer]) p.on("pageerror", error => errors.push(error.message));
  try {
    for (const [client, name] of [[page.request, "owner"], [context.request, "viewer"]]) expect((await client.post("/api/auth/register", { data: { name, email: `data-${name}-${stamp}@example.com`, password: "DataMenuPass123" } })).ok()).toBeTruthy();
    const doc = await (await page.request.post("/api/documents", { data: {} })).json(), sheetId = doc.state.sheets[0].id;
    async function write(client, operation) {
      if (process.env.TEST_RUNTIME === "worker") {
        const response = await client.post(`/api/documents/${doc.id}/operations`, { data: { operation, requestId: crypto.randomUUID() } });
        return { ...(await response.json()), status: response.status() };
      }
      const { cookies } = await client.storageState();
      const socket = io(test.info().project.use.baseURL, { transports: ["websocket"], extraHeaders: { Cookie: cookies.map(c => `${c.name}=${c.value}`).join("; ") }, reconnection: false });
      try {
        await new Promise((resolve, reject) => { socket.on("connect", resolve); socket.on("connect_error", reject); });
        const joined = await socket.timeout(10000).emitWithAck("join", doc.id); if (joined.error) return joined;
        return await socket.timeout(10000).emitWithAck("operation", operation);
      } finally { socket.disconnect(); }
    }
    await page.request.put(`/api/documents/${doc.id}/members`, { data: { email: `data-viewer-${stamp}@example.com`, role: "viewer" } });
    const seed = [["Группа", "Баллы", "Расчёт"], ["Б", "2", "=B2+$B$2"], ["А", "1", "=B3+$B$2"], ["А", "3", "=B4+$B$2"]];
    const changes = seed.flatMap((row, r) => row.map((value, c) => ({ key: `${r},${c}`, cell: { value, ...(r === 2 && c === 0 ? { style: { bold: true }, link: "https://example.com" } : {}) } })));
    expect((await write(page.request, { type: "cells", sheetId, changes })).ok).toBeTruthy();
    await page.goto(`/?doc=${doc.id}`); await peer.goto(`/?doc=${doc.id}`);
    const select = async range => { await page.getByLabel("Диапазон", { exact: true }).fill(range); await page.getByLabel("Диапазон", { exact: true }).press("Enter"); };
    const open = () => page.getByRole("button", { name: "Данные", exact: true }).click();
    const main = page.getByRole("menu", { name: "Данные", exact: true });
    const child = label => page.getByRole("menu", { name: label, exact: true });
    const data = async () => (await (await page.request.get(`/api/documents/${doc.id}`)).json()).state.sheets[0].cells;
    await select("G10:H11"); await open();
    expect(await main.boundingBox()).toMatchObject({ x: 348.953125, y: 58, width: 384.984375, height: 594 });
    await page.screenshot({ path: "artifacts/data-menu-app.png" });
    await main.getByRole("menuitem", { name: "Сортировать лист", exact: true }).hover(); await expect(child("Сортировать лист")).toBeVisible();
    const box = await child("Сортировать лист").boundingBox(); expect(box.width).toBe(290.21875); expect(box.height).toBe(78); expect(box.x).toBeCloseTo(732.953125, 1); expect(box.y).toBe(65);
    await page.screenshot({ path: "artifacts/data-sort-sheet-app.png" });
    await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
    await select("B3"); await open(); await main.getByRole("menuitem", { name: "Сортировать лист", exact: true }).hover(); await child("Сортировать лист").getByRole("menuitem", { name: "Сортировать лист по столбцу B (А > Я)", exact: true }).click();
    await expect(peer.locator('[data-cell="0,0"] .cell-text')).toHaveText("А"); await expect(peer.locator('[data-cell="0,1"] .cell-text')).toHaveText("1");
    await page.getByRole("grid").press("Control+z"); await expect(peer.locator('[data-cell="0,0"] .cell-text')).toHaveText("Группа");
    const advanced = async () => { await select("A1:C5"); await open(); await main.getByRole("menuitem", { name: "Сортировать диапазон", exact: true }).hover(); await child("Сортировать диапазон").getByRole("menuitem", { name: "Расширенные настройки сортировки диапазонов", exact: true }).click(); };
    await advanced(); const dialog = page.getByRole("dialog", { name: "Сортировка диапазона A1 – C5", exact: true });
    expect(await dialog.boundingBox()).toMatchObject({ x: 463, y: 294, width: 514, height: 312 });
    await page.screenshot({ path: "artifacts/data-sort-dialog-app.png" });
    await dialog.getByRole("checkbox", { name: "Данные со строкой заголовка" }).check();
    await dialog.getByRole("button", { name: "Добавить еще один столбец для сортировки" }).click();
    await dialog.getByLabel("Столбец сортировки 2").selectOption("1");
    await dialog.getByRole("radio", { name: "Я > А", exact: true }).nth(1).check();
    await dialog.getByRole("button", { name: "Сортировать", exact: true }).click(); await expect(dialog).not.toBeVisible();
    await expect(peer.locator('[data-cell="1,1"] .cell-text')).toHaveText("3");
    let cells = await data(); expect(cells["1,2"].value).toBe("=B2+$B$2"); expect(cells["2,0"].link).toBe("https://example.com/"); expect(cells["2,0"].style.bold).toBeTruthy(); expect(cells["0,0"].value).toBe("Группа");
    await advanced();
    expect((await write(page.request, { type: "cells", sheetId, changes: [{ key: "1,1", cell: { value: "99" } }] })).ok).toBeTruthy();
    await expect(peer.locator('[data-cell="1,1"] .cell-text')).toHaveText("99");
    await dialog.getByRole("button", { name: "Сортировать", exact: true }).click(); await expect(dialog.getByRole("alert")).toContainText("Не удалось"); expect((await data())["1,1"].value).toBe("99");
    await dialog.getByRole("button", { name: "Отмена", exact: true }).click();
    expect((await write(page.request, { type: "cells", sheetId, changes: [{ key: "5,0", cell: { value: "  a  b  ", style: { italic: true }, link: "https://example.com" } }, { key: "5,1", cell: { value: " =1+2  " } }] })).ok).toBeTruthy();
    await expect(peer.locator('[data-cell="5,0"] .cell-text')).toHaveText("a b");
    await select("A6:B6"); await open(); await main.getByRole("menuitem", { name: "Очистка данных", exact: true }).hover(); await child("Очистка данных").getByRole("menuitem", { name: "Удалить пробелы", exact: true }).click();
    await expect(peer.locator('[data-cell="5,1"] .cell-text')).toHaveText("=1+2");
    cells = await data(); expect(cells["5,0"].value).toBe("a b"); expect(cells["5,0"].style.italic).toBeTruthy(); expect(cells["5,0"].link).toBeTruthy(); expect(cells["5,1"].literal).toBeTruthy();
    await page.getByRole("grid").press("Control+z"); await expect.poll(async () => (await data())["5,0"].value).toBe("  a  b  ");
    expect((await write(page.request, { type: "filter", sheetId, filter: { range: { r: 0, r2: 4, c: 0, c2: 2 }, criteria: {} } })).ok).toBeTruthy();
    await page.locator('[data-cell="0,1"] .column-filter-button').click();
    await page.getByRole("button", { name: "Сортировать А → Я", exact: true }).click();
    await expect(peer.locator('[data-cell="1,1"] .cell-text')).toHaveText("1");
    expect((await data())["0,0"].value).toBe("Группа");
    await peer.getByRole("button", { name: "Данные", exact: true }).click(); await expect(peer.getByRole("menuitem", { name: "Сортировать лист", exact: true })).toBeDisabled();
    const forbidden = await write(context.request, { type: "cells", sheetId, changes: [{ key: "0,0", cell: { value: "FORBIDDEN" } }] }); expect(forbidden.error).toContain("Недостаточно прав");
    await page.setViewportSize({ width: 900, height: 700 }); await select("A1:C5"); await open(); await main.getByRole("menuitem", { name: "Сортировать диапазон", exact: true }).hover(); await expect(child("Сортировать диапазон")).toBeVisible(); const narrow = await child("Сортировать диапазон").boundingBox(); expect(narrow.x).toBeGreaterThanOrEqual(8); expect(narrow.x + narrow.width).toBeLessThanOrEqual(892);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
