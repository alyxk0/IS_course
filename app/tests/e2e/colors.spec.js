import { test, expect } from "@playwright/test";
test("text and fill palettes match reference geometry, synchronize ranges, reset, undo, and support keyboard and custom colors", async ({ page, browser }) => {
  const context = await browser.newContext(), peer = await context.newPage(), stamp = Date.now(), errors = [];
  for (const p of [page, peer]) p.on("pageerror", (error) => errors.push(error.message));
  try {
    for (const [client, name] of [[page.request, "owner"], [context.request, "viewer"]])
      expect((await client.post("/api/auth/register", { data: { name, email: `colors-${name}-${stamp}@example.com`, password: "ColorsPass123" } })).ok()).toBeTruthy();
    const doc = await (await page.request.post("/api/documents", { data: {} })).json();
    await page.request.put(`/api/documents/${doc.id}/members`, { data: { email: `colors-viewer-${stamp}@example.com`, role: "viewer" } });
    await page.goto(`/?doc=${doc.id}`); await peer.goto(`/?doc=${doc.id}`);
    const select = async (range) => { await page.getByLabel("Диапазон", { exact: true }).fill(range); await page.getByLabel("Диапазон", { exact: true }).press("Enter"); };
    const open = (name) => page.getByRole("button", { name, exact: true }).click();
    const cell = (key) => peer.locator(`[data-cell="${key}"]`);
    await select("B2:C3"); await open("Цвет текста");
    const text = page.getByRole("dialog", { name: "Цвет текста", exact: true }), fill = page.getByRole("dialog", { name: "Цвет заливки", exact: true });
    const box = await text.boundingBox(); expect(box).toMatchObject({ x: 742, y: 100, width: 257.765625, height: 395 });
    await expect(text.getByRole("grid", { name: "Палитра цветов", exact: true }).getByRole("gridcell")).toHaveCount(80);
    await page.screenshot({ path: "artifacts/text-colors-app.png" });
    await text.getByRole("gridcell", { name: "красный", exact: true }).click();
    await expect(cell("2,2")).toHaveCSS("color", "rgb(255, 0, 0)");
    await page.getByRole("grid").press("Control+z"); await expect(cell("2,2")).not.toHaveCSS("color", "rgb(255, 0, 0)");
    await page.getByRole("grid").press("Control+y"); await expect(cell("2,2")).toHaveCSS("color", "rgb(255, 0, 0)");
    await open("Цвет заливки"); expect(await fill.boundingBox()).toMatchObject({ x: 783, y: 100, width: 257.765625, height: 427 });
    await page.screenshot({ path: "artifacts/fill-colors-app.png" });
    await fill.getByRole("gridcell", { name: "желтый", exact: true }).click();
    await expect(cell("1,1")).toHaveCSS("background-color", "rgb(255, 255, 0)");
    await open("Цвет заливки"); await fill.getByRole("button", { name: "Сбросить параметры", exact: true }).click();
    await expect(cell("1,1")).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(cell("1,1")).toHaveCSS("color", "rgb(255, 0, 0)");
    await open("Цвет текста"); await text.getByRole("button", { name: "Сбросить параметры", exact: true }).click();
    await expect(cell("1,1")).not.toHaveCSS("color", "rgb(255, 0, 0)");
    await open("Цвет заливки"); await fill.getByLabel("Пользовательский цвет заливки", { exact: true }).fill("#123456");
    await expect(cell("2,2")).toHaveCSS("background-color", "rgb(18, 52, 86)");
    await open("Цвет текста"); await text.getByRole("gridcell", { name: "#123456", exact: true }).click();
    await expect(cell("2,2")).toHaveCSS("color", "rgb(18, 52, 86)");
    await open("Цвет текста"); await open("Цвет текста"); await expect(text).toHaveCount(0);
    await open("Цвет текста"); await text.getByRole("gridcell", { name: "красный", exact: true }).focus(); await page.keyboard.press("Home");
    await expect(text.getByRole("grid", { name: "Палитра цветов", exact: true }).getByRole("gridcell").first()).toBeFocused();
    await page.keyboard.press("Escape"); await expect(text).toHaveCount(0); await expect(page.getByRole("grid")).toBeFocused();
    await open("Цвет заливки"); await fill.getByRole("button", { name: "Условное форматирование", exact: true }).click();
    await expect(fill).toHaveCount(0); await expect(page.locator(".editor-sidebar")).toBeVisible();
    await page.reload(); await expect(page.locator('[data-cell="2,2"]')).toHaveCSS("background-color", "rgb(18, 52, 86)");
    await page.setViewportSize({ width: 1024, height: 768 }); await open("Цвет заливки");
    const narrow = await fill.boundingBox(); expect(narrow.x).toBeGreaterThanOrEqual(8); expect(narrow.x + narrow.width).toBeLessThanOrEqual(1016);
    await expect(peer.getByRole("button", { name: "Цвет текста", exact: true })).toHaveCount(0); expect(errors).toEqual([]);
  } finally { await context.close(); }
});
