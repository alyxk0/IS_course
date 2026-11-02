import { useMemo, useState } from "react";
import { Search, X } from "./SheetIcons.jsx";
import { IconButton } from "./UI.jsx";
import { colName } from "../api.js";
export default function FilterPopover({
  sheet,
  col,
  display,
  anchor,
  onApply,
  onClose,
  onSort,
  editable,
}) {
  const values = useMemo(() => {
    const set = new Set();
    for (let r = sheet.filter.range.r + 1; r <= sheet.filter.range.r2; r++)
      set.add(display(r, col));
    return [...set].sort((a, b) => a.localeCompare(b, "ru", { numeric: true }));
  }, [sheet, col]);
  const [selected, setSelected] = useState(
      new Set(sheet.filter.criteria[col]?.values ?? values),
    ),
    [search, setSearch] = useState("");
  const matches = values.filter((v) =>
    v.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <section
      className="popover column-filter-popover"
      aria-label={`Фильтр столбца ${colName(col)}`}
      style={{
        left: Math.max(8, Math.min(anchor.left, window.innerWidth - 310)),
        top: Math.min(anchor.bottom + 3, window.innerHeight - 440),
      }}
    >
      <header>
        <strong>Столбец {colName(col)}</strong>
        <IconButton icon={X} label="Закрыть фильтр" onClick={onClose} />
      </header>
      <button disabled={!editable} onClick={() => onSort(false)}>
        Сортировать А → Я
      </button>
      <button disabled={!editable} onClick={() => onSort(true)}>
        Сортировать Я → А
      </button>
      <div className="filter-values-heading">
        <strong>Фильтровать по значениям</strong>
        <div>
          <button
            disabled={!editable}
            onClick={() =>
              setSelected((prev) => new Set([...prev, ...matches]))
            }
          >
            Выбрать все
          </button>
          <span> · </span>
          <button
            disabled={!editable}
            onClick={() =>
              setSelected(
                (prev) =>
                  new Set([...prev].filter((v) => !matches.includes(v))),
              )
            }
          >
            Очистить
          </button>
        </div>
      </div>
      <div className="filter-search">
        <Search size={15} />
        <input
          aria-label="Поиск значений фильтра"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск"
        />
      </div>
      <div className="filter-values">
        {matches.length ? (
          matches.map((value) => (
            <label key={value}>
              <input
                type="checkbox"
                disabled={!editable}
                checked={selected.has(value)}
                onChange={(e) =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(value);
                    else next.delete(value);
                    return next;
                  })
                }
              />
              <span>{value || "(Пустые)"}</span>
            </label>
          ))
        ) : (
          <p>Нет совпадений</p>
        )}
      </div>
      <footer>
        <button className="text-button" onClick={onClose}>
          Отмена
        </button>
        <button
          className="primary"
          disabled={!editable}
          onClick={() =>
            onApply(
              selected.size === values.length &&
                values.every((v) => selected.has(v))
                ? null
                : [...selected],
            )
          }
        >
          ОК
        </button>
      </footer>
    </section>
  );
}
