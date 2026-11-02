import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../server/store.js";
import { parseFontSize, validFontSize, stepFontSize } from "../shared/fontSizing.js";
import { exportWorkbook, importXLSX } from "../src/files.js";
test("font-size input truncates fractional points, caps large values and rejects empty or malformed input", () => {
  assert.equal(parseFontSize("12.5"), 12); assert.equal(parseFontSize("9999"), 400);
  for (const text of ["", " ", "abc", "0", "-1", "1e3", "12px"]) assert.equal(parseFontSize(text), null);
  assert.equal(stepFontSize(400, 1), 400); assert.equal(stepFontSize(1, -1), 1); assert.equal(stepFontSize(80, 1), 81);
  for (const value of [1, 400, 12.5]) assert(validFontSize(value));
  for (const value of [0, 401, NaN, Infinity, "12"]) assert(!validFontSize(value));
});
test("server font bounds are atomic and preserve values and unrelated styles; Excel keeps sizes outside the old range", async () => {
  const store = createStore(":memory:"), user = { id: "size-owner", email: "size-owner@example.com", name: "Owner" };
  try {
    store.db.prepare("INSERT INTO users VALUES(?,?,?,?)").run(user.id, user.email, user.name, "hash");
    const doc = store.createDoc(user), sheetId = doc.state.sheets[0].id;
    const apply = (changes) => store.apply(doc.id, user, { type: "cells", sheetId, changes });
    apply([{ key: "0,0", cell: { value: "=1+2", style: { fontSize: 1, bold: true } } }, { key: "0,1", cell: { value: "Large", style: { fontSize: 400 } } }]);
    const before = store.getDoc(doc.id);
    for (const size of [0, 401, "400"]) {
      assert.throws(() => apply([{ key: "0,0", cell: { value: "FORBIDDEN" } }, { key: "0,1", cell: { style: { fontSize: size } } }]), /от 1 до 400/);
      assert.deepEqual(store.getDoc(doc.id), before);
    }
    const imported = await importXLSX(await exportWorkbook(before, () => 3));
    assert.equal(imported.cells.find((cell) => cell.c === 0).cell.style.fontSize, 1);
    assert.equal(imported.cells.find((cell) => cell.c === 1).cell.style.fontSize, 400);
    assert.equal(imported.cells.find((cell) => cell.c === 0).cell.value, "=1+2");
    assert(imported.cells.find((cell) => cell.c === 0).cell.style.bold);
  } finally { store.db.close(); }
});
