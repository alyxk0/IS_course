import { formulaEngine, syncFormulas } from "./formulas.js";
import {
  intersects,
  contains,
  validRange,
  shiftRange,
} from "../shared/ranges.js";
import { validationAt, validationMatches } from "../shared/rules.js";
import { FEATURE_OPERATIONS, applySheetFeature } from "./sheetFeatures.js";
import { validDecimalPlaces, NUMBER_FORMATS, validNumberPattern } from "../shared/numberFormats.js";
import { safeLink, validRotation } from "../shared/links.js";
import { applyLiteralInput } from "../shared/cellInput.js";
import { sameCell } from "../shared/cellEquality.js";
import { mergeRanges, mergeDropsValue } from "../shared/merging.js";
import { validBorders, mergeStyles, withoutBorders } from "../shared/borders.js";
import { normalizeBanding } from "../shared/banding.js";
import { validFontSize } from "../shared/fontSizing.js";
import { applyNamedRangeOperation } from "./namedRanges.js";
import { shiftNamedRanges, mapNamedReferences } from "../shared/namedRanges.js";
import { duplicateSheet } from "./duplicateSheet.js";
import { applyProtectionOperation, assertProtectedMutation } from "./protections.js";
import { shiftProtections } from "../shared/protections.js";
import { freezePatch, shiftFrozen } from "../shared/sheetView.js";
import { normalizeTabColor, moveSheet } from "../shared/sheetTabs.js";
const randomUUID = () => globalThis.crypto.randomUUID();

export function applyDocumentOperation(
  document, user, op, access, restoreVersion = null,
) {
  const protectedDocument = !!document.state.protections?.length;
  const result = applyUnchecked(protectedDocument ? structuredClone(document) : document, user, op, access, restoreVersion);
  if (protectedDocument) assertProtectedMutation(document, result, user, op);
  return result;
}
function applyUnchecked(
  document,
  user,
  op,
  access,
  restoreVersion = null,
) {
  if (
    !access ||
    access === "viewer" ||
    (access === "commenter" && op.type !== "comment")
  )
    throw Object.assign(new Error("Недостаточно прав для изменения таблицы"), {
      status: 403,
    });
  const doc = document;
  let state = doc.state;
  const sheet = state.sheets.find((s) => s.id === op.sheetId);
  const bad = (message) => {
    throw Object.assign(new Error(message), { status: 400 });
  };
  if (op.type === "cells" || op.type === "import-range") {
    if (op.expectedRevision !== undefined && (!Number.isInteger(op.expectedRevision) || op.expectedRevision !== doc.revision))
      throw Object.assign(new Error("Данные изменились. Повторите операцию."), { status: 409 });
    if (!sheet || !Array.isArray(op.changes) || op.changes.length > 50000 || op.changes.some((c) => !c || typeof c !== "object") || op.changes.filter((c) => c.cell && Object.hasOwn(c.cell, "value")).length > 20000)
      bad("Неверный диапазон");
    const validStyles = [
      "bold",
      "italic",
      "strike",
      "underline",
      "color",
      "background",
      "align",
      "verticalAlign",
      "rotation",
      "fontSize",
      "fontFamily",
      "format",
      "decimalPlaces",
      "numberPattern",
      "currency",
      "wrap",
      "wrapMode",
      "border",
      "borders",
    ];
    const appliedValues = new Set();
    for (const change of op.changes) {
      if ("replaceStyle" in change && typeof change.replaceStyle !== "boolean")
        bad("Неверный режим форматирования");
      if (!/^\d{1,5},\d{1,3}$/.test(change.key)) bad("Неверный адрес ячейки");
      const [r, c] = change.key.split(",").map(Number);
      if (r >= 10000 || c >= 200) bad("Слишком большой диапазон");
      const merged = sheet.merges?.find((range) => contains(range, r, c));
      const covered = merged && (merged.r !== r || merged.c !== c);
      const prev = sheet.cells[change.key] || {};
      if (
        "expected" in change &&
        !sameCell(prev, change.expected)
      )
        continue;
      if (change.cell === null) {
        if (covered && !sameCell(withoutBorders(prev), {})) bad("Нельзя изменять часть объединённой ячейки");
        delete sheet.cells[change.key];
        continue;
      }
      if (!change.cell || typeof change.cell !== "object")
        bad("Неверная ячейка");
      const next = change.replace ? {} : { ...prev };
      if ("value" in change.cell) {
        if (
          typeof change.cell.value !== "string" ||
          change.cell.value.length > 32000
        )
          bad("Неверное значение");
        next.value = change.cell.value;
      }
      if ("link" in change.cell) {
        if (change.cell.link === null) delete next.link;
        else {
          const link = safeLink(change.cell.link);
          if (!link)
            bad(
              "Укажите ссылку http, https или mailto длиной до 2048 символов",
            );
          next.link = link;
        }
      }
      if ("style" in change.cell) {
        if (!change.cell.style || typeof change.cell.style !== "object" || Array.isArray(change.cell.style))
          bad("Неверный формат");
        const style = {};
        for (const [k, v] of Object.entries(change.cell.style)) {
          if (!validStyles.includes(k)) continue;
          if (["color", "background"].includes(k) && v === null) {
            style[k] = null;
            continue;
          }
          if (k === "borders") {
            if (!validBorders(v)) bad("Неверные границы ячейки");
            style.borders = structuredClone(v);
            continue;
          }
          if (
            typeof v !== "string" &&
            typeof v !== "boolean" &&
            typeof v !== "number"
          )
            bad("Неверный формат");
          if (String(v).length > (k === "numberPattern" ? 200 : 100)) bad("Неверный формат");
          if (
            ["bold", "italic", "strike", "underline", "wrap", "border"].includes(k) &&
            typeof v !== "boolean"
          )
            bad("Неверное начертание");
          if (
            ["color", "background"].includes(k) &&
            (typeof v !== "string" || !/^#[0-9a-f]{6}$/i.test(v))
          )
            bad("Неверный цвет");
          if (
            k === "fontSize" &&
            !validFontSize(v)
          )
            bad("Размер шрифта должен быть от 1 до 400");
          if (
            k === "fontFamily" &&
            (typeof v !== "string" || !v.trim() || /[\u0000-\u001f]/.test(v))
          )
            bad("Неверный шрифт");
          if (
            k === "align" &&
            !["left", "center", "right", "justify", "general"].includes(v)
          )
            bad("Неверное выравнивание");
          if (k === "verticalAlign" && !["top", "middle", "bottom"].includes(v))
            bad("Неверное вертикальное выравнивание");
          if (k === "rotation" && !validRotation(v))
            bad("Угол поворота должен быть от -90 до 90 градусов");
          if (
            k === "format" &&
            !NUMBER_FORMATS.includes(v)
          )
            bad("Неверный числовой формат");
          if (k === "decimalPlaces" && !validDecimalPlaces(v))
            bad("Число знаков после запятой должно быть от 0 до 30");
          if (k === "numberPattern" && !validNumberPattern(v))
            bad("Неверная маска числового формата");
          if (k === "currency" && (typeof v !== "string" || !/^[A-Z]{3}$/.test(v)))
            bad("Неверный код валюты");
          if (k === "wrapMode" && !["overflow", "wrap", "clip"].includes(v))
            bad("Неверный режим переноса текста");
          style[k] = v;
        }
        next.style = mergeStyles(prev.style, style, change.replace || change.replaceStyle);
      }
      if ("literal" in change.cell) {
        if (typeof change.cell.literal !== "boolean") bad("Неверный тип значения");
      }
      applyLiteralInput(next, change.cell);
      if (next.style?.format === "custom" && !validNumberPattern(next.style.numberPattern))
        bad("Укажите маску пользовательского числового формата");
      if (covered && !sameCell(withoutBorders(prev), withoutBorders(next))) bad("Нельзя изменять часть объединённой ячейки");
      sheet.cells[change.key] = next;
      if (Object.hasOwn(change.cell, "value")) appliedValues.add(change.key);
      sheet.rows = Math.max(sheet.rows, r + 1);
      sheet.cols = Math.max(sheet.cols, c + 1);
    }
    if (op.type === "import-range") {
      if (!Array.isArray(op.merges) || op.merges.length > 2000)
        bad("Неверные объединения в импортируемом файле");
      const merges = [...(sheet.merges || [])];
      for (const m of op.merges) {
        if (
          !validRange(m) ||
          m.r2 - m.r > 99 ||
          (m.r === m.r2 && m.c === m.c2) ||
          merges.some((existing) => intersects(existing, m))
        )
          bad(
            "Импортируемые объединения пересекаются или выходят за пределы листа",
          );
        if (sheet.frozen && m.r < sheet.frozen && m.r2 >= sheet.frozen)
          bad("Импортируемое объединение пересекает закрепление");
        if (sheet.frozenCols && m.c < sheet.frozenCols && m.c2 >= sheet.frozenCols)
          bad("Импортируемое объединение пересекает закрепление");
        if (sheet.filter && m.r !== m.r2 && intersects(m, sheet.filter.range))
          bad("Импортируемое объединение пересекает фильтр");
        for (const [key, cell] of Object.entries(sheet.cells)) {
          const [r, c] = key.split(",").map(Number);
          if (contains(m, r, c) && (r !== m.r || c !== m.c) && cell.value)
            bad("Импортируемое объединение удалит существующие значения");
        }
        merges.push(m);
        sheet.rows = Math.max(sheet.rows, m.r2 + 1);
        sheet.cols = Math.max(sheet.cols, m.c2 + 1);
      }
      sheet.merges = merges;
      if (op.bandedRanges !== undefined) {
        if (!Array.isArray(op.bandedRanges) || op.bandedRanges.length > 100) bad("Неверные диапазоны чередования цветов");
        for (const input of op.bandedRanges) {
          let rule;
          try { rule = normalizeBanding(input); } catch (error) { bad(error.message); }
          sheet.rows = Math.max(sheet.rows, rule.range.r2 + 1);
          sheet.cols = Math.max(sheet.cols, rule.range.c2 + 1);
          applySheetFeature(sheet, { type: "banding-set", rule });
        }
      }
      if (op.namedRanges !== undefined) {
        if (!Array.isArray(op.namedRanges) || op.namedRanges.length > 1000) bad("Неверные именованные диапазоны");
        for (const item of op.namedRanges) {
          if (!item || !validRange(item.range)) bad("Неверный именованный диапазон");
          sheet.rows = Math.max(sheet.rows, item.range.r2 + 1); sheet.cols = Math.max(sheet.cols, item.range.c2 + 1);
          applyNamedRangeOperation(state, { type: "named-range-set", namedRange: { ...item, sheetId: sheet.id } });
        }
      }
    }
    const checked = op.changes.filter((change) =>
      appliedValues.has(change.key),
    );
    if (sheet.validations?.some((rule) => rule.reject) && checked.length) {
      const engine = formulaEngine(state);
      try {
        const sid = engine.getSheetId(sheet.name);
        for (const change of checked) {
          const [r, c] = change.key.split(",").map(Number),
            rule = validationAt(sheet, r, c);
          if (!rule?.reject) continue;
          let value = engine.getCellValue({ sheet: sid, row: r, col: c });
          if (value && typeof value === "object") value = value.value;
          if (
            rule.type === "date" &&
            typeof value !== "number" &&
            !sheet.cells[change.key]?.value?.startsWith("=")
          )
            value = sheet.cells[change.key]?.value;
          if (!validationMatches(rule, value))
            bad(
              `Значение не соответствует проверке данных в строке ${r + 1}, столбце ${c + 1}`,
            );
        }
      } finally {
        engine.destroy();
      }
    }
  } else if (["protection-set", "protection-delete"].includes(op.type)) {
    applyProtectionOperation(doc, user, op);
  } else if (["named-range-set", "named-range-delete"].includes(op.type)) {
    if (op.type === "named-range-delete") {
      const named = state.namedRanges?.find(item => item.id === op.id);
      if (named) state.protections = (state.protections || []).map(rule => {
        if (rule.namedRangeId !== named.id) return rule;
        const { namedRangeId, ...rest } = rule; return { ...rest, sheetId: named.sheetId, range: structuredClone(named.range), ...(named.allRows ? { allRows: true } : {}), ...(named.allCols ? { allCols: true } : {}) };
      });
    }
    applyNamedRangeOperation(state, op);
  } else if (FEATURE_OPERATIONS.has(op.type)) {
    if (!sheet) bad("Лист не найден");
    applySheetFeature(sheet, op);
  } else if (op.type === "merge") {
    if (
      !sheet ||
      !validRange(op.range, sheet.rows, sheet.cols) ||
      !["merge", "unmerge"].includes(op.action) ||
      (op.mode !== undefined && !["all", "horizontal", "vertical"].includes(op.mode))
    )
      bad("Неверный диапазон объединения");
    const overlapping = (sheet.merges || []).filter((range) =>
      intersects(range, op.range),
    );
    if (op.action === "unmerge")
      sheet.merges = (sheet.merges || []).filter(
        (range) => !intersects(range, op.range),
      );
    else {
      const targets = mergeRanges(op.range, op.mode);
      if (!targets.length)
        bad("Выделите несколько ячеек");
      if (
        targets.some((range) => range.r2 - range.r > 99) ||
        (op.range.r2 - op.range.r + 1) * (op.range.c2 - op.range.c + 1) > 20000
      )
        bad("Диапазон объединения слишком большой");
      if (overlapping.some((range) => range.r < op.range.r || range.r2 > op.range.r2 || range.c < op.range.c || range.c2 > op.range.c2))
        bad("Сначала выделите существующее объединение целиком");
      if (op.expectedRevision !== undefined && (!Number.isInteger(op.expectedRevision) || op.expectedRevision !== doc.revision))
        bad("Данные изменились. Повторите объединение.");
      if (
        sheet.frozen &&
        targets.some((range) => range.r < sheet.frozen && range.r2 >= sheet.frozen)
      )
        bad("Нельзя объединить закреплённые и незакреплённые строки");
      if (sheet.frozenCols && targets.some(range => range.c < sheet.frozenCols && range.c2 >= sheet.frozenCols))
        bad("Нельзя объединить закреплённые и незакреплённые столбцы");
      if (
        sheet.filter &&
        targets.some((range) => range.r !== range.r2 && intersects(sheet.filter.range, range))
      )
        bad("Вертикальное объединение пересекает фильтр");
      if (!op.discard)
        for (const [key, cell] of Object.entries(sheet.cells)) {
          const [r, c] = key.split(",").map(Number);
          if (
            mergeDropsValue(op.range, op.mode, r, c) &&
            cell.value
          )
            bad("Объединение удалит значения. Подтвердите объединение.");
        }
      for (const [key, cell] of Object.entries(sheet.cells)) {
        const [r, c] = key.split(",").map(Number);
        if (mergeDropsValue(op.range, op.mode, r, c))
          sheet.cells[key] = { ...cell, value: "" };
      }
      sheet.merges = [...(sheet.merges || []).filter((range) => !intersects(range, op.range)), ...targets];
    }
  } else if (op.type === "filter") {
    if (!sheet) bad("Лист не найден");
    if (op.filter === null) sheet.filter = null;
    else {
      const filter = op.filter;
      if (
        !filter ||
        !validRange(filter.range, sheet.rows, sheet.cols) ||
        filter.range.r === filter.range.r2 ||
        !filter.criteria ||
        typeof filter.criteria !== "object"
      )
        bad("Для фильтра нужны заголовок и строки данных");
      if (
        (sheet.merges || []).some(
          (m) => m.r !== m.r2 && intersects(m, filter.range),
        )
      )
        bad("Фильтр пересекает вертикально объединённые ячейки");
      const criteria = {};
      for (const [col, rule] of Object.entries(filter.criteria)) {
        if (
          !/^\d+$/.test(col) ||
          +col < filter.range.c ||
          +col > filter.range.c2 ||
          !rule ||
          !Array.isArray(rule.values) ||
          rule.values.length > 10000 ||
          rule.values.some((v) => typeof v !== "string" || v.length > 32000)
        )
          bad("Неверные условия фильтра");
        criteria[col] = { values: [...new Set(rule.values)] };
      }
      sheet.filter = { range: filter.range, criteria };
    }
  } else if (op.type === "restore") {
    if (!Number.isInteger(op.revision) || op.expectedRevision !== doc.revision)
      bad(
        "Таблица изменилась. Откройте историю и подтвердите восстановление заново.",
      );
    const version = restoreVersion;
    if (!version) bad("Сохранённая версия не найдена");
    doc.title = version.title;
    state = JSON.parse(version.state);
    doc.state = state;
  } else if (op.type === "title") {
    if (
      typeof op.title !== "string" ||
      !op.title.trim() ||
      op.title.length > 200
    )
      bad("Неверное название");
    doc.title = op.title.trim();
  } else if (op.type === "sheet-add") {
    if (state.sheets.length >= 30) bad("Не более 30 листов");
    let n = 1;
    while (state.sheets.some((s) => s.name === `Лист${n}`)) n++;
    state.sheets.push({
      id: randomUUID(),
      name: `Лист${n}`,
      cells: {},
      widths: {},
      rows: 1000,
      cols: 26,
      frozen: 0,
    });
  } else if (op.type === "sheet-duplicate") {
    try { duplicateSheet(state,op.sheetId,op.newSheetId); } catch(error) { bad(error.message); }
  } else if (op.type === "sheet-color") {
    if (!sheet) bad("Лист не найден");
    try { const color=normalizeTabColor(op.color); if(color===null)delete sheet.tabColor;else sheet.tabColor=color; } catch(error) { bad(error.message); }
  } else if (op.type === "sheet-move") {
    try { state.sheets=moveSheet(state.sheets,op.sheetId,op.relativeTo,op.position); } catch(error) { bad(error.message); }
  } else if (op.type === "sheet-visibility") {
    if (!sheet || typeof op.hidden !== "boolean") bad("Неверные настройки видимости листа");
    if (op.hidden && !state.sheets.some(item => item.id !== sheet.id && !item.hidden)) bad("Нельзя скрыть единственный видимый лист");
    sheet.hidden = op.hidden;
  } else if (op.type === "sheet-rename") {
    if (
      !sheet ||
      typeof op.name !== "string" ||
      !op.name.trim() ||
      op.name.length > 60 ||
      /[\[\]:*?/\\]/.test(op.name) ||
      state.sheets.some(
        (s) =>
          s.id !== sheet.id &&
          s.name.toLowerCase() === op.name.trim().toLowerCase(),
      )
    )
      bad("Недопустимое или повторяющееся имя листа");
    const engine = formulaEngine(state);
    try {
      engine.renameSheet(engine.getSheetId(sheet.name), op.name.trim());
      sheet.name = op.name.trim();
      syncFormulas(state, engine);
    } finally {
      engine.destroy();
    }
  } else if (op.type === "sheet-delete") {
    if (!sheet || state.sheets.length === 1)
      bad("Нельзя удалить единственный лист");
    if (!sheet.hidden && !state.sheets.some(item => item.id !== sheet.id && !item.hidden)) bad("Нельзя удалить единственный видимый лист");
    for(const other of state.sheets)for(const cell of Object.values(other.cells))if(!cell.literal&&cell.value?.startsWith("="))cell.value=mapNamedReferences(cell.value,state.namedRanges||[],state.sheets,other.id,(item,raw)=>item.scopeSheetId===sheet.id?"#REF!":raw);
    const engine = formulaEngine(state);
    try {
      engine.removeSheet(engine.getSheetId(sheet.name));
      state.sheets = state.sheets.filter((s) => s.id !== sheet.id);
      state.protections = (state.protections || []).filter(rule => rule.sheetId !== sheet.id);
      state.namedRanges = (state.namedRanges || []).filter(item=>item.scopeSheetId!==sheet.id).map(item => item.sheetId === sheet.id ? { ...item, range: null } : item);
      syncFormulas(state, engine);
    } finally {
      engine.destroy();
    }
    state.comments = state.comments.filter((c) => c.sheetId !== sheet.id);
  } else if (op.type === "structure") {
    const isRow = op.axis === "row",
      remove = op.action === "delete",
      axis = isRow ? 0 : 1,
      size = isRow ? sheet?.rows : sheet?.cols,
      limit = isRow ? 10000 : 200;
    if (
      !sheet ||
      !["row", "col"].includes(op.axis) ||
      !["insert", "delete"].includes(op.action) ||
      !Number.isInteger(op.index) ||
      op.index < 0 ||
      op.index >= size ||
      !Number.isInteger(op.count) ||
      op.count < 1 ||
      op.count > 100 ||
      (remove
        ? size - op.count < 1 || op.index + op.count > size
        : size + op.count > limit)
    )
      bad("Недопустимый диапазон строк или столбцов");
    const engine = formulaEngine(state);
    try {
      engine[
        isRow
          ? remove
            ? "removeRows"
            : "addRows"
          : remove
            ? "removeColumns"
            : "addColumns"
      ](engine.getSheetId(sheet.name), [op.index, op.count]);
      const moved = {};
      for (const [key, cell] of Object.entries(sheet.cells)) {
        const coords = key.split(",").map(Number),
          n = coords[axis];
        if (remove && n >= op.index && n < op.index + op.count) continue;
        if (n >= op.index) coords[axis] += remove ? -op.count : op.count;
        moved[coords.join(",")] = cell;
      }
      sheet.cells = moved;
      sheet.merges = (sheet.merges || [])
        .map((range) => shiftRange(range, op.axis, op.index, op.count, remove))
        .filter(
          (range) => range && (range.r !== range.r2 || range.c !== range.c2),
        );
      for (const feature of ["conditionalFormats", "validations", "charts", "bandedRanges"])
        sheet[feature] = (sheet[feature] || [])
          .map((item) => ({
            ...item,
            range: shiftRange(item.range, op.axis, op.index, op.count, remove),
          }))
          .filter((item) => item.range);
      if (sheet.filter) {
        const range = shiftRange(
          sheet.filter.range,
          op.axis,
          op.index,
          op.count,
          remove,
        );
        if (!range || range.r === range.r2) sheet.filter = null;
        else {
          sheet.filter.range = range;
          if (!isRow) {
            const criteria = {};
            for (const [c, rule] of Object.entries(sheet.filter.criteria)) {
              if (remove && +c >= op.index && +c < op.index + op.count)
                continue;
              criteria[
                +c >= op.index ? +c + (remove ? -op.count : op.count) : c
              ] = rule;
            }
            sheet.filter.criteria = criteria;
          }
        }
      }
      shiftFrozen(sheet, op.axis, op.index, op.count, remove);
      if (isRow) sheet.rows += remove ? -op.count : op.count;
      else {
        sheet.cols += remove ? -op.count : op.count;
        const widths = {};
        for (const [c, w] of Object.entries(sheet.widths)) {
          if (remove && +c >= op.index && +c < op.index + op.count) continue;
          widths[+c >= op.index ? +c + (remove ? -op.count : op.count) : c] = w;
        }
        sheet.widths = widths;
      }
      state.comments = state.comments.filter((c) => {
        if (c.sheetId !== sheet.id) return true;
        const coords = c.key.split(",").map(Number),
          n = coords[axis];
        if (remove && n >= op.index && n < op.index + op.count) return false;
        if (n >= op.index) coords[axis] += remove ? -op.count : op.count;
        c.key = coords.join(",");
        return true;
      });
      shiftNamedRanges(state, sheet, op.axis, op.index, op.count, remove);
      shiftProtections(state, sheet, op.axis, op.index, op.count, remove);
      syncFormulas(state, engine);
    } finally {
      engine.destroy();
    }
  } else if (op.type === "resize") {
    if (
      !sheet ||
      !Number.isInteger(op.col) ||
      op.col < 0 ||
      op.col >= 200 ||
      !Number.isFinite(op.width)
    )
      bad("Неверный столбец");
    sheet.widths[op.col] = Math.max(40, Math.min(700, op.width));
  } else if (op.type === "grow") {
    if (!sheet || !Number.isInteger(op.rows) || op.rows < 1 || op.rows > 1000)
      bad("Неверное число строк");
    sheet.rows = Math.min(10000, sheet.rows + op.rows);
    shiftNamedRanges(state, sheet, "row", sheet.rows, 0, false);
  } else if (op.type === "freeze") {
    try { Object.assign(sheet, freezePatch(sheet, op)); } catch (error) { bad(error.message); }
  } else if (op.type === "sheet-display") {
    if (!sheet || typeof op.hideGridlines !== "boolean") bad("Неверные настройки отображения");
    sheet.hideGridlines = op.hideGridlines;
  } else if (op.type === "comment") {
    if (
      !sheet ||
      !/^\d{1,5},\d{1,3}$/.test(op.key) ||
      typeof op.text !== "string" ||
      !op.text.trim() ||
      op.text.length > 5000
    )
      bad("Неверный комментарий");
    state.comments.push({
      id: randomUUID(),
      sheetId: sheet.id,
      key: op.key,
      text: op.text.trim(),
      userId: user.id,
      name: user.name,
      created: Date.now(),
      resolved: false,
    });
  } else if (op.type === "resolve-comment") {
    const comment = state.comments.find((c) => c.id === op.id);
    if (!comment) bad("Комментарий не найден");
    comment.resolved = !comment.resolved;
  } else bad("Неизвестное действие");
  for (const item of state.namedRanges || []) {
    const target = state.sheets.find(s => s.id === item.sheetId);
    if (!target || !item.range) continue;
    if (item.allRows) { item.range.r = 0; item.range.r2 = target.rows - 1; }
    if (item.allCols) { item.range.c = 0; item.range.c2 = target.cols - 1; }
  }
  for (const rule of state.protections || []) {
    const named = rule.namedRangeId && state.namedRanges?.find(item => item.id === rule.namedRangeId);
    if (named?.range) { rule.sheetId = named.sheetId; rule.range = structuredClone(named.range); }
  }
  if (!state.sheets.some(item => !item.hidden)) bad("В таблице должен оставаться видимый лист");
  doc.revision++;
  return { ...doc, state, updated: Date.now(), changeType: op.type };
}
