import { test, expect } from "@playwright/test";
import { io } from "socket.io-client";

test("two real browsers: formulas, access, editing, comments and live revocation", async ({
  browser,
}) => {
  const ownerContext = await browser.newContext(),
    peerContext = await browser.newContext();
  const owner = await ownerContext.newPage(),
    peer = await peerContext.newPage();
  const stamp = Date.now(),
    email1 = `owner${stamp}@example.com`,
    email2 = `peer${stamp}@example.com`;
  async function register(page, email, name) {
    await page.goto("/");
    await page
      .getByRole("button", { name: "Создать аккаунт", exact: true })
      .click();
    await page.getByLabel("Имя", { exact: true }).fill(name);
    await page.getByLabel("Электронная почта").fill(email);
    await page.getByLabel("Пароль", { exact: true }).fill("TestPass12345");
    await page.getByRole("button", { name: "Создать", exact: true }).click();
    await expect(
      page.getByText("Пустая таблица", { exact: true }),
    ).toBeVisible();
  }
  await register(owner, email1, "Владелец");
  await register(peer, email2, "Коллега");
  await owner.locator(".blank-template").click();
  await expect(owner.getByRole("grid")).toBeVisible();
  await expect(owner.locator(".connection-warning")).toHaveCount(0);
  const url = owner.url(),
    id = new URL(url).searchParams.get("doc");
  const a1 = owner.locator('[data-cell="0,0"]');
  await a1.dblclick();
  await owner.getByLabel("Редактирование A1", { exact: true }).fill("10");
  await owner.getByLabel("Редактирование A1", { exact: true }).press("Enter");
  await owner.locator('[data-cell="1,0"]').dblclick();
  await owner.getByLabel("Редактирование A2", { exact: true }).fill("20");
  await owner.getByLabel("Редактирование A2", { exact: true }).press("Enter");
  await owner.locator('[data-cell="2,0"]').dblclick();
  await owner
    .getByLabel("Редактирование A3", { exact: true })
    .fill("=SUM(A1:A2)");
  await owner.getByLabel("Редактирование A3", { exact: true }).press("Enter");
  await expect(owner.locator('[data-cell="2,0"] .cell-value')).toHaveText("30");
  await owner
    .getByRole("button", { name: "Настройки доступа", exact: true })
    .click();
  await owner.getByLabel("Email пользователя").fill(email2);
  await owner.getByLabel("Права приглашения").selectOption("viewer");
  await owner.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(owner.getByLabel(`Права ${email2}`)).toBeVisible();
  await owner.getByRole("button", { name: "Готово", exact: true }).click();
  await peer.goto(url);
  await expect(peer.getByRole("grid")).toBeVisible();
  await expect(peer.locator('[data-cell="2,0"] .cell-value')).toHaveText("30");
  await expect(
    peer.getByText("Только просмотр", { exact: true }),
  ).toBeVisible();
  await expect(
    peer.getByRole("button", { name: "Полужирный (Ctrl+B)" }),
  ).toHaveCount(0);
  const blocked = await peer.request.put(`/api/documents/${id}/members`, {
    data: { email: email1, role: "viewer" },
  });
  expect(blocked.status()).toBe(403);
  const session = (await peerContext.cookies()).find(
    (c) => c.name === "session",
  );
  const workerRuntime = process.env.TEST_RUNTIME === "worker";
  const forged = workerRuntime
    ? {
        timeout() {
          return {
            emitWithAck: async (event, payload) => {
              if (event === "join")
                return {
                  document: await (
                    await peer.request.get(`/api/documents/${payload}`)
                  ).json(),
                };
              const result = await peer.request.post(
                `/api/documents/${id}/operations`,
                {
                  data: {
                    operation: payload,
                    requestId: `test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                  },
                },
              );
              return result.json();
            },
          };
        },
        disconnect() {},
      }
    : io("http://127.0.0.1:3101", {
        autoConnect: false,
        extraHeaders: { Cookie: `session=${session.value}` },
      });
  if (!workerRuntime)
    await new Promise((resolve, reject) => {
      forged.once("connect", resolve);
      forged.once("connect_error", reject);
      forged.connect();
    });
  const joined = await forged.timeout(3000).emitWithAck("join", id);
  const sheetId = joined.document.state.sheets[0].id;
  const unauthorizedWrite = await forged
    .timeout(3000)
    .emitWithAck("operation", {
      type: "cells",
      sheetId,
      changes: [{ key: "0,0", cell: { value: "999" } }],
    });
  expect(unauthorizedWrite.error).toContain("прав");
  await expect(owner.locator('[data-cell="0,0"] .cell-value')).toHaveText("10");
  await owner.locator('[data-cell="0,0"]').dblclick();
  await owner.getByLabel("Редактирование A1", { exact: true }).fill("15");
  await owner.getByLabel("Редактирование A1", { exact: true }).press("Enter");
  await expect(peer.locator('[data-cell="2,0"] .cell-value')).toHaveText("35");
  await owner
    .getByRole("button", { name: "Настройки доступа", exact: true })
    .click();
  await owner.getByLabel(`Права ${email2}`).selectOption("editor");
  await owner.getByRole("button", { name: "Готово", exact: true }).click();
  await expect(
    peer.getByRole("button", { name: "Полужирный (Ctrl+B)" }),
  ).toBeEnabled();
  await peer.locator('[data-cell="0,1"]').dblclick();
  await peer.getByLabel("Редактирование B1", { exact: true }).fill("Вместе");
  await peer.getByLabel("Редактирование B1", { exact: true }).press("Enter");
  await expect(owner.locator('[data-cell="0,1"] .cell-value')).toHaveText(
    "Вместе",
  );
  await peer
    .getByRole("button", { name: "Добавить комментарий", exact: true })
    .click();
  await peer.getByLabel("Текст комментария").fill("Проверено коллегой");
  await peer
    .getByRole("button", { name: "Комментировать", exact: true })
    .click();
  await expect(
    peer.locator(".comment p").filter({ hasText: "Проверено коллегой" }),
  ).toBeVisible();
  await peer.getByRole("button", { name: "Закрыть", exact: true }).click();
  await owner.reload();
  await expect(owner.locator('[data-cell="0,1"] .cell-value')).toHaveText(
    "Вместе",
  );
  await expect(owner.locator('[data-cell="2,0"] .cell-value')).toHaveText("35");
  await owner.screenshot({
    path: "test-results/editor-desktop.png",
    fullPage: true,
  });
  await owner
    .getByRole("button", { name: "Настройки доступа", exact: true })
    .click();
  await owner.getByLabel(`Права ${email2}`).selectOption("remove");
  await expect(
    peer.getByText("Нет доступа к этой таблице", { exact: true }),
  ).toBeVisible();
  const revokedWrite = await forged.timeout(3000).emitWithAck("operation", {
    type: "cells",
    sheetId,
    changes: [{ key: "0,0", cell: { value: "999" } }],
  });
  expect(revokedWrite.error).toBeTruthy();
  forged.disconnect();
  await ownerContext.close();
  await peerContext.close();
});
