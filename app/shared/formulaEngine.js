import { HyperFormula } from "hyperformula";
import { formulaInput } from "./cellInput.js";
import { namedExpressions, toEngineFormula } from "./namedRanges.js";
export function formulaEngine(state) {
  const data = {};
  for (const sheet of state.sheets) {
    const rows = [];
    for (const [key, cell] of Object.entries(sheet.cells)) {
      const [r, c] = key.split(",").map(Number);
      if (cell.value !== undefined && cell.value !== "") { rows[r] ??= []; rows[r][c] = toEngineFormula(formulaInput(cell),state.namedRanges||[],state.sheets,sheet.id); }
    }
    data[sheet.name] = Array.from({ length: rows.length }, (_, r) => Array.from({ length: rows[r]?.length || 0 }, (_, c) => rows[r]?.[c] ?? ""));
  }
  return HyperFormula.buildFromSheets(data, { licenseKey: "gpl-v3", maxRows: 10000, maxColumns: 200 }, [{ name: "TRUE", expression: "=TRUE()" }, { name: "FALSE", expression: "=FALSE()" }, ...namedExpressions(state)]);
}
