import { contains, intersects, shiftRange, validRange } from "./ranges.js";
export function protectionTarget(rule, state) {
  const named = rule.namedRangeId ? (state.namedRanges || []).find(item => item.id === rule.namedRangeId) : null;
  const sheet = state.sheets.find(item => item.id === (named?.sheetId || rule.sheetId));
  if (!sheet) return null;
  let range = rule.type === "sheet" ? { r: 0, r2: sheet.rows - 1, c: 0, c2: sheet.cols - 1 } : named?.range || rule.range;
  if (range && !named) range = { ...range, ...(rule.allRows ? { r:0,r2:sheet.rows-1 } : {}), ...(rule.allCols ? { c:0,c2:sheet.cols-1 } : {}) };
  return range ? { sheetId: sheet.id, range, sheet } : null;
}
export const canEditProtection = (rule, user, ownerId) => user?.id === ownerId || (rule.editors || []).includes(user?.email?.toLowerCase());
export const canManageProtection = (rule, user, ownerId) => rule.warningOnly || canEditProtection(rule, user, ownerId);
export function subtractProtectedRange(range, cut) {
  if (!intersects(range, cut)) return [range];
  const overlap = { r: Math.max(range.r, cut.r), r2: Math.min(range.r2, cut.r2), c: Math.max(range.c, cut.c), c2: Math.min(range.c2, cut.c2) }, parts = [];
  if (range.r < overlap.r) parts.push({ ...range, r2: overlap.r - 1 });
  if (overlap.r2 < range.r2) parts.push({ ...range, r: overlap.r2 + 1 });
  if (range.c < overlap.c) parts.push({ r: overlap.r, r2: overlap.r2, c: range.c, c2: overlap.c - 1 });
  if (overlap.c2 < range.c2) parts.push({ r: overlap.r, r2: overlap.r2, c: overlap.c2 + 1, c2: range.c2 });
  return parts;
}
export function protectionIntersects(rule, state, sheetId, range) {
  const target = protectionTarget(rule, state);
  if (!target || target.sheetId !== sheetId) return false;
  const named = rule.namedRangeId && state.namedRanges?.find(item => item.id === rule.namedRangeId);
  if (rule.type === "sheet" || rule.allRows || named?.allRows) target.range = { ...target.range, r2: Math.max(target.range.r2, range.r2) };
  if (rule.type === "sheet" || rule.allCols || named?.allCols) target.range = { ...target.range, c2: Math.max(target.range.c2, range.c2) };
  if (!intersects(target.range, range)) return false;
  let parts = [{ r: Math.max(range.r, target.range.r), r2: Math.min(range.r2, target.range.r2), c: Math.max(range.c, target.range.c), c2: Math.min(range.c2, target.range.c2) }];
  for (const exception of rule.exceptions || []) parts = parts.flatMap(part => subtractProtectedRange(part, exception));
  return parts.length > 0;
}
export function protectionAt(state, sheetId, r, c) {
  return (state.protections || []).filter(rule => { const target = protectionTarget(rule, state); return target?.sheetId === sheetId && contains(target.range, r, c) && !(rule.exceptions || []).some(range => contains(range, r, c)); });
}
export function normalizeProtection(input, state) {
  if (!input || !["range", "sheet"].includes(input.type) || typeof input.description !== "string" || input.description.length > 500 || typeof input.warningOnly !== "boolean" || !Array.isArray(input.editors) || input.editors.length > 500 || input.editors.some(email => typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new Error("Неверные параметры защиты");
  const named = input.namedRangeId && state.namedRanges?.find(item => item.id === input.namedRangeId), sheet = state.sheets.find(item => item.id === (named?.sheetId || input.sheetId));
  if (!sheet || input.namedRangeId && (!named?.range || input.type !== "range")) throw new Error("Диапазон защиты не найден");
  const range = named?.range || input.range;
  if (input.type === "range" && !validRange(range, sheet.rows, sheet.cols)) throw new Error("Неверный защищаемый диапазон");
  const exceptions = input.exceptions || [];
  if (!Array.isArray(exceptions) || exceptions.length > 100 || input.type !== "sheet" && exceptions.length || exceptions.some(item => !validRange(item, sheet.rows, sheet.cols))) throw new Error("Неверные исключения защиты");
  const result = { type: input.type, description: input.description.trim(), sheetId: sheet.id, warningOnly: input.warningOnly, editors: [...new Set(input.editors.map(email => email.toLowerCase()))], exceptions: exceptions.map(({ r,r2,c,c2 }) => ({ r,r2,c,c2 })) };
  if (input.type === "range") result.range = { r: range.r, r2: range.r2, c: range.c, c2: range.c2 };
  if (named) result.namedRangeId = named.id;
  for (const flag of ["allRows","allCols"]) {
    if (input[flag] !== undefined && typeof input[flag] !== "boolean") throw new Error("Неверный диапазон защиты");
    if (input[flag] && input.type === "range" && !named) result[flag] = true;
  }
  return result;
}
export function shiftProtections(state, sheet, axis, index, count, remove) {
  state.protections = (state.protections || []).flatMap(rule => {
    if (rule.sheetId !== sheet.id) return [rule];
    if (rule.namedRangeId && !state.namedRanges?.find(item => item.id === rule.namedRangeId)?.range) return [];
    const range = rule.type === "range" && !rule.namedRangeId && !(axis === "row" && rule.allRows || axis === "col" && rule.allCols) ? shiftRange(rule.range, axis, index, count, remove) : rule.range;
    if (rule.type === "range" && !range) return [];
    return [{ ...rule, ...(range ? { range } : {}), exceptions: (rule.exceptions || []).map(item => shiftRange(item, axis, index, count, remove)).filter(Boolean) }];
  });
}
