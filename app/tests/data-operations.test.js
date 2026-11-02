import { test } from "node:test";
import assert from "node:assert/strict";
import { sortChanges, sortingRange, trimChanges } from "../src/dataOperations.js";
import { createStore } from "../server/store.js";
const range = { r: 0, r2: 4, c: 0, c2: 2 };
function fixture() {
  const sheet = { id: "s", name: "Лист1", rows: 100, cols: 10, cells: {}, merges: [] };
  [["Группа", "Баллы", "Расчёт"], ["Б", "2", "=B2+$B$2"], ["А", "1", "=B3+$B$2"], ["А", "3", "=B4+$B$2"], ["", "", ""]].forEach((values, r) => values.forEach((value, c) => { sheet.cells[`${r},${c}`] = { value }; }));
  sheet.cells["2,0"].style = { bold: true }; sheet.cells["2,0"].link = "https://example.com";
  return sheet;
}
test("sort keeps headers, uses stable multiple keys and calculated values, leaves blanks last and relocates formulas, styles and links", () => {
  const sheet = fixture(), original = structuredClone(sheet);
  const get = (r, c) => c === 1 && r > 0 && r < 4 ? Number(sheet.cells[`${r},${c}`].value) : sheet.cells[`${r},${c}`].value;
  const changes = sortChanges(sheet, range, [{ col: 0, desc: false }, { col: 1, desc: true }], true, get);
  const at = (r, c) => changes.find(x => x.key === `${r},${c}`).cell;
  assert.equal(at(0, 0).value, "Группа"); assert.equal(at(1, 1).value, "3"); assert.equal(at(1, 2).value, "=B2+$B$2");
  assert.equal(at(2, 0).style.bold, true); assert.equal(at(2, 0).link, "https://example.com");
  assert.equal(at(4, 0).value, ""); assert.deepEqual(sheet, original);
  for (const desc of [false, true]) {
    const sorted = sortChanges(sheet, range, [{ col: 0, desc }], true, get);
    assert.equal(sorted.find(x => x.key === "4,0").cell.value, "");
    const a = sorted.filter(x => x.key.endsWith(",1") && ["1", "3"].includes(x.cell?.value));
    assert.deepEqual(a.map(x => x.cell.value), ["1", "3"]);
  }
  assert.deepEqual(sortingRange(sheet, { r: 2, r2: 3, c: 1, c2: 1 }, true), range);
  sheet.merges = [{ r: 50, r2: 50, c: 0, c2: 1 }]; assert.doesNotThrow(() => sortChanges(sheet, range, [{ col: 0, desc: false }], false, get));
  sheet.merges = [{ r: 1, r2: 2, c: 0, c2: 0 }]; assert.throws(() => sortChanges(sheet, range, [{ col: 0, desc: false }], false, get), /объединения/);
  assert.throws(() => sortChanges(original, range, [{ col: 0, desc: false }, { col: 0, desc: true }], false, get), /разные/);
  assert.throws(() => sortChanges({ ...original, rows: 10000 }, { r: 0, r2: 9999, c: 0, c2: 9 }, [{ col: 0, desc: false }], false, get), /20 000/);
});
test("trim preserves formulas, formatting, links and nonbreaking spaces and never converts cleaned text into a formula", () => {
  const sheet = fixture();
  sheet.cells["0,0"] = { value: "  a  \t b\n ", style: { bold: true }, link: "https://example.com" };
  sheet.cells["0,1"] = { value: " =1+2  " }; sheet.cells["0,2"] = { value: "a\u00a0\u00a0b" };
  const changes = trimChanges(sheet, range);
  assert.equal(changes.length, 2); assert.equal(changes[0].cell.value, "a b"); assert(changes[0].cell.style.bold); assert(changes[0].cell.link);
  assert.equal(changes[1].cell.value, "=1+2"); assert(changes[1].cell.literal);
});
test("range operations reject a stale revision atomically and enforce editor rights", () => {
  const store = createStore(":memory:"), owner = { id: "owner", email: "sort@example.com", name: "Owner" };
  try {
    store.db.prepare("INSERT INTO users VALUES(?,?,?,?)").run(owner.id, owner.email, owner.name, "hash");
    const doc = store.createDoc(owner), sheetId = doc.state.sheets[0].id;
    const apply = op => store.apply(doc.id, owner, { sheetId, ...op });
    apply({ type: "cells", changes: [{ key: "0,0", cell: { value: "2" } }, { key: "1,0", cell: { value: "1" } }] });
    const before = store.getDoc(doc.id);
    const changes = sortChanges(before.state.sheets[0], { r: 0, r2: 1, c: 0, c2: 0 }, [{ col: 0, desc: false }], false, r => r ? 1 : 2);
    apply({ type: "cells", changes: [{ key: "1,0", cell: { value: "3" } }] });
    const updated = store.getDoc(doc.id);
    assert.throws(() => apply({ type: "cells", changes, expectedRevision: before.revision }), /Данные изменились/);
    assert.deepEqual(store.getDoc(doc.id), updated);
    apply({ type: "cells", changes: [{ key: "2,0", cell: { value: "ok" } }], expectedRevision: updated.revision });
    assert.equal(store.getDoc(doc.id).state.sheets[0].cells["2,0"].value, "ok");
    const viewer = { id: "viewer", email: "sort-viewer@example.com", name: "Viewer" };
    store.db.prepare("INSERT INTO users VALUES(?,?,?,?)").run(viewer.id, viewer.email, viewer.name, "hash");
    store.db.prepare("INSERT INTO permissions VALUES(?,?,?)").run(doc.id, viewer.email, "viewer");
    assert.throws(() => store.apply(doc.id, viewer, { type: "cells", sheetId, changes }), /Недостаточно прав/);
  } finally { store.db.close(); }
});
