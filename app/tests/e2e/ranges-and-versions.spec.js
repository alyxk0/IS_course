import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("filters, merged cells, wrapping and version restoration synchronize across two accounts", async ({
  page,
  browser,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const stamp = Date.now(),
    peerContext = await browser.newContext(),
    peer = await peerContext.newPage();
  const ownerEmail = `ranges${stamp}@example.com`,
    peerEmail = `ranges-peer${stamp}@example.com`;
  const registration = await page.request.post("/api/auth/register", {
    data: {
      name: "Редактор диапазонов",
      email: ownerEmail,
      password: "RangesPass1234",
    },
  });
  expect(registration.ok()).toBeTruthy();
  const peerRegistration = await peerContext.request.post(
    "/api/auth/register",
    {
      data: {
        name: "Наблюдатель",
        email: peerEmail,
        password: "RangesPass1234",
      },
    },
  );
  expect(peerRegistration.ok()).toBeTruthy();
  const doc = await (
    await page.request.post("/api/documents", { data: {} })
  ).json();
  await page.request.put(`/api/documents/${doc.id}/members`, {
    data: { email: peerEmail, role: "viewer" },
  });
  await page.goto(`/?doc=${doc.id}`);
  await peer.goto(`/?doc=${doc.id}`);
  await expect(page.getByRole("grid")).toBeVisible();
  await expect(peer.getByRole("grid")).toBeVisible();
  await page.getByRole("grid").evaluate((el) => {
    const data = new DataTransfer();
    data.setData(
      "text/plain",
      "Товар\tГород\tСумма\nКнига\tМосква\t100\nРучка\tКазань\t50\nБлокнот\tМосква\t200\nПапка\tКазань\t70",
    );
    el.dispatchEvent(
      new ClipboardEvent("paste", { bubbles: true, clipboardData: data }),
    );
  });
  await expect(peer.locator('[data-cell="4,2"] .cell-value')).toHaveText("70");
  async function range(text) {
    await page.getByLabel("Диапазон", { exact: true }).fill(text);
    await page.getByLabel("Диапазон", { exact: true }).press("Enter");
  }
  async function input(text) {
    await page.getByLabel("Строка формул", { exact: true }).fill(text);
    await page.getByLabel("Строка формул", { exact: true }).press("Enter");
  }
  await range("A1:C5");
  await page
    .getByRole("button", { name: "Создать фильтр", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Фильтр столбца B", exact: true })
    .click();
  await page.getByRole("button", { name: "Очистить", exact: true }).click();
  await page.getByLabel("Москва", { exact: true }).check();
  await page.getByRole("button", { name: "ОК", exact: true }).click();
  await expect(page.locator('[data-cell="2,0"]')).toHaveCount(0);
  await expect(page.locator('[data-cell="3,0"] .cell-value')).toHaveText(
    "Блокнот",
  );
  await expect(peer.locator('[data-cell="2,0"]')).toHaveCount(0);
  await expect(
    peer.getByRole("button", { name: "Удалить фильтр", exact: true }),
  ).toHaveCount(0);
  await expect(
    peer.getByText("Только просмотр", { exact: true }),
  ).toBeVisible();
  await range("A2");
  await page.getByRole("grid").press("ArrowDown");
  await expect(page.getByLabel("Диапазон", { exact: true })).toHaveValue("A4");
  await page
    .getByRole("button", { name: "Удалить фильтр", exact: true })
    .click();
  await expect(peer.locator('[data-cell="2,0"] .cell-value')).toHaveText(
    "Ручка",
  );
  await range("E1");
  await input("Шапка таблицы");
  await range("E1:F2");
  await page
    .getByRole("button", { name: "Объединить ячейки", exact: true })
    .click();
  await expect(page.locator('[data-cell="0,4"]')).toHaveAttribute(
    "colspan",
    "2",
  );
  await expect(page.locator('[data-cell="0,4"]')).toHaveAttribute(
    "rowspan",
    "2",
  );
  await expect(peer.locator('[data-cell="1,5"]')).toHaveCount(0);
  await expect(peer.locator('[data-cell="0,4"] .cell-value')).toHaveText(
    "Шапка таблицы",
  );
  const saved = await (
    await page.request.get(`/api/documents/${doc.id}`)
  ).json();
  await range("E1");
  await input("Изменённая шапка");
  await expect(peer.locator('[data-cell="0,4"] .cell-value')).toHaveText(
    "Изменённая шапка",
  );
  await page
    .getByRole("button", { name: "История изменений", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: `Просмотреть версию ${saved.revision}`,
      exact: true,
    })
    .click();
  await expect(page.locator(".version-preview")).toContainText("Шапка таблицы");
  await page
    .getByRole("button", { name: "Восстановить эту версию", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(peer.locator('[data-cell="0,4"] .cell-value')).toHaveText(
    "Шапка таблицы",
  );
  await range("G1");
  await input(
    "Очень длинный текст для проверки переноса на несколько строк внутри ячейки таблицы",
  );
  await range("G1");
  await page
    .getByRole("button", { name: "Перенос текста", exact: true })
    .click();
  await page.getByRole("menuitemradio", { name: "Переносить по словам", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await page.locator('[data-cell="0,6"]').boundingBox()).height,
    )
    .toBeGreaterThan(40);
  await expect
    .poll(
      async () =>
        (await peer.locator('[data-cell="0,6"]').boundingBox()).height,
    )
    .toBeGreaterThan(40);
  async function copy() {
    await page.getByRole("grid").evaluate((el) => {
      window.testClipboard = new DataTransfer();
      el.dispatchEvent(
        new ClipboardEvent("copy", {
          bubbles: true,
          clipboardData: window.testClipboard,
        }),
      );
    });
  }
  async function paste() {
    await page.getByRole("grid").evaluate((el) =>
      el.dispatchEvent(
        new ClipboardEvent("paste", {
          bubbles: true,
          clipboardData: window.testClipboard,
        }),
      ),
    );
  }
  await range("H2");
  await input("=C2*2");
  await range("H2");
  await copy();
  await input("=C2*3");
  await range("H3");
  await paste();
  await expect(page.getByLabel("Строка формул", { exact: true })).toHaveValue(
    "=C3*2",
  );
  await expect(peer.locator('[data-cell="2,7"] .cell-value')).toHaveText("100");
  await range("E1:F2");
  await copy();
  await range("I1");
  await paste();
  await expect(peer.locator('[data-cell="0,8"]')).toHaveAttribute(
    "colspan",
    "2",
  );
  await expect(peer.locator('[data-cell="0,8"] .cell-value')).toHaveText(
    "Шапка таблицы",
  );
  await page.getByRole("button", { name: "Файл", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Скачать Excel (.xlsx)", exact: true })
    .click();
  const download = await downloadPromise;
  await range("K1");
  await page.locator('input[type="file"]').setInputFiles({
    name: "roundtrip.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: await readFile(await download.path()),
  });
  await expect(peer.locator('[data-cell="0,14"]')).toHaveAttribute(
    "colspan",
    "2",
  );
  await expect(peer.locator('[data-cell="0,14"] .cell-value')).toHaveText(
    "Шапка таблицы",
  );
  expect((await page.locator(".editor-header").boundingBox()).height).toBe(64);
  expect((await page.locator(".formula-bar").boundingBox()).y + 30).toBe(142);
  await page.screenshot({ path: "test-results/ranges-and-wrapping.png" });
  expect(errors).toEqual([]);
  await peerContext.close();
});
