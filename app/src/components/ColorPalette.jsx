import { useEffect, useRef, useState } from "react";
import { Check, AddCircle, Colorize, ColorReset } from "./SheetIcons.jsx";
import colors from "../assets/sheets-colors.json";

export default function ColorPalette({ kind, value, customColors, onCustomColors, anchor, onChoose, onConditional, onBanding, onClose, title: customTitle, footer = true }) {
  const root = useRef(null), [error, setError] = useState("");
  const fill = kind === "background", title = customTitle || (fill ? "Цвет заливки" : "Цвет текста"), width = 257.765625, height = footer ? (fill ? 427 : 395) : 346;
  const position = { left: Math.max(8, Math.min(anchor.left, innerWidth - width - 8)), top: Math.max(8, Math.min(anchor.top + 31, innerHeight - height - 8)) };
  useEffect(() => {
    root.current?.querySelector('[aria-selected="true"]')?.focus();
    window.addEventListener("resize", onClose);
    return () => window.removeEventListener("resize", onClose);
  }, []);
  const choose = (color) => {
    if (color && ![...colors.palette, ...colors.standard].some((item) => item.color === color))
      onCustomColors([...new Set([...customColors, color])].slice(-6));
    onChoose(color);
  };
  const swatch = ({ color, label }) => {
    const rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)), ink = rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722 > 150 ? "#202124" : "white";
    const selected = (value || (fill ? "#ffffff" : "#000000")).toLowerCase() === color.toLowerCase();
    return <button type="button" key={`${color}:${label}`} className="color-swatch" role="gridcell" aria-label={label || color} title={label || color} aria-selected={selected} style={{ background: color }} onClick={() => choose(color)}>{selected && <Check size={14} color={ink} />}</button>;
  };
  return <div ref={root} className="popover sheet-color-popover" role="dialog" aria-label={title} style={{ ...position, width, height }} onKeyDown={(e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); return; }
    const container = e.target.closest('[role="grid"]');
    if (container && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) {
      e.preventDefault(); e.stopPropagation();
      const buttons = [...container.querySelectorAll('button,input')], current = buttons.indexOf(document.activeElement), columns = container.classList.contains('sheet-custom-colors') ? buttons.length : 10;
      const delta = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" ? -columns : columns;
      buttons[e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : (current + delta + buttons.length) % buttons.length]?.focus();
    }
  }}>
    <button type="button" className="sheet-color-reset" onClick={() => choose(null)}><ColorReset size={20} /><span>Сбросить параметры</span></button>
    <div className="sheet-color-grid" role="grid" aria-label="Палитра цветов">{colors.palette.map(swatch)}</div>
    <div className="color-section-title">СТАНДАРТНАЯ</div>
    <div className="sheet-color-grid standard-colors" role="grid" aria-label="Стандартные цвета">{colors.standard.map(swatch)}</div>
    <hr />
    <div className="color-section-title">ДРУГОЙ</div>
    <div className="sheet-custom-colors" role="grid" aria-label="Пользовательские цвета">
      {customColors.map((color) => swatch({ color }))}
      <label className="custom-border-color" title="Добавить пользовательский цвет"><AddCircle size={18} /><input type="color" aria-label={`Пользовательский ${title.toLowerCase()}`} value={value || (fill ? "#ffffff" : "#000000")} onChange={(e) => choose(e.target.value)} /></label>
      <button type="button" className="border-eyedropper" aria-label="Выбрать цвет с экрана" title="Выбрать цвет с экрана" disabled={typeof window.EyeDropper !== "function"} onClick={async () => {
        try { const result = await new window.EyeDropper().open(); choose(result.sRGBHex); }
        catch (e) { if (e.name !== "AbortError") setError("Выбор цвета с экрана недоступен."); }
      }}><Colorize size={18} /></button>
    </div>
    {footer && <><hr />
    <button type="button" className="sheet-color-footer" onClick={onConditional}>Условное форматирование</button>
    {fill && <button type="button" className="sheet-color-footer" onClick={onBanding}>Чередование цветов</button>}</>}
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}
