export const DEFAULT_VIEW = { formulaBar: true, formulas: false, protections: false, comments: "all" };
export function readViewPreferences(userId) {
  try { const value = JSON.parse(localStorage.getItem(`sheet-view:${userId}`) || "{}"); return normalizeView(value); } catch { return { ...DEFAULT_VIEW }; }
}
export function normalizeView(value) {
  const result = { ...DEFAULT_VIEW };
  for (const key of ["formulaBar", "formulas", "protections"]) if (typeof value?.[key] === "boolean") result[key] = value[key];
  if (["all", "none"].includes(value?.comments)) result.comments = value.comments;
  return result;
}
export function writeViewPreferences(userId, value) { try { localStorage.setItem(`sheet-view:${userId}`, JSON.stringify(normalizeView(value))); } catch {} }
