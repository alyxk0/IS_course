export { formulaEngine } from "../shared/formulaEngine.js";
import { fromEngineFormula } from "../shared/namedRanges.js";
export function syncFormulas(state, engine) {
  const serialized = engine.getAllSheetsSerialized();
  for (const sheet of state.sheets) {
    const rows = serialized[sheet.name] || [];
    for (let r = 0; r < rows.length; r++)
      for (let c = 0; c < rows[r].length; c++) {
        const value = fromEngineFormula(rows[r][c], state.namedRanges || [],state.sheets);
        if (value !== null && value !== undefined && value !== "")
          sheet.cells[`${r},${c}`] = {
            ...sheet.cells[`${r},${c}`],
            value: sheet.cells[`${r},${c}`]?.literal && String(value).startsWith("'") ? String(value).slice(1) : String(value),
          };
      }
  }
}
