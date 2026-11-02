import { useState } from "react";
import {
  X,
  Plus,
  Trash2,
  Grid2X2,
  Bold,
  Italic,
  Strikethrough,
  ArrowUp,
  ArrowDown,
} from "./SheetIcons.jsx";
import { IconButton } from "./UI.jsx";
import { parseRange, rangeText } from "../api.js";
import {
  CONDITIONS,
  VALIDATION_TYPES,
  normalizeCondition,
  normalizeValidation,
} from "../../shared/rules.js";

export function Sidebar({ title, onClose, children, className = "", icon: TitleIcon }) {
  return (
    <aside className={`editor-sidebar ${className}`} aria-label={title}>
      <header>
        <h2>{TitleIcon && <TitleIcon size={20} />}{title}</h2>
        <IconButton icon={X} label="Закрыть боковую панель" onClick={onClose} />
      </header>
      <div className="sidebar-content">{children}</div>
    </aside>
  );
}
function RangeField({ value, onChange, selection }) {
  return (
    <label className="panel-label">
      Применить к диапазону
      <div className="range-field">
        <input
          aria-label="Диапазон правила"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <IconButton
          icon={Grid2X2}
          label="Использовать выделенный диапазон"
          onClick={() => onChange(rangeText(selection))}
        />
      </div>
    </label>
  );
}
function number(text) {
  if (String(text).trim() === "" || !Number.isFinite(Number(text)))
    throw new Error("Введите число для условия");
  return Number(text);
}

export function ConditionalPanel({ sheet, selection, operation, editable }) {
  const [editing, setEditing] = useState(
      (sheet.conditionalFormats || []).length ? false : true,
    ),
    [draft, setDraft] = useState(null);
  const rules = sheet.conditionalFormats || [];
  function edit(rule) {
    setDraft(rule || null);
    setEditing(true);
  }
  if (editing)
    return (
      <ConditionalForm
        key={draft?.id || "new"}
        sheet={sheet}
        selection={selection}
        initial={draft}
        editable={editable}
        onCancel={() => setEditing(false)}
        onSave={async (rule) => {
          if (
            await operation({
              type: "conditional-set",
              sheetId: sheet.id,
              rule,
            })
          )
            setEditing(false);
        }}
      />
    );
  return (
    <>
      <p className="panel-note">
        Правила проверяются сверху вниз. Применяется первое совпавшее
        оформление.
      </p>
      <div className="rule-list">
        {rules.map((rule, index) => (
          <article className="rule-card" key={rule.id}>
            <button className="rule-details" onClick={() => edit(rule)}>
              <span
                className="rule-swatch"
                style={{
                  background:
                    rule.condition.type === "colorScale"
                      ? `linear-gradient(90deg,${rule.colors.join(",")})`
                      : rule.style.background || "#fff",
                  color: rule.style.color || "#202124",
                  fontWeight: rule.style.bold ? 700 : 400,
                }}
              >
                Аа
              </span>
              <span>
                <strong>
                  {CONDITIONS[rule.condition.type]}
                  {rule.condition.value !== undefined
                    ? " " + rule.condition.value
                    : ""}
                </strong>
                <small>{rangeText(rule.range)}</small>
              </span>
            </button>
            <div className="rule-actions">
              <IconButton
                icon={ArrowUp}
                label="Переместить правило выше"
                disabled={!editable || index === 0}
                onClick={() =>
                  operation({
                    type: "conditional-move",
                    sheetId: sheet.id,
                    id: rule.id,
                    direction: -1,
                  })
                }
              />
              <IconButton
                icon={ArrowDown}
                label="Переместить правило ниже"
                disabled={!editable || index === rules.length - 1}
                onClick={() =>
                  operation({
                    type: "conditional-move",
                    sheetId: sheet.id,
                    id: rule.id,
                    direction: 1,
                  })
                }
              />
              <IconButton
                icon={Trash2}
                label={`Удалить правило ${rangeText(rule.range)}`}
                disabled={!editable}
                onClick={() =>
                  operation({
                    type: "conditional-delete",
                    sheetId: sheet.id,
                    id: rule.id,
                  })
                }
              />
            </div>
          </article>
        ))}
      </div>
      <button
        className="panel-add"
        disabled={!editable}
        onClick={() => edit(null)}
      >
        <Plus size={18} />
        Добавить правило
      </button>
    </>
  );
}
function ConditionalForm({
  sheet,
  selection,
  initial,
  onSave,
  onCancel,
  editable,
}) {
  const [range, setRange] = useState(rangeText(initial?.range || selection)),
    [type, setType] = useState(initial?.condition.type || "notEmpty"),
    [value, setValue] = useState(initial?.condition.value ?? ""),
    [value2, setValue2] = useState(initial?.condition.value2 ?? ""),
    [style, setStyle] = useState(
      initial?.style || { background: "#b7e1cd", color: "#202124" },
    ),
    [colors, setColors] = useState(
      initial?.colors || ["#f8696b", "#ffeb84", "#63be7b"],
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const numeric = ["gt", "gte", "lt", "lte", "eq", "neq", "between"].includes(
      type,
    ),
    hasValue = !["notEmpty", "empty", "duplicate", "colorScale"].includes(type);
  async function submit(e) {
    e.preventDefault();
    setError("");
    try {
      let rule = {
        id: initial?.id,
        range: parseRange(range, sheet),
        condition: {
          type,
          ...(hasValue
            ? { value: numeric ? number(value) : String(value) }
            : {}),
          ...(type === "between" ? { value2: number(value2) } : {}),
        },
        style,
        colors,
      };
      rule = {
        ...normalizeCondition(rule, sheet.rows, sheet.cols),
        id: initial?.id,
      };
      setBusy(true);
      await onSave(rule);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel-form" onSubmit={submit}>
      <div className="sidebar-tabs">
        <button
          type="button"
          className={type !== "colorScale" ? "active" : ""}
          onClick={() => setType("notEmpty")}
        >
          Один цвет
        </button>
        <button
          type="button"
          className={type === "colorScale" ? "active" : ""}
          onClick={() => setType("colorScale")}
        >
          Градиент
        </button>
      </div>
      <RangeField value={range} onChange={setRange} selection={selection} />
      {type === "colorScale" ? (
        <>
          <h3>Цветовая шкала</h3>
          <p className="panel-note">
            Минимальное, среднее и максимальное числовые значения диапазона.
          </p>
          <div className="gradient-colors">
            {colors.map((c, i) => (
              <label key={i}>
                {["Мин.", "Середина", "Макс."][i]}
                <input
                  type="color"
                  aria-label={
                    ["Цвет минимума", "Цвет середины", "Цвет максимума"][i]
                  }
                  value={c}
                  onChange={(e) =>
                    setColors((prev) =>
                      prev.map((v, j) => (j === i ? e.target.value : v)),
                    )
                  }
                />
              </label>
            ))}
          </div>
          <div
            className="gradient-preview"
            style={{ background: `linear-gradient(90deg,${colors.join(",")})` }}
          />
        </>
      ) : (
        <>
          <h3>Правила форматирования</h3>
          <label className="panel-label">
            Форматировать ячейки, если…
            <select
              aria-label="Условие форматирования"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {Object.entries(CONDITIONS)
                .filter(([key]) => key !== "colorScale")
                .map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
            </select>
          </label>
          {hasValue && (
            <label className="panel-label">
              {numeric ? "Значение" : "Текст"}
              <input
                aria-label="Значение условия"
                type={numeric ? "number" : "text"}
                step="any"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
              />
            </label>
          )}
          {type === "between" && (
            <label className="panel-label">
              Верхняя граница
              <input
                aria-label="Верхняя граница условия"
                type="number"
                step="any"
                value={value2}
                onChange={(e) => setValue2(e.target.value)}
                required
              />
            </label>
          )}
          <h3>Формат</h3>
          <div
            className="condition-preview"
            style={{
              background: style.background,
              color: style.color,
              fontWeight: style.bold ? 700 : 400,
              fontStyle: style.italic ? "italic" : "normal",
              textDecoration: style.strike ? "line-through" : "none",
            }}
          >
            Пример текста
          </div>
          <div className="condition-style-tools">
            <IconButton
              icon={Bold}
              label="Полужирный в правиле"
              active={style.bold}
              onClick={() => setStyle((s) => ({ ...s, bold: !s.bold }))}
            />
            <IconButton
              icon={Italic}
              label="Курсив в правиле"
              active={style.italic}
              onClick={() => setStyle((s) => ({ ...s, italic: !s.italic }))}
            />
            <IconButton
              icon={Strikethrough}
              label="Зачёркнутый в правиле"
              active={style.strike}
              onClick={() => setStyle((s) => ({ ...s, strike: !s.strike }))}
            />
            <label>
              Текст
              <input
                type="color"
                aria-label="Цвет текста правила"
                value={style.color || "#202124"}
                onChange={(e) =>
                  setStyle((s) => ({ ...s, color: e.target.value }))
                }
              />
            </label>
            <label>
              Заливка
              <input
                type="color"
                aria-label="Заливка правила"
                value={style.background || "#ffffff"}
                onChange={(e) =>
                  setStyle((s) => ({ ...s, background: e.target.value }))
                }
              />
            </label>
          </div>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="panel-form-actions">
        <button type="button" className="text-button" onClick={onCancel}>
          Отмена
        </button>
        <button className="primary" disabled={!editable || busy}>
          Готово
        </button>
      </div>
    </form>
  );
}
export function ValidationPanel({ sheet, selection, editable, operation }) {
  const [editing, setEditing] = useState(!(sheet.validations || []).length),
    [draft, setDraft] = useState(null);
  if (editing)
    return (
      <ValidationForm
        key={draft?.id || "new"}
        sheet={sheet}
        selection={selection}
        initial={draft}
        editable={editable}
        onCancel={() => setEditing(false)}
        onSave={async (rule) => {
          if (
            await operation({ type: "validation-set", sheetId: sheet.id, rule })
          )
            setEditing(false);
        }}
      />
    );
  return (
    <>
      <div className="rule-list">
        {(sheet.validations || []).map((rule) => (
          <article className="rule-card" key={rule.id}>
            <button
              className="rule-details"
              onClick={() => {
                setDraft(rule);
                setEditing(true);
              }}
            >
              <span>
                <strong>{VALIDATION_TYPES[rule.type]}</strong>
                <small>
                  {rangeText(rule.range)} ·{" "}
                  {rule.reject ? "Отклонять ввод" : "Предупреждение"}
                </small>
              </span>
            </button>
            <IconButton
              icon={Trash2}
              label={`Удалить проверку ${rangeText(rule.range)}`}
              disabled={!editable}
              onClick={() =>
                operation({
                  type: "validation-delete",
                  sheetId: sheet.id,
                  id: rule.id,
                })
              }
            />
          </article>
        ))}
      </div>
      <button
        className="panel-add"
        disabled={!editable}
        onClick={() => {
          setDraft(null);
          setEditing(true);
        }}
      >
        <Plus size={18} />
        Добавить правило
      </button>
      <p className="panel-note">
        Пустые ячейки разрешены. Новое правило заменяет старую проверку в
        пересекающемся диапазоне.
      </p>
    </>
  );
}
function ValidationForm({
  sheet,
  selection,
  initial,
  editable,
  onSave,
  onCancel,
}) {
  const [range, setRange] = useState(rangeText(initial?.range || selection)),
    [type, setType] = useState(initial?.type || "list"),
    [values, setValues] = useState(
      initial?.values || ["Вариант 1", "Вариант 2"],
    ),
    [operator, setOperator] = useState(initial?.operator || "any"),
    [value, setValue] = useState(initial?.value ?? ""),
    [value2, setValue2] = useState(initial?.value2 ?? ""),
    [reject, setReject] = useState(initial?.reject !== false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setError("");
    try {
      let rule = {
        range: parseRange(range, sheet),
        type,
        values,
        operator,
        reject,
        ...(type === "number" && operator !== "any"
          ? { value: number(value) }
          : {}),
        ...(type === "number" && operator === "between"
          ? { value2: number(value2) }
          : {}),
      };
      rule = {
        ...normalizeValidation(rule, sheet.rows, sheet.cols),
        id: initial?.id,
      };
      setBusy(true);
      await onSave(rule);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel-form" onSubmit={submit}>
      <RangeField value={range} onChange={setRange} selection={selection} />
      <label className="panel-label">
        Критерии
        <select
          aria-label="Критерий проверки"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          {Object.entries(VALIDATION_TYPES).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {type === "list" && (
        <div className="dropdown-options">
          {values.map((v, i) => (
            <div key={i}>
              <span className={`option-color color-${i % 6}`} />
              <input
                aria-label={`Вариант списка ${i + 1}`}
                value={v}
                maxLength={200}
                onChange={(e) =>
                  setValues((prev) =>
                    prev.map((x, j) => (i === j ? e.target.value : x)),
                  )
                }
              />
              <IconButton
                icon={X}
                label={`Удалить вариант ${i + 1}`}
                onClick={() =>
                  setValues((prev) => prev.filter((_, j) => j !== i))
                }
              />
            </div>
          ))}
          <button
            type="button"
            className="panel-add"
            disabled={values.length >= 100}
            onClick={() => setValues((prev) => [...prev, ""])}
          >
            <Plus size={17} />
            Добавить элемент
          </button>
        </div>
      )}
      {type === "number" && (
        <>
          <label className="panel-label">
            Условие
            <select
              aria-label="Числовая проверка"
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
            >
              <option value="any">Любое число</option>
              {["gt", "gte", "lt", "lte", "eq", "neq", "between"].map((key) => (
                <option key={key} value={key}>
                  {CONDITIONS[key]}
                </option>
              ))}
            </select>
          </label>
          {operator !== "any" && (
            <label className="panel-label">
              Значение
              <input
                aria-label="Число для проверки"
                type="number"
                step="any"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
              />
            </label>
          )}
          {operator === "between" && (
            <label className="panel-label">
              Верхняя граница
              <input
                aria-label="Верхняя граница проверки"
                type="number"
                step="any"
                value={value2}
                onChange={(e) => setValue2(e.target.value)}
                required
              />
            </label>
          )}
        </>
      )}
      {type === "date" && (
        <p className="panel-note">
          Дата в формате ГГГГ-ММ-ДД, например 2026-10-19.
        </p>
      )}
      <details className="validation-advanced" open>
        <summary>Дополнительные параметры</summary>
        <p>Если данные недопустимы:</p>
        <label>
          <input
            type="radio"
            name="invalid-mode"
            checked={reject}
            onChange={() => setReject(true)}
          />
          Отклонять ввод
        </label>
        <label>
          <input
            type="radio"
            name="invalid-mode"
            checked={!reject}
            onChange={() => setReject(false)}
          />
          Показывать предупреждение
        </label>
      </details>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="panel-form-actions">
        <button type="button" className="text-button" onClick={onCancel}>
          Отмена
        </button>
        <button className="primary" disabled={!editable || busy}>
          Готово
        </button>
      </div>
    </form>
  );
}

export const CHART_TYPES = {
  column: "Гистограмма",
  bar: "Линейчатая",
  line: "График",
  area: "С областями",
  pie: "Круговая",
  scatter: "Точечная",
};
export function ChartPanel({ chart, sheet, operation, editable }) {
  const [tab, setTab] = useState("setup"),
    [draft, setDraft] = useState({
      ...chart,
      rangeText: rangeText(chart.range),
    }),
    [error, setError] = useState("");
  async function apply(patch = {}) {
    const next = { ...draft, ...patch };
    setDraft(next);
    setError("");
    try {
      const range = parseRange(next.rangeText, sheet);
      await operation({
        type: "chart-set",
        sheetId: sheet.id,
        chart: {
          id: chart.id,
          type: next.type,
          title: next.title,
          range,
          header: next.header,
          labels: next.labels,
          legend: next.legend,
          includeHidden: next.includeHidden,
        },
      });
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <div className="panel-form">
      <div className="sidebar-tabs">
        <button
          className={tab === "setup" ? "active" : ""}
          onClick={() => setTab("setup")}
        >
          Настройка
        </button>
        <button
          className={tab === "customize" ? "active" : ""}
          onClick={() => setTab("customize")}
        >
          Дополнительные
        </button>
      </div>
      {tab === "setup" ? (
        <>
          <label className="panel-label">
            Тип диаграммы
            <select
              disabled={!editable}
              aria-label="Тип диаграммы"
              value={draft.type}
              onChange={(e) => apply({ type: e.target.value })}
            >
              {Object.entries(CHART_TYPES).map(([type, label]) => (
                <option key={type} value={type}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="panel-label">
            Диапазон данных
            <input
              disabled={!editable}
              aria-label="Диапазон диаграммы"
              value={draft.rangeText}
              onChange={(e) =>
                setDraft((s) => ({ ...s, rangeText: e.target.value }))
              }
              onBlur={() => apply()}
              onKeyDown={(e) => {
                if (e.key === "Enter") apply();
              }}
            />
          </label>
          {[
            ["header", "Первая строка — заголовки"],
            ["labels", "Первый столбец — подписи"],
            ["includeHidden", "Показывать скрытые строки"],
          ].map(([key, label]) => (
            <label className="panel-checkbox" key={key}>
              <input
                type="checkbox"
                disabled={!editable}
                checked={draft[key]}
                onChange={(e) => apply({ [key]: e.target.checked })}
              />
              {label}
            </label>
          ))}
          <p className="panel-note">
            Числа и формулы из выбранного диапазона обновляют диаграмму
            автоматически.
          </p>
        </>
      ) : (
        <>
          <h3>Название и легенда</h3>
          <label className="panel-label">
            Название диаграммы
            <input
              disabled={!editable}
              aria-label="Название диаграммы"
              maxLength={150}
              value={draft.title}
              onChange={(e) =>
                setDraft((s) => ({ ...s, title: e.target.value }))
              }
              onBlur={() => apply()}
              onKeyDown={(e) => {
                if (e.key === "Enter") apply();
              }}
            />
          </label>
          <label className="panel-checkbox">
            <input
              type="checkbox"
              disabled={!editable}
              checked={draft.legend}
              onChange={(e) => apply({ legend: e.target.checked })}
            />
            Показывать легенду
          </label>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
