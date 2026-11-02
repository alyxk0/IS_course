import { useEffect, useRef, useState } from "react";
import { IconButton } from "./UI.jsx";
import { Minus, Plus } from "./SheetIcons.jsx";
import { FONT_SIZES, parseFontSize, stepFontSize } from "../../shared/fontSizing.js";
export default function FontSizeControl({ value, disabled, open, onOpen, onClose, onApply, onFocusGrid, contextKey }) {
  const root = useRef(null), input = useRef(null), editing = useRef(false), apply = useRef(onApply), dirty = useRef(false), keyboardChoice = useRef(false);
  const [draft, setDraft] = useState(String(value)), [active, setActive] = useState(-1), [anchor, setAnchor] = useState(null), [error, setError] = useState(false);
  useEffect(() => { if (!editing.current) setDraft(String(value)); }, [value]);
  useEffect(() => {
    editing.current = false; setDraft(String(value)); setError(false); if (open) onClose();
  }, [contextKey]);
  useEffect(() => { if (!open) return; const resized = () => cancel(); window.addEventListener("resize", resized); return () => window.removeEventListener("resize", resized); }, [open]);
  function cancel(focus = false) { editing.current = false; setDraft(String(value)); setError(false); onClose(); if (focus) onFocusGrid(); }
  function commit(size = parseFontSize(draft), focus = false) {
    if (size === null) { setError(true); return false; }
    editing.current = false; setDraft(String(size)); setError(false);
    Promise.resolve(apply.current(size)).then((ok) => { if (ok === false) setDraft(String(value)); });
    onClose(); if (focus) onFocusGrid(); return true;
  }
  const begin = () => {
    apply.current = onApply; dirty.current = false; keyboardChoice.current = false; editing.current = true; setActive(FONT_SIZES.indexOf(value)); setAnchor(input.current.getBoundingClientRect()); setError(false); onOpen();
  };
  return <div ref={root} className="menu-anchor font-size-control">
    <IconButton icon={Minus} data-font-size-control="" label="Уменьшить размер шрифта" disabled={disabled} onClick={() => { apply.current = onApply; commit(stepFontSize(editing.current ? parseFontSize(draft) ?? value : value, -1), true); }} />
    <input ref={input} className="font-size" aria-label="Размер шрифта" role="combobox" aria-expanded={open} aria-haspopup="listbox" aria-controls="font-size-options" aria-activedescendant={open && active >= 0 ? `font-size-${active}` : undefined} aria-invalid={error || undefined}
      type="text" inputMode="decimal" value={editing.current ? draft : String(value)} disabled={disabled}
      onFocus={(event) => { setDraft(String(value)); begin(); event.currentTarget.select(); }}
      onClick={() => { if (!open) begin(); }}
      onChange={(event) => { if (!editing.current) begin(); dirty.current = true; keyboardChoice.current = false; setDraft(event.target.value); setError(false); setActive(-1); }}
      onBlur={(event) => { if (!root.current.contains(event.relatedTarget) && editing.current) { if (!dirty.current || !commit()) cancel(); } }}
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancel(true); }
        else if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); commit(keyboardChoice.current && active >= 0 && open ? FONT_SIZES[active] : parseFontSize(draft), true); }
        else if (event.key === "Tab") { if (!dirty.current) cancel(); else if (!commit()) { event.preventDefault(); input.current?.select(); } }
        else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault(); event.stopPropagation();
          if (!open) begin();
          keyboardChoice.current = true;
          const next = event.key === "Home" ? 0 : event.key === "End" ? FONT_SIZES.length - 1 : active < 0 ? (event.key === "ArrowDown" ? 0 : FONT_SIZES.length - 1) : (active + (event.key === "ArrowDown" ? 1 : -1) + FONT_SIZES.length) % FONT_SIZES.length;
          setActive(next);
        }
      }} />
    <IconButton icon={Plus} data-font-size-control="" label="Увеличить размер шрифта" disabled={disabled} onClick={() => { apply.current = onApply; commit(stepFontSize(editing.current ? parseFontSize(draft) ?? value : value, 1), true); }} />
    {open && anchor && <div id="font-size-options" className="popover font-size-popover" role="listbox" aria-label="Размеры шрифта" style={{ left: Math.max(8, Math.min(anchor.left + (anchor.width - 41) / 2, innerWidth - 49)), top: Math.max(8, Math.min(anchor.bottom + 2, innerHeight - 374)) }}>
      {FONT_SIZES.map((size, index) => <button type="button" key={size} id={`font-size-${index}`} role="option" aria-selected={active === index} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => commit(size, true)}>{size}</button>)}
    </div>}
    {error && <span className="font-size-error" role="alert">Введите размер от 1 до 400</span>}
  </div>;
}
