import { useEffect, useRef, useState } from "react";
import { MoreVertical, Download, Pencil, Trash2 } from "./SheetIcons.jsx";
import { IconButton } from "./UI.jsx";
import {
  chartDomain,
  chartTicks,
  chartRatio,
  SERIES_COLORS,
} from "../chartModel.js";

const short = (s, n = 18) =>
  String(s).length > n ? String(s).slice(0, n - 1) + "…" : String(s);
const number = (n) =>
  new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 2,
    notation:
      Math.abs(n) >= 1e12 || (n !== 0 && Math.abs(n) < 0.001)
        ? "scientific"
        : Math.abs(n) >= 1e6
          ? "compact"
          : "standard",
  }).format(n);
export function ChartSVG({ chart, data }) {
  const width = chart.width,
    height = chart.height,
    legendRows = chart.legend
      ? Math.min(2, Math.ceil(data.series.length / 3))
      : 0;
  const plot = {
      left: 62,
      right: width - 24,
      top: 55,
      bottom: height - 45 - legendRows * 22,
    },
    plotWidth = plot.right - plot.left,
    plotHeight = Math.max(60, plot.bottom - plot.top);
  const domain = chartDomain(data.series),
    y = (value) =>
      plot.bottom - chartRatio(value, domain.min, domain.max) * plotHeight,
    zero = y(0);
  const hasValues = data.series.some((s) => s.values.some((v) => v !== null));
  const scatterValid = data.series.some((s) =>
    s.values.some(
      (v, i) =>
        v !== null &&
        typeof data.x[i] === "number" &&
        Number.isFinite(data.x[i]),
    ),
  );
  const title = chart.title || "Диаграмма";
  const labels = data.labels,
    tickStep = Math.max(
      1,
      Math.ceil(labels.length / Math.max(2, Math.floor(plotWidth / 80))),
    );
  const xAt = (i) =>
    plot.left + ((i + 0.5) * plotWidth) / Math.max(1, labels.length);
  const summary = data.series
    .map(
      (s) =>
        `${s.name}: ${s.values
          .map((v, i) => (v === null ? "" : `${labels[i]} ${number(v)}`))
          .filter(Boolean)
          .join(", ")}`,
    )
    .join("; ");
  function linePath(values, area = false) {
    let path = "",
      segment = [];
    const flush = () => {
      if (!segment.length) return;
      path += `M${segment.map(([x, yy]) => `${x},${yy}`).join("L")}`;
      if (area)
        path += `L${segment[segment.length - 1][0]},${zero}L${segment[0][0]},${zero}Z`;
      segment = [];
    };
    values.forEach((v, i) => {
      if (v === null) flush();
      else segment.push([xAt(i), y(v)]);
    });
    flush();
    return path;
  }
  const pie =
      data.series[0]?.values
        .map((value, i) => ({ value, i, label: labels[i] }))
        .filter((p) => p.value !== null && p.value > 0) || [],
    largest = Math.max(1, ...pie.map((p) => p.value)),
    total = pie.reduce((sum, p) => sum + p.value / largest, 0);
  let angle = -Math.PI / 2;
  const scatterX = data.x.filter(
      (v) => typeof v === "number" && Number.isFinite(v),
    ),
    minX = Math.min(0, ...scatterX),
    maxX = Math.max(1, ...scatterX);
  const scatterAt = (i) =>
    plot.left + chartRatio(data.x[i], minX, maxX) * plotWidth;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="100%"
      height="100%"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={title}
      fontFamily="Arial,sans-serif"
      fontSize="11"
      fill="#5f6368"
    >
      <desc>{summary || "Нет числовых данных"}</desc>
      <rect width={width} height={height} fill="white" />
      <text x="24" y="30" fontSize="18" fill="#202124">
        {short(title, Math.floor(width / 10))}
      </text>
      {!hasValues ? (
        <text x={width / 2} y={height / 2} textAnchor="middle" fontSize="14">
          Добавьте числовые данные в выбранный диапазон
        </text>
      ) : chart.type === "scatter" && !scatterValid ? (
        <text x={width / 2} y={height / 2} textAnchor="middle" fontSize="13">
          Для точечной диаграммы нужны числовые X и Y
        </text>
      ) : chart.type === "pie" ? (
        <>
          {pie.length ? (
            pie.map((p, index) => {
              const start = angle,
                share = p.value / largest / total,
                end = angle + share * Math.PI * 2;
              angle = end;
              const cx = width / 2,
                cy = (plot.top + plot.bottom) / 2,
                radius = Math.max(25, Math.min(plotWidth, plotHeight) / 2 - 8),
                color = SERIES_COLORS[index % SERIES_COLORS.length];
              const path = `M${cx},${cy}L${cx + radius * Math.cos(start)},${cy + radius * Math.sin(start)}A${radius},${radius} 0 ${end - start > Math.PI ? 1 : 0} 1 ${cx + radius * Math.cos(end - 1e-8)},${cy + radius * Math.sin(end - 1e-8)}Z`;
              return (
                <g key={p.i}>
                  <path
                    data-value={p.value}
                    d={path}
                    fill={color}
                    stroke="white"
                    strokeWidth="1"
                  >
                    <title>{`${p.label}: ${number(p.value)} (${number(share * 100)}%)`}</title>
                  </path>
                  {share > 0.07 && (
                    <text
                      x={cx + radius * 0.66 * Math.cos((start + end) / 2)}
                      y={cy + radius * 0.66 * Math.sin((start + end) / 2)}
                      fill="white"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize="12"
                    >
                      {number(share * 100)}%
                    </text>
                  )}
                </g>
              );
            })
          ) : (
            <text x={width / 2} y={height / 2} textAnchor="middle">
              Для круговой диаграммы нужны положительные числа
            </text>
          )}
          {chart.legend &&
            pie.slice(0, 6).map((p, i) => (
              <g
                key={p.i}
                transform={`translate(${24 + ((i % 3) * (width - 48)) / 3},${height - 36 + Math.floor(i / 3) * 20})`}
              >
                <rect
                  width="10"
                  height="10"
                  fill={SERIES_COLORS[i % SERIES_COLORS.length]}
                />
                <text x="16" y="9">
                  {short(p.label, 20)}
                </text>
              </g>
            ))}
        </>
      ) : chart.type === "bar" ? (
        <>
          {chartTicks(domain).map((value, i) => {
            const x =
              plot.left + chartRatio(value, domain.min, domain.max) * plotWidth;
            return (
              <g key={i}>
                <line
                  x1={x}
                  y1={plot.top}
                  x2={x}
                  y2={plot.bottom}
                  stroke="#e0e0e0"
                />
                <text x={x} y={plot.bottom + 20} textAnchor="middle">
                  {number(value)}
                </text>
              </g>
            );
          })}
          {labels.map((label, i) => {
            const group = plotHeight / Math.max(1, labels.length),
              bar = (group * 0.72) / Math.max(1, data.series.length),
              x0 =
                plot.left + chartRatio(0, domain.min, domain.max) * plotWidth;
            return (
              <g key={i}>
                {i % Math.max(1, Math.ceil(labels.length / 10)) === 0 && (
                  <text
                    x={plot.left - 8}
                    y={plot.top + (i + 0.5) * group + 4}
                    textAnchor="end"
                  >
                    {short(label, 10)}
                  </text>
                )}
                {data.series.map((s, j) => {
                  const v = s.values[i];
                  if (v === null) return null;
                  const xx =
                    plot.left +
                    chartRatio(v, domain.min, domain.max) * plotWidth;
                  return (
                    <rect
                      key={j}
                      data-series={j}
                      data-row={i}
                      data-value={v}
                      x={Math.min(x0, xx)}
                      y={plot.top + i * group + group * 0.14 + j * bar}
                      width={Math.abs(xx - x0)}
                      height={Math.max(0.3, bar - 1)}
                      fill={s.color}
                    >
                      <title>{`${s.name} · ${label}: ${number(v)}`}</title>
                    </rect>
                  );
                })}
              </g>
            );
          })}
        </>
      ) : (
        <>
          {chartTicks(domain).map((value, i) => {
            return (
              <g key={i}>
                <line
                  x1={plot.left}
                  y1={y(value)}
                  x2={plot.right}
                  y2={y(value)}
                  stroke="#e0e0e0"
                />
                <text x={plot.left - 9} y={y(value) + 4} textAnchor="end">
                  {number(value)}
                </text>
              </g>
            );
          })}
          <line
            x1={plot.left}
            y1={zero}
            x2={plot.right}
            y2={zero}
            stroke="#9aa0a6"
          />
          {chart.type === "scatter"
            ? chartTicks({ min: minX, max: maxX }).map((v, i) => {
                return (
                  <text
                    key={i}
                    x={plot.left + plotWidth * chartRatio(v, minX, maxX)}
                    y={plot.bottom + 22}
                    textAnchor="middle"
                  >
                    {number(v)}
                  </text>
                );
              })
            : labels.map(
                (label, i) =>
                  i % tickStep === 0 && (
                    <text
                      key={i}
                      x={xAt(i)}
                      y={plot.bottom + 22}
                      textAnchor="middle"
                    >
                      {short(label, 12)}
                    </text>
                  ),
              )}
          {data.series.map((s, j) => (
            <g key={j}>
              {["line", "area"].includes(chart.type) ? (
                <>
                  <path
                    d={linePath(s.values, chart.type === "area")}
                    fill={chart.type === "area" ? s.color : "none"}
                    fillOpacity={chart.type === "area" ? 0.18 : 1}
                    stroke={s.color}
                    strokeWidth="2"
                  />
                  {s.values.length <= 100 &&
                    s.values.map(
                      (v, i) =>
                        v !== null && (
                          <circle
                            key={i}
                            data-series={j}
                            data-row={i}
                            data-value={v}
                            cx={xAt(i)}
                            cy={y(v)}
                            r="3"
                            fill={s.color}
                          >
                            <title>{`${s.name} · ${labels[i]}: ${number(v)}`}</title>
                          </circle>
                        ),
                    )}
                </>
              ) : (
                s.values.map((v, i) => {
                  if (v === null) return null;
                  if (chart.type === "scatter") {
                    if (typeof data.x[i] !== "number") return null;
                    return (
                      <circle
                        key={i}
                        data-series={j}
                        data-row={i}
                        data-value={v}
                        cx={scatterAt(i)}
                        cy={y(v)}
                        r="4"
                        fill={s.color}
                        fillOpacity=".8"
                      >
                        <title>{`${s.name}: (${number(data.x[i])}, ${number(v)})`}</title>
                      </circle>
                    );
                  }
                  const group = plotWidth / Math.max(1, labels.length),
                    bar = (group * 0.72) / data.series.length;
                  return (
                    <rect
                      key={i}
                      data-series={j}
                      data-row={i}
                      data-value={v}
                      x={plot.left + i * group + group * 0.14 + j * bar}
                      y={Math.min(zero, y(v))}
                      width={Math.max(0.3, bar - 1)}
                      height={Math.abs(zero - y(v))}
                      fill={s.color}
                    >
                      <title>{`${s.name} · ${labels[i]}: ${number(v)}`}</title>
                    </rect>
                  );
                })
              )}
            </g>
          ))}
        </>
      )}
      {hasValues &&
        chart.type !== "pie" &&
        chart.legend &&
        data.series.slice(0, 6).map((s, i) => (
          <g
            key={i}
            transform={`translate(${24 + ((i % 3) * (width - 48)) / 3},${height - 36 + Math.floor(i / 3) * 22})`}
          >
            <rect width="10" height="10" fill={s.color} />
            <text x="16" y="9">
              {short(s.name, 20)}
            </text>
          </g>
        ))}
    </svg>
  );
}
export default function ChartCard({
  chart,
  data,
  editable,
  selected,
  onSelect,
  onEdit,
  onDelete,
  onLayout,
}) {
  const [menu, setMenu] = useState(false),
    [draft, setDraft] = useState(null),
    ref = useRef(null),
    gesture = useRef(null);
  useEffect(() => {
    const close = (e) => {
      if (!ref.current?.contains(e.target)) setMenu(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  useEffect(() => () => gesture.current?.(), []);
  function drag(e, resize = false) {
    if (!editable || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect();
    const start = { x: e.clientX, y: e.clientY },
      scale = ref.current.getBoundingClientRect().width / chart.width || 1;
    let latest = {};
    const move = (event) => {
      const dx = (event.clientX - start.x) / scale,
        dy = (event.clientY - start.y) / scale;
      latest = resize
        ? {
            width: Math.max(320, Math.min(1200, chart.width + dx)),
            height: Math.max(220, Math.min(900, chart.height + dy)),
          }
        : {
            x: Math.max(0, Math.min(40000, chart.x + dx)),
            y: Math.max(0, Math.min(400000, chart.y + dy)),
          };
      setDraft(latest);
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      gesture.current = null;
    };
    const up = async () => {
      cleanup();
      if (Object.keys(latest).length) await onLayout(latest);
      setDraft(null);
    };
    gesture.current = cleanup;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  }
  const actual = { ...chart, ...draft };
  function download() {
    const svg = ref.current.querySelector("svg"),
      a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([new XMLSerializer().serializeToString(svg)], {
        type: "image/svg+xml;charset=utf-8",
      }),
    );
    a.download = (chart.title || "Диаграмма") + ".svg";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setMenu(false);
  }
  return (
    <section
      ref={ref}
      data-chart={chart.id}
      className={`chart-card ${selected ? "selected-chart" : ""}`}
      style={{
        left: actual.x,
        top: actual.y,
        width: actual.width,
        height: actual.height,
      }}
      tabIndex={0}
      aria-label={`Диаграмма ${chart.title || ""}`}
      onFocus={onSelect}
      onMouseDown={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onEdit();
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.target !== e.currentTarget) return;
        if ((e.key === "Delete" || e.key === "Backspace") && editable) {
          e.preventDefault();
          onDelete();
        } else if (e.key === "Enter") onEdit();
      }}
    >
      <div
        className="chart-drag-area"
        aria-label="Переместить диаграмму"
        onPointerDown={(e) => drag(e)}
      />
      <ChartSVG chart={actual} data={data} />
      <div className="chart-menu-anchor">
        <IconButton
          icon={MoreVertical}
          label={`Меню диаграммы ${chart.title || ""}`}
          onClick={() => setMenu(!menu)}
        />
        {menu && (
          <div className="popover chart-menu">
            <button
              onClick={() => {
                setMenu(false);
                onEdit();
              }}
            >
              <Pencil size={16} />
              Изменить диаграмму
            </button>
            <button onClick={download}>
              <Download size={16} />
              Скачать SVG
            </button>
            <button
              disabled={!editable}
              onClick={() => {
                setMenu(false);
                onDelete();
              }}
            >
              <Trash2 size={16} />
              Удалить диаграмму
            </button>
          </div>
        )}
      </div>
      {selected && editable && (
        <span
          className="chart-resize-handle"
          aria-label="Изменить размер диаграммы"
          onPointerDown={(e) => drag(e, true)}
        />
      )}
    </section>
  );
}
