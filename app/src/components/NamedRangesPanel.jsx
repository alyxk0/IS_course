import { useEffect, useRef, useState } from "react";
import { Plus, Pencil, Trash2, Grid2X2, MessageSquarePlus } from "./SheetIcons.jsx";
import { namedRangeAddress, namedRangeKey, namedRangeDisplay, namedRangeConflict, normalizeNamedRange, validRangeName } from "../../shared/namedRanges.js";
import { parseNamedTarget } from "../namedRangeModel.js";
export default function NamedRangesPanel({ state, sheet, selection, editable, operation, onSelect }) {
  const items = state.namedRanges || [], [draft, setDraft] = useState(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [deleting, setDeleting] = useState(false), [picking, setPicking] = useState(false), nameInput = useRef(null);
  function create() {
    let n = 1; while (items.some(item => namedRangeKey(item.name) === namedRangeKey(`ИменованныйДиапазон${n}`))) n++;
    setDraft({ name: `ИменованныйДиапазон${n}`, target: namedRangeAddress({ sheetId: sheet.id, range: selection }, state.sheets), original: null }); setError(""); setDeleting(false);
  }
  useEffect(() => { if (!items.length && editable) create(); }, []);
  useEffect(() => { if (draft) { nameInput.current?.focus(); nameInput.current?.select(); } }, [draft?.original?.id, !!draft]);
  useEffect(() => {
    if (picking) setDraft(value => ({ ...value, target: namedRangeAddress({ sheetId: sheet.id, range: selection }, state.sheets) }));
  }, [picking, sheet.id, selection.r, selection.r2, selection.c, selection.c2]);
  function begin(item) { setDraft({ name: item.name, target: namedRangeAddress(item, state.sheets), original: structuredClone(item) }); setError(""); setDeleting(false); }
  async function save(event) {
    event.preventDefault(); if (!editable || busy || !draft) return; setError("");
    try {
      const next = normalizeNamedRange({ name: draft.name,...(draft.original?.scopeSheetId?{scopeSheetId:draft.original.scopeSheetId}:{}), ...parseNamedTarget(draft.target, state.sheets, sheet.id) }, state.sheets);
      if (items.some(item => item.id !== draft.original?.id && namedRangeConflict(item,next))) throw new Error("Диапазон с таким именем уже существует");
      setBusy(true);
      const ok = await operation({ type: "named-range-set", ...(draft.original ? { id: draft.original.id, expected: draft.original } : {}), namedRange: next });
      if (ok) { setDraft(null); setPicking(false); } else setError("Не удалось сохранить диапазон. Если он изменился, откройте его заново.");
    } catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  async function remove() {
    if (!editable || !draft?.original || busy) return; setBusy(true);
    try {
      if (await operation({ type: "named-range-delete", id: draft.original.id, expected: draft.original })) { setDraft(null); setDeleting(false); setPicking(false); }
      else setError("Диапазон изменился или удалён. Откройте список заново.");
    } finally { setBusy(false); }
  }
  return <div className="named-ranges-panel">
    {!draft && <button className="named-add" type="button" disabled={!editable} onClick={create}><Plus size={18} />Добавить диапазон</button>}
    {items.filter(item => item.id !== draft?.original?.id).map(item => <div className="named-range-row" key={item.id}>
      <button type="button" className="named-range-jump" onClick={() => onSelect(item)} disabled={!item.range}><strong>{namedRangeDisplay(item,state.sheets)}</strong><small>{namedRangeAddress(item, state.sheets)}</small></button>
      {editable && <button type="button" aria-label={`Изменить диапазон ${namedRangeDisplay(item,state.sheets)}`} className="named-range-edit" onClick={() => begin(item)}><Pencil size={18} /></button>}
    </div>)}
    {draft && <form className="named-range-form" onSubmit={save}>
      <div className="named-name-field"><input ref={nameInput} aria-label="Название диапазона" maxLength={250} value={draft.name} onChange={event => { setDraft({ ...draft, name: event.target.value }); setError(""); }} aria-invalid={!validRangeName(draft.name)} disabled={!editable || busy || picking} />{draft.original && <button type="button" aria-label="Удалить диапазон" disabled={!editable || busy || picking} onClick={() => setDeleting(true)}><Trash2 size={18} /></button>}</div>
      <div className={`named-target-field${picking ? " picking" : ""}`}><input aria-label="Адрес именованного диапазона" value={draft.target} onChange={event => setDraft({ ...draft, target: event.target.value })} disabled={!editable || busy} /><button type="button" aria-label={picking ? "Завершить выбор диапазона" : "Выбрать диапазон данных"} onClick={() => setPicking(value => !value)}><Grid2X2 size={20} /></button></div>
      {picking && <div className="named-picking-hint"><button type="button" onClick={() => setPicking(false)}>ОК</button><span>Выберите<br />диапазон</span></div>}
      {error && <p className="error" role="alert">{error}</p>}
      <footer><button type="button" disabled={picking} onClick={() => { setDraft(null); setError(""); setPicking(false); }}>Отмена</button><button type="submit" disabled={!editable || busy || picking || !validRangeName(draft.name)}>Готово</button></footer>
    </form>}
    {!items.length && <div className="named-range-tips"><h3><MessageSquarePlus size={18} />Полезные советы</h3><p>Применяйте именованные диапазоны в формулах. Их легко использовать повторно, запоминать и читать.</p><code><i>ƒx</i> =SUM(ИменованныйДиапазон1)</code><a href="https://support.google.com/docs/answer/63175?hl=ru" target="_blank" rel="noreferrer">Подробнее...</a></div>}
    {deleting && <div className="named-delete-confirm" role="alertdialog" aria-label="Удалить именованный диапазон?"><h3>Удалить диапазон?</h3><p>Формулы, использующие {draft?.original?.name}, перестанут работать.</p><footer><button type="button" onClick={() => setDeleting(false)}>Отмена</button><button type="button" onClick={remove} disabled={busy}>Удалить</button></footer></div>}
  </div>;
}
