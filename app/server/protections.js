import { canManageProtection, canEditProtection, normalizeProtection, protectionIntersects, protectionTarget } from "../shared/protections.js";
import { sameCell } from "../shared/cellEquality.js";
const failure = (message, status = 403, extra = {}) => Object.assign(new Error(message), { status, code: "protected_range", ...extra });
export function applyProtectionOperation(doc, user, op) {
  const rules = doc.state.protections || [], previous = rules.find(rule => rule.id === op.id);
  if (op.id !== undefined && (!previous || !sameCell(previous, op.expected))) throw failure("Защита изменена другим участником. Откройте её заново.", 409);
  if (previous && !canManageProtection(previous, user, doc.owner)) throw failure("Вы не можете изменять защиту этого диапазона");
  if (op.type === "protection-delete") {
    if (!previous) throw failure("Защита не найдена", 400);
    doc.state.protections = rules.filter(rule => rule.id !== previous.id); return;
  }
  let next;
  try { next = normalizeProtection(op.protection, doc.state); } catch (error) { throw failure(error.message, 400); }
  if (!previous && rules.length >= 1000) throw failure("Не более 1000 защищённых диапазонов", 400);
  if (!previous && !next.editors.includes(user.email.toLowerCase())) next.editors.push(user.email.toLowerCase());
  if (user.id !== doc.owner && !next.warningOnly && !next.editors.includes(user.email.toLowerCase())) throw failure("Нельзя исключить себя из редакторов защиты");
  const target = protectionTarget(next, doc.state);
  if (rules.some(rule => rule.id !== previous?.id && !rule.warningOnly && !canEditProtection(rule, user, doc.owner) && protectionIntersects(rule, doc.state, target.sheetId, target.range))) throw failure("Нельзя изменять защиту недоступных вам ячеек");
  next.id = previous?.id || globalThis.crypto.randomUUID(); next.creatorId = previous?.creatorId || user.id;
  doc.state.protections = previous ? rules.map(rule => rule.id === previous.id ? next : rule) : [...rules, next];
}
function changedRules(before, after, property) {
  const old = before?.[property] || [], next = after?.[property] || [];
  return [...old.filter(item => !next.some(value => sameCell(item, value))), ...next.filter(item => !old.some(value => sameCell(item, value)))].map(item => item.range).filter(Boolean);
}
export function assertProtectedMutation(before, after, user, op) {
  const state = before.state, warnings = [];
  const touch = (sheetId, range, onlySheets = false) => {
    for (const rule of state.protections || []) {
      if (onlySheets && rule.type !== "sheet" || !protectionIntersects(rule, state, sheetId, range)) continue;
      if (rule.warningOnly) { if (!warnings.some(item => item.id === rule.id)) warnings.push({ id: rule.id, description: rule.description || "Защищённый диапазон" }); }
      else if (!canEditProtection(rule, user, before.owner)) throw failure("Вы пытаетесь изменить защищённую ячейку или объект. Обратитесь к владельцу таблицы.");
    }
  };
  const source = state.sheets.find(sheet => sheet.id === op.sheetId), full = sheet => ({ r: 0, r2: sheet.rows - 1, c: 0, c2: sheet.cols - 1 });
  if (["protection-set", "protection-delete", "sheet-duplicate"].includes(op.type)) return;
  if (op.type === "structure" && source) {
    const row = op.axis === "row";
    for (const rule of state.protections || []) {
      const target = protectionTarget(rule, state); if (target?.sheetId !== source.id) continue;
      const start = row ? target.range.r : target.range.c, end = row ? target.range.r2 : target.range.c2;
      if (op.action === "insert" && rule.type !== "sheet" && !(row && rule.allRows || !row && rule.allCols) && (op.index <= start || op.index > end)) continue;
      const range = row ? { r: op.index, r2: op.index + (op.action === "delete" ? op.count - 1 : 0), c: target.range.c, c2: target.range.c2 } : { r: target.range.r, r2: target.range.r2, c: op.index, c2: op.index + (op.action === "delete" ? op.count - 1 : 0) };
      if (protectionIntersects(rule, state, source.id, range)) {
        if (rule.warningOnly) warnings.push({ id: rule.id, description: rule.description || "Защищённый диапазон" });
        else if (!canEditProtection(rule, user, before.owner)) throw failure("Нельзя изменять строки или столбцы защищённого диапазона");
      }
    }
  } else if (["sheet-delete", "sheet-rename", "sheet-visibility", "sheet-color", "sheet-move", "resize", "grow", "freeze", "sheet-display"].includes(op.type) && source) touch(source.id, full(source), op.type !== "sheet-delete");
  else {
    for (const oldSheet of state.sheets) {
      const next = after.state.sheets.find(sheet => sheet.id === oldSheet.id);
      if (!next) { touch(oldSheet.id, full(oldSheet)); continue; }
      if (oldSheet.rows !== next.rows || oldSheet.cols !== next.cols || oldSheet.tabColor !== next.tabColor || state.sheets.indexOf(oldSheet) !== after.state.sheets.indexOf(next) || !!oldSheet.hidden !== !!next.hidden || oldSheet.frozen !== next.frozen || oldSheet.frozenCols !== next.frozenCols || oldSheet.hideGridlines !== next.hideGridlines || !sameCell(oldSheet.widths || {}, next.widths || {})) touch(oldSheet.id, full(oldSheet), true);
      if (next.rows < oldSheet.rows) touch(oldSheet.id, { r: next.rows, r2: oldSheet.rows - 1, c: 0, c2: oldSheet.cols - 1 });
      if (next.cols < oldSheet.cols) touch(oldSheet.id, { r: 0, r2: oldSheet.rows - 1, c: next.cols, c2: oldSheet.cols - 1 });
      for (const key of new Set([...Object.keys(oldSheet.cells), ...Object.keys(next.cells)])) {
        if (sameCell(oldSheet.cells[key] || {}, next.cells[key] || {})) continue;
        const [r, c] = key.split(",").map(Number); touch(oldSheet.id, { r,r2:r,c,c2:c });
      }
      for (const property of ["merges", "conditionalFormats", "validations", "bandedRanges", "charts"]) {
        if (property === "merges") {
          for (const range of [...(oldSheet.merges || []), ...(next.merges || [])]) if (!oldSheet.merges?.some(item => sameCell(item, range)) || !next.merges?.some(item => sameCell(item, range))) touch(oldSheet.id, range);
        } else for (const range of changedRules(oldSheet, next, property)) touch(oldSheet.id, range);
      }
      if (!sameCell(oldSheet.filter, next.filter)) for (const filter of [oldSheet.filter, next.filter]) if (filter?.range) touch(oldSheet.id, filter.range);
    }
  }
  if (op.type === "restore") {
    for (const rule of state.protections || []) if (!after.state.protections?.some(next => sameCell(rule, next)) && !canManageProtection(rule, user, before.owner)) throw failure("Нельзя восстановить версию поверх чужой защиты");
    for (const rule of after.state.protections || []) if (!state.protections?.some(previous => sameCell(previous, rule))) {
      const target = protectionTarget(rule, after.state); if (target) touch(target.sheetId, target.range);
    }
  }
  if (op.type === "named-range-set") for (const rule of state.protections || []) {
    if (!rule.namedRangeId) continue;
    const a = protectionTarget(rule, state), b = protectionTarget(rule, after.state);
    if (!sameCell(a && { sheetId: a.sheetId, range: a.range }, b && { sheetId: b.sheetId, range: b.range })) {
      if (!rule.warningOnly && !canEditProtection(rule, user, before.owner)) throw failure("Нельзя переместить именованный диапазон с чужой защитой");
      if (b) touch(b.sheetId, b.range);
    }
  }
  if (warnings.length && op.protectionAcknowledgement !== before.revision) throw failure("Вы пытаетесь изменить защищённый диапазон. Продолжить?", 409, { code: "protection_warning", protectionWarnings: warnings, revision: before.revision });
}
