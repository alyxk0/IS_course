import { test, expect } from "@playwright/test";

test("format painter preserves formulas, replaces styles, supports undo and repeated painting; precision synchronizes", async ({
  page,
  browser,
}) => {
  const peerContext = await browser.newContext(),
    peer = await peerContext.newPage();
  const stamp = Date.now(),
    password = "FormattingPass1234";
  for (const [context, name] of [
    [page.context(), "owner"],
    [peerContext, "viewer"],
  ]) {
    const r = await context.request.post("/api/auth/register", {
      data: { name, email: `format-${name}-${stamp}@example.com`, password },
    });
    expect(r.ok()).toBeTruthy();
  }
  const doc = await (
    await page.request.post("/api/documents", { data: {} })
  ).json();
  await page.request.put(`/api/documents/${doc.id}/members`, {
    data: { email: `format-viewer-${stamp}@example.com`, role: "viewer" },
  });
  await page.goto(`/?doc=${doc.id}`);
  await expect(page.getByRole("grid")).toBeVisible();
  await page.getByRole("grid").evaluate((el) => {
    const data = new DataTransfer();
    data.setData(
      "text/plain",
      "1.234\tSource\t\t=A1*2\tTarget\n7\tBlank\t\t9\t10",
    );
    el.dispatchEvent(
      new ClipboardEvent("paste", { bubbles: true, clipboardData: data }),
    );
  });
  await expect(page.locator('[data-cell="0,3"] .cell-value')).toHaveText(
    "2.468",
  );
  async function select(range) {
    await page.getByLabel("Диапазон", { exact: true }).fill(range);
    await page.getByLabel("Диапазон", { exact: true }).press("Enter");
  }
  await select("D1:E2");
  await page
    .getByRole("button", { name: "Курсив (Ctrl+I)", exact: true })
    .click();
  await page.getByRole("button", { name: "Цвет заливки", exact: true }).click();
  await page.getByRole("dialog", { name: "Цвет заливки", exact: true }).getByRole("gridcell", { name: "красный", exact: true }).click();
  await expect(page.locator('[data-cell="0,4"]')).toHaveCSS(
    "background-color",
    "rgb(255, 0, 0)",
  );
  await select("A1");
  await page
    .getByRole("button", { name: "Полужирный (Ctrl+B)", exact: true })
    .click();
  await page.getByLabel("Числовой формат", { exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name: "Число", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Увеличить число знаков после запятой",
      exact: true,
    })
    .click();
  await expect(page.locator('[data-cell="0,0"] .cell-value')).toHaveText(
    "1,234",
  );
  await peer.goto(page.url());
  await expect(peer.getByRole("grid")).toBeVisible();
  await select("A1:B2");
  const painter = page.getByRole("button", {
    name: "Копировать форматирование",
    exact: true,
  });
  await painter.click();
  await page.locator('[data-cell="0,3"]').click();
  await expect(page.locator('[data-cell="0,3"] .cell-value')).toHaveText(
    "2,468",
  );
  await expect(peer.locator('[data-cell="0,3"] .cell-value')).toHaveText(
    "2,468",
  );
  await expect(page.locator('[data-cell="0,3"]')).toHaveCSS(
    "font-weight",
    "700",
  );
  await expect(page.locator('[data-cell="0,4"]')).not.toHaveCSS(
    "background-color",
    "rgb(255, 0, 0)",
  );
  await expect(page.locator('[data-cell="0,4"] .cell-value')).toHaveText(
    "Target",
  );
  await expect(page.locator('[data-cell="1,3"] .cell-value')).toHaveText("9");
  await expect(painter).not.toHaveClass(/active/);
  await page.locator('[data-cell="0,3"]').click();
  await expect(page.getByLabel("Строка формул", { exact: true })).toHaveValue(
    "=A1*2",
  );
  await page
    .getByRole("button", { name: "Отменить (Ctrl+Z)", exact: true })
    .click();
  await expect(page.locator('[data-cell="0,4"]')).toHaveCSS(
    "background-color",
    "rgb(255, 0, 0)",
  );
  await expect(page.getByLabel("Строка формул", { exact: true })).toHaveValue(
    "=A1*2",
  );
  await select("A1");
  await painter.dblclick();
  await page.locator('[data-cell="0,6"]').click();
  await expect(painter).toHaveClass(/active/);
  await page.locator('[data-cell="0,7"]').click();
  await expect(painter).toHaveClass(/active/);
  await page.getByRole("grid").press("Escape");
  await expect(painter).not.toHaveClass(/active/);
  const saved = await (
    await page.request.get(`/api/documents/${doc.id}`)
  ).json();
  expect(saved.state.sheets[0].cells["0,6"].style.decimalPlaces).toBe(3);
  expect(saved.state.sheets[0].cells["0,7"].style.decimalPlaces).toBe(3);
  expect(saved.state.sheets[0].cells["0,6"].value).toBeUndefined();
  await select("A1");
  await page
    .getByRole("button", {
      name: "Уменьшить число знаков после запятой",
      exact: true,
    })
    .click();
  await expect(peer.locator('[data-cell="0,0"] .cell-value')).toHaveText(
    "1,23",
  );
  await page.getByLabel("Числовой формат", { exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name: "Автоматический формат", exact: true }).click();
  await expect(page.locator('[data-cell="0,0"] .cell-value')).toHaveText(
    "1.234",
  );
  for (const [label, x] of [
    ["Копировать форматирование", 158],
    ["Масштаб", 190],
    ["Увеличить число знаков после запятой", 370],
    ["Шрифт", 443],
    ["Полужирный (Ctrl+B)", 646],
  ]) {
    const el =
      label === "Масштаб" || label === "Шрифт"
        ? page.getByLabel(label, { exact: true })
        : page.getByRole("button", { name: label, exact: true });
    expect((await el.boundingBox()).x).toBe(x);
  }
  await page.screenshot({ path: "test-results/formatting-toolbar.png" });
  await peerContext.close();
});
