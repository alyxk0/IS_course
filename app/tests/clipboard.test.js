import { test } from "node:test";
import assert from "node:assert/strict";
import { captureClipboard, relocateClipboard } from "../src/clipboard.js";
test("copy relocates relative references, keeps absolute references, strings and captured formatting", () => {
  const sheet = {
    name: "Данные",
    cells: {
      "1,1": { value: '=IF(A2="A2",$A$1+A$2+$A2,0)', style: { bold: true } },
    },
  };
  const payload = JSON.parse(
    JSON.stringify(captureClipboard(sheet, { r: 1, c: 1, r2: 1, c2: 1 })),
  );
  sheet.cells["1,1"].value = "changed after copying";
  const result = relocateClipboard(payload, sheet, { r: 3, c: 2 }, [sheet]);
  assert.equal(result.changes[0].cell.value, '=IF(B4="A2",$A$1+B$2+$A4,0)');
  assert.equal(result.changes[0].cell.style.bold, true);
  assert.equal(result.changes[0].key, "3,2");
});
test("copying across sheets preserves explicit sheet names and translates merged ranges", () => {
  const sheet = {
      name: "Лист1",
      cells: { "0,0": { value: "='Лист2'!A1" } },
      merges: [{ r: 0, c: 0, r2: 1, c2: 1 }],
    },
    target = { name: "Лист2", cells: {} };
  const payload = captureClipboard(sheet, { r: 0, c: 0, r2: 1, c2: 1 }),
    result = relocateClipboard(payload, target, { r: 2, c: 3 }, [
      sheet,
      target,
    ]);
  assert.deepEqual(result.merges, [{ r: 2, c: 3, r2: 3, c2: 4 }]);
  assert.equal(result.changes.length, 1);
  assert.match(result.changes[0].cell.value, /D3$/);
});
test("clipboard rejects oversized and malformed ranges before applying changes", () => {
  const sheet = { name: "Sheet1", cells: {} };
  assert.throws(
    () => captureClipboard(sheet, { r: 0, c: 0, r2: 9999, c2: 199 }),
    /20 000/,
  );
  const payload = captureClipboard(sheet, { r: 0, c: 0, r2: 0, c2: 0 });
  assert.throws(
    () => relocateClipboard(payload, sheet, { r: 10000, c: 0 }, [sheet]),
    /пределы/,
  );
  assert.throws(
    () =>
      relocateClipboard({ ...payload, cells: [] }, sheet, { r: 0, c: 0 }, [
        sheet,
      ]),
    /буфера/,
  );
});
