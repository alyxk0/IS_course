import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../server/store.js";
import { formatValue } from "../src/format.js";
import { displayedDecimalPlaces } from "../shared/numberFormats.js";
import { captureFormats, paintFormats } from "../src/formatPainter.js";
import { exportWorkbook, importXLSX } from "../src/files.js";

test("precision displays trailing zeros, rounded percentages and small exponents without changing values", () => {
  assert.equal(
    formatValue(1.234567, { format: "number", decimalPlaces: 3 }),
    "1,235",
  );
  assert.equal(
    formatValue(0.125, { format: "percent", decimalPlaces: 2 }).replaceAll(
      "\u00a0",
      " ",
    ),
    "12,50 %",
  );
  assert.equal(formatValue(7, { decimalPlaces: 3 }), "7,000");
  assert.equal(formatValue("literal", { decimalPlaces: 3 }), "literal");
  assert.equal(displayedDecimalPlaces(1e-7), 7);
  assert.equal(displayedDecimalPlaces(1.25e-7), 9);
  assert.equal(displayedDecimalPlaces(0.125, { format: "percent" }), 2);
  assert.equal(displayedDecimalPlaces(1, { format: "currency" }), 2);
  assert.equal(
    formatValue(1.25, { decimalPlaces: 30 }).split(",")[1].length,
    30,
  );
});

test("format painter tiles a captured pattern, copies defaults, skips covered merge cells and bounds the operation", () => {
  const source = {
    id: "source",
    cells: {
      "0,0": { value: "Source", style: { bold: true, decimalPlaces: 3 } },
      "1,1": { style: { background: "#ff0000" } },
    },
  };
  const captured = captureFormats(source, { r: 0, c: 0, r2: 1, c2: 1 });
  source.cells["0,0"].style.bold = false;
  const target = {
    cells: { "3,3": { value: "=A1", style: { italic: true } } },
    merges: [{ r: 4, c: 4, r2: 4, c2: 5 }],
  };
  const changes = paintFormats(target, captured, { r: 3, c: 3, r2: 5, c2: 5 });
  assert.equal(changes.length, 8);
  assert.deepEqual(
    changes.find((c) => c.key === "3,3"),
    {
      key: "3,3",
      cell: { style: { bold: true, decimalPlaces: 3 } },
      replaceStyle: true,
    },
  );
  assert.deepEqual(changes.find((c) => c.key === "3,4").cell.style, {});
  assert.deepEqual(changes.find((c) => c.key === "5,5").cell.style, {
    bold: true,
    decimalPlaces: 3,
  });
  assert.equal(
    changes.some((c) => c.key === "4,5"),
    false,
  );
  assert.equal(
    paintFormats(target, captured, { r: 3, c: 3, r2: 3, c2: 3 }).length,
    4,
  );
  assert.equal(target.cells["3,3"].value, "=A1");
  assert.throws(
    () =>
      paintFormats(target, captured, { r: 9999, c: 199, r2: 9999, c2: 199 }),
    /диапазон/,
  );
});

test("style replacement preserves current values and precision validation rolls back a batch", () => {
  const store = createStore(":memory:"),
    owner = { id: "owner", email: "owner@example.com", name: "Owner" },
    viewer = { id: "viewer", email: "viewer@example.com", name: "Viewer" };
  for (const u of [owner, viewer])
    store.db
      .prepare("INSERT INTO users VALUES(?,?,?,?)")
      .run(u.id, u.email, u.name, "hash");
  const doc = store.createDoc(owner),
    sheetId = doc.state.sheets[0].id;
  const apply = (changes, user = owner) =>
    store.apply(doc.id, user, { type: "cells", sheetId, changes });
  apply([
    {
      key: "0,0",
      cell: { value: "=1+2", style: { italic: true, border: true } },
    },
  ]);
  apply([
    {
      key: "0,0",
      cell: { style: { bold: true, decimalPlaces: 3 } },
      replaceStyle: true,
    },
  ]);
  let cell = store.getDoc(doc.id).state.sheets[0].cells["0,0"];
  assert.deepEqual(cell, {
    value: "=1+2",
    style: { bold: true, decimalPlaces: 3 },
  });
  apply([{ key: "0,0", cell: { style: {} }, replaceStyle: true }]);
  assert.deepEqual(store.getDoc(doc.id).state.sheets[0].cells["0,0"], {
    value: "=1+2",
    style: {},
  });
  const before = store.getDoc(doc.id);
  for (const invalid of [-1, 31, 1.5, "2", false]) {
    assert.throws(
      () =>
        apply([
          { key: "0,0", cell: { value: "Wrong" } },
          { key: "0,1", cell: { style: { decimalPlaces: invalid } } },
        ]),
      /знаков/,
    );
    assert.deepEqual(store.getDoc(doc.id), before);
  }
  assert.throws(
    () =>
      apply(
        [
          {
            key: "0,0",
            cell: { style: { decimalPlaces: 2 } },
            replaceStyle: true,
          },
        ],
        viewer,
      ),
    /прав/,
  );
  store.db.close();
});

test("Excel round trip preserves explicit precision in numbers, rubles and percentages", async () => {
  const sheet = {
    name: "Sheet1",
    widths: {},
    cells: {
      "0,0": { value: "1.2345", style: { format: "number", decimalPlaces: 3 } },
      "0,1": { value: "10", style: { format: "currency", decimalPlaces: 0 } },
      "0,2": { value: "=1/8", style: { format: "percent", decimalPlaces: 4 } },
    },
  };
  const buffer = await exportWorkbook(
    { state: { sheets: [sheet] } },
    () => 0.125,
  );
  const imported = await importXLSX(buffer);
  assert.equal(
    imported.cells.find((c) => c.c === 0).cell.style.decimalPlaces,
    3,
  );
  assert.equal(
    imported.cells.find((c) => c.c === 1).cell.style.format,
    "currency",
  );
  assert.equal(
    imported.cells.find((c) => c.c === 1).cell.style.decimalPlaces,
    0,
  );
  assert.equal(
    imported.cells.find((c) => c.c === 2).cell.style.decimalPlaces,
    4,
  );
  assert.equal(imported.cells.find((c) => c.c === 2).cell.value, "=1/8");
});
