export function normalizeTabColor(value) {
  if (value === null) return null;
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error("Неверный цвет вкладки");
  return value.toLowerCase();
}
export function moveSheet(sheets, sheetId, relativeTo, position) {
  if (!["before", "after"].includes(position) || typeof relativeTo !== "string" || sheetId === relativeTo) throw new Error("Неверное перемещение листа");
  const source=sheets.find(sheet=>sheet.id===sheetId), target=sheets.find(sheet=>sheet.id===relativeTo);
  if (!source || !target) throw new Error("Лист изменён или удалён. Повторите перемещение.");
  const next=sheets.filter(sheet=>sheet.id!==sheetId), index=next.findIndex(sheet=>sheet.id===relativeTo);
  next.splice(index+(position==="after"?1:0),0,source);
  return next;
}
export function tabMoveTarget(sheets, sheetId, direction) {
  const visible=sheets.filter(sheet=>!sheet.hidden),index=visible.findIndex(sheet=>sheet.id===sheetId);
  return index<0||![-1,1].includes(direction)?null:visible[index+direction] || null;
}
