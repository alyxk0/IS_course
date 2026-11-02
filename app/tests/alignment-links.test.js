import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../server/store.js";
import { safeLink } from "../shared/links.js";
import { buildLayout } from "../src/gridModel.js";
import { exportWorkbook, importXLSX } from "../src/files.js";
import JSZip from "jszip";
import { parseCSV } from "../src/api.js";

test("clipboard delimiter detection handles a multiline first TSV cell and a quoted tab in CSV", () => {
  assert.deepEqual(parseCSV('"Line1\nLine2"\tNext\t=2+3'), [
    ["Line1\nLine2", "Next", "=2+3"],
  ]);
  assert.deepEqual(parseCSV('"Tab\tinside",Next'), [["Tab\tinside", "Next"]]);
});

test("alignment, rotation and links are checked server-side; link edits preserve formulas and roll back invalid batches", () => {
  const store = createStore(":memory:"),
    owner = { id: "owner", email: "owner@example.com", name: "Owner" },
    viewer = { id: "viewer", email: "viewer@example.com", name: "Viewer" };
  for (const user of [owner, viewer])
    store.db
      .prepare("INSERT INTO users VALUES(?,?,?,?)")
      .run(user.id, user.email, user.name, "hash");
  const doc = store.createDoc(owner),
    sheetId = doc.state.sheets[0].id;
  const apply = (changes, user = owner) =>
    store.apply(doc.id, user, { type: "cells", sheetId, changes });
  apply([{ key: "0,0", cell: { value: "=1+2" } }]);
  for (const rotation of [-90, -45, 0, 45, 90, "vertical"])
    for (const verticalAlign of ["top", "middle", "bottom"])
      apply([{ key: "0,0", cell: { style: { rotation, verticalAlign } } }]);
  apply([{ key: "0,0", cell: { link: "HTTPS://example.com/a?x=1&y=2" } }]);
  const cell = store.getDoc(doc.id).state.sheets[0].cells["0,0"];
  assert.equal(cell.value, "=1+2");
  assert.equal(cell.link, "https://example.com/a?x=1&y=2");
  const before = store.getDoc(doc.id);
  for (const rotation of [-91, 91, 1.5, "45", false])
    assert.throws(
      () =>
        apply([
          { key: "0,0", cell: { value: "Lost" } },
          { key: "0,1", cell: { style: { rotation } } },
        ]),
      /поворота/,
    );
  for (const link of [
    "javascript:alert(1)",
    "data:text/html,hello",
    "file:///a",
    "/relative",
    "mailto:",
    "https://example.com/\nunsafe",
  ]) {
    assert.equal(safeLink(link), null);
    assert.throws(
      () =>
        apply([
          { key: "0,0", cell: { value: "Lost" } },
          { key: "0,1", cell: { link } },
        ]),
      /ссылку/,
    );
  }
  assert.deepEqual(store.getDoc(doc.id), before);
  assert.throws(
    () =>
      apply([{ key: "0,0", cell: { link: "https://example.com" } }], viewer),
    /прав/,
  );
  apply([{ key: "0,0", cell: { link: null } }]);
  assert.equal(
    store.getDoc(doc.id).state.sheets[0].cells["0,0"].link,
    undefined,
  );
  assert.equal(store.getDoc(doc.id).state.sheets[0].cells["0,0"].value, "=1+2");
  store.db.close();
});

test("rotated and stacked text grows rows, with explicit row heights taking precedence", () => {
  const sheet = {
    rows: 5,
    cols: 2,
    widths: {},
    cells: {
      "0,0": { value: "A very long rotated label", style: { rotation: 90 } },
      "1,0": { value: "Vertical", style: { rotation: "vertical" } },
    },
  };
  let layout = buildLayout(
    sheet,
    (r, c) => sheet.cells[`${r},${c}`]?.value || "",
  );
  assert.ok(layout.heights[0] > 100);
  assert.ok(layout.heights[1] > 100);
  sheet.heights = { 0: 24 };
  layout = buildLayout(sheet, (r, c) => sheet.cells[`${r},${c}`]?.value || "");
  assert.equal(layout.heights[0], 24);
});

test("native XLSX links preserve numeric and formula cells, alignment and rotation, including books with helper sheets", async () => {
  const first = {
    name: "First",
    widths: {},
    cells: {
      "0,0": {
        value: "12.5",
        link: "https://example.com/?x=1&y=2",
        style: { verticalAlign: "top", rotation: 45 },
      },
      "0,1": {
        value: "=A1*2",
        link: "https://example.com/formula",
        style: { verticalAlign: "middle", rotation: "vertical" },
      },
      "0,2": {
        value: "Caption",
        link: "mailto:test@example.com",
        style: { rotation: -90 },
      },
    },
    validations: [
      {
        id: "list",
        type: "list",
        range: { r: 1, c: 0, r2: 2, c2: 0 },
        values: Array.from(
          { length: 10 },
          (_, i) => "Long option " + i + "x".repeat(30),
        ),
        reject: true,
      },
    ],
  };
  const second = {
    name: "Second",
    widths: {},
    cells: { "0,0": { value: "42", link: "https://example.com/second" } },
  };
  const buffer = await exportWorkbook(
    { state: { sheets: [first, second] } },
    () => 25,
  );
  const zip = await JSZip.loadAsync(buffer),
    xml = await zip.file("xl/worksheets/sheet1.xml").async("string");
  assert.match(xml, /<f>A1\*2<\/f>/);
  assert.match(xml, /<v>12.5<\/v>/);
  assert.match(xml, /<hyperlink ref="B1"/);
  assert.match(
    await zip.file("xl/worksheets/sheet3.xml").async("string"),
    /<hyperlink ref="A1"/,
  );
  const imported = await importXLSX(buffer),
    cells = Object.fromEntries(
      imported.cells.map((c) => [`${c.r},${c.c}`, c.cell]),
    );
  assert.equal(cells["0,0"].value, "12.5");
  assert.equal(cells["0,0"].link, first.cells["0,0"].link);
  assert.equal(cells["0,1"].value, "=A1*2");
  assert.equal(cells["0,1"].link, first.cells["0,1"].link);
  assert.equal(cells["0,0"].style.verticalAlign, "top");
  assert.equal(cells["0,0"].style.rotation, 45);
  assert.equal(cells["0,1"].style.rotation, "vertical");
  assert.equal(cells["0,2"].style.rotation, -90);
  const relPart = "xl/worksheets/_rels/sheet1.xml.rels";
  zip.file(
    relPart,
    (await zip.file(relPart).async("string")).replace(
      "https://example.com/formula",
      "javascript:alert(1)",
    ),
  );
  const unsafe = await importXLSX(
    await zip.generateAsync({ type: "uint8array" }),
  );
  assert.equal(unsafe.cells.find((c) => c.c === 1).cell.link, undefined);
  assert.equal(unsafe.cells.find((c) => c.c === 1).cell.value, "=A1*2");
});
