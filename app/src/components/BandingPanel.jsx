import { useEffect, useState } from "react";
import { Grid2X2, Plus, Trash2, ChevronDown } from "./SheetIcons.jsx";
import { IconButton } from "./UI.jsx";
import ColorPalette from "./ColorPalette.jsx";
import presets from "../assets/banding-presets.json";
import { parseRange, rangeText } from "../api.js";
import { intersects } from "../../shared/ranges.js";
import { normalizeBanding, bandingDataRange } from "../../shared/banding.js";
const textColor = (hex) => {
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722 > 150 ? "#202124" : "#ffffff";
};

export default function BandingPanel({ sheet, selection, operation, editable, onPreview, onClose }) {
  const [initial] = useState(() => sheet.bandedRanges?.find((rule) => intersects(rule.range, selection)) || null);
  const [range, setRange] = useState(() => rangeText(initial?.range || bandingDataRange(sheet, selection)));
  const [colors, setColors] = useState(() => initial ? { header: initial.header || presets[0].header, first: initial.first, second: initial.second, footer: initial.footer || presets[0].footer } : presets[0]);
  const [header, setHeader] = useState(initial ? !!initial.header : true), [footer, setFooter] = useState(!!initial?.footer);
  const [palette, setPalette] = useState(null), [customColors, setCustomColors] = useState([]), [custom, setCustom] = useState(false), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [presetIndex, setPresetIndex] = useState(() => initial ? presets.findIndex((item) => item.first === initial.first && item.second === initial.second && (!initial.header || item.header === initial.header) && (!initial.footer || item.footer === initial.footer)) : 0);
  const normalized = () => normalizeBanding({ range: parseRange(range, sheet), ...colors, header: header ? colors.header : null, footer: footer ? colors.footer : null }, sheet.rows, sheet.cols);
  useEffect(() => {
    try { onPreview({ ...normalized(), id: initial?.id || "draft" }); }
    catch { onPreview(null); }
  }, [range, colors, header, footer]);
  useEffect(() => () => onPreview(null), []);
  async function save() {
    try {
      setError(""); const rule = normalized(); setBusy(true);
      if (await operation({ type: "banding-set", sheetId: sheet.id, rule: { ...rule, ...(initial ? { id: initial.id } : {}) }, expected: initial, ...(custom ? { customStyle: colors } : {}) })) onClose();
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  const sameColors = (scheme) => ["header", "first", "second", "footer"].every((key) => colors[key] === scheme[key]);
  const customSchemes = [...(sheet.bandingStyles || []), ...(custom && !(sheet.bandingStyles || []).some(sameColors) ? [colors] : [])];
  const scheme = (item, key) => <button type="button" key={key} className={`banding-preset${presetIndex === key && !custom ? " chosen" : ""}`} aria-label={`Цветовая схема ${key + 1}`} aria-pressed={presetIndex === key && !custom} onClick={() => { setColors(item); setCustom(false); setPresetIndex(key); }}><span>{[header ? item.header : item.first, header ? item.first : item.second, header ? item.second : item.first, footer ? item.footer : header ? item.first : item.second].map((color, index) => <i key={index} style={{ background: color }} />)}</span></button>;
  return <div className="banding-panel" onKeyDown={(event) => { if (event.key === "Escape" && !palette) { event.preventDefault(); event.stopPropagation(); onClose(); } }}>
    <div className="banding-scroll">
      <div className="banding-range"><label htmlFor="banding-range">Применить к диапазону</label><div><input id="banding-range" value={range} onChange={(e) => setRange(e.target.value)} /><IconButton icon={Grid2X2} label="Использовать выделенный диапазон" onClick={() => setRange(rangeText(selection))} /></div></div>
      <section className="banding-flags"><div>Стили</div><label><input type="checkbox" checked={header} onChange={(e) => setHeader(e.target.checked)} />Верхний колонтитул</label><label><input type="checkbox" checked={footer} onChange={(e) => setFooter(e.target.checked)} />Нижний колонтитул</label></section>
      <div className="banding-defaults"><div>Стили по умолчанию</div><div className="banding-presets" role="group" aria-label="Стили по умолчанию" onKeyDown={(e) => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;
        e.preventDefault(); const buttons = [...e.currentTarget.querySelectorAll('button')], index = buttons.indexOf(document.activeElement), delta = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' ? -6 : 6;
        buttons[e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (index + delta + buttons.length) % buttons.length]?.focus();
      }}>{presets.map(scheme)}</div></div>
      <div className="banding-custom"><div>Пользовательские стили</div><div className="banding-custom-card"><div className="banding-new">
        {customSchemes.map((item, index) => <button type="button" key={index} className={`banding-preset${custom && sameColors(item) ? " chosen" : ""}`} aria-label={`Пользовательская схема ${index + 1}`} onClick={() => { setColors({ header: item.header || presets[0].header, first: item.first, second: item.second, footer: item.footer || presets[0].footer }); setCustom(true); }}><span>{[item.header || item.first, item.first, item.second, item.footer || item.first].map((color, i) => <i key={i} style={{ background: color }} />)}</span></button>)}
        <button type="button" className="banding-add" aria-label="Новая цветовая схема" onClick={(event) => { setCustom(true); setPalette({ key: "second", label: "Цвет 2", anchor: event.currentTarget.closest('.banding-custom-card').querySelector('[data-banding-color="second"]').getBoundingClientRect() }); }}><span><Plus size={18} /></span></button></div><div className="banding-color-rows">
        {[["header", "Верхний колонтитул", header], ["first", "Цвет 1", true], ["second", "Цвет 2", true], ["footer", "Нижний колонтитул", footer]].filter(([, , visible]) => visible).map(([key, label]) => <div className="banding-color-row" key={key}><span style={{ background: colors[key], color: textColor(colors[key]) }}>{label}</span><button type="button" data-banding-color={key} aria-label={label} aria-haspopup="dialog" onClick={(e) => setPalette({ key, label, anchor: e.currentTarget.getBoundingClientRect() })}><i style={{ background: colors[key] }} /><ChevronDown size={9} /></button></div>)}
      </div></div></div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="banding-actions"><button type="button" onClick={onClose}>Отмена</button><button type="button" disabled={!editable || busy} onClick={save}>Готово</button></div>
    </div>
    <button type="button" className="banding-remove" disabled={!editable || !initial || busy} onClick={async () => { setBusy(true); if (await operation({ type: "banding-delete", sheetId: sheet.id, id: initial.id, expected: initial })) onClose(); setBusy(false); }}><Trash2 size={18} />Удалить чередующиеся цвета</button>
    {palette && <ColorPalette key={palette.key} title={palette.label} footer={false} kind="background" value={colors[palette.key]} customColors={customColors} onCustomColors={setCustomColors} anchor={palette.anchor} onChoose={(color) => { setColors((previous) => ({ ...previous, [palette.key]: color || presets[0][palette.key] })); setCustom(true); setPalette(null); }} onClose={() => setPalette(null)} />}
  </div>;
}
