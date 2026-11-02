import { address, colName, rangeText } from "./api.js";
import { intersects } from "../shared/ranges.js";

const quote = (value) => '"' + String(value).replaceAll('"', '""') + '"';
const absolute = (range) =>
  `$${colName(range.c)}$${range.r + 1}:$${colName(range.c2)}$${range.r2 + 1}`;
function predicate(rule, cell) {
  const { type, value, value2 } = rule.condition,
    operators = { gt: ">", gte: ">=", lt: "<", lte: "<=", eq: "=", neq: "<>" };
  if (operators[type])
    return `AND(ISNUMBER(${cell}),${cell}${operators[type]}${value})`;
  if (type === "between")
    return `AND(ISNUMBER(${cell}),${cell}>=${value},${cell}<=${value2})`;
  if (type === "empty") return `LEN(${cell})=0`;
  if (type === "notEmpty") return `LEN(${cell})>0`;
  if (type === "textEquals") return `LOWER(${cell})=LOWER(${quote(value)})`;
  if (type === "contains" || type === "notContains") {
    const escaped = String(value)
        .replaceAll("~", "~~")
        .replaceAll("*", "~*")
        .replaceAll("?", "~?"),
      formula = `ISNUMBER(SEARCH(${quote(escaped)},${cell}))`;
    return type === "contains" ? formula : `NOT(${formula})`;
  }
  if (type === "startsWith")
    return `LOWER(LEFT(${cell},LEN(${quote(value)})))=LOWER(${quote(value)})`;
  if (type === "endsWith")
    return `LOWER(RIGHT(${cell},LEN(${quote(value)})))=LOWER(${quote(value)})`;
  if (type === "duplicate")
    return `AND(LEN(${cell})>0,COUNTIF(${absolute(rule.range)},${cell})>1)`;
  return `ISNUMBER(${cell})`;
}
function excelStyle(style) {
  const result = { font: {} };
  for (const key of ["bold", "italic"])
    if (style[key] !== undefined) result.font[key] = style[key];
  if (style.strike !== undefined) result.font.strike = style.strike;
  if (style.underline !== undefined) result.font.underline = style.underline;
  if (style.color) result.font.color = { argb: "FF" + style.color.slice(1) };
  if (style.background)
    result.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF" + style.background.slice(1) },
    };
  return result;
}
export function addXLSXFeatures(book, ws, sheet, context) {
  for (const [index, rule] of (sheet.conditionalFormats || []).entries()) {
    let model;
    if (rule.condition.type === "colorScale")
      model = {
        type: "colorScale",
        priority: index + 1,
        cfvo: [
          { type: "min" },
          { type: "percent", value: 50 },
          { type: "max" },
        ],
        color: rule.colors.map((value) => ({ argb: "FF" + value.slice(1) })),
      };
    else {
      const cell = address(rule.range.r, rule.range.c),
        formula = predicate(rule, cell),
        previous = sheet.conditionalFormats
          .slice(0, index)
          .filter((p) => intersects(p.range, rule.range));
      const excludes = previous.map(
        (p) =>
          `AND(ROW()>=${p.range.r + 1},ROW()<=${p.range.r2 + 1},COLUMN()>=${p.range.c + 1},COLUMN()<=${p.range.c2 + 1},${predicate(p, cell)})`,
      );
      model = {
        type: "expression",
        priority: index + 1,
        formulae: [
          excludes.length
            ? `AND(${formula},NOT(OR(${excludes.join(",")})))`
            : formula,
        ],
        style: excelStyle(rule.style),
      };
    }
    ws.addConditionalFormatting({ ref: rangeText(rule.range), rules: [model] });
  }
  let bandPriority = (sheet.conditionalFormats || []).length + 1;
  for (const band of sheet.bandedRanges || []) {
    const start = band.range.r + 1, end = band.range.r2 + 1, first = start + (band.header ? 1 : 0), last = end - (band.footer ? 1 : 0);
    const rules = [];
    const add = (formula, color) => rules.push({ type: "expression", priority: bandPriority++, formulae: [formula], style: excelStyle({ background: color }) });
    if (band.header) add(`ROW()=${start}`, band.header);
    if (band.footer && (!band.header || start !== end)) add(`ROW()=${end}`, band.footer);
    if (first <= last) {
      add(`AND(ROW()>=${first},ROW()<=${last},MOD(ROW()-${first},2)=0)`, band.first);
      add(`AND(ROW()>=${first},ROW()<=${last},MOD(ROW()-${first},2)=1)`, band.second);
    }
    ws.addConditionalFormatting({ ref: rangeText(band.range), rules });
  }
  const operators = {
    gt: "greaterThan",
    gte: "greaterThanOrEqual",
    lt: "lessThan",
    lte: "lessThanOrEqual",
    eq: "equal",
    neq: "notEqual",
    between: "between",
  };
  for (const rule of sheet.validations || []) {
    const cell = address(rule.range.r, rule.range.c),
      validation = {
        allowBlank: true,
        showErrorMessage: true,
        errorStyle: rule.reject ? "stop" : "warning",
        errorTitle: "Недопустимое значение",
        error: "Значение не соответствует проверке данных.",
        showInputMessage: !rule.reject,
        promptTitle: "Проверка данных",
        prompt: "Используйте значение, соответствующее правилу.",
      };
    if (rule.type === "list") {
      if (!context.lists) {
        let name = "_OpenSheetsLists",
          n = 1;
        while (book.getWorksheet(name)) name = `_OpenSheetsLists${n++}`;
        context.lists = book.addWorksheet(name, { state: "veryHidden" });
        context.nextColumn = 1;
      }
      const col = context.nextColumn++,
        letter = colName(col - 1);
      let name = `_OpenSheetsList${col}`, suffix = 1;
      while (context.reservedNames?.has(name.toLowerCase())) name = `_OpenSheetsList${col}_${suffix++}`;
      context.reservedNames?.add(name.toLowerCase());
      rule.values.forEach(
        (value, i) => (context.lists.getCell(i + 1, col).value = value),
      );
      book.definedNames.add(
        `'${context.lists.name}'!$${letter}$1:$${letter}$${rule.values.length}`,
        name,
      );
      Object.assign(validation, { type: "list", formulae: [name] });
    } else if (rule.type === "checkbox")
      Object.assign(validation, { type: "list", formulae: ['"TRUE,FALSE"'] });
    else if (rule.type === "number") {
      if (rule.operator === "any")
        Object.assign(validation, {
          type: "custom",
          formulae: [`ISNUMBER(${cell})`],
        });
      else
        Object.assign(validation, {
          type: "decimal",
          operator: operators[rule.operator],
          formulae:
            rule.operator === "between"
              ? [rule.value, rule.value2]
              : [rule.value],
        });
    } else if (rule.type === "date")
      Object.assign(validation, {
        type: "date",
        operator: "between",
        formulae: [
          new Date("1900-01-01T00:00:00Z"),
          new Date("9999-12-31T00:00:00Z"),
        ],
      });
    else if (rule.type === "email")
      Object.assign(validation, {
        type: "custom",
        formulae: [
          `AND(IFERROR(SEARCH("@",${cell}),0)>1,IFERROR(SEARCH(".",${cell},SEARCH("@",${cell})+2),LEN(${cell}))<LEN(${cell}),ISERROR(SEARCH(" ",${cell})))`,
        ],
      });
    else if (rule.type === "url")
      Object.assign(validation, {
        type: "custom",
        formulae: [
          `AND(OR(AND(LEFT(LOWER(${cell}),7)="http://",LEN(${cell})>7),AND(LEFT(LOWER(${cell}),8)="https://",LEN(${cell})>8)),ISERROR(SEARCH(" ",${cell})))`,
        ],
      });
    ws.dataValidations.add(rangeText(rule.range), validation);
  }
}
