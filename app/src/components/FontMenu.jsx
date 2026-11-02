import { useEffect, useRef, useState } from "react";
import { Check, Search, X } from "./SheetIcons.jsx";
import { fontChoices, filterFonts } from "../fontModel.js";
function AddFontsIcon() {
  return <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 15 7 4h2l4 11M4.5 11h7M15 7v7m-3.5-3.5h7" /></svg>;
}
export default function FontMenu({ value, themed, preferences, anchor, onChoose, onMore, onClose }) {
  const root = useRef(null), list = useRef(null), fonts = fontChoices(preferences, value);
  const width = 228.46875, height = Math.min(774.15625, innerHeight - 116);
  const position = { left: Math.max(8, Math.min(anchor.left, innerWidth - width - 8)), top: Math.max(8, Math.min(anchor.top + 31, innerHeight - height - 8)), width, height };
  useEffect(() => {
    let active = true;
    const focus = () => { if (active) list.current?.querySelector('[aria-checked="true"]')?.scrollIntoView({ block: "nearest" }); };
    root.current?.querySelector('[aria-checked="true"]')?.focus({ preventScroll: true });
    focus(); document.fonts?.ready.then(focus);
    window.addEventListener("resize", onClose);
    return () => { active = false; window.removeEventListener("resize", onClose); };
  }, []);
  const item = (font, label = font, theme = false) => {
    const selected = value === font && (theme ? themed : !themed);
    return <button type="button" key={label} role="menuitemcheckbox" aria-label={label} aria-checked={selected} onClick={() => onChoose(font)}><i>{selected && <Check size={18} />}</i><span style={{ fontFamily: font }}>{label}</span></button>;
  };
  return <div ref={root} className="popover font-popover" role="menu" aria-label="Выбор шрифта" style={position} onKeyDown={(event) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); return; }
    const buttons = [...root.current.querySelectorAll('button:not(:disabled)')], index = buttons.indexOf(document.activeElement);
    let next;
    if (["ArrowDown", "ArrowUp"].includes(event.key)) next = (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = buttons.length - 1;
    else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && event.key !== " ") {
      const candidates = [...buttons.slice(index + 1), ...buttons.slice(0, index + 1)];
      const match = candidates.find((button) => button.getAttribute('aria-label')?.toLowerCase().startsWith(event.key.toLowerCase()));
      if (match) next = buttons.indexOf(match);
    }
    if (next !== undefined) { event.preventDefault(); event.stopPropagation(); buttons[next]?.focus(); }
  }}>
    <button type="button" role="menuitem" className="more-fonts-item" onClick={onMore}><AddFontsIcon /><span>Другие шрифты</span></button>
    <div className="font-menu-separator" role="separator" />
    <div className="font-theme-label">ТЕМА</div>
    {item("Arial", "По умолчанию (Arial)", true)}
    <div className="font-menu-separator" role="separator" />
    <div ref={list} className="font-menu-list">{fonts.map((font) => item(font))}</div>
  </div>;
}

export function MoreFontsDialog({ preferences, onSave, onClose }) {
  const [enabled, setEnabled] = useState(preferences.enabled), [query, setQuery] = useState(""), [script, setScript] = useState(""), [category, setCategory] = useState(""), [sort, setSort] = useState("popular");
  const root = useRef(null), search = useRef(null), fonts = filterFonts(query, script, category, sort);
  const changed = JSON.stringify([...enabled].sort()) !== JSON.stringify([...preferences.enabled].sort());
  useEffect(() => { root.current?.querySelector('.font-catalog-row input')?.focus(); }, []);
  const toggle = (name) => setEnabled((previous) => previous.includes(name) ? previous.filter((font) => font !== name) : [...previous, name]);
  return <div className="fonts-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={root} className="fonts-dialog" role="dialog" aria-label="Шрифты" aria-modal="true" onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
      if (event.key === "Tab") {
        const controls = [...root.current.querySelectorAll('button:not(:disabled),input,select')], first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }}>
      <h2>Шрифты</h2>
      <div className="font-catalog-toolbar">
        <div className="font-search"><Search size={20} /><input ref={search} aria-label="Поиск" placeholder="Поиск" value={query} onChange={(event) => setQuery(event.target.value)} /><button type="button" aria-label="Очистить поле поиска" onClick={() => { setQuery(""); search.current?.focus(); }}><X size={20} /></button></div>
        <label><span>Сценарии</span><select aria-label="Сценарии" value={script} onChange={(event) => setScript(event.target.value)}><option value="">Все скрипты</option><option value="cyrillic">Кириллица</option><option value="latin">Латиница</option></select></label>
        <label><span>Показать</span><select aria-label="Показать" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">Все шрифты</option>{[["SANS_SERIF", "Без засечек"], ["SERIF", "С засечками"], ["MONOSPACE", "Моноширинные"], ["HANDWRITING", "Рукописные"], ["DISPLAY", "Декоративные"]].map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label><span>Сортировка</span><select aria-label="Сортировка" value={sort} onChange={(event) => setSort(event.target.value)}><option value="popular">По популярности</option><option value="alpha">По алфавиту</option></select></label>
      </div>
      <div className="font-catalog-results" role="group" aria-label="Доступные шрифты">{fonts.map((font) => <label key={font.name} className="font-catalog-row"><input type="checkbox" aria-label={font.name} checked={enabled.includes(font.name)} onChange={() => toggle(font.name)} /><span style={{ fontFamily: font.name }}>{font.name}</span></label>)}{!fonts.length && <p role="status">Шрифты не найдены</p>}</div>
      <aside className="my-fonts" aria-label="Мои шрифты"><h3>Мои шрифты</h3><div>{enabled.map((font) => <button type="button" key={font} aria-label={`Удалить ${font}`} onClick={() => toggle(font)}><span>{font}</span><X size={18} /></button>)}</div></aside>
      <footer><button type="button" onClick={onClose}>Отмена</button><button type="button" disabled={!changed} onClick={() => onSave(enabled)}>Готово</button></footer>
    </section>
  </div>;
}
