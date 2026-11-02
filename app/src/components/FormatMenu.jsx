import { useEffect, useLayoutEffect, useRef, useState } from "react";
import NumberFormatMenu from "./NumberFormatMenu.jsx";
import { Bold, Italic, Underline, Strikethrough, Palette, PaintRoller, Grid2X2, Merge, AlignLeft, AlignCenter, AlignRight, AlignTop, AlignMiddle, AlignBottom, TextClip, TextOverflow, WrapText, TextRotationNone, TextTiltUp, RotateText, TextVertical, TextUp, TextDown, FontSize, FormatClear, BandingColor, Link } from "./SheetIcons.jsx";
import { FONT_SIZES, stepFontSize } from "../../shared/fontSizing.js";
import { wrapMode } from "../../shared/textWrapping.js";
const dimensions = { text: [262,142], align: [279.765625,223], wrap: [268.03125,110], rotation: [262,255], size: [76.9375,366], merge: [262,142] };
function flyout(anchor, width, height) {
  const preferred = anchor.right + width <= innerWidth - 8 || anchor.left - width < 8 ? anchor.right : anchor.left - width;
  return { left: Math.max(8, Math.min(preferred, innerWidth - width - 8)), top: Math.max(8, Math.min(anchor.top, innerHeight - height - 8)), width };
}
export default function FormatMenu({ anchor, style, range, hasMerges, onAction, onStyle, onMerge, onNumber, onCustom, onClose }) {
  const root = useRef(null), child = useRef(null), angles = useRef(null), parent = useRef(null), angleParent = useRef(null), focusNext = useRef(false), timer = useRef(null);
  const [submenu, setSubmenu] = useState(null), [subAnchor, setSubAnchor] = useState(null), [angleAnchor, setAngleAnchor] = useState(null);
  const position = { left: Math.max(8, Math.min(anchor.left, innerWidth - 330)), top: Math.max(8, Math.min(anchor.bottom, innerHeight - 506)) };
  useEffect(() => { root.current?.focus(); window.addEventListener("resize", onClose); return () => { clearTimeout(timer.current); window.removeEventListener("resize", onClose); }; }, []);
  useLayoutEffect(() => { if (focusNext.current) { (angleAnchor ? angles.current : child.current)?.querySelector('button:not(:disabled)')?.focus(); focusNext.current = false; } }, [submenu, angleAnchor]);
  function open(kind, element, focus = false) {
    clearTimeout(timer.current); parent.current = element; setAngleAnchor(null); setSubAnchor(element.getBoundingClientRect()); focusNext.current = focus; setSubmenu(kind);
  }
  function closeSubmenu() { setAngleAnchor(null); setSubmenu(null); parent.current?.focus(); }
  function apply(action) { action(); onClose(); }
  const groups = [
    [{ label: "Выбрать тему", icon: Palette, disabled: true }],
    [{ label: "Числа", kind: "number", textIcon: "123" }, { label: "Текст", kind: "text", icon: Bold }, { label: "Выравнивание", kind: "align", icon: AlignLeft }, { label: "Перенос", kind: "wrap", icon: TextClip }, { label: "Вращение", kind: "rotation", icon: RotateText }, { label: "Умные чипы", disabled: true, icon: Link, arrow: true }],
    [{ label: "Размер шрифта", kind: "size", icon: FontSize }, { label: "Объединить ячейки", kind: "merge", icon: Merge, disabled: !hasMerges && range.r === range.r2 && range.c === range.c2 }],
    [{ label: "Преобразовать в таблицу", icon: Grid2X2, disabled: true, shortcut: "Ctrl+Alt+T" }, { label: "Условное форматирование", action: "conditional", icon: PaintRoller }, { label: "Чередование цветов", action: "banding", icon: BandingColor }],
    [{ label: "Очистить форматирование", action: "clear-style", icon: FormatClear, shortcut: "Ctrl+\\" }],
  ];
  const toggle = (key) => () => onStyle({ [key]: !style[key] });
  const items = {
    text: [
      { label: "Полужирный", icon: Bold, shortcut: "Ctrl+B", checked: !!style.bold, apply: toggle("bold") },
      { label: "Курсив", icon: Italic, shortcut: "Ctrl+I", checked: !!style.italic, apply: toggle("italic") },
      { label: "Подчеркнутый", icon: Underline, shortcut: "Ctrl+U", checked: !!style.underline, apply: toggle("underline") },
      { label: "Зачеркнутый", icon: Strikethrough, shortcut: "Alt+Shift+5", checked: !!style.strike, apply: toggle("strike") },
    ],
    align: [
      { label: "По левому краю", icon: AlignLeft, shortcut: "Ctrl+Shift+L", checked: style.align === "left", apply: () => onStyle({ align: "left" }) },
      { label: "По центру", aria: "По центру по горизонтали", icon: AlignCenter, shortcut: "Ctrl+Shift+E", checked: style.align === "center", apply: () => onStyle({ align: "center" }) },
      { label: "По правому краю", icon: AlignRight, shortcut: "Ctrl+Shift+R", checked: style.align === "right", apply: () => onStyle({ align: "right" }) }, null,
      { label: "По верхнему краю", icon: AlignTop, checked: style.verticalAlign === "top", apply: () => onStyle({ verticalAlign: "top" }) },
      { label: "По центру", aria: "По центру по вертикали", icon: AlignMiddle, checked: style.verticalAlign === "middle", apply: () => onStyle({ verticalAlign: "middle" }) },
      { label: "По нижнему краю", icon: AlignBottom, checked: !style.verticalAlign || style.verticalAlign === "bottom", apply: () => onStyle({ verticalAlign: "bottom" }) },
    ],
    wrap: [["overflow", "Перекрывать соседние ячейки", TextOverflow], ["wrap", "Переносить по словам", WrapText], ["clip", "Обрезать текст", TextClip]].map(([mode, label, icon]) => ({ label, icon, checked: wrapMode(style) === mode, apply: () => onStyle({ wrapMode: mode, wrap: mode === "wrap" }) })),
    rotation: [[0, "Нет", TextRotationNone], [45, "Вверх на 45°", TextTiltUp], [-45, "Вниз на 45°", RotateText], ["vertical", "Вертикально", TextVertical], [90, "Вверх на 90°", TextUp], [-90, "Вниз на 90°", TextDown]].map(([rotation, label, icon]) => ({ label, icon, checked: (style.rotation || 0) === rotation, apply: () => onStyle({ rotation }) })).concat([null, { label: "Другой угол", kind: "angle" }]),
    size: FONT_SIZES.map((size) => ({ label: String(size), checked: (style.fontSize || 10) === size, apply: () => onStyle({ fontSize: size }) })),
    merge: [
      { label: "Объединить все", disabled: range.r === range.r2 && range.c === range.c2, apply: () => onMerge("all") },
      { label: "Объединить по вертикали", disabled: range.r === range.r2, apply: () => onMerge("vertical") },
      { label: "Объединить по горизонтали", disabled: range.c === range.c2, apply: () => onMerge("horizontal") },
      { label: "Отменить объединение ячеек", disabled: !hasMerges, apply: () => onMerge("all", true) },
    ],
  };
  function openAngles(element, focus = false) { angleParent.current = element; focusNext.current = focus; setAngleAnchor(element.getBoundingClientRect()); }
  function keydown(event) {
    const menu = event.target.closest('[role="menu"]'); if (!menu) return;
    if ((event.ctrlKey || event.metaKey) && !event.altKey) {
      const action = { b: "bold", i: "italic", u: "underline" }[event.key.toLowerCase()] || (event.code === "Backslash" ? "clear-style" : null);
      if (action) { event.preventDefault(); event.stopPropagation(); apply(() => onAction(action)); return; }
      if (event.shiftKey && ["Comma", "Period"].includes(event.code)) { event.preventDefault(); event.stopPropagation(); apply(() => onStyle({ fontSize: stepFontSize(style.fontSize, event.code === "Period" ? 1 : -1) })); return; }
    }
    if (event.altKey && event.shiftKey && event.code === "Digit5") { event.preventDefault(); event.stopPropagation(); apply(toggle("strike")); return; }
    if (event.key === "Escape" || event.key === "ArrowLeft") {
      event.preventDefault(); event.stopPropagation();
      if (angleAnchor) { setAngleAnchor(null); angleParent.current?.focus(); }
      else if (submenu) closeSubmenu(); else if (event.key === "Escape") onClose();
      return;
    }
    const buttons = [...menu.querySelectorAll('button:not(:disabled)')].filter((button) => button.closest('[role="menu"]') === menu), index = buttons.indexOf(document.activeElement);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      buttons[event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    } else if (event.key === "ArrowRight") {
      const kind = document.activeElement?.dataset.formatKind;
      if (kind) { event.preventDefault(); kind === "angle" ? openAngles(document.activeElement, true) : open(kind, document.activeElement, true); }
    }
  }
  const row = (item, index, main = false) => {
    if (!item) return <div key={`separator-${index}`} className="format-menu-divider" role="separator" />;
    const Icon = item.icon;
    return <button type="button" className="format-menu-row" key={item.aria || item.label} role={item.checked === undefined ? "menuitem" : "menuitemcheckbox"} aria-label={item.aria || item.label} aria-checked={item.checked} disabled={item.disabled}
      title={item.disabled && !item.kind ? "Пока недоступно" : undefined} data-format-kind={item.kind} aria-haspopup={item.kind ? "menu" : undefined} aria-expanded={item.kind ? (item.kind === "angle" ? !!angleAnchor : submenu === item.kind) : undefined}
      onMouseEnter={(event) => {
        clearTimeout(timer.current); const target = event.currentTarget;
        if (main) { if (item.kind && !item.disabled) timer.current = setTimeout(() => open(item.kind, target), 120); else { setSubmenu(null); setAngleAnchor(null); } }
        else if (item.kind === "angle") timer.current = setTimeout(() => openAngles(target), 120);
      }}
      onClick={(event) => item.kind ? item.kind === "angle" ? openAngles(event.currentTarget, true) : open(item.kind, event.currentTarget, true) : apply(item.apply || (() => onAction(item.action)))}>
      <i>{Icon ? <Icon size={18} /> : item.textIcon ? <b className="format-text-icon">{item.textIcon}</b> : item.checked ? <span className="format-check">✓</span> : null}</i>
      <span>{item.label}</span>{item.shortcut && <small>{item.shortcut}</small>}{(item.kind || item.arrow) && <b className="format-arrow" />}
    </button>;
  };
  return <div className="format-menu-tree" onKeyDown={keydown}>
    <div ref={root} tabIndex={-1} role="menu" aria-label="Формат" className="popover format-main-menu" style={position}>{groups.map((group, index) => <section key={index}>{index > 0 && <div className="format-menu-divider" role="separator" />}{group.map((item, i) => row(item, i, true))}</section>)}</div>
    {submenu && subAnchor && (submenu === "number" ? <NumberFormatMenu style={style} anchor={subAnchor} placement="right" autoFocus={focusNext.current} onApply={(format) => apply(() => onNumber(format))} onCustom={(kind) => apply(() => onCustom(kind))} onClose={closeSubmenu} /> : <div ref={child} role="menu" aria-label={groups.flat().find((item) => item.kind === submenu)?.label} className={`popover format-flyout format-${submenu}-menu`} style={flyout(subAnchor, ...dimensions[submenu])}>{items[submenu]?.map((item, index) => row(item, index))}</div>)}
    {angleAnchor && <div ref={angles} role="menu" aria-label="Другой угол" className="popover format-flyout format-angle-menu" style={flyout(angleAnchor, 86.265625, 430)}>{Array.from({ length: 13 }, (_, index) => index * 15 - 90).map((rotation, index) => row({ label: `${rotation}°`, checked: (style.rotation || 0) === rotation, apply: () => onStyle({ rotation }) }, index))}</div>}
  </div>;
}
