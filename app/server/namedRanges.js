import { normalizeNamedRange, namedRangeAddress, namedRangeDisplay, namedRangeConflict, mapNamedReferences, rangeEngineName } from "../shared/namedRanges.js";
import { sameCell } from "../shared/cellEquality.js";
import { formulaEngine } from "../shared/formulaEngine.js";
export function applyNamedRangeOperation(state, op) {
  const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
  const items = state.namedRanges || [], previous = items.find(item => item.id === op.id);
  if (op.id !== undefined && (typeof op.id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(op.id))) fail("Неверный идентификатор диапазона");
  if (op.id !== undefined && (!previous || !sameCell(previous, op.expected))) fail("Именованный диапазон изменился. Откройте его заново.", 409);
  if (op.type === "named-range-delete") {
    if (!previous) fail("Диапазон не найден");
    if(previous.scopeSheetId)for(const sheet of state.sheets)for(const cell of Object.values(sheet.cells))if(!cell.literal&&cell.value?.startsWith("="))cell.value=mapNamedReferences(cell.value,items,state.sheets,sheet.id,(item,raw)=>item.id===previous.id?namedRangeDisplay(previous,state.sheets):raw);
    state.namedRanges = items.filter(item => item.id !== op.id); return;
  }
  let next;
  try { next = normalizeNamedRange({...op.namedRange,...(previous?.scopeSheetId&&op.namedRange?.scopeSheetId===undefined?{scopeSheetId:previous.scopeSheetId}:{})}, state.sheets); } catch (error) { fail(error.message); }
  if (items.some(item => item.id !== previous?.id && namedRangeConflict(item,next))) fail("Диапазон с таким именем уже существует");
  if (!previous && items.length >= 1000) fail("Не более 1000 именованных диапазонов");
  const engine = formulaEngine({ ...state, namedRanges: items.filter(item => item.id !== previous?.id) });
  try { if (!engine.isItPossibleToAddNamedExpression(rangeEngineName(next), "=" + namedRangeAddress(next, state.sheets, true))) fail("Недопустимое имя диапазона"); } finally { engine.destroy(); }
  next.id = previous?.id || globalThis.crypto.randomUUID();
  if (previous && (previous.name !== next.name||previous.scopeSheetId!==next.scopeSheetId)) for (const sheet of state.sheets) for (const cell of Object.values(sheet.cells)) if (!cell.literal && cell.value?.startsWith("=")) cell.value = mapNamedReferences(cell.value,items,state.sheets,sheet.id,(item,raw)=>item.id===previous.id?namedRangeDisplay(next,state.sheets):raw);
  state.namedRanges = previous ? items.map(item => item.id === previous.id ? next : item) : [...items, next];
}
