import { useState, useRef, useEffect } from "react";
import { IconButton } from "./UI.jsx";
import { Grid2X2, BorderInside, BorderHorizontal, BorderVertical, BorderOuter, BorderLeft, BorderTop, BorderRight, BorderBottom, BorderClear, Pencil, ChevronDown, Check, AddCircle, Colorize } from "./SheetIcons.jsx";
import { borderCss } from "../../shared/borders.js";
import colors from "../assets/sheets-colors.json";
const presets = [["all", "Все границы", Grid2X2], ["inner", "Внутренние границы", BorderInside], ["horizontal", "Горизонтальные границы", BorderHorizontal], ["vertical", "Вертикальные границы", BorderVertical], ["outer", "Внешние границы", BorderOuter], ["left", "Левая граница", BorderLeft], ["top", "Верхняя граница", BorderTop], ["right", "Правая граница", BorderRight], ["bottom", "Нижняя граница", BorderBottom], ["clear", "Убрать границы", BorderClear]];
const lines = [["thin", "Тонкая граница"], ["medium", "Граница средней толщины"], ["thick", "Толстая граница"], ["dashed", "Пунктир"], ["dotted", "Точечный пунктир"], ["double", "Двойная граница"]];
function LineStyleIcon() {
  return <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true"><path d="M3 5h14M3 9h5m2 0h7M3 13h2m2 0h2m2 0h2m2 0h2M3 16h1m2 0h1m2 0h1m2 0h1m2 0h1" /></svg>;
}
const swatchInk = (color) => {
  const rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722 > 150 ? "#202124" : "white";
};
export default function BordersPopover({ options, onOptions, onApply, anchor, onClose }) {
  const [submenu, setSubmenu] = useState(null), [error, setError] = useState("");
  const colorButton = useRef(null), styleButton = useRef(null);
  const position = { left: Math.max(8, Math.min(anchor.left, innerWidth - 238)), top: Math.max(8, Math.min(anchor.top + 31, innerHeight - 98)) };
  const submenuPosition = (width, height, top) => ({ left: Math.max(8 - position.left, Math.min(189, innerWidth - position.left - width - 8)), top: Math.max(8 - position.top, Math.min(top, innerHeight - position.top - height - 8)) });
  useEffect(() => { window.addEventListener("resize", onClose); return () => window.removeEventListener("resize", onClose); }, [onClose]);
  const chooseColor = (color) => {
    onOptions({ ...options, color, customColors: colors.palette.some((c) => c.color === color) || colors.standard.some((c) => c.color === color) ? options.customColors : [...new Set([...(options.customColors || []), color])].slice(-6) });
    setSubmenu(null);
    colorButton.current?.focus();
  };
  const swatch = ({ color, label }) => <button type="button" key={`${color}:${label}`} className="color-swatch" aria-label={label || color} title={label || color} role="gridcell" aria-selected={options.color === color} onClick={() => chooseColor(color)} style={{ backgroundColor: color }}>
    {options.color === color && <Check size={14} color={swatchInk(color)} />}
  </button>;
  return <div className="popover borders-popover" role="menu" aria-label="Границы ячеек" data-border-submenu={submenu || undefined} style={position} onKeyDown={(e) => {
    if (e.key === "Escape" && submenu) { e.preventDefault(); e.stopPropagation(); setSubmenu(null); return; }
    const container = e.target.closest(".sheet-color-grid,.border-style-popover,.border-presets");
    if (container && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) {
      e.preventDefault(); e.stopPropagation();
      const buttons = [...container.querySelectorAll("button")], current = buttons.indexOf(document.activeElement), columns = container.classList.contains("sheet-color-grid") ? 10 : container.classList.contains("border-presets") ? 5 : 1;
      const delta = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" ? -columns : columns;
      buttons[e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : (current + delta + buttons.length) % buttons.length]?.focus();
    }
  }}>
    <div className="border-presets">{presets.map(([preset, label, Icon]) => <IconButton key={preset} icon={Icon} label={label} role="menuitem" onClick={() => onApply(preset)} />)}</div>
    <div className="border-settings">
      <button ref={colorButton} type="button" aria-label="Цвет границы" title="Цвет границы" aria-expanded={submenu === "color"} onClick={() => setSubmenu(submenu === "color" ? null : "color")}><span className="border-color-icon" style={{ borderBottomColor: options.color }}><Pencil size={20} /></span><ChevronDown size={9} /></button>
      <button ref={styleButton} type="button" aria-label="Стиль границ" title="Стиль границ" aria-expanded={submenu === "style"} onClick={() => setSubmenu(submenu === "style" ? null : "style")}><LineStyleIcon /><ChevronDown size={9} /></button>
    </div>
    {submenu === "style" && <div className="popover border-style-popover" role="menu" aria-label="Стиль границ" style={submenuPosition(122, 158, 71)}>
      {lines.map(([line, label]) => <button type="button" role="menuitemradio" aria-checked={options.line === line} aria-label={label} title={label} key={line} onClick={() => { onOptions({ ...options, line }); setSubmenu(null); styleButton.current?.focus(); }}><span>{options.line === line && <Check size={18} />}</span><i style={{ borderTop: borderCss({ line, color: "#000000" }) }} /></button>)}
    </div>}
    {submenu === "color" && <div className="popover border-color-popover" role="dialog" aria-label="Цвет границы" style={submenuPosition(244, 346, 45)}>
      <button type="button" className="border-color-reset" onClick={() => onApply("clear")}><BorderClear size={20} />Убрать границы</button>
      <div className="sheet-color-grid" role="grid" aria-label="Цвета границы">{colors.palette.map(swatch)}</div>
      <div className="color-section-title">СТАНДАРТНАЯ</div>
      <div className="sheet-color-grid standard-colors" role="grid" aria-label="Стандартные цвета">{colors.standard.map(swatch)}</div>
      <hr />
      <div className="color-section-title">ДРУГОЙ</div>
      <div className="sheet-custom-colors" role="grid" aria-label="Пользовательские цвета">
        {(options.customColors || []).map((color) => swatch({ color }))}
        <label className="custom-border-color" title="Добавить пользовательский цвет"><AddCircle size={18} /><input type="color" aria-label="Пользовательский цвет границы" value={options.color} onChange={(e) => chooseColor(e.target.value)} /></label>
        <button type="button" className="border-eyedropper" aria-label="Выбрать цвет с экрана" title="Выбрать цвет с экрана" disabled={typeof window.EyeDropper !== "function"} onClick={async () => { try { const result = await new window.EyeDropper().open(); chooseColor(result.sRGBHex); } catch (e) { if (e.name !== "AbortError") setError("Выбор цвета с экрана недоступен."); } }}><Colorize size={18} /></button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </div>}
  </div>;
}
