import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("vertical alignment, rotation and hyperlinks synchronize, preserve formulas, undo and export to Excel", async ({
  page,
  browser,
}) => {
  const peerContext = await browser.newContext(),
    peer = await peerContext.newPage(),
    stamp = Date.now();
  for (const [context, name] of [
    [page.context(), "owner"],
    [peerContext, "viewer"],
  ]) {
    const r = await context.request.post("/api/auth/register", {
      data: {
        name,
        email: `links-${name}-${stamp}@example.com`,
        password: "LinksPass12345",
      },
    });
    expect(r.ok()).toBeTruthy();
  }
  const doc = await (
    await page.request.post("/api/documents", { data: {} })
  ).json();
  await page.request.put(`/api/documents/${doc.id}/members`, {
    data: { email: `links-viewer-${stamp}@example.com`, role: "viewer" },
  });
  await page.goto(`/?doc=${doc.id}`);
  await expect(page.getByRole("grid")).toBeVisible();
  await page.getByRole("grid").evaluate((el) => {
    const data = new DataTransfer();
    data.setData(
      "text/plain",
      '"Line1\nLine2\nLine3"\tRotated label\t=2+3\t12.5',
    );
    el.dispatchEvent(
      new ClipboardEvent("paste", { bubbles: true, clipboardData: data }),
    );
  });
  await expect(page.locator('[data-cell="0,2"] .cell-value')).toHaveText("5");
  const select = async (range) => {
    await page.getByLabel("Диапазон", { exact: true }).fill(range);
    await page.getByLabel("Диапазон", { exact: true }).press("Enter");
  };
  await select("A1");
  await page
    .getByRole("button", { name: "Перенос текста", exact: true })
    .click();
  await page.getByRole("menuitemradio", { name: "Переносить по словам", exact: true }).click();
  await select("B1");
  await page
    .getByRole("button", { name: "Выравнивание по вертикали", exact: true })
    .click();
  const alignmentBox = await page.locator(".alignment-popover").boundingBox();
  expect(alignmentBox.width).toBe(102);
  expect(alignmentBox.height).toBe(46);
  await page
    .getByRole("button", { name: "По верхнему краю", exact: true })
    .click();
  const topY = (
    await page.locator('[data-cell="0,1"] .cell-text').boundingBox()
  ).y;
  await page
    .getByRole("button", { name: "Выравнивание по вертикали", exact: true })
    .click();
  await page
    .getByRole("button", { name: "По нижнему краю", exact: true })
    .click();
  expect(
    (await page.locator('[data-cell="0,1"] .cell-text').boundingBox()).y,
  ).toBeGreaterThan(topY + 10);
  await page
    .getByRole("button", { name: "Поворот текста", exact: true })
    .click();
  const rotationBox = await page.locator(".rotation-popover").boundingBox();
  expect(rotationBox.width).toBe(262);
  expect(rotationBox.height).toBe(50);
  await page
    .getByRole("button", { name: "Повернуть вверх", exact: true })
    .click();
  const rotated = await page
    .locator('[data-cell="0,1"] .angled-text')
    .boundingBox();
  expect(rotated.height).toBeGreaterThan(rotated.width * 2);
  await page
    .getByRole("button", { name: "Поворот текста", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Вертикальный текст", exact: true })
    .click();
  await expect(
    page.locator('[data-cell="0,1"] .vertical-text-columns'),
  ).toHaveText("Rotated label");
  await page
    .getByRole("button", { name: "Поворот текста", exact: true })
    .click();
  await page.getByLabel("Угол поворота", { exact: true }).fill("-30");
  await page.getByLabel("Угол поворота", { exact: true }).press("Enter");
  await page
    .getByRole("button", { name: "Поворот текста", exact: true })
    .click();
  await page.getByLabel("Угол поворота", { exact: true }).fill("80");
  await page.getByLabel("Угол поворота", { exact: true }).press("Escape");
  await expect(page.getByLabel("Угол поворота", { exact: true })).toHaveCount(
    0,
  );
  await peer.goto(page.url());
  await expect(peer.locator('[data-cell="0,1"] .angled-text')).toBeVisible();
  await select("C1");
  await page.getByRole("grid").press("Control+k");
  await expect(page.getByLabel("Текст ссылки", { exact: true })).toHaveValue(
    "5",
  );
  await expect(
    page.getByLabel("Текст ссылки", { exact: true }),
  ).toHaveAttribute("readonly", "");
  await page
    .getByLabel("Адрес ссылки", { exact: true })
    .fill("https://example.com/formula?a=1&b=2");
  await page.getByRole("button", { name: "Применить", exact: true }).click();
  await expect(page.locator('[data-cell="0,2"] a')).toHaveAttribute(
    "href",
    "https://example.com/formula?a=1&b=2",
  );
  await expect(page.getByLabel("Строка формул", { exact: true })).toHaveValue(
    "=2+3",
  );
  await expect(peer.locator('[data-cell="0,2"] a')).toHaveText("5");
  await peer.locator('[data-cell="0,2"] a').click();
  await expect(
    peer.getByRole("dialog", { name: "Ссылка ячейки" }),
  ).toBeVisible();
  await expect(
    peer.getByRole("button", { name: "Удалить ссылку", exact: true }),
  ).toHaveCount(0);
  await expect(
    peer.getByRole("link", { name: "Открыть ссылку", exact: true }),
  ).toHaveAttribute("rel", "noopener noreferrer");
  await page.locator('[data-cell="0,2"] a').click();
  await page
    .getByRole("button", { name: "Удалить ссылку", exact: true })
    .click();
  await expect(page.locator('[data-cell="0,2"] a')).toHaveCount(0);
  await page
    .getByRole("button", { name: "Отменить (Ctrl+Z)", exact: true })
    .click();
  await expect(page.locator('[data-cell="0,2"] a')).toHaveText("5");
  await select("D1");
  await page.getByRole("grid").press("F2");
  const editor = page.getByLabel("Редактирование D1", { exact: true });
  await editor.fill("14.25");
  await editor.press("Control+k");
  await expect(page.getByLabel("Текст ссылки", { exact: true })).toHaveValue(
    "14.25",
  );
  await page
    .getByLabel("Адрес ссылки", { exact: true })
    .fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Применить", exact: true }).click();
  await expect(
    page.getByText("Укажите ссылку http, https или mailto", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Адрес ссылки", { exact: true })
    .fill("https://example.com/number");
  await page.getByRole("button", { name: "Применить", exact: true }).click();
  await expect(peer.locator('[data-cell="0,3"] a')).toHaveText("14.25");
  await page.getByRole("button", { name: "Файл", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Скачать Excel (.xlsx)", exact: true })
    .click();
  const download = await downloadPromise;
  await select("F1");
  await page.locator('input[type="file"]').setInputFiles({
    name: "links-roundtrip.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: await readFile(await download.path()),
  });
  await expect(peer.locator('[data-cell="0,7"] a')).toHaveText("5");
  await expect(peer.locator('[data-cell="0,7"] a')).toHaveCSS(
    "color",
    "rgb(17, 85, 204)",
  );
  await expect(peer.locator('[data-cell="0,8"] a')).toHaveText("14.25");
  const imported = await (
      await page.request.get(`/api/documents/${doc.id}`)
    ).json(),
    cells = imported.state.sheets[0].cells;
  expect(cells["0,6"].style.rotation).toBe(-30);
  expect(cells["0,7"].value).toBe("=2+3");
  expect(cells["0,7"].link).toBe("https://example.com/formula?a=1&b=2");
  expect(cells["0,8"].value).toBe("14.25");
  await select("H1");
  await page
    .getByRole("button", { name: "Поворот текста", exact: true })
    .click();
  await page.getByRole("button", { name: "Наклон вверх", exact: true }).click();
  await page.getByLabel("Числовой формат", { exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name: "Число", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Увеличить число знаков после запятой",
      exact: true,
    })
    .click();
  await expect(peer.locator('[data-cell="0,7"] a')).toHaveText("5,000");
  await page.getByRole("button", { name: "Формат", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Очистить форматирование", exact: true })
    .click();
  await expect(peer.locator('[data-cell="0,7"] a')).toHaveText("5");
  await expect(peer.locator('[data-cell="0,7"] .angled-text')).toHaveCount(0);
  await expect(peer.locator('[data-cell="0,7"] a')).toHaveAttribute(
    "href",
    "https://example.com/formula?a=1&b=2",
  );
  await expect(page.getByLabel("Строка формул", { exact: true })).toHaveValue(
    "=2+3",
  );
  await page.screenshot({ path: "test-results/alignment-links.png" });
  await peerContext.close();
});
