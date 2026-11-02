import { useRef, useState } from "react";
import { colName, address } from "../api.js";
import { Trash2 } from "./SheetIcons.jsx";

export default function SortDialog({ sheet, range, column, onApply, onClose }) {
  const original = useRef({ sheet });
  const [header, setHeader] = useState(false), [rules, setRules] = useState([{ col: column, desc: false }]), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const columns = Array.from({ length: range.c2 - range.c + 1 }, (_, i) => range.c + i);
  function update(index, patch) { setRules(current => current.map((rule, i) => i === index ? { ...rule, ...patch } : rule)); }
  return <div className="sort-dialog-backdrop" onMouseDown={onClose}>
    <section role="dialog" aria-modal="true" aria-label={`Сортировка диапазона ${address(range.r, range.c)} – ${address(range.r2, range.c2)}`} className="sort-dialog" onMouseDown={e => e.stopPropagation()} onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}>
      <h2>Сортировка диапазона {address(range.r, range.c)} – {address(range.r2, range.c2)}</h2>
      <form onSubmit={async e => { e.preventDefault(); setBusy(true); setError(""); try { if (await onApply(original.current.sheet, range, rules, header)) onClose(); else setError("Не удалось применить сортировку. Если данные изменились, откройте настройки заново."); } catch (error) { setError(error.message); } finally { setBusy(false); } }}>
        <label className="sort-header-option"><input autoFocus type="checkbox" checked={header} onChange={e => setHeader(e.target.checked)} />Данные со строкой заголовка</label>
        <div className="sort-rules">{rules.map((rule, i) => <div className="sort-rule" key={i}>
          <label htmlFor={`sort-column-${i}`}>{i ? "Затем по" : "Сортировать по"}</label>
          <select id={`sort-column-${i}`} aria-label={`Столбец сортировки ${i + 1}`} value={rule.col} onChange={e => update(i, { col: +e.target.value })}>{columns.map(col => <option key={col} value={col} disabled={rules.some((r, j) => j !== i && r.col === col)}>{header && sheet.cells[`${range.r},${col}`]?.value || `Столбец ${colName(col)}`}</option>)}</select>
          <label><input type="radio" name={`sort-order-${i}`} checked={!rule.desc} onChange={() => update(i, { desc: false })} />А &gt; Я</label>
          <label><input type="radio" name={`sort-order-${i}`} checked={rule.desc} onChange={() => update(i, { desc: true })} />Я &gt; А</label>
          {rules.length > 1 && <button className="sort-delete" type="button" aria-label={`Удалить условие ${i + 1}`} onClick={() => setRules(current => current.filter((_, j) => j !== i))}><Trash2 size={18} /></button>}
        </div>)}</div>
        <button className="sort-add" type="button" disabled={rules.length === columns.length} onClick={() => setRules(current => [...current, { col: columns.find(col => !current.some(r => r.col === col)), desc: false }])}>Добавить еще один столбец для сортировки</button>
        {error && <p className="error" role="alert">{error}</p>}
        <footer><button type="button" onClick={onClose}>Отмена</button><button type="submit" disabled={busy}>Сортировать</button></footer>
      </form>
    </section>
  </div>;
}
