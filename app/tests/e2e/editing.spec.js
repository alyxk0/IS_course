import { test, expect } from "@playwright/test";

test("formula bar, undo, formatting, structural edits, Excel download and narrow layout", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Создать аккаунт", exact: true })
    .click();
  await page.getByLabel("Имя", { exact: true }).fill("Тест редактора");
  await page
    .getByLabel("Электронная почта")
    .fill(`editing${Date.now()}@example.com`);
  await page.getByLabel("Пароль", { exact: true }).fill("TestPass12345");
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  await page.locator(".blank-template").click();
  await expect(page.getByRole("grid")).toBeVisible();
  await page.getByLabel("Строка формул", { exact: true }).fill("7");
  await page.getByLabel("Строка формул", { exact: true }).press("Enter");
  await expect(page.locator('[data-cell="0,0"] .cell-value')).toHaveText("7");
  await page.locator('[data-cell="0,0"]').click();
  await page.getByRole("button", { name: "Полужирный (Ctrl+B)" }).click();
  await expect(page.locator('[data-cell="0,0"]')).toHaveCSS(
    "font-weight",
    "700",
  );
  await page.getByRole("button", { name: "Отменить (Ctrl+Z)" }).click();
  await expect(page.locator('[data-cell="0,0"]')).toHaveCSS(
    "font-weight",
    "400",
  );
  await page.getByRole("button", { name: "Повторить (Ctrl+Y)" }).click();
  await expect(page.locator('[data-cell="0,0"]')).toHaveCSS(
    "font-weight",
    "700",
  );
  await page.getByLabel("Диапазон", { exact: true }).fill("B1");
  await page.getByLabel("Диапазон", { exact: true }).press("Enter");
  await page.getByRole("grid").press("=");
  await page.getByLabel("Редактирование B1", { exact: true }).fill("=A1*2");
  await page.getByLabel("Редактирование B1", { exact: true }).press("Enter");
  await expect(page.locator('[data-cell="0,1"] .cell-value')).toHaveText("14");
  await page.locator('[data-cell="0,0"]').click();
  await page.getByRole("button", { name: "Вставка", exact: true }).click();
  await page.getByRole("button", { name: "Строки выше", exact: true }).click();
  await expect(page.locator('[data-cell="1,1"] .cell-value')).toHaveText("14");
  await page.locator('[data-cell="1,1"]').click();
  await expect(page.getByLabel("Строка формул", { exact: true })).toHaveValue(
    "=A2*2",
  );
  const handle = await page.locator(".fill-handle").boundingBox(),
    target = await page.locator('[data-cell="2,1"]').boundingBox();
  await page.mouse.move(handle.x + 3, handle.y + 3);
  await page.mouse.down();
  await page.mouse.move(
    target.x + target.width / 2,
    target.y + target.height / 2,
    { steps: 5 },
  );
  await page.mouse.up();
  await page.locator('[data-cell="2,1"]').click();
  await expect(page.getByLabel("Строка формул", { exact: true })).toHaveValue(
    "=A3*2",
  );
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  await expect(page.locator('[data-cell="2,1"]')).toBeVisible();
  expect(
    await page.locator(".sheet-grid tbody tr:not(.spacer-row)").count(),
  ).toBe(3);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await page
    .getByRole("button", { name: "Скрыть меню (Ctrl+Shift+F)", exact: true })
    .click();
  await expect(page.locator(".editor-header")).toBeHidden();
  expect((await page.locator(".sheet-grid").boundingBox()).y).toBe(83);
  await page.screenshot({ path: "test-results/editor-collapsed.png" });
  await page.getByRole("grid").focus();
  await page.keyboard.press("Control+Shift+F");
  await expect(page.locator(".editor-header")).toBeVisible();
  await page.locator('[data-cell="2,1"]').dblclick();
  const activeEdit = page.getByLabel("Редактирование B3", { exact: true });
  await activeEdit.fill("=A3*3");
  await activeEdit.press("Control+Shift+F");
  await expect(page.locator(".editor-header")).toBeHidden();
  await expect(activeEdit).toHaveValue("=A3*3");
  await activeEdit.press("Escape");
  await expect(page.getByLabel("Строка формул", { exact: true })).toHaveValue(
    "=A3*2",
  );
  await page
    .getByRole("button", { name: "Показать меню (Ctrl+Shift+F)", exact: true })
    .click();
  await expect(page.locator(".editor-header")).toBeVisible();
  await page.getByRole("button", { name: "Файл", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Скачать Excel (.xlsx)", exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("Новая таблица.xlsx");
  expect(await download.failure()).toBeNull();
  await page
    .getByRole("button", { name: "Настройки доступа", exact: true })
    .click();
  await page.screenshot({ path: "test-results/share-dialog.png" });
  await page.getByRole("button", { name: "Готово", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/editor-mobile.png" });
  await expect(page.getByRole("grid")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  expect(errors).toEqual([]);
});
