import { useLayoutEffect, useRef, useState } from "react";
import { Modal } from "./UI.jsx";
import { Check } from "./SheetIcons.jsx";
import { formatValue } from "../format.js";
import { validNumberPattern, excelNumberFormat } from "../../shared/numberFormats.js";

const groups = [
  [["auto", "Автоматический формат"], ["text", "Обычный текст"]],
  [["number", "Число", 1000.12], ["percent", "Процент", .1012], ["scientific", "Экспоненциальный", 1012]],
  [["accounting", "Расчеты", -1000.12], ["financial", "Финансы", -1000.12], ["currency", "Валюта", 1000.12], ["currencyRounded", "Валюта (с округлением)", 1000.12]],
  [["date", "Дата", 39717], ["time", "Время", .6659722222], ["datetime", "Дата и время", 39717.6659722222], ["duration", "Продолжительность", 1 + 1 / 1440]],
  [["custom-currency", "Валюта"], ["custom-date", "Пользовательские дата и время"], ["custom-number", "Другие форматы чисел"]],
];

export default function NumberFormatMenu({ style, anchor, onApply, onCustom, onClose, placement = "bottom", autoFocus = true }) {
  const ref = useRef(null), [position, setPosition] = useState({ left: anchor.left, top: anchor.top + 30 });
  useLayoutEffect(() => {
    const box = ref.current.getBoundingClientRect();
    const left = placement === "right" ? (anchor.right + box.width <= innerWidth - 8 || anchor.left - box.width < 8 ? anchor.right : anchor.left - box.width) : anchor.left;
    setPosition({ left: Math.max(8, Math.min(left, innerWidth - box.width - 8)), top: Math.max(8, Math.min(placement === "right" ? anchor.top : anchor.top + 30, innerHeight - box.height - 8)) });
    if (autoFocus) ref.current.querySelector('[aria-checked="true"]')?.focus();
  }, [anchor]);
  return <div ref={ref} role="menu" aria-label="Числовые форматы" className="popover number-format-menu" style={position}
    onKeyDown={(e) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        const buttons = [...ref.current.querySelectorAll('button')], i = buttons.indexOf(document.activeElement);
        buttons[e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : (i + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
      }
    }}>
    {groups.map((group, i) => <section key={i}>
      {i > 0 && <div className="number-format-divider" role="separator" />}
      {group.map(([id, label, sample]) => <button key={id} type="button"
        aria-label={label}
        role={id.startsWith("custom-") ? "menuitem" : "menuitemcheckbox"}
        aria-checked={id.startsWith("custom-") ? undefined : (style.format || "auto") === id}
        onClick={() => id.startsWith("custom-") ? onCustom(id) : onApply(id)}>
        <span className="format-menu-check">{(style.format || "auto") === id && <Check size={18} />}</span>
        <span className="format-menu-label">{label}</span>
        {sample !== undefined && <span className="format-menu-example">{formatValue(sample, { format: id, currency: style.currency })}</span>}
      </button>)}
    </section>)}
  </div>;
}

const numberPatterns = ["#,##0.00", "0", "0.00", "0.00%", "0.00E+00", "# ?/?", '#,##0.00;[Red](#,##0.00)', '0.00" кг"', '0.0,," млн"', '0.00;[Red](0.00);"—";@'];
const datePatterns = ["dd.mm.yyyy", "d mmmm yyyy", "dddd, d mmmm yyyy", "yyyy-mm-dd", "dd.mm.yyyy h:mm:ss", "h:mm:ss", "hh:mm AM/PM", "[h]:mm:ss", "[m]:ss", "h:mm:ss.000"];
const currencyCodes = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("currency") : ["RUB", "USD", "EUR", "GBP", "CNY", "JPY", "CHF", "CAD", "AUD", "BYN", "KZT", "GEL", "AMD", "TRY", "AED", "INR", "BRL", "KRW", "PLN", "UAH"];

export function CustomNumberFormatDialog({ kind, style, value, onApply, onClose }) {
  const dates = kind === "custom-date", currencyMode = kind === "custom-currency",
    title = currencyMode ? "Валюты" : dates ? "Пользовательские дата и время" : "Пользовательские числовые форматы";
  const [pattern, setPattern] = useState(style.numberPattern || (dates ? "dd.mm.yyyy" : excelNumberFormat(style) || "#,##0.00")),
    [currency, setCurrency] = useState(style.currency || "RUB"),
    [decimals, setDecimals] = useState(style.decimalPlaces ?? 2),
    [search, setSearch] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const valid = currencyMode || validNumberPattern(pattern),
    sample = typeof value === "number" ? value : dates ? 39717.6659722222 : 1234.56,
    previewStyle = currencyMode ? { format: "currency", currency, decimalPlaces: decimals } : { format: "custom", numberPattern: pattern };
  const names = new Intl.DisplayNames("ru", { type: "currency" });
  return <Modal title={title} onClose={onClose} wide>
    <form className="custom-number-form" onSubmit={async (e) => {
      e.preventDefault(); if (!valid || busy) return;
      setBusy(true); setError("");
      try {
        const ok = await onApply(currencyMode ? "currency" : "custom", currencyMode ? { currency, decimalPlaces: decimals } : { numberPattern: pattern });
        if (ok) onClose(); else setError("Не удалось применить формат.");
      } finally { setBusy(false); }
    }}>
      {currencyMode ? <>
        <input autoFocus aria-label="Поиск валюты" placeholder="Поиск валюты" value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="currency-precision">Десятичные знаки <input aria-label="Десятичные знаки валюты" type="number" min="0" max="30" required value={decimals} onChange={(e) => setDecimals(+e.target.value)} /></label>
        <div className="format-pattern-list" role="listbox" aria-label="Валюты">
          {currencyCodes.filter((code) => `${code} ${names.of(code)}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map((code) => <button type="button" role="option" aria-selected={currency === code} key={code} onClick={() => setCurrency(code)}>
            <span>{code} — {names.of(code)}</span><span>{formatValue(1234.56, { format: "currency", currency: code, decimalPlaces: decimals })}</span>
          </button>)}
        </div>
      </> : <>
        <input autoFocus aria-label="Маска формата" maxLength={200} value={pattern} onChange={(e) => setPattern(e.target.value)} aria-invalid={!valid} />
        {!valid && <p className="error" role="alert">Неверная маска формата</p>}
        <div className="format-pattern-list" aria-label="Примеры форматов">
          {(dates ? datePatterns : numberPatterns).map((p) => <button type="button" key={p} onClick={() => setPattern(p)}><span>{p}</span><span>{formatValue(sample, { format: "custom", numberPattern: p })}</span></button>)}
        </div>
      </>}
      <div className="number-format-preview">Пример: <output aria-label="Предварительный просмотр формата">{valid ? formatValue(sample, previewStyle) : ""}</output></div>
      {error && <p className="error" role="alert">{error}</p>}
      <footer><button type="button" className="text-button" onClick={onClose}>Отмена</button><button className="primary" disabled={!valid || busy}>Применить</button></footer>
    </form>
  </Modal>;
}
