import { test, expect } from "@playwright/test";
test.skip(
  process.env.TEST_RUNTIME !== "worker",
  "D1 transaction and chunk-storage checks",
);
test("D1 preserves concurrent edits, deduplicates mutations and stores large Unicode snapshots", async ({
  page,
  browser,
}) => {
  const stamp = Date.now(),
    peerContext = await browser.newContext(),
    peer = peerContext.request;
  const ownerEmail = `storage${stamp}@example.com`,
    peerEmail = `storage-peer${stamp}@example.com`;
  for (const [client, email] of [
    [page.request, ownerEmail],
    [peer, peerEmail],
  ])
    expect(
      (
        await client.post("/api/auth/register", {
          data: { name: "Хранилище", email, password: "StoragePass1234" },
        })
      ).ok(),
    ).toBeTruthy();
  const doc = await (
      await page.request.post("/api/documents", { data: {} })
    ).json(),
    id = doc.id,
    sheetId = doc.state.sheets[0].id;
  await page.request.put(`/api/documents/${id}/members`, {
    data: { email: peerEmail, role: "editor" },
  });
  async function write(client, operation, requestId) {
    const response = await client.post(`/api/documents/${id}/operations`, {
      data: { operation, requestId },
    });
    const body = await response.json();
    expect(response.ok(), JSON.stringify(body.error)).toBeTruthy();
    return body;
  }
  for (let wave = 0; wave < 3; wave++)
    await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        write(
          index % 2 ? peer : page.request,
          {
            type: "cells",
            sheetId,
            changes: [
              {
                key: `${wave * 4 + index},0`,
                cell: { value: `value-${wave * 4 + index}` },
              },
            ],
          },
          `parallel-${stamp}-${wave}-${index}`,
        ),
      ),
    );
  let current = await (await page.request.get(`/api/documents/${id}`)).json();
  for (let i = 0; i < 12; i++)
    expect(current.state.sheets[0].cells[`${i},0`].value).toBe(`value-${i}`);
  const before = current.revision;
  await Promise.all(
    Array.from({ length: 4 }, () =>
      write(page.request, { type: "sheet-add" }, `duplicate-${stamp}`),
    ),
  );
  current = await (await page.request.get(`/api/documents/${id}`)).json();
  expect(current.revision).toBe(before + 1);
  expect(current.state.sheets).toHaveLength(2);
  const text = "😀Ж".repeat(8000),
    changes = Array.from({ length: 50 }, (_, r) => ({
      key: `${r},1`,
      cell: { value: text },
    }));
  expect(Buffer.byteLength(JSON.stringify(changes))).toBeGreaterThan(2_000_000);
  const large = await write(
    page.request,
    { type: "cells", sheetId, changes },
    `unicode-${stamp}`,
  );
  current = await (await page.request.get(`/api/documents/${id}`)).json();
  expect(current.state.sheets[0].cells["42,1"].value).toBe(text);
  const version = await (
    await page.request.get(`/api/documents/${id}/versions/${large.revision}`)
  ).json();
  expect(version.state.sheets[0].cells["42,1"].value).toBe(text);
  await page.request.put(`/api/documents/${id}/members`, {
    data: { email: peerEmail, role: "remove" },
  });
  const denied = await peer.post(`/api/documents/${id}/operations`, {
    data: {
      operation: { type: "title", title: "Intrusion" },
      requestId: `revoked-${stamp}`,
    },
  });
  expect(denied.status()).toBe(403);
  await peerContext.close();
});
