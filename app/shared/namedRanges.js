import { validRange, shiftRange } from "./ranges.js";

export const namedRangeKey = name => name.toLocaleLowerCase("en-US");
export const quoteSheetName = name => `'${name.replaceAll("'", "''")}'`;
export function namedRangeDisplay(item, sheets) { if(!item)return "#REF!";return item.scopeSheetId ? `${quoteSheetName(sheets.find(s=>s.id===item.scopeSheetId)?.name || "#REF")}!${item.name}` : item.name; }
export const rangeEngineName = item => item.scopeSheetId ? encodeEngineName(`@${item.scopeSheetId}!${namedRangeKey(item.name)}`) : engineRangeName(item.name);
export function findNamedRange(reference, items, sheets, contextSheetId) {
  const match=/^(?:'((?:[^']|'')*)'|([^'!]+))!([^!]+)$/.exec(reference.trim());
  if (match) { const name=(match[1]??match[2]).replaceAll("''", "'"),sheet=sheets.find(s=>namedRangeKey(s.name)===namedRangeKey(name)),key=namedRangeKey(match[3]);if(!sheet)return null;return items.find(n=>n.scopeSheetId===sheet.id&&namedRangeKey(n.name)===key)||items.find(n=>!n.scopeSheetId&&n.sheetId===sheet.id&&namedRangeKey(n.name)===key)||null; }
  const key=namedRangeKey(reference.trim());return items.find(n=>n.scopeSheetId===contextSheetId&&namedRangeKey(n.name)===key)||items.find(n=>!n.scopeSheetId&&namedRangeKey(n.name)===key)||null;
}
export const namedRangeConflict = (item,next) => namedRangeKey(item.name)===namedRangeKey(next.name)&&(item.scopeSheetId||null)===(next.scopeSheetId||null);
export function validRangeName(name) {
  return typeof name === "string" && name.length >= 1 && name.length <= 250 && /^[\p{L}_][\p{L}\p{N}_]*$/u.test(name) && !/^(?:true|false)/i.test(name) && !/^(?:[a-z]+[1-9]\d*|r\d*c\d*|r|c)$/i.test(name);
}
function column(n) { let text = ""; for (n++; n; n = Math.floor((n - 1) / 26)) text = String.fromCharCode(65 + (n - 1) % 26) + text; return text; }
export function namedRangeAddress(item, sheets, absolute = false) {
  const sheet = sheets.find(s => s.id === item.sheetId), r = item.range, dollar = absolute ? "$" : "";
  if (!sheet || !r) return "#REF!";
  const simpleName = absolute ? /^[a-z_][a-z0-9_]*$/i.test(sheet.name) : /^[\p{L}_][\p{L}\p{N}_]*$/u.test(sheet.name);
  const prefix = simpleName ? sheet.name : `'${sheet.name.replaceAll("'", "''")}'`;
  const start = item.allRows ? `${dollar}${column(r.c)}` : item.allCols ? `${dollar}${r.r + 1}` : `${dollar}${column(r.c)}${dollar}${r.r + 1}`;
  const end = item.allRows ? `${dollar}${column(r.c2)}` : item.allCols ? `${dollar}${r.r2 + 1}` : `${dollar}${column(r.c2)}${dollar}${r.r2 + 1}`;
  return `${prefix}!${start}${start !== end || item.allRows || item.allCols ? ":" + end : ""}`;
}
export function namedExpressions(state) {
  return (state.namedRanges || []).map(item => ({ name: rangeEngineName(item), expression: "=" + namedRangeAddress(item, state.sheets, true) }));
}
export function normalizeNamedRange(input, sheets) {
  const sheet = sheets.find(s => s.id === input?.sheetId);
  if (!validRangeName(input?.name)) throw new Error("Недопустимое имя диапазона");
  if (!sheet || !validRange(input.range, sheet.rows, sheet.cols) || (input.allRows !== undefined && typeof input.allRows !== "boolean") || (input.allCols !== undefined && typeof input.allCols !== "boolean") || input.allRows && input.allCols)
    throw new Error("Неверный именованный диапазон");
  const range = { r: input.range.r, r2: input.range.r2, c: input.range.c, c2: input.range.c2 };
  if (input.allRows) { range.r = 0; range.r2 = sheet.rows - 1; }
  if (input.allCols) { range.c = 0; range.c2 = sheet.cols - 1; }
  if(input.scopeSheetId!==undefined&&(!sheets.some(s=>s.id===input.scopeSheetId)))throw new Error("Неверная область имени диапазона");
  return { name: input.name, sheetId: sheet.id, range, ...(input.scopeSheetId?{scopeSheetId:input.scopeSheetId}:{}), ...(input.allRows ? { allRows: true } : {}), ...(input.allCols ? { allCols: true } : {}) };
}
export function shiftNamedRanges(state, sheet, axis, index, count, remove) {
  state.namedRanges = (state.namedRanges || []).map(item => {
    if (item.sheetId !== sheet.id || !item.range) return item;
    const range = (axis === "row" && item.allRows || axis === "col" && item.allCols) ? { ...item.range } : shiftRange(item.range, axis, index, count, remove);
    if (range && item.allRows) { range.r = 0; range.r2 = sheet.rows - 1; }
    if (range && item.allCols) { range.c = 0; range.c2 = sheet.cols - 1; }
    return { ...item, range };
  });
}
// Tokenize identifiers while leaving string literals and quoted sheet names intact.
function mapFormulaIdentifiers(formula, map, numberMap = value => value, qualifiedMap = null) {
  if (typeof formula !== "string" || !formula.startsWith("=")) return formula;
  let output = "", i = 0;
  while (i < formula.length) {
    if(qualifiedMap) {
      const qualified=/^(?:'((?:[^']|'')*)'|([\p{L}_][\p{L}\p{N}_.]*))\s*!\s*([\p{L}_][\p{L}\p{N}_]*)/u.exec(formula.slice(i));
      if(qualified&&validRangeName(qualified[3])&&formula.slice(i+qualified[0].length).trimStart()[0]!==":"&&formula.slice(i+qualified[0].length).trimStart()[0]!=="(") {
        output+=qualifiedMap(qualified[0],qualified[3],(qualified[1]??qualified[2]).replaceAll("''","'"));i+=qualified[0].length;continue;
      }
    }
    const char = formula[i];
    if (char === '"' || char === "'") {
      const start = i++;
      while (i < formula.length) { if (formula[i++] === char) { if (formula[i] === char) i++; else break; } }
      output += formula.slice(start, i); continue;
    }
    const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(formula.slice(i));
    if (number) { output += numberMap(number[0]); i += number[0].length; continue; }
    const match = /^[\p{L}_][\p{L}\p{N}_.]*/u.exec(formula.slice(i));
    if (match) {
      const token = match[0], after = formula.slice(i + token.length).trimStart()[0];
      output += map(token, after, formula[i - 1], formula.slice(0, i).trimEnd().slice(-1));
      i += token.length;
    } else output += formula[i++];
  }
  return output;
}
export function renameRangeInFormula(formula, oldName, name) {
  return mapFormulaIdentifiers(formula, (token, after) => namedRangeKey(token) === namedRangeKey(oldName) && after !== "!" && after !== "(" ? name : token);
}
export function mapNamedReferences(formula, items, sheets, contextSheetId, map) {
  return mapFormulaIdentifiers(formula,(token,after,before,previous)=>{
    if(after==="!"||after==="("||before==="$"||after==="$"||before==="#"||after===":"||previous===":")return token;
    const item=findNamedRange(token,items,sheets,contextSheetId);return item?map(item,token):token;
  },value=>value,(raw,token,sheetName)=>{const item=findNamedRange(`${quoteSheetName(sheetName)}!${token}`,items,sheets,contextSheetId);return item?map(item,raw):raw;});
}
function encodeEngineName(name) { return "_osnr_" + [...name].map(c => c.codePointAt(0).toString(16)).join("_"); }
export function engineRangeName(name) { return encodeEngineName(namedRangeKey(name)); }
export function toEngineFormula(formula, names=[], sheets=[], contextSheetId) {
  return mapFormulaIdentifiers(formula, (token, after, before, previous) => {
    if (after === "!") return /[^a-z0-9_]/i.test(token) ? `'${token}'` : token;
    if (after === "(" || before === "$" || after === "$" || before === "#" || /^(?:true|false)$/i.test(token) || /^[a-z]+\d+$/i.test(token) || (/^[a-z]+$/i.test(token) && (after === ":" || previous === ":"))) return token;
    const item=findNamedRange(token,names,sheets,contextSheetId);return item?rangeEngineName(item):engineRangeName(token);
  }, number => {
    if (!/[eE]/.test(number) || !Number.isFinite(Number(number))) return number;
    const normal = String(Number(number));
    if (!/[eE]/.test(normal)) return normal;
    const [base, exponent] = number.split(/[eE]/);
    return `(${base}*10^(${Number(exponent)}))`;
  },(raw,token,sheetName)=>{const item=findNamedRange(`${quoteSheetName(sheetName)}!${token}`,names,sheets,contextSheetId);return item?rangeEngineName(item):engineRangeName(`${quoteSheetName(sheetName)}!${token}`);});
}
export function fromEngineFormula(formula, names = [], sheets = []) {
  const displays = new Map(names.map(item => [rangeEngineName(item), namedRangeDisplay(item,sheets)]));
  return mapFormulaIdentifiers(formula, token => {
    if (!/^_osnr_(?:[0-9a-f]+_)*[0-9a-f]+$/i.test(token)) return token;
    if (displays.has(token.toLowerCase())) return displays.get(token.toLowerCase());
    try { return token.slice(6).split("_").map(code => String.fromCodePoint(parseInt(code, 16))).join(""); } catch { return token; }
  });
}
