import { test, expect } from "@playwright/test";

test("temporary view sorts and filters privately, updates formulas, blocks writes and leaves no saved view", async ({ page, browser }) => {
  const context = await browser.newContext(), reader = await context.newPage(), stamp = Date.now();
  try {
    for (const [client, name] of [[page.request, "owner"], [context.request, "reader"]]) {
      expect((await client.post("/api/auth/register", { data: {
        name, email: `temporary-${name}-${stamp}@example.com`, password: "TemporaryPass1234",
      } })).ok()).toBeTruthy();
    }
    const doc = await (await page.request.post("/api/documents", { data: {} })).json(),
      url = `/?doc=${doc.id}`;
    expect((await page.request.put(`/api/documents/${doc.id}/members`, { data: {
      email: `temporary-reader-${stamp}@example.com`, role: "viewer",
    } })).ok()).toBeTruthy();
    await page.goto(url);
    await page.getByRole("grid").evaluate((grid) => {
      const clipboardData = new DataTransfer();
      clipboardData.setData("text/plain", "Name\tValue\tDouble\nBravo\t10\t=B2*2\nAlpha\t20\t=B3*2\nCharlie\t30\t=B4*2");
      grid.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, clipboardData }));
    });
    await expect(page.locator('[data-cell="3,2"] .cell-value')).toHaveText("60");
    await reader.goto(url);
    const cell = (p, key) => p.locator(`[data-cell="${key}"] .cell-value`);
    await expect(cell(reader, "1,0")).toHaveText("Bravo");
    const before = await (await page.request.get(`/api/documents/${doc.id}`)).json();
    await reader.getByRole("button", { name: "Режимы фильтрации", exact: true }).click();
    await reader.getByRole("button", { name: "Создать временный просмотр", exact: true }).click();
    await expect(reader.locator(".readonly-mode")).toHaveText("Временный просмотр");
    await reader.locator('[data-cell="0,0"] .column-filter-button').click();
    await reader.getByRole("button", { name: "Сортировать А → Я", exact: true }).click();
    await expect(cell(reader, "1,0")).toHaveText("Alpha");
    await expect(cell(reader, "1,2")).toHaveText("40");
    await expect(cell(page, "1,0")).toHaveText("Bravo");
    await reader.getByLabel("Диапазон", { exact: true }).fill("A2:C3");
    await reader.getByLabel("Диапазон", { exact: true }).press("Enter");
    const copied = await reader.getByRole("grid").evaluate((grid) => {
      const clipboardData = new DataTransfer();
      grid.dispatchEvent(new ClipboardEvent("copy", { bubbles: true, clipboardData }));
      return { plain: clipboardData.getData("text/plain"), types: [...clipboardData.types] };
    });
    expect(copied.plain).toBe("Alpha\t20\t40\nBravo\t10\t20");
    expect(copied.types).toEqual(["text/plain"]);
    await reader.locator('[data-cell="0,0"] .column-filter-button').click();
    await reader.locator(".filter-values label").filter({ hasText: "Bravo" }).getByRole("checkbox").uncheck();
    await reader.getByRole("button", { name: "ОК", exact: true }).click();
    await expect(reader.locator('[data-cell="2,0"]')).toHaveCount(0);
    await reader.getByLabel("Диапазон", { exact: true }).fill("A2:C4");
    await reader.getByLabel("Диапазон", { exact: true }).press("Enter");
    const filteredCopy = await reader.getByRole("grid").evaluate((grid) => {
      const clipboardData = new DataTransfer();
      grid.dispatchEvent(new ClipboardEvent("copy", { bubbles: true, clipboardData }));
      return clipboardData.getData("text/plain");
    });
    expect(filteredCopy).toBe("Alpha\t20\t40\nCharlie\t30\t60");
    expect((await (await page.request.get(`/api/documents/${doc.id}`)).json()).revision).toBe(before.revision);
    await page.getByLabel("Диапазон", { exact: true }).fill("B3");
    await page.getByLabel("Диапазон", { exact: true }).press("Enter");
    await page.getByLabel("Строка формул", { exact: true }).fill("25");
    await page.getByLabel("Строка формул", { exact: true }).press("Enter");
    await expect(cell(reader, "1,2")).toHaveText("50");
    await reader.getByRole("button", { name: "Закрыть временный просмотр", exact: true }).click();
    await expect(cell(reader, "1,0")).toHaveText("Bravo");
    await expect(cell(reader, "2,2")).toHaveText("50");
    await page.getByRole("button", { name: "Режимы фильтрации", exact: true }).click();
    await page.getByRole("button", { name: "Создать временный просмотр", exact: true }).click();
    await expect(page.locator(".readonly-mode")).toHaveText("Временный просмотр");
    await page.getByLabel("Диапазон", { exact: true }).fill("A2");
    await page.getByLabel("Диапазон", { exact: true }).press("Enter");
    await page.getByRole("grid").press("Delete");
    await expect(cell(page, "1,0")).toHaveText("Bravo");
    await page.getByRole("grid").evaluate((grid) => {
      const clipboardData = new DataTransfer(); clipboardData.setData("text/plain", "FORBIDDEN");
      grid.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, clipboardData }));
    });
    await expect(cell(page, "1,0")).toHaveText("Bravo");
    await page.getByRole("grid").evaluate((grid) => { grid.scrollTop = 0; });
    await page.screenshot({ path: "artifacts/temporary-view-app.png" });
    await page.reload();
    await expect(page.getByRole("button", { name: "Создать фильтр", exact: true })).toBeVisible();
    const current = await (await page.request.get(`/api/documents/${doc.id}`)).json();
    expect(current.state.sheets[0].filter).toBeFalsy();
    expect(current.state.sheets[0].cells["1,0"].value).toBe("Bravo");
    expect(current.revision).toBe(before.revision + 1);
    await reader.getByRole("button", { name: "Режимы фильтрации", exact: true }).click();
    await reader.getByRole("button", { name: "Создать временный просмотр", exact: true }).click();
    await expect(reader.locator(".readonly-mode")).toHaveText("Временный просмотр");
    await page.getByLabel("Диапазон", { exact: true }).fill("A10");
    await page.getByLabel("Диапазон", { exact: true }).press("Enter");
    await page.getByRole("button", { name: "Правка", exact: true }).click();
    await page.getByRole("button", { name: "Удалить строки", exact: true }).click();
    await expect(reader.locator(".readonly-mode")).toHaveText("Только просмотр");
  } finally { await context.close(); }
});
