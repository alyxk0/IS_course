import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Filter, Plus, Lock, TableView, FunctionSquare, ListChecks, SortData, Shuffle, ColumnStats, DataCleanup, SplitText, DataExtract, Database, Slicer } from "./SheetIcons.jsx";
import { colName } from "../api.js";

export default function DataMenu({ anchor, column, editable, filtering, personalView, singleCell, onAction, onSort, onClose }) {
  const root = useRef(null), child = useRef(null), parent = useRef(null), timer = useRef(null), focusChild = useRef(false);
  const [submenu, setSubmenu] = useState(null), [subAnchor, setSubAnchor] = useState(null);
  const groups = [
    [{ label: "Сортировать лист", kind: "sheet", icon: SortData, disabled: !editable }, { label: "Сортировать диапазон", kind: "range", icon: SortData, disabled: !editable || singleCell }],
    [{ label: filtering ? "Удалить фильтр" : "Создать фильтр", action: "filter", icon: Filter, disabled: !editable }, { label: 'Создать фильтр "Основание группировки"', icon: Plus, disabled: true, arrow: true }, { label: personalView ? "Закрыть временный просмотр" : "Создать режим фильтрации", action: "temporary-view", icon: Plus }, { label: "Добавить срез", icon: Slicer, disabled: true }],
    [{ label: "Защитить листы и диапазоны", icon: Lock, action: "protections" }, { label: "Настроить именованные диапазоны", icon: TableView, action: "named-ranges" }, { label: "Именованные функции", icon: FunctionSquare, disabled: true }, { label: "Перемешать ячейки диапазона", icon: Shuffle, disabled: true }],
    [{ label: "Статистика по столбцам", icon: ColumnStats, disabled: true }, { label: "Настроить проверку данных", action: "validation", icon: ListChecks, disabled: !editable }, { label: "Очистка данных", kind: "cleanup", icon: DataCleanup, disabled: !editable }, { label: "Разделить текст на столбцы", icon: SplitText, disabled: true }, { label: "Извлечение данных", icon: DataExtract, disabled: true }],
    [{ label: "Коннекторы данных", icon: Database, disabled: true, arrow: true, badge: "Новое" }],
  ];
  const labelColumn = colName(column);
  const items = submenu === "cleanup" ? [{ label: "Советы по очистке данных", disabled: true }, { label: "Удалить повторы", disabled: true }, { label: "Удалить пробелы", action: "trim" }] : [
    { label: `Сортировать ${submenu === "sheet" ? "лист" : "диапазон"} по столбцу ${labelColumn} (А > Я)`, sort: false },
    { label: `Сортировать ${submenu === "sheet" ? "лист" : "диапазон"} по столбцу ${labelColumn} (Я > А)`, sort: true },
    ...(submenu === "range" ? [null, { label: "Расширенные настройки сортировки диапазонов", action: "sort-dialog" }] : []),
  ];
  function open(kind, element, focus = false) { clearTimeout(timer.current); parent.current = element; setSubAnchor(element.getBoundingClientRect()); focusChild.current = focus; setSubmenu(kind); }
  function closeChild() { setSubmenu(null); parent.current?.focus(); }
  useEffect(() => { root.current?.focus(); window.addEventListener("resize", onClose); return () => { clearTimeout(timer.current); window.removeEventListener("resize", onClose); }; }, []);
  useLayoutEffect(() => { if (focusChild.current) { child.current?.querySelector('button:not(:disabled)')?.focus(); focusChild.current = false; } }, [submenu, subAnchor]);
  function keydown(event) {
    const menu = event.target.closest('[role="menu"]'); if (!menu) return;
    if (["Escape", "ArrowLeft"].includes(event.key)) { event.preventDefault(); event.stopPropagation(); if (submenu) closeChild(); else if (event.key === "Escape") onClose(); return; }
    const buttons = [...menu.querySelectorAll('button:not(:disabled)')], index = buttons.indexOf(document.activeElement);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : index < 0 ? (event.key === "ArrowUp" ? buttons.length - 1 : 0) : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    } else if (event.key === "ArrowRight" && document.activeElement?.dataset.dataKind) { event.preventDefault(); open(document.activeElement.dataset.dataKind, document.activeElement, true); }
  }
  function row(item, index, main = false) {
    if (!item) return <div className="format-menu-divider" role="separator" key={`separator-${index}`} />;
    const Icon = item.icon;
    return <button type="button" role="menuitem" className="format-menu-row" aria-label={item.label} key={item.label} disabled={item.disabled} title={item.disabled && !item.kind ? "Пока недоступно" : undefined} data-data-kind={item.kind} aria-haspopup={item.kind ? "menu" : undefined} aria-expanded={item.kind ? submenu === item.kind : undefined}
      onMouseEnter={(event) => { clearTimeout(timer.current); const target = event.currentTarget; if (main) { if (item.kind && !item.disabled) timer.current = setTimeout(() => open(item.kind, target), 120); else setSubmenu(null); } }}
      onClick={(event) => { if (item.kind) open(item.kind, event.currentTarget, true); else { if (Object.hasOwn(item, "sort")) onSort(submenu === "sheet", item.sort); else onAction(item.action); onClose(); } }}>
      {main && <i>{Icon && <Icon size={18} />}</i>}<span>{item.label}</span>{item.badge && <em className="data-menu-badge">{item.badge}</em>}{(item.kind || item.arrow) && <b className="format-arrow" />}
    </button>;
  }
  const width = submenu === "sheet" ? Math.max(290.21875, 280 + labelColumn.length * 10.21875) : submenu === "range" ? 371.8125 : 262, height = submenu === "sheet" ? 78 : submenu === "range" ? 127 : 110;
  const preferred = subAnchor && (subAnchor.right + width <= innerWidth - 8 || subAnchor.left - width < 8 ? subAnchor.right : subAnchor.left - width);
  return <div className="format-menu-tree data-menu-tree" onKeyDown={keydown}>
    <div ref={root} tabIndex={-1} role="menu" aria-label="Данные" className="popover format-main-menu data-main-menu" style={{ left: Math.max(8, Math.min(anchor.left, innerWidth - 392.984375)), top: Math.max(8, Math.min(anchor.bottom, innerHeight - 602)) }}>
      {groups.map((group, index) => <section key={index}>{index > 0 && <div className="format-menu-divider" role="separator" />}{group.map((item, i) => row(item, i, true))}</section>)}
    </div>
    {submenu && subAnchor && <div ref={child} role="menu" aria-label={groups.flat().find(item => item.kind === submenu)?.label} className="popover format-flyout data-submenu" style={{ width, left: Math.max(8, Math.min(preferred, innerWidth - width - 8)), top: Math.max(8, Math.min(subAnchor.top, innerHeight - height - 8)) }}>{items.map((item, i) => row(item, i))}</div>}
  </div>;
}
