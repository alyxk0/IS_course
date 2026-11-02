// JSON cells can arrive with a different object-property order after a replace.
// Compare their content so undo/redo only skips actual concurrent changes.
export function sameCell(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ak = Object.keys(a).filter((k) => a[k] !== undefined),
    bk = Object.keys(b).filter((k) => b[k] !== undefined);
  return ak.length === bk.length && ak.every((k) => Object.hasOwn(b, k) && sameCell(a[k], b[k]));
}
