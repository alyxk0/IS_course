import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
const ExcelJS = createRequire(import.meta.url)("exceljs");
test("font menu and catalog match reference geometry; local fonts synchronize, undo, export, and preferences remain personal", async ({ page, browser }) => {
  const context = await browser.newContext(), peer = await context.newPage(), stamp = Date.now(), errors = [], externalFonts = [];
  for (const p of [page, peer]) {
    p.on("pageerror", (error) => errors.push(error.message));
    p.on("request", (request) => { if (/fonts\.(googleapis|gstatic)\.com/.test(request.url())) externalFonts.push(request.url()); });
  }
  try {
    for (const [client, name] of [[page.request, "owner"], [context.request, "editor"]])
      expect((await client.post("/api/auth/register", { data: { name, email: `fonts-${name}-${stamp}@example.com`, password: "FontPass12345" } })).ok()).toBeTruthy();
    const doc = await (await page.request.post("/api/documents", { data: {} })).json();
    await page.request.put(`/api/documents/${doc.id}/members`, { data: { email: `fonts-editor-${stamp}@example.com`, role: "editor" } });
    await page.goto(`/?doc=${doc.id}`); await peer.goto(`/?doc=${doc.id}`);
    const select = async (range) => { await page.getByLabel("Диапазон", { exact: true }).fill(range); await page.getByLabel("Диапазон", { exact: true }).press("Enter"); };
    const button = page.getByRole("listbox", { name: "Шрифт", exact: true }), menu = page.getByRole("menu", { name: "Выбор шрифта", exact: true });
    await select("B2"); await page.getByLabel("Строка формул", { exact: true }).fill("Привет, таблица! Hello world 123"); await page.getByLabel("Строка формул", { exact: true }).press("Enter");
    await select("B2:C3"); await button.click();
    expect(await menu.boundingBox()).toMatchObject({ x: 443, y: 100, width: 228.46875, height: 774.15625 });
    await expect(menu.locator(".font-menu-list").getByRole("menuitemcheckbox")).toHaveCount(25);
    await page.screenshot({ path: "artifacts/font-menu-app.png" });
    await menu.getByRole("menuitemcheckbox", { name: "Montserrat", exact: true }).click();
    await expect(peer.locator('[data-cell="2,2"]')).toHaveCSS("font-family", "Montserrat");
    await page.getByRole("grid").press("Control+z"); await expect(peer.locator('[data-cell="2,2"]')).toHaveCSS("font-family", "Arial");
    await page.getByRole("grid").press("Control+y"); await expect(peer.locator('[data-cell="2,2"]')).toHaveCSS("font-family", "Montserrat");
    await page.getByRole("button", { name: "Полужирный (Ctrl+B)", exact: true }).click(); await page.getByRole("button", { name: "Курсив (Ctrl+I)", exact: true }).click();
    await page.evaluate(() => document.fonts.load('italic 700 14px Montserrat', 'Привет, таблица! Hello world 123'));
    expect(await page.evaluate(() => [...document.fonts].some((font) => font.family.replaceAll('"', '') === 'Montserrat' && font.status === 'loaded' && font.style === 'italic'))).toBeTruthy();
    await expect(peer.locator('[data-cell="1,1"] .cell-value')).toHaveText("Привет, таблица! Hello world 123");
    await button.click(); await menu.getByRole("menuitem", { name: "Другие шрифты", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Шрифты", exact: true });
    expect(await dialog.boundingBox()).toMatchObject({ x: 281.5, y: 124, width: 877, height: 652 });
    await expect(dialog.getByRole("button", { name: "Готово", exact: true })).toBeDisabled();
    await page.screenshot({ path: "artifacts/more-fonts-app.png" });
    await dialog.getByRole("checkbox", { name: "Open Sans", exact: true }).check();
    await dialog.getByLabel("Поиск", { exact: true }).fill("Roboto Mono");
    await expect(dialog.getByRole("checkbox")).toHaveCount(1);
    await dialog.getByRole("button", { name: "Очистить поле поиска", exact: true }).click();
    await dialog.getByLabel("Сценарии", { exact: true }).selectOption("cyrillic"); await dialog.getByLabel("Показать", { exact: true }).selectOption("MONOSPACE");
    await expect(dialog.getByRole("checkbox", { name: "Roboto Mono", exact: true })).toBeVisible();
    await expect(dialog.getByRole("checkbox", { name: "Poppins", exact: true })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Готово", exact: true }).click(); await button.click();
    await menu.getByRole("menuitemcheckbox", { name: "Open Sans", exact: true }).click();
    await expect(peer.locator('[data-cell="2,2"]')).toHaveCSS("font-family", '"Open Sans"');
    await page.reload(); await expect(button).toHaveText(/Arial/); await select("B2"); await expect(button).toHaveText(/Open Sans/);
    const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Файл", exact: true }).click(); await page.getByRole("button", { name: "Скачать Excel (.xlsx)", exact: true }).click();
    const book = new ExcelJS.Workbook(); await book.xlsx.load(await readFile(await (await download).path()));
    expect(book.worksheets[0].getCell("B2").font.name).toBe("Open Sans"); expect(book.worksheets[0].getCell("B2").font.bold).toBeTruthy(); expect(book.worksheets[0].getCell("B2").font.italic).toBeTruthy();
    await select("A1"); await button.click(); await expect(menu.getByRole("menuitemcheckbox", { name: "Open Sans", exact: true })).toHaveCount(1);
    await page.keyboard.press("End"); await expect(menu.locator(".font-menu-list").getByRole("menuitemcheckbox").last()).toBeFocused();
    await page.keyboard.press("Escape"); await expect(menu).toHaveCount(0); await expect(page.getByRole("grid")).toBeFocused();
    await button.click(); await menu.getByRole("menuitemcheckbox", { name: "Times New Roman", exact: true }).click(); await button.click();
    await page.screenshot({ path: "artifacts/font-menu-times-app.png" });
    await page.keyboard.press("Escape");
    await peer.getByLabel("Диапазон", { exact: true }).fill("A1"); await peer.getByLabel("Диапазон", { exact: true }).press("Enter");
    await peer.getByRole("listbox", { name: "Шрифт", exact: true }).click();
    await expect(peer.getByRole("menu", { name: "Выбор шрифта", exact: true }).getByRole("menuitemcheckbox", { name: "Open Sans", exact: true })).toHaveCount(0);
    await page.setViewportSize({ width: 1024, height: 768 }); await button.click(); const narrow = await menu.boundingBox(); expect(narrow.y + narrow.height).toBeLessThanOrEqual(760);
    expect(externalFonts).toEqual([]); expect(errors).toEqual([]);
  } finally { await context.close(); }
});
