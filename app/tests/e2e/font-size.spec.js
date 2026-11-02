import { test, expect } from "@playwright/test";
test("font-size presets match reference, drafts do not broadcast, Escape cancels and blur keeps the original range", async ({ page, browser }) => {
  const context = await browser.newContext(), peer = await context.newPage(), stamp = Date.now(), errors = [];
  for (const p of [page, peer]) p.on("pageerror", (error) => errors.push(error.message));
  try {
    for (const [client, name] of [[page.request, "owner"], [context.request, "viewer"]])
      expect((await client.post("/api/auth/register", { data: { name, email: `size-${name}-${stamp}@example.com`, password: "FontSizePass123" } })).ok()).toBeTruthy();
    const doc = await (await page.request.post("/api/documents", { data: {} })).json();
    await page.request.put(`/api/documents/${doc.id}/members`, { data: { email: `size-viewer-${stamp}@example.com`, role: "viewer" } });
    await page.goto(`/?doc=${doc.id}`); await peer.goto(`/?doc=${doc.id}`);
    const select = async (range) => { await page.getByLabel("Диапазон", { exact: true }).fill(range); await page.getByLabel("Диапазон", { exact: true }).press("Enter"); };
    const input = page.getByRole("combobox", { name: "Размер шрифта", exact: true }), menu = page.getByRole("listbox", { name: "Размеры шрифта", exact: true });
    const size = async (key, points) => expect.poll(() => peer.locator(`[data-cell="${key}"]`).evaluate((cell) => Math.round(parseFloat(getComputedStyle(cell).fontSize) * 3 / 4))).toBe(points);
    await select("B2:C3"); await input.click();
    expect(await menu.boundingBox()).toMatchObject({ x: 572.5, y: 98, width: 41, height: 366 });
    await expect(menu.getByRole("option")).toHaveCount(11); await page.screenshot({ path: "artifacts/font-size-app.png" });
    await menu.getByRole("option", { name: "18", exact: true }).click(); await size("2,2", 18);
    await input.fill("80"); await size("2,2", 18); await input.press("Escape"); await expect(input).toHaveValue("18");
    await input.fill("80"); await input.press("Enter"); await size("2,2", 80);
    await page.getByRole("grid").press("Control+z"); await size("2,2", 18); await page.getByRole("grid").press("Control+y"); await size("2,2", 80);
    await input.fill("26"); await page.locator('[data-cell="5,5"]').click({ position: { x: 5, y: 5 } }); await size("1,1", 26); await size("5,5", 10); await expect(input).toHaveValue("10");
    await select("B2:C3"); await input.fill("10"); await page.locator('[data-cell="5,5"]').click({ position: { x: 5, y: 5 } }); await size("1,1", 10); await size("5,5", 10);
    await select("B2"); await input.fill("18"); await input.press("Enter"); await size("1,1", 18);
    await select("B2:C3"); await input.click(); await menu.getByRole("option", { name: "18", exact: true }).click(); await size("2,2", 18);
    await select("B2:C3"); await input.fill("12.5"); await input.press("Enter"); await size("2,2", 12);
    await input.fill("abc"); await input.press("Enter"); await expect(input).toHaveAttribute("aria-invalid", "true"); await size("2,2", 12); await input.press("Escape");
    await input.fill("9999"); await input.press("Enter"); await size("2,2", 400);
    await input.fill("1"); await input.press("Enter"); await size("2,2", 1);
    await page.getByRole("grid").press("Control+Shift+Period"); await size("2,2", 2); await page.getByRole("grid").press("Control+Shift+Comma"); await size("2,2", 1);
    await page.getByRole("button", { name: "Увеличить размер шрифта", exact: true }).click(); await size("2,2", 2);
    await input.click(); await input.press("End"); await input.press("Enter"); await size("2,2", 36);
    await input.click(); await page.setViewportSize({ width: 1024, height: 768 }); await expect(menu).toHaveCount(0);
    await input.fill("28"); await input.press("Enter"); await size("2,2", 28);
    await page.reload(); await select("B2"); await expect(input).toHaveValue("28");
    await expect(peer.getByLabel("Размер шрифта", { exact: true })).toHaveCount(0); expect(errors).toEqual([]);
  } finally { await context.close(); }
});
