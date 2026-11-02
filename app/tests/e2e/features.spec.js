import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("rules, dropdowns, checkboxes and live charts work for an owner, editor and viewer", async ({
  page,
  browser,
}) => {
  const editorContext = await browser.newContext(),
    viewerContext = await browser.newContext(),
    editor = await editorContext.newPage(),
    viewer = await viewerContext.newPage(),
    errors = [];
  for (const p of [page, editor, viewer])
    p.on("pageerror", (e) => errors.push(e.message));
  const stamp = Date.now(),
    ownerEmail = `features${stamp}@example.com`,
    editorEmail = `features-editor${stamp}@example.com`,
    viewerEmail = `features-viewer${stamp}@example.com`;
  for (const [request, name, email] of [
    [page.request, "Аналитик", ownerEmail],
    [editorContext.request, "Редактор", editorEmail],
    [viewerContext.request, "Читатель", viewerEmail],
  ]) {
    const response = await request.post("/api/auth/register", {
      data: { name, email, password: "FeaturesPass123" },
    });
    expect(response.ok()).toBeTruthy();
  }
  const doc = await (
    await page.request.post("/api/documents", { data: {} })
  ).json();
  for (const [email, role] of [
    [editorEmail, "editor"],
    [viewerEmail, "viewer"],
  ])
    expect(
      (
        await page.request.put(`/api/documents/${doc.id}/members`, {
          data: { email, role },
        })
      ).ok(),
    ).toBeTruthy();
  for (const p of [page, editor, viewer]) {
    await p.goto(`/?doc=${doc.id}`);
    await expect(p.getByRole("grid")).toBeVisible();
  }
  async function range(p, value) {
    await p.getByLabel("Диапазон", { exact: true }).fill(value);
    await p.getByLabel("Диапазон", { exact: true }).press("Enter");
  }
  async function input(p, value) {
    await p.getByLabel("Строка формул", { exact: true }).fill(value);
    await p.getByLabel("Строка формул", { exact: true }).press("Enter");
  }
  async function paste(p, text) {
    await p.getByRole("grid").evaluate((el, text) => {
      const data = new DataTransfer();
      data.setData("text/plain", text);
      el.dispatchEvent(
        new ClipboardEvent("paste", { bubbles: true, clipboardData: data }),
      );
    }, text);
  }
  async function menu(p, name, action) {
    await p.getByRole("button", { name, exact: true }).click();
    await p.getByRole(["Формат", "Данные"].includes(name) ? "menuitem" : "button", { name: action, exact: true }).click();
  }
  await paste(
    page,
    "Месяц\tВыручка\tСтатус\nЯнварь\t10\tПлан\nФевраль\t20\tГотово\nМарт\t=SUM(B2:B3)\tПлан",
  );
  await expect(viewer.locator('[data-cell="3,1"] .cell-value')).toHaveText(
    "30",
  );
  await range(page, "B2:B4");
  await menu(page, "Формат", "Условное форматирование");
  const conditional = page.getByRole("complementary", {
    name: "Условное форматирование",
  });
  await conditional
    .getByLabel("Условие форматирования", { exact: true })
    .selectOption("gt");
  await conditional.getByLabel("Значение условия", { exact: true }).fill("15");
  await conditional
    .getByLabel("Заливка правила", { exact: true })
    .fill("#f4cccc");
  await conditional
    .getByRole("button", { name: "Готово", exact: true })
    .click();
  await expect(viewer.locator('[data-cell="2,1"]')).toHaveCSS(
    "background-color",
    "rgb(244, 204, 204)",
  );
  await expect(viewer.locator('[data-cell="1,1"]')).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await page.screenshot({ path: "test-results/conditional-sidebar.png" });
  await range(page, "C2:C4");
  await menu(page, "Данные", "Настроить проверку данных");
  const validation = page.getByRole("complementary", {
    name: "Проверка данных",
  });
  await validation.getByLabel("Вариант списка 1", { exact: true }).fill("План");
  await validation
    .getByLabel("Вариант списка 2", { exact: true })
    .fill("Готово");
  await validation.getByRole("button", { name: "Готово", exact: true }).click();
  await editor.getByRole("button", { name: "Список C2", exact: true }).click();
  await editor.getByRole("option", { name: "Готово", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Список C2", exact: true }),
  ).toHaveText("Готово");
  await expect(
    viewer.getByRole("button", { name: "Список C2", exact: true }),
  ).toBeDisabled();
  await range(editor, "C2");
  await input(editor, "Недопустимо");
  await expect(editor.locator(".error-banner")).toContainText(
    "проверке данных",
  );
  await expect(
    page.getByRole("button", { name: "Список C2", exact: true }),
  ).toHaveText("Готово");
  await editor
    .getByRole("button", { name: "Скрыть ошибку", exact: true })
    .click();
  await validation.locator(".rule-details").click();
  await validation
    .getByLabel("Показывать предупреждение", { exact: true })
    .check();
  await validation.getByRole("button", { name: "Готово", exact: true }).click();
  await range(editor, "C2");
  await input(editor, "Недопустимо");
  await expect(viewer.locator('[data-cell="1,2"]')).toHaveAttribute(
    "data-invalid",
    "true",
  );
  await editor.getByRole("button", { name: "Список C2", exact: true }).click();
  await editor.getByRole("option", { name: "План", exact: true }).click();
  await expect(viewer.locator('[data-cell="1,2"]')).not.toHaveAttribute(
    "data-invalid",
    "true",
  );
  await range(page, "D2:D4");
  await menu(page, "Вставка", "Флажок");
  await editor
    .getByRole("checkbox", { name: "Флажок D2", exact: true })
    .check();
  await expect(
    viewer.getByRole("checkbox", { name: "Флажок D2", exact: true }),
  ).toBeChecked();
  await expect(
    viewer.getByRole("checkbox", { name: "Флажок D2", exact: true }),
  ).toBeDisabled();
  await range(page, "E2:E4");
  await validation
    .getByRole("button", { name: "Добавить правило", exact: true })
    .click();
  await validation
    .getByLabel("Критерий проверки", { exact: true })
    .selectOption("number");
  await validation
    .getByLabel("Числовая проверка", { exact: true })
    .selectOption("between");
  await validation.getByLabel("Число для проверки", { exact: true }).fill("1");
  await validation
    .getByLabel("Верхняя граница проверки", { exact: true })
    .fill("3");
  await validation.getByRole("button", { name: "Готово", exact: true }).click();
  await range(editor, "E2");
  await input(editor, "=1+1");
  await expect(page.locator('[data-cell="1,4"] .cell-value')).toHaveText("2");
  await range(page, "H2:H3");
  await validation
    .getByRole("button", { name: "Добавить правило", exact: true })
    .click();
  await validation
    .getByLabel("Критерий проверки", { exact: true })
    .selectOption("date");
  await validation.getByRole("button", { name: "Готово", exact: true }).click();
  await range(editor, "H2");
  await input(editor, "=DATE(2026,10,19)");
  await expect(page.locator('[data-cell="1,7"] .cell-value')).toHaveText(
    "2026-10-19",
  );
  await page
    .getByRole("button", { name: "Закрыть боковую панель", exact: true })
    .click();
  await range(page, "A1:B4");
  await page
    .getByRole("button", { name: "Вставить диаграмму", exact: true })
    .click();
  const chart = page.locator(".chart-card"),
    chartEditor = page.getByRole("complementary", {
      name: "Редактор диаграмм",
    });
  await expect(chart).toHaveCount(1);
  await expect(viewer.locator(".chart-card")).toHaveCount(1);
  await expect(
    chart.locator('[data-series="0"][data-row="0"]'),
  ).toHaveAttribute("data-value", "10");
  const oldHeight = Number(
    await chart
      .locator('[data-series="0"][data-row="0"]')
      .getAttribute("height"),
  );
  await chartEditor
    .getByRole("button", { name: "Дополнительные", exact: true })
    .click();
  await chartEditor
    .getByLabel("Название диаграммы", { exact: true })
    .fill("Выручка по месяцам");
  await chartEditor
    .getByLabel("Название диаграммы", { exact: true })
    .press("Enter");
  await expect(
    viewer.getByRole("img", { name: "Выручка по месяцам", exact: true }),
  ).toBeVisible();
  await range(editor, "B2");
  await input(editor, "25");
  await expect(
    chart.locator('[data-series="0"][data-row="0"]'),
  ).toHaveAttribute("data-value", "25");
  await expect(
    chart.locator('[data-series="0"][data-row="2"]'),
  ).toHaveAttribute("data-value", "45");
  expect(
    Number(
      await chart
        .locator('[data-series="0"][data-row="0"]')
        .getAttribute("height"),
    ),
  ).toBeGreaterThan(oldHeight);
  await expect(viewer.locator('[data-cell="1,1"]')).toHaveCSS(
    "background-color",
    "rgb(244, 204, 204)",
  );
  await chartEditor
    .getByRole("button", { name: "Настройка", exact: true })
    .click();
  for (const type of ["line", "area", "pie", "bar"]) {
    await chartEditor
      .getByLabel("Тип диаграммы", { exact: true })
      .selectOption(type);
    await expect
      .poll(
        async () =>
          (await (await page.request.get(`/api/documents/${doc.id}`)).json())
            .state.sheets[0].charts[0].type,
      )
      .toBe(type);
  }
  await range(editor, "F1");
  await paste(editor, "X\tY\n1\t2\n2\t4\n3\t9");
  await expect(page.locator('[data-cell="3,6"] .cell-value')).toHaveText("9");
  await chartEditor
    .getByLabel("Диапазон диаграммы", { exact: true })
    .fill("F1:G4");
  await chartEditor
    .getByLabel("Диапазон диаграммы", { exact: true })
    .press("Enter");
  await chartEditor
    .getByLabel("Тип диаграммы", { exact: true })
    .selectOption("scatter");
  await expect(chart.locator('circle[data-value="9"]')).toHaveCount(1);
  await expect(
    viewer.locator('.chart-card circle[data-value="9"]'),
  ).toHaveCount(1);
  await page.screenshot({ path: "test-results/chart-sidebar.png" });
  const handle = await chart.locator(".chart-resize-handle").boundingBox();
  await page.mouse.move(handle.x + 4, handle.y + 4);
  await page.mouse.down();
  await page.mouse.move(handle.x + 104, handle.y + 54, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`/api/documents/${doc.id}`)).json())
          .state.sheets[0].charts[0].width,
    )
    .toBe(700);
  await viewer
    .getByRole("button", {
      name: "Меню диаграммы Выручка по месяцам",
      exact: true,
    })
    .click();
  const downloadPromise = viewer.waitForEvent("download");
  await viewer
    .getByRole("button", { name: "Скачать SVG", exact: true })
    .click();
  expect((await downloadPromise).suggestedFilename()).toBe(
    "Выручка по месяцам.svg",
  );
  const excelPromise = page.waitForEvent("download");
  await menu(page, "Файл", "Скачать Excel (.xlsx)");
  const excel = await excelPromise;
  expect(await excel.failure()).toBeNull();
  const excelBytes = await readFile(await excel.path());
  expect(excelBytes.subarray(0, 2).toString()).toBe("PK");
  await page.reload();
  await expect(
    page.getByRole("img", { name: "Выручка по месяцам", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "Флажок D2", exact: true }),
  ).toBeChecked();
  expect(errors).toEqual([]);
  await editorContext.close();
  await viewerContext.close();
});
