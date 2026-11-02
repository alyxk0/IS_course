import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { flushSync } from "react-dom";
import { createRealtime } from "./realtime.js";
import { applyLiteralInput } from "../shared/cellInput.js";
import NumberFormatMenu, { CustomNumberFormatDialog } from "./components/NumberFormatMenu.jsx";
import { api, address, colName, parseAddress, parseCSV } from "./api.js";
import { SheetLogo, IconButton, Modal } from "./components/UI.jsx";
import FilterPopover from "./components/FilterPopover.jsx";
import { createTemporaryView, projectTemporaryView, temporaryViewSignature } from "./temporaryView.js";
import {
  Sidebar,
  ConditionalPanel,
  ValidationPanel,
  ChartPanel,
} from "./components/FeaturePanels.jsx";
import ChartCard from "./components/ChartCard.jsx";
import CellCheckbox from "./components/CellCheckbox.jsx";
import CellContent from "./components/CellContent.jsx";
import RotationPopover, {
  rotationIcon,
} from "./components/RotationPopover.jsx";
import LinkDialog from "./components/LinkDialog.jsx";
import {
  conditionalEvaluator,
  validationAt,
  validationMatches,
} from "../shared/rules.js";
import { chartData } from "./chartModel.js";
import { intersects, usedRange } from "../shared/ranges.js";
import { mergeDropsValue } from "../shared/merging.js";
import { wrapMode } from "../shared/textWrapping.js";
import { borderChanges, synchronizeBorders, mergeStyles } from "../shared/borders.js";
import BordersPopover from "./components/BordersPopover.jsx";
import ColorPalette from "./components/ColorPalette.jsx";
import BandingPanel from "./components/BandingPanel.jsx";
import FontMenu, { MoreFontsDialog } from "./components/FontMenu.jsx";
import FontSizeControl from "./components/FontSizeControl.jsx";
import FormatMenu from "./components/FormatMenu.jsx";
import DataMenu from "./components/DataMenu.jsx";
import ViewMenu from "./components/ViewMenu.jsx";
import SheetTabMenu from "./components/SheetTabMenu.jsx";
import AllSheetsMenu from "./components/AllSheetsMenu.jsx";
import { readViewPreferences, writeViewPreferences } from "./viewPreferences.js";
import { frozenColumnLeft } from "../shared/sheetView.js";
import { tabMoveTarget } from "../shared/sheetTabs.js";
import { protectionAt } from "../shared/protections.js";
import SortDialog from "./components/SortDialog.jsx";
import { sortingRange, sortChanges, trimChanges } from "./dataOperations.js";
import { formulaEngine } from "../shared/formulaEngine.js";
import { fromEngineFormula, findNamedRange, namedRangeDisplay } from "../shared/namedRanges.js";
import NamedRangesPanel from "./components/NamedRangesPanel.jsx";
import ProtectionPanel from "./components/ProtectionPanel.jsx";
import { stepFontSize } from "../shared/fontSizing.js";
import { readFontPreferences, normalizeFontPreferences, fontPreferenceKey, rememberFont } from "./fontModel.js";
import { bandingStyle } from "../shared/banding.js";
import CellBorders from "./components/CellBorders.jsx";
import {
  mergeAt,
  expandSelection,
  buildLayout,
  windowRows,
  textOverflow,
  wrappedLines,
} from "./gridModel.js";
import { formatValue } from "./format.js";
import {
  displayedDecimalPlaces,
  MAX_DECIMAL_PLACES,
  withNumberPrecision,
  numberFormatColor,
} from "../shared/numberFormats.js";
import { captureFormats, paintFormats } from "./formatPainter.js";
import {
  CLIPBOARD_TYPE,
  captureClipboard,
  relocateClipboard,
} from "./clipboard.js";
import {
  ShareModal,
  CommentsModal,
  HistoryModal,
} from "./components/Dialogs.jsx";
import {
  Search,
  Undo2,
  Redo2,
  Printer,
  PaintRoller,
  ChevronDown,
  Minus,
  Plus,
  Bold,
  Italic,
  Strikethrough,
  PaintBucket,
  Grid2X2,
  Merge,
  AlignLeft,
  AlignCenter,
  AlignRight,
  WrapText,
  TextOverflow,
  TextClip,
  MessageSquarePlus,
  Filter,
  TableView,
  FunctionSquare,
  Cloud,
  History,
  MessageSquare,
  Lock,
  Share2,
  Menu,
  X,
  Check,
  Download,
  Upload,
  Trash2,
  Settings,
  LogOut,
  ArrowLeft,
  WifiOff,
  ExternalLink,
  Eye,
  ChartColumn,
  ListChecks,
  Palette,
  SquareCheck,
  DecimalDecrease,
  DecimalIncrease,
  AlignTop,
  AlignMiddle,
  AlignBottom,
  Link,
} from "./components/SheetIcons.jsx";
import { ArrowDownAZ, ArrowUpAZ } from "lucide-react";
export default function Editor({ id, user, onHome, onLogout }) {
  const [doc, setDoc] = useState(null),
    [sheetId, setSheetId] = useState(null),
    [selection, setSelection] = useState({ r: 0, c: 0, r2: 0, c2: 0 }),
    [editing, setEditing] = useState(null),
    [formula, setFormula] = useState(""),
    [connected, setConnected] = useState(false),
    [pending, setPending] = useState(0),
    [people, setPeople] = useState([]),
    [error, setError] = useState(""),
    [menu, setMenu] = useState(null),
    [modal, setModal] = useState(null),
    [scrollTop, setScrollTop] = useState(0),
    [zoom, setZoom] = useState(100),
    [find, setFind] = useState(""),
    [undoCount, setUndoCount] = useState(0),
    [redoCount, setRedoCount] = useState(0),
    [toast, setToast] = useState(""),
    [title, setTitle] = useState(""),
    [filterAnchor, setFilterAnchor] = useState(null),
    [printing, setPrinting] = useState(false),
    [collapsedChrome, setCollapsedChrome] = useState(false),
    [painter, setPainter] = useState(null),
    [linkPreview, setLinkPreview] = useState(null),
    [sidebar, setSidebar] = useState(null),
    [selectedChart, setSelectedChart] = useState(null),
    [dropdown, setDropdown] = useState(null),
    [temporaryView, setTemporaryView] = useState(null);
  const [numberFormatAnchor, setNumberFormatAnchor] = useState(null);
  const [mergeRequest, setMergeRequest] = useState(null);
  const [borderOptions, setBorderOptions] = useState({ color: "#000000", line: "thin" });
  const [borderAnchor, setBorderAnchor] = useState(null);
  const [colorAnchor, setColorAnchor] = useState(null);
  const [customColors, setCustomColors] = useState([]);
  const [bandPreview, setBandPreview] = useState(null);
  const [fontAnchor, setFontAnchor] = useState(null);
  const [formatAnchor, setFormatAnchor] = useState(null);
  const [viewAnchor, setViewAnchor] = useState(null);
  const [sheetAnchor, setSheetAnchor] = useState(null);
  const [tabDrop, setTabDrop] = useState(null);
  const tabDrag = useRef(null), tabsContainer = useRef(null);
  const [protectionRequest, setProtectionRequest] = useState({key:0,type:"range"});
  const [viewPreferences, setViewPreferences] = useState(() => readViewPreferences(user.id));
  const [fullscreen, setFullscreen] = useState(false);
  function changeViewPreferences(patch) {
    setViewPreferences(previous => { const next = { ...previous, ...patch }; writeViewPreferences(user.id, next); return next; });
  }
  const [dataAnchor, setDataAnchor] = useState(null), [sortRequest, setSortRequest] = useState(null);
  const [protectionPrompts, setProtectionPrompts] = useState([]);
  const [fontPreferences, setFontPreferences] = useState(() => readFontPreferences(user.id));
  const [fontRevision, setFontRevision] = useState(0);
  useEffect(() => {
    try { localStorage.setItem(fontPreferenceKey(user.id), JSON.stringify(fontPreferences)); } catch {}
  }, [fontPreferences, user.id]);
  useEffect(() => {
    let active = true;
    const loaded = () => { if (active) setFontRevision((value) => value + 1); };
    document.fonts?.addEventListener("loadingdone", loaded);
    document.fonts?.ready.then(loaded);
    return () => { active = false; document.fonts?.removeEventListener("loadingdone", loaded); };
  }, []);
  const socket = useRef(null),
    docRef = useRef(null),
    selectionRef = useRef(selection),
    editingRef = useRef(null),
    grid = useRef(null),
    drag = useRef(false),
    undo = useRef([]),
    redo = useRef([]),
    fileInput = useRef(null),
    toastTimer = useRef(null);
  const titleEditing = useRef(false);
  const paintingDrag = useRef(false),
    finishPainting = useRef(null);
  const sourceSheet =
    doc?.state.sheets.find((s) => s.id === sheetId && !s.hidden) || doc?.state.sheets.find(s => !s.hidden);
  const activeSheetIdRef = useRef(null);
  activeSheetIdRef.current = sourceSheet?.id;
  const calculation = useMemo(() => {
    if (!doc) return null;
    try {
      return formulaEngine(doc.state);
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [doc?.state]);
  useEffect(() => () => calculation?.destroy(), [calculation]);
  function sourceValueAt(r, c) {
    const raw = sourceSheet?.cells[`${r},${c}`]?.value;
    if (!raw) return "";
    try {
      const value = calculation?.getCellValue({
        sheet: calculation.getSheetId(sourceSheet.name), row: r, col: c,
      });
      return value && typeof value === "object" ? value.value : (value ?? raw);
    } catch { return raw; }
  }
  const projection = useMemo(
    () => projectTemporaryView(sourceSheet, temporaryView, sourceValueAt),
    [sourceSheet, temporaryView, calculation],
  );
  const sheet = projection?.sheet || sourceSheet,
    personalView = !!projection,
    editable = !personalView && ["owner", "editor"].includes(doc?.role),
    commentable = !personalView && (editable || doc?.role === "commenter");
  const personalViewRef = useRef(false);
  personalViewRef.current = personalView;
  useEffect(() => {
    if (temporaryView && (!sourceSheet || temporaryView.sheetId !== sourceSheet.id ||
        temporaryView.signature !== temporaryViewSignature(sourceSheet))) {
      setTemporaryView(null);
      setMenu(null);
    }
  }, [sourceSheet, temporaryView]);
  useEffect(() => {
    if (!editable) {
      setPainter(null);
      paintingDrag.current = false;
    }
  }, [editable]);
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);
  useEffect(() => {
    selectionRef.current = selection;
    socket.current?.emit("cursor", {
      row: projection?.sourceAt(selection.r, selection.c).r ?? selection.r,
      col: selection.c,
      sheetId: sheet?.id,
    });
  }, [selection, sheet?.id, projection]);
  useEffect(() => {
    editingRef.current = editing;
    if (editing) setLinkPreview(null);
  }, [editing]);
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);
  useEffect(() => {
    let live = true;
    const s = createRealtime();
    socket.current = s;
    function receive(next) {
      if (!live) return;
      if (docRef.current && docRef.current.state.sheets.map(s=>s.id).join(",") !== next.state.sheets.map(s=>s.id).join(",")) setMenu(null);
      if (
        [
          "restore",
          "structure",
          "merge",
          "sheet-delete",
          "import-range",
        ].includes(next.changeType) || activeSheetIdRef.current && !next.state.sheets.some(s => s.id === activeSheetIdRef.current && !s.hidden)
      ) {
        setTemporaryView(null);
        setMenu(null);
        undo.current = [];
        redo.current = [];
        setUndoCount(0);
        setRedoCount(0);
        editingRef.current = null;
        setEditing(null);
      }
      if (JSON.stringify(docRef.current?.state.namedRanges || []) !== JSON.stringify(next.state.namedRanges || [])) {
        undo.current = []; redo.current = []; setUndoCount(0); setRedoCount(0);
      }
      setDoc((prev) => ({ ...next, role: next.role || prev?.role }));
      if (!titleEditing.current) setTitle(next.title);
    }
    s.on("connect", () => {
      setConnected(true);
      s.emit("join", id, (result) => {
        if (result.error) setError(result.error);
        else {
          receive(result.document);
          setSheetId((prev) => prev || result.document.state.sheets.find(s => !s.hidden)?.id);
        }
      });
    });
    s.on("disconnect", () => {
      setConnected(false);
      setPeople([]);
    });
    s.on("connect_error", (e) => setError(e.message));
    s.on("document", receive);
    s.on("presence", setPeople);
    s.on("access-changed", () => {
      api(`/documents/${id}`)
        .then(receive)
        .catch((e) => {
          setError(e.message);
          setDoc(null);
          s.disconnect();
        });
    });
    api(`/documents/${id}`)
      .then((d) => {
        if (live) {
          receive(d);
          setSheetId(d.state.sheets.find(s => !s.hidden)?.id);
          s.connect();
        }
      })
      .catch((e) => setError(e.message));
    const stop = () => {
      drag.current = false;
      if (paintingDrag.current) {
        paintingDrag.current = false;
        finishPainting.current?.();
      }
    };
    window.addEventListener("mouseup", stop);
    return () => {
      live = false;
      s.disconnect();
      window.removeEventListener("mouseup", stop);
      clearTimeout(toastTimer.current);
    };
  }, [id]);
  useEffect(() => {
    if (sheet && !doc.state.sheets.some((s) => s.id === sheetId && !s.hidden)) {
      setSheetId(sheet.id);setSelection({r:0,c:0,r2:0,c2:0});setMenu(null);
      if (grid.current) { grid.current.scrollTop=0;grid.current.scrollLeft=0; }
    }
  }, [doc, sheetId]);
  useEffect(() => {
    if (!editing)
      setFormula(sheet?.cells[`${selection.r},${selection.c}`]?.value || "");
  }, [sheet, selection.r, selection.c, editing]);
  function inform(message) {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3500);
  }
  const operation = useCallback(
    (op) =>
      new Promise((resolve) => {
        if (personalViewRef.current) {
          setError("Закройте временный просмотр, чтобы изменять документ.");
          resolve(false);
          return;
        }
        if (!socket.current?.connected) {
          setError("Нет соединения. Изменение не отправлено.");
          resolve(false);
          return;
        }
        const submit = request => {
          setPending((n) => n + 1);
          socket.current
          .timeout(10000)
          .emit("operation", request, (timeout, result) => {
            setPending((n) => Math.max(0, n - 1));
            if (!timeout && result?.code === "protection_warning") {
              setProtectionPrompts(queue => [...queue, { message: result.error, warnings: result.protectionWarnings || [], confirm: () => submit({ ...request, protectionAcknowledgement: result.revision }), cancel: () => resolve(false) }]);
              return;
            }
            if (timeout || result?.error) {
              setError(
                result?.error ||
                  "Сервер не подтвердил сохранение. Переподключитесь перед повторной попыткой.",
              );
              resolve(false);
            } else resolve(true);
          });
        };
        submit(op);
      }),
    [],
  );
  async function changeCells(changes, remember = true, expectedRevision) {
    if (!editable || !changes.length) return false;
    changes = synchronizeBorders(sheet, changes);
    const history = {
      sheetId: sheet.id,
      before: changes.map((c) => ({
        key: c.key,
        cell: sheet.cells[c.key] || null,
      })),
      after: changes.map((c) => {
        const result = {
          key: c.key,
          cell:
            c.cell === null
              ? null
              : {
                  ...(c.replace ? {} : sheet.cells[c.key]),
                  ...c.cell,
                  style: c.cell.style
                    ? mergeStyles(sheet.cells[c.key]?.style, c.cell.style, c.replace || c.replaceStyle)
                    : c.replace
                      ? undefined
                      : sheet.cells[c.key]?.style,
                },
        };
        if (result.cell?.link === null) delete result.cell.link;
        if (result.cell?.style && Object.hasOwn(c.cell.style || {}, "wrap") && !Object.hasOwn(c.cell.style || {}, "wrapMode")) delete result.cell.style.wrapMode;
        if (result.cell) applyLiteralInput(result.cell, c.cell);
        return result;
      }),
    };
    const ok = await operation({ type: "cells", sheetId: sheet.id, changes, ...(expectedRevision !== undefined ? { expectedRevision } : {}) });
    if (ok && remember) {
      undo.current.push(history);
      redo.current = [];
      setUndoCount(undo.current.length);
      setRedoCount(0);
    }
    return ok;
  }
  async function undoRedo(isRedo = false) {
    const from = isRedo ? redo.current : undo.current,
      to = isRedo ? undo.current : redo.current;
    const entry = from[from.length - 1];
    if (!entry || !editable) return;
    const target = isRedo ? entry.after : entry.before,
      expected = isRedo ? entry.before : entry.after;
    const changes = target.map((c, i) => ({
      ...c,
      replace: true,
      expected: expected[i].cell || {},
    }));
    if (await operation({ type: "cells", sheetId: entry.sheetId, changes })) {
      from.pop();
      to.push(entry);
      setUndoCount(undo.current.length);
      setRedoCount(redo.current.length);
    }
  }
  function bounds() {
    return expandSelection(sheet, {
      r: Math.min(selection.r, selection.r2),
      r2: Math.max(selection.r, selection.r2),
      c: Math.min(selection.c, selection.c2),
      c2: Math.max(selection.c, selection.c2),
    });
  }
  function selectedKeys() {
    const b = bounds(),
      keys = [];
    if ((b.r2 - b.r + 1) * (b.c2 - b.c + 1) > 20000) {
      setError("За один раз можно изменить не более 20 000 ячеек");
      return keys;
    }
    for (let r = b.r; r <= b.r2; r++)
      for (let c = b.c; c <= b.c2; c++) {
        const m = mergeAt(sheet, r, c);
        if (!m || (m.r === r && m.c === c)) keys.push(`${r},${c}`);
      }
    return keys;
  }
  function style(patch) {
    changeCells(selectedKeys().map((key) => ({ key, cell: { style: patch } })));
  }
  function setNumberFormat(format, options = {}) {
    setMenu(null);
    return changeCells(
      selectedKeys().map((key) => {
        const next = { ...sheet.cells[key]?.style, format };
        delete next.decimalPlaces;
        delete next.numberPattern;
        delete next.currency;
        Object.assign(next, options);
        return { key, cell: { style: next }, replaceStyle: true };
      }),
    );
  }
  function changePrecision(delta) {
    changeCells(
      selectedKeys().map((key) => {
        const [r, c] = key.split(",").map(Number),
          current = sheet.cells[key]?.style || {};
        return {
          key,
          cell: {
            style: withNumberPrecision(current, Math.max(
                0,
                Math.min(
                  MAX_DECIMAL_PLACES,
                  displayedDecimalPlaces(valueAt(r, c), current) + delta,
                ),
              )),
          },
          replaceStyle: true,
        };
      }),
    );
  }
  function armPainter(sticky = false) {
    if (!editable) return;
    commit();
    if (painter && !sticky) {
      clearPainter();
      return;
    }
    try {
      setPainter({ ...captureFormats(sheet, bounds()), sticky });
      inform(
        sticky
          ? "Форматирование: выберите диапазоны. Esc — завершить."
          : "Выберите диапазон для форматирования. Esc — отмена.",
      );
    } catch (error) {
      setError(error.message);
    }
  }
  function clearPainter() {
    setPainter(null);
    paintingDrag.current = false;
    setToast("");
  }
  function applyPainter() {
    if (!painter || !editable) return;
    const source = painter,
      target = bounds();
    if (!source.sticky) clearPainter();
    try {
      const changes = paintFormats(sheet, source, target);
      changeCells(changes);
      if (target.r === target.r2 && target.c === target.c2)
        setSelection({
          ...target,
          r2: target.r + source.height - 1,
          c2: target.c + source.width - 1,
        });
    } catch (error) {
      setError(error.message);
    }
  }
  finishPainting.current = applyPainter;
  function startEdit(value) {
    if (!editable || !connected) return;
    const next = {
      r: selection.r,
      c: selection.c,
      value: value ?? sheet.cells[`${selection.r},${selection.c}`]?.value ?? "",
    };
    editingRef.current = next;
    setEditing(next);
    setFormula(next.value);
  }
  function updateEdit(value) {
    const next = { ...editingRef.current, value };
    editingRef.current = next;
    setEditing(next);
    setFormula(value);
  }
  function insertEditNewline(e) {
    e.preventDefault();
    const field = e.currentTarget, start = field.selectionStart, end = field.selectionEnd;
    updateEdit(field.value.slice(0, start) + "\n" + field.value.slice(end));
    requestAnimationFrame(() => field.setSelectionRange(start + 1, start + 1));
  }
  function commit() {
    const edit = editingRef.current;
    if (!edit) return;
    editingRef.current = null;
    setEditing(null);
    if (edit.value !== (sheet.cells[`${edit.r},${edit.c}`]?.value || ""))
      return changeCells([
        { key: `${edit.r},${edit.c}`, cell: { value: edit.value } },
      ]);
  }
  async function openLink() {
    if (!editable) return;
    clearPainter();
    setMenu(null);
    const ok = await commit();
    if (ok !== false) {
      setLinkPreview(null);
      setModal("link");
    }
  }
  function move(dr, dc, extend = false) {
    setSelection((prev) => {
      const merged = mergeAt(sheet, prev.r, prev.c);
      const originRow = extend
        ? prev.r2
        : dr > 0 && merged
          ? merged.r2
          : prev.r;
      const rowIndex = layout.positions[originRow] ?? 0;
      let r = dr
          ? layout.rows[
              Math.max(0, Math.min(layout.rows.length - 1, rowIndex + dr))
            ]
          : Math.max(
              0,
              Math.min(sheet.rows - 1, (extend ? prev.r2 : prev.r) + dr),
            ),
        c = Math.max(
          0,
          Math.min(
            sheet.cols - 1,
            (extend ? prev.c2 : dc > 0 && merged ? merged.c2 : prev.c) + dc,
          ),
        );
      if (!extend) {
        const target = mergeAt(sheet, r, c);
        if (target) {
          r = target.r;
          c = target.c;
        }
      }
      requestAnimationFrame(() => {
        const el = grid.current;
        if (!el) return;
        const y = ((layout.offsets[layout.positions[r]] || 0) * zoom) / 100;
        if (y < el.scrollTop) el.scrollTop = y;
        if (y > el.scrollTop + el.clientHeight - 70)
          el.scrollTop = y - el.clientHeight + 90;
        let x = 46;
        for (let i = 0; i < c; i++) x += sheet.widths[i] || 100;
        if (x < el.scrollLeft) el.scrollLeft = x - 46;
        if (x + 100 > el.scrollLeft + el.clientWidth)
          el.scrollLeft = x + 120 - el.clientWidth;
      });
      return extend ? { ...prev, r2: r, c2: c } : { r, c, r2: r, c2: c };
    });
  }
  function keyboard(e) {
    if ((e.ctrlKey || e.metaKey) && e.code === "Backquote" && !e.target.closest("input,textarea")) {
      e.preventDefault(); changeViewPreferences({ formulas: !viewPreferences.formulas }); return;
    }
    if (
      e.target.closest(".cell-editor") ||
      e.target.tagName === "INPUT" ||
      e.target.tagName === "TEXTAREA"
    )
      return;
    if (e.altKey && e.shiftKey && e.code === "Digit5") {
      e.preventDefault(); style({ strike: !currentStyle.strike }); return;
    }
    if (e.ctrlKey || e.metaKey) {
      if (e.shiftKey && ["Comma", "Period"].includes(e.code)) {
        e.preventDefault();
        style({ fontSize: stepFontSize(currentStyle.fontSize, e.code === "Period" ? 1 : -1) });
      } else if (e.shiftKey && ["l", "e", "r"].includes(e.key.toLowerCase())) {
        e.preventDefault(); style({ align: { l: "left", e: "center", r: "right" }[e.key.toLowerCase()] });
      } else if (e.code === "Backslash") {
        e.preventDefault(); menuAction("clear-style").catch((error) => setError(error.message));
      } else if (e.key.toLowerCase() === "u") {
        e.preventDefault(); style({ underline: !(currentStyle.underline ?? !!sheet.cells[`${selection.r},${selection.c}`]?.link) });
      } else if (e.key.toLowerCase() === "z") {
        e.preventDefault();
        undoRedo(e.shiftKey);
      } else if (e.key.toLowerCase() === "y") {
        e.preventDefault();
        undoRedo(true);
      } else if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        openLink();
      } else if (e.key.toLowerCase() === "b") {
        e.preventDefault();
        style({ bold: !currentStyle.bold });
      } else if (e.key.toLowerCase() === "i") {
        e.preventDefault();
        style({ italic: !currentStyle.italic });
      } else if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        setModal("find");
      } else if (e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelection({ r: 0, c: 0, r2: sheet.rows - 1, c2: sheet.cols - 1 });
      }
      return;
    }
    if (
      [
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Enter",
        "Tab",
      ].includes(e.key)
    ) {
      e.preventDefault();
      const [dr, dc] =
        e.key === "ArrowUp"
          ? [-1, 0]
          : e.key === "ArrowDown" || e.key === "Enter"
            ? [1, 0]
            : e.key === "ArrowLeft"
              ? [0, -1]
              : e.key === "Tab" && e.shiftKey
                ? [0, -1]
                : [0, 1];
      move(dr, dc, e.shiftKey && e.key !== "Tab");
    } else if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      changeCells(selectedKeys().map((key) => ({ key, cell: { value: "" } })));
    } else if (e.key === "F2") {
      e.preventDefault();
      startEdit();
    } else if (e.key.length === 1 && !e.altKey) {
      e.preventDefault();
      startEdit(e.key);
    }
  }
  function valueAt(r, c) {
    const source = projection?.sourceAt(r, c) || { r, c };
    return sourceValueAt(source.r, source.c);
  }
  function display(r, c) {
    const value = valueAt(r, c);
    if (
      validationAt(sheet, r, c)?.type === "date" &&
      (!sheet.cells[`${r},${c}`]?.style?.format || sheet.cells[`${r},${c}`]?.style?.format === "auto") &&
      typeof value === "number" &&
      value >= 0 &&
      value < 2958466
    ) {
      const date = calculation?.numberToDate(value);
      if (date)
        return `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
    }
    return formatValue(value, sheet.cells[`${r},${c}`]?.style);
  }
  const conditionalStyle = useMemo(
    () => {
      const evaluate = conditionalEvaluator(sourceSheet, sourceValueAt);
      const bandSheet = bandPreview && bandPreview.sheetId === sourceSheet?.id ? { ...sourceSheet, bandedRanges: [...(sourceSheet.bandedRanges || []).filter((rule) => rule.id !== bandPreview.rule.id), bandPreview.rule] } : sourceSheet;
      return (r, c) => {
        const source = projection?.sourceAt(r, c) || { r, c };
        const color = numberFormatColor(sourceValueAt(source.r, source.c), sourceSheet?.cells[`${source.r},${source.c}`]?.style);
        return { ...bandingStyle(bandSheet, r, c), ...(color ? { color } : {}), ...evaluate(source.r, source.c) };
      };
    },
    [sourceSheet, projection, calculation, bandPreview],
  );
  const layout = useMemo(
    () => buildLayout(sheet, printing ? display : gridDisplay, printing, conditionalStyle),
    [sheet, calculation, printing, conditionalStyle, fontRevision, viewPreferences.formulas],
  );
  function gridDisplay(r, c) {
    const cell = sheet.cells[`${r},${c}`];
    return viewPreferences.formulas && !cell?.literal && cell?.value?.startsWith("=") ? cell.value : display(r, c);
  }
  useEffect(() => {
    setSidebar(null);
    setSelectedChart(null);
    setDropdown(null);
  }, [sheetId]);
  useEffect(()=>{tabsContainer.current?.querySelector('.sheet-tab.active')?.scrollIntoView({block:"nearest",inline:"nearest"});},[sheetId,doc?.state.sheets.map(s=>s.id).join(",")]);
  useEffect(() => {
    if (
      selectedChart &&
      sheet &&
      !sheet.charts?.some((c) => c.id === selectedChart)
    ) {
      setSelectedChart(null);
      if (sidebar === "chart") setSidebar(null);
    }
  }, [sheet, selectedChart, sidebar]);
  useEffect(() => {
    if (!sheet || !layout) return;
    let r = Math.min(selection.r, sheet.rows - 1),
      c = Math.min(selection.c, sheet.cols - 1);
    if (layout.positions[r] < 0)
      r = sheet.filter?.range.r ?? layout.rows[0] ?? 0;
    const merged = mergeAt(sheet, r, c);
    if (merged) {
      r = merged.r;
      c = merged.c;
    }
    if (r !== selection.r || c !== selection.c)
      setSelection({ r, c, r2: r, c2: c });
  }, [sheet, layout, selection.r, selection.c]);
  function copy(e, cut = false) {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    const b = bounds(),
      rows = [];
    let payload;
    try {
      payload = captureClipboard(sheet, b, cut);
    } catch (error) {
      setError(error.message);
      e.preventDefault();
      return;
    }
    for (let r = b.r; r <= b.r2; r++) {
      if (personalView && layout.positions[r] < 0) continue;
      const cells = [];
      for (let c = b.c; c <= b.c2; c++) cells.push(display(r, c));
      rows.push(cells.join("\t"));
    }
    e.clipboardData.setData("text/plain", rows.join("\n"));
    // Projected formulas refer to the shared coordinates. Copy their displayed
    // values rather than publishing an incorrect relative-formula payload.
    if (!personalView)
      e.clipboardData.setData(CLIPBOARD_TYPE, JSON.stringify(payload));
    e.preventDefault();
    if (cut)
      changeCells(selectedKeys().map((key) => ({ key, cell: { value: "" } })));
  }
  function paste(e) {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    e.preventDefault();
    if (!editable) return;
    const internal = e.clipboardData.getData(CLIPBOARD_TYPE);
    if (internal) {
      try {
        const { changes, merges } = relocateClipboard(
          JSON.parse(internal),
          sheet,
          { r: selection.r, c: selection.c },
          doc.state.sheets,
          doc.state.namedRanges || [],
        );
        if (merges.length)
          operation({
            type: "import-range",
            sheetId: sheet.id,
            changes,
            merges,
          });
        else changeCells(changes);
      } catch (error) {
        setError(error.message);
      }
    } else pasteRows(parseCSV(e.clipboardData.getData("text/plain")));
  }
  function pasteRows(rows) {
    const changes = [];
    rows.forEach((row, ri) =>
      row.forEach((value, ci) => {
        if (selection.r + ri < 10000 && selection.c + ci < 200)
          changes.push({
            key: `${selection.r + ri},${selection.c + ci}`,
            cell: { value: String(value) },
          });
      }),
    );
    if (changes.length > 20000) {
      setError("За один раз можно вставить не более 20 000 ячеек");
      return;
    }
    changeCells(changes);
  }
  function fillRange(source, range) {
    const sid = calculation.getSheetId(sheet.name),
      start = { sheet: sid, row: range.r, col: range.c },
      end = { sheet: sid, row: range.r2, col: range.c2 };
    const r = Math.min(range.r, range.r2),
      c = Math.min(range.c, range.c2),
      r2 = Math.max(range.r, range.r2),
      c2 = Math.max(range.c, range.c2);
    try {
      const data = calculation.getFillRangeData(
          { start, end: start },
          {
            start: { sheet: sid, row: r, col: c },
            end: { sheet: sid, row: r2, col: c2 },
          },
        ),
        changes = [];
      data.forEach((row, ri) =>
        row.forEach((value, ci) => {
          if (r + ri !== range.r || c + ci !== range.c)
            changes.push({
              key: `${r + ri},${c + ci}`,
              cell: { ...source, literal: !!source.literal, value: source.literal ? source.value : value === null ? "" : String(fromEngineFormula(value, doc.state.namedRanges || [],doc.state.sheets)) },
              replace: true,
            });
        }),
      );
      if (changes.length) changeCells(changes);
    } catch (e) {
      setError(e.message);
    }
  }
  function structure(axis, action) {
    const b = bounds();
    operation({
      type: "structure",
      sheetId: sheet.id,
      axis,
      action,
      index: axis === "row" ? b.r : b.c,
      count: Math.min(100, axis === "row" ? b.r2 - b.r + 1 : b.c2 - b.c + 1),
    });
  }
  function exportCSV() {
    const used = Object.keys(sheet.cells).filter((k) => sheet.cells[k].value),
      maxR = Math.max(0, ...used.map((k) => +k.split(",")[0])),
      maxC = Math.max(0, ...used.map((k) => +k.split(",")[1]));
    const rows = [];
    for (let r = 0; r <= maxR; r++) {
      const cells = [];
      for (let c = 0; c <= maxC; c++) {
        let value = String(valueAt(r, c));
        if (/^[=+@-]/.test(value)) value = "'" + value;
        cells.push('"' + value.replaceAll('"', '""') + '"');
      }
      rows.push(cells.join(","));
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob(["\uFEFF" + rows.join("\r\n")], {
        type: "text/csv;charset=utf-8",
      }),
    );
    a.download = `${doc.title} — ${sheet.name}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function applySort(snapshot, range, rules, header, revision = doc.revision) {
    if (snapshot.id !== sheet.id) throw new Error("Лист изменился. Откройте настройки сортировки заново.");
    const changes = sortChanges(snapshot, range, rules, header, valueAt, doc.state.sheets, doc.state.namedRanges || []);
    return changeCells(changes, true, revision);
  }
  function sort(desc = false, wholeSheet = false, fromFilter = false) {
    const range = fromFilter && sheet.filter ? sheet.filter.range : sortingRange(sheet, bounds(), wholeSheet || fromFilter), col = bounds().c;
    try { return applySort(sheet, range, [{ col, desc }], fromFilter && !!sheet.filter); }
    catch (error) { setError(error.message); return false; }
  }
  function findNext() {
    if (!find) return;
    const matches = Object.keys(sheet.cells)
      .map((k) => k.split(",").map(Number))
      .filter(([r, c]) =>
        display(r, c).toLowerCase().includes(find.toLowerCase()),
      )
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const next =
      matches.find(
        ([r, c]) => r > selection.r || (r === selection.r && c > selection.c),
      ) || matches[0];
    if (next) {
      setSelection({ r: next[0], c: next[1], r2: next[0], c2: next[1] });
      grid.current.scrollTop = Math.max(0, next[0] * 24 - 100);
    } else inform("Совпадений не найдено");
  }
  async function menuAction(action) {
    setMenu(null);
    if (action === "insert-row") structure("row", "insert");
    else if (action === "insert-col") structure("col", "insert");
    else if (action === "delete-row") structure("row", "delete");
    else if (action === "delete-col") structure("col", "delete");
    else if (action === "new") {
      const d = await api("/documents", { method: "POST", body: {} });
      location.href = `?doc=${d.id}`;
    } else if (action === "import") fileInput.current.click();
    else if (action === "export") exportCSV();
    else if (action === "export-xlsx") {
      const { exportWorkbook } = await import("./files.js");
      const data = await exportWorkbook(doc, (s, r, c) => {
        const v = calculation.getCellValue({
          sheet: calculation.getSheetId(s.name),
          row: r,
          col: c,
        });
        return v && typeof v === "object" ? v.value : v;
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([data]));
      a.download = doc.title + ".xlsx";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } else if (action === "print") window.print();
    else if (action === "undo") undoRedo();
    else if (action === "redo") undoRedo(true);
    else if (action === "find") setModal("find");
    else if (action === "clear")
      changeCells(selectedKeys().map((key) => ({ key, cell: { value: "" } })));
    else if (action === "clear-style")
      changeCells(
        selectedKeys().map((key) => ({
          key,
          cell: { style: {} },
          replaceStyle: true,
        })),
      );
    else if (action === "sort-up") sort(false, false, true);
    else if (action === "sort-down") sort(true, false, true);
    else if (action === "add-sheet") operation({ type: "sheet-add" });
    else if (action === "comment") setModal("comments");
    else if (action === "freeze")
      operation({
        type: "freeze",
        sheetId: sheet.id,
        rows: sheet.frozen ? 0 : 1,
      });
    else if (action === "history") setModal("history");
    else if (action === "share") setModal("share");
    else if (action === "help") setModal("help");
    else if (action === "bold") style({ bold: !currentStyle.bold });
    else if (action === "italic") style({ italic: !currentStyle.italic });
    else if (action === "underline") style({ underline: !(currentStyle.underline ?? !!sheet.cells[`${selection.r},${selection.c}`]?.link) });
    else if (action === "strike") style({ strike: !currentStyle.strike });
    else if (action === "filter") toggleFilter();
    else if (action === "temporary-view")
      personalView ? closeTemporaryView() : await startTemporaryView();
    else if (action === "sort-dialog") setSortRequest({ sheet: structuredClone(sheet), range: bounds(), column: bounds().c, revision: doc.revision });
    else if (action === "trim") {
      const changes = trimChanges(sheet, bounds());
      if (changes.length && await changeCells(changes, true, doc.revision)) inform(`Пробелы удалены: ${changes.length} яч.`);
      else if (!changes.length) inform("Лишних пробелов не найдено");
    }
    else if (action === "merge") toggleMerge();
    else if (action === "conditional") setSidebar("conditional");
    else if (action === "banding") setSidebar("banding");
    else if (action === "validation") setSidebar("validation");
    else if (action === "named-ranges") setSidebar("named-ranges");
    else if (action === "protections") {setProtectionRequest(previous=>({key:previous.key+1,type:"range"}));setSidebar("protections");}
    else if (action === "chart") await createChart();
    else if (action === "checkbox")
      await operation({
        type: "validation-set",
        sheetId: sheet.id,
        rule: { range: bounds(), type: "checkbox", reject: true },
      });
  }
  async function createChart() {
    const b = bounds(),
      range = b.r === b.r2 && b.c === b.c2 ? usedRange(sheet) : b;
    const chart = {
      id:
        globalThis.crypto?.randomUUID?.() ||
        `chart-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      range,
      type: "column",
      title: "",
      header: range.r2 > range.r,
      labels: range.c2 > range.c,
      legend: true,
      includeHidden: false,
      x: Math.round(((grid.current?.scrollLeft || 0) * 100) / zoom + 80),
      y: Math.round(((grid.current?.scrollTop || 0) * 100) / zoom + 70),
      width: 600,
      height: 360,
    };
    if (await operation({ type: "chart-set", sheetId: sheet.id, chart })) {
      setSelectedChart(chart.id);
      setSidebar("chart");
    }
  }
  function openDropdown(e, r, c) {
    e.preventDefault();
    e.stopPropagation();
    commit();
    setSelection({ r, c, r2: r, c2: c });
    drag.current = false;
    setMenu("dropdown");
    setDropdown({ r, c, anchor: e.currentTarget.getBoundingClientRect() });
  }
  function toggleFilter() {
    if (sheet.filter) {
      operation({ type: "filter", sheetId: sheet.id, filter: null });
      return;
    }
    const b = bounds(),
      used = usedRange(sheet),
      range = b.r === b.r2 && b.c === b.c2 ? used : b;
    operation({
      type: "filter",
      sheetId: sheet.id,
      filter: { range, criteria: {} },
    });
  }
  async function startTemporaryView() {
    const saved = await commit();
    if (saved === false) return;
    try {
      const b = bounds(),
        range = sourceSheet.filter?.range ||
          (b.r === b.r2 && b.c === b.c2 ? usedRange(sourceSheet) : b);
      setTemporaryView(createTemporaryView(sourceSheet, range));
      setSidebar(null);
      setModal(null);
      setDropdown(null);
      setLinkPreview(null);
      setMenu(null);
      setScrollTop(0);
      if (grid.current) grid.current.scrollTop = 0;
      inform("Временный просмотр виден только вам. Закройте его, чтобы редактировать данные.");
    } catch (error) { setError(error.message); }
  }
  function closeTemporaryView() {
    const source = projection?.sourceAt(selection.r, selection.c) || selection;
    setTemporaryView(null);
    setMenu(null);
    setSelection({ r: source.r, c: source.c, r2: source.r, c2: source.c });
  }
  function toggleMerge() {
    return requestMerge("all", (sheet.merges || []).some((m) => intersects(m, bounds())));
  }
  function requestMerge(mode = "all", unmerge = false) {
    setError("");
    const range = bounds(),
      request = { type: "merge", sheetId: sheet.id, range, action: unmerge ? "unmerge" : "merge", mode };
    setMenu(null);
    if (
      !unmerge &&
      Object.entries(sheet.cells).some(([key, cell]) => {
        const [r, c] = key.split(",").map(Number);
        return (
          mergeDropsValue(range, mode, r, c) &&
          cell.value
        );
      })
    ) {
      setMergeRequest({ ...request, expectedRevision: doc.revision });
      setModal("merge-confirm");
      return;
    }
    return operation(request);
  }
  function openColumnFilter(e, c) {
    e.preventDefault();
    e.stopPropagation();
    setFilterAnchor(e.currentTarget.getBoundingClientRect());
    setMenu(`column-filter:${c}`);
  }
  function sortFiltered(col, desc) {
    if (personalView) {
      setTemporaryView((view) => ({ ...view, sort: { col, desc } }));
      setMenu(null);
      return;
    }
    try { applySort(sheet, sheet.filter.range, [{ col, desc }], true); }
    catch (error) { setError(error.message); }
    setMenu(null);
  }
  const menuItems = {
    Файл: [
      ["Создать таблицу", "new", Plus],
      ["Импортировать XLSX / CSV", "import", Upload, !editable],
      ["Скачать Excel (.xlsx)", "export-xlsx", Download],
      ["Скачать CSV", "export", Download],
      ["Настройки доступа", "share", Share2],
      ["История изменений", "history", History],
      ["Печать", "print", Printer],
    ],
    Правка: [
      ["Отменить", "undo", Undo2, !editable || !undoCount],
      ["Повторить", "redo", Redo2, !editable || !redoCount],
      ["Найти", "find", Search],
      ["Удалить значения", "clear", Trash2, !editable],
      ["Удалить строки", "delete-row", Trash2, !editable],
      ["Удалить столбцы", "delete-col", Trash2, !editable],
    ],
    Вид: [],
    Вставка: [
      ["Строки выше", "insert-row", Plus, !editable],
      ["Столбцы слева", "insert-col", Plus, !editable],
      ["Лист", "add-sheet", Plus, !editable],
      ["Комментарий", "comment", MessageSquarePlus, !commentable],
      ["Диаграмма", "chart", ChartColumn, !editable],
      ["Раскрывающийся список", "validation", ListChecks, !editable],
      ["Флажок", "checkbox", SquareCheck, !editable],
    ],
    Формат: [],
    Данные: [],
    Инструменты: [
      ["Найти", "find", Search],
      ["Управление доступом", "share", Settings],
    ],
    Расширения: [["Об открытых компонентах", "help", ExternalLink]],
    Справка: [["Сочетания клавиш и возможности", "help", FunctionSquare]],
  };
  if (!doc)
    return (
      <div className="loading">
        <SheetLogo />
        {error ? (
          <>
            <p className="error">{error}</p>
            <button className="primary" onClick={onHome}>
              К списку таблиц
            </button>
          </>
        ) : (
          <p>Открываем таблицу…</p>
        )}
      </div>
    );
  const currentStyle =
    sheet.cells[`${selection.r},${selection.c}`]?.style || {};
  const b = bounds();
  const selectedNamedRange=(doc.state.namedRanges||[]).find(item=>item.sheetId===sheet.id&&item.range&&["r","r2","c","c2"].every(key=>item.range[key]===b[key]));
  const chromeToggle = (
    <IconButton
      icon={ChevronDown}
      data-chrome-toggle=""
      label={`${collapsedChrome ? "Показать" : "Скрыть"} меню (Ctrl+Shift+F)`}
      aria-expanded={!collapsedChrome}
      aria-controls="document-header"
      onClick={toggleChrome}
    />
  );
  const temporaryViewControl = (
    <div className="menu-anchor">
      <IconButton
        icon={TableView}
        dropdown
        label="Режимы фильтрации"
        active={personalView}
        onClick={() => setMenu(menu === "temporary-view" ? null : "temporary-view")}
      />
      {menu === "temporary-view" && (
        <div className="popover menu-popover temporary-view-menu">
          <button onClick={personalView ? closeTemporaryView : startTemporaryView}>
            {personalView ? "Закрыть временный просмотр" : "Создать временный просмотр"}
          </button>
        </div>
      )}
    </div>
  );
  const numeric = Object.keys(sheet.cells)
    .filter((key) => {
      const [r, c] = key.split(",").map(Number);
      return r >= b.r && r <= b.r2 && c >= b.c && c <= b.c2;
    })
    .map((key) => {
      const [r, c] = key.split(",").map(Number);
      return valueAt(r, c);
    })
    .filter((v) => typeof v === "number");
  const visibleCols = layout.cols;
  const rowWindow = windowRows(
    sheet,
    layout,
    scrollTop,
    window.innerHeight || 900,
    zoom,
    printing,
  );
  const rowIndexes = rowWindow.indexes;
  const others = people.filter((p) => p.id !== user.id),
    uniquePeople = [...new Map(others.map((p) => [p.id, p])).values()];
  function chooseCell(e, r, c) {
    if (e.button !== 0) return;
    setLinkPreview(null);
    if (painter && editable) {
      e.preventDefault();
      paintingDrag.current = true;
    }
    if (
      editingRef.current?.value.startsWith("=") &&
      sheet.cells[`${editingRef.current.r},${editingRef.current.c}`]?.style?.format !== "text" &&
      /[=+\-*/(:,]$/.test(editingRef.current.value)
    ) {
      e.preventDefault();
      updateEdit(editingRef.current.value + address(r, c));
      return;
    }
    commit();
    grid.current.focus();
    drag.current = true;
    if (e.shiftKey) setSelection((prev) => ({ ...prev, r2: r, c2: c }));
    else setSelection({ r, c, r2: r, c2: c });
  }
  function sheetMenu(event, s) {
    event.preventDefault();
    commit();
    setSheetAnchor(event.currentTarget.closest(".sheet-tab").getBoundingClientRect());
    setSheetId(s.id);
    if (s.id !== sheet.id) setSelection({r:0,c:0,r2:0,c2:0});
    setMenu(menu === `sheet:${s.id}` ? null : `sheet:${s.id}`);
  }
  function moveTab(sheetId, targetId, position) {
    if (!targetId || sheetId === targetId) return;
    return operation({type:"sheet-move",sheetId,relativeTo:targetId,position});
  }
  async function duplicateTab(sourceId){
    if(await commit()===false)return;
    const newSheetId=crypto.randomUUID();
    if(await operation({type:"sheet-duplicate",sheetId:sourceId,newSheetId})){setTemporaryView(null);setSheetId(newSheetId);setSelection({r:0,c:0,r2:0,c2:0});if(grid.current){grid.current.scrollTop=0;grid.current.scrollLeft=0;grid.current.focus();}}
  }
  function selectNamedRange(item) {
    const target = doc.state.sheets.find(s => s.id === item.sheetId);
    if (!target || !item.range) { inform("Диапазон больше не существует"); return false; }
    if (target.hidden) { inform(`Лист «${target.name}» скрыт.`); return false; }
    setTemporaryView(null); setSheetId(target.id); setSelection({ ...item.range });
    const targetLayout = buildLayout(target, (r, c) => target.cells[`${r},${c}`]?.value || "", false);
    requestAnimationFrame(() => { if (grid.current) { grid.current.scrollTop = (targetLayout.offsets[targetLayout.positions[item.range.r]] || 0) * zoom / 100; grid.current.scrollLeft = Array.from({ length: item.range.c }, (_, c) => target.widths[c] || 100).reduce((a, b) => a + b, 0) * zoom / 100; grid.current.focus(); } });
    return true;
  }
  function toggleChrome() {
    setMenu(null);
    setCollapsedChrome((collapsed) => !collapsed);
  }
  return (
    <main
      className={`editor${collapsedChrome ? " chrome-collapsed" : ""}${painter ? " format-painting" : ""}${fullscreen ? " view-fullscreen" : ""}`}
      data-hide-formula-bar={!viewPreferences.formulaBar || undefined}
      data-banding-open={sidebar === "banding" || undefined}
      data-named-open={sidebar === "named-ranges" || sidebar === "protections" || undefined}
      onKeyDownCapture={(e) => {
        if (fullscreen && e.key === "Escape" && !menu && !modal) { e.preventDefault(); e.stopPropagation(); setFullscreen(false); return; }
        if ((e.ctrlKey || e.metaKey) && e.altKey && e.shiftKey && !e.target.closest("input,textarea") && !modal) {
          const key = e.code;
          if (["KeyJ","KeyW","KeyM","KeyA"].includes(key)) { e.preventDefault(); e.stopPropagation(); if (key === "KeyA") setModal("comments"); else changeViewPreferences({comments:key === "KeyJ" ? "none" : "all"}); return; }
        }
        if (
          e.key === "Escape" &&
          menu &&
          !e.target.closest(".rotation-popover,.borders-popover[data-border-submenu],.sheet-color-popover,.tab-color-palette,.font-popover,.font-size-control,.format-menu-tree,.sheet-context-menu,.all-sheets-menu")
        ) {
          e.preventDefault();
          e.stopPropagation();
          setMenu(null);
          if (e.target.closest(".borders-popover")) grid.current?.focus();
          return;
        }
        if (e.key === "Escape" && linkPreview) {
          e.preventDefault();
          e.stopPropagation();
          setLinkPreview(null);
          return;
        }
        if (
          (e.ctrlKey || e.metaKey) &&
          !e.altKey &&
          e.key.toLowerCase() === "k" &&
          !modal
        ) {
          e.preventDefault();
          e.stopPropagation();
          openLink();
          return;
        }
        if (painter && e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          clearPainter();
          return;
        }
        if (
          (e.ctrlKey || e.metaKey) &&
          e.shiftKey &&
          !e.altKey &&
          e.key.toLowerCase() === "f"
        ) {
          e.preventDefault();
          e.stopPropagation();
          if (!e.repeat) toggleChrome();
        }
      }}
      onMouseDown={(e) => {
        if (
          !e.target.closest(".menu-anchor") &&
          !e.target.closest(".popover")
        ) {
          setMenu(null);
          setLinkPreview(null);
        }
      }}
    >
      <header id="document-header" className="editor-header">
        <button
          className="logo-button"
          title="Главная страница Таблиц"
          onClick={onHome}
        >
          <SheetLogo size={36} />
        </button>
        <div className="header-main">
          <div className="document-title">
            <input
              aria-label="Название таблицы"
              value={title}
              readOnly={!editable}
              onFocus={() => {
                if (editable) titleEditing.current = true;
              }}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                titleEditing.current = false;
                if (title !== doc.title) operation({ type: "title", title });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.target.blur();
              }}
            />
            <Cloud size={19} color="#5f6368" />
            <span className="saved-label">
              {pending
                ? "Сохранение…"
                : connected
                  ? "Все изменения сохранены"
                  : "Нет соединения"}
            </span>
          </div>
          <nav className="menubar" aria-label="Главное меню">
            {Object.keys(menuItems).map((name) => (
              <div className="menu-anchor" key={name}>
                <button
                  className={menu === name ? "open" : ""}
                  disabled={
                    (name === "Вставка" && !commentable) ||
                    (name === "Формат" && !editable)
                  }
                  onClick={(event) => { if (name === "Вид") setViewAnchor(event.currentTarget.getBoundingClientRect()); if (name === "Формат") setFormatAnchor(event.currentTarget.getBoundingClientRect()); if (name === "Данные") setDataAnchor(event.currentTarget.getBoundingClientRect()); setMenu(menu === name ? null : name); }}
                >
                  {name}
                </button>
                {menu === name && name === "Вид" && viewAnchor ? <ViewMenu
                  anchor={viewAnchor} selection={b} editable={editable && !personalView} sheet={sheet} hiddenSheets={doc.state.sheets.filter(item=>item.hidden)} preferences={viewPreferences} zoom={zoom}
                  onUnhide={async target => {if(await operation({type:"sheet-visibility",sheetId:target.id,hidden:false})){setSheetId(target.id);setSelection({r:0,c:0,r2:0,c2:0});}}}
                  onPreference={changeViewPreferences} onFreeze={patch => operation({type:"freeze",sheetId:sheet.id,...patch})}
                  onGridlines={() => operation({type:"sheet-display",sheetId:sheet.id,hideGridlines:!sheet.hideGridlines})}
                  onZoom={setZoom} onComments={() => setModal("comments")} onFullscreen={() => setFullscreen(true)}
                  onClose={() => { setMenu(null); grid.current?.focus(); }}
                /> : menu === name && name === "Формат" && formatAnchor ? <FormatMenu
                  anchor={formatAnchor} style={{ ...currentStyle, underline: currentStyle.underline ?? !!sheet.cells[`${selection.r},${selection.c}`]?.link }} range={b}
                  hasMerges={(sheet.merges || []).some((range) => intersects(range, b))}
                  onAction={(action) => menuAction(action).catch((error) => setError(error.message))} onStyle={style}
                  onMerge={requestMerge} onNumber={setNumberFormat} onCustom={setModal}
                  onClose={() => { setMenu(null); grid.current?.focus(); }}
                /> : menu === name && name === "Данные" && dataAnchor ? <DataMenu
                  anchor={dataAnchor} column={b.c} editable={editable} filtering={!!sheet.filter} personalView={personalView} singleCell={b.r === b.r2 && b.c === b.c2}
                  onAction={action => menuAction(action).catch(error => setError(error.message))} onSort={(whole, desc) => sort(desc, whole)} onClose={() => { setMenu(null); grid.current?.focus(); }}
                /> : menu === name && (
                  <div className="popover menu-popover">
                    {menuItems[name].map(([label, action, Icon, disabled]) => (
                      <button
                        key={action}
                        disabled={disabled}
                        onClick={() =>
                          menuAction(action).catch((e) => setError(e.message))
                        }
                      >
                        <Icon size={18} />
                        <span>{label}</span>
                        {action === "undo" && <small>Ctrl+Z</small>}
                        {action === "find" && <small>Ctrl+F</small>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>
        </div>
        <div className="header-actions">
          <div className="collaborators">
            {uniquePeople.slice(0, 3).map((p) => (
              <span
                key={p.id}
                className="avatar"
                style={{ background: p.color }}
                title={p.name}
              >
                {p.name[0].toUpperCase()}
              </span>
            ))}
          </div>
          <IconButton
            icon={History}
            label="История изменений"
            onClick={() => setModal("history")}
          />
          <IconButton
            icon={MessageSquare}
            label="Комментарии"
            onClick={() => setModal("comments")}
          />
          <button className="share-button" onClick={() => setModal("share")}>
            <Lock size={17} />
            <span>Настройки доступа</span>
          </button>
          <button
            className="avatar user-avatar"
            title={`${user.name} (${user.email})`}
            onClick={() => setMenu(menu === "account" ? null : "account")}
          >
            {user.name[0].toUpperCase()}
          </button>
          {menu === "account" && (
            <div className="popover account-popover">
              <strong>{user.name}</strong>
              <p>{user.email}</p>
              <button
                onClick={async () => {
                  await api("/logout", { method: "POST" });
                  onLogout();
                }}
              >
                Выйти из аккаунта <LogOut size={16} />
              </button>
            </div>
          )}
        </div>
      </header>
      <div className="editor-workspace">
        <section className="sheet-workspace">
          {editable ? (
            <div
              className="toolbar editing-toolbar"
              aria-label="Панель инструментов"
            >
              <IconButton
                icon={Search}
                label="Найти (Ctrl+F)"
                onClick={() => setModal("find")}
              />
              <IconButton
                icon={Undo2}
                label="Отменить (Ctrl+Z)"
                disabled={!editable || !undoCount}
                onClick={() => undoRedo()}
              />
              <IconButton
                icon={Redo2}
                label="Повторить (Ctrl+Y)"
                disabled={!editable || !redoCount}
                onClick={() => undoRedo(true)}
              />
              <IconButton
                icon={Printer}
                label="Печать"
                onClick={() => window.print()}
              />
              <IconButton
                icon={PaintRoller}
                label="Копировать форматирование"
                disabled={!editable}
                active={!!painter}
                onClick={() => armPainter()}
                onDoubleClick={() => armPainter(true)}
              />
              <select
                className="zoom-select"
                value={zoom}
                onChange={(e) => setZoom(+e.target.value)}
                aria-label="Масштаб"
              >
                {[50, 75, 90, 100, 125, 150, 200].map((z) => (
                  <option key={z} value={z}>
                    {z}%
                  </option>
                ))}
              </select>
              <span className="separator" />
              <IconButton
                label="Валюта"
                disabled={!editable}
                onClick={() => setNumberFormat("currency")}
              >
                ₽
              </IconButton>
              <IconButton
                label="Проценты"
                disabled={!editable}
                onClick={() => setNumberFormat("percent")}
              >
                %
              </IconButton>
              <IconButton
                icon={DecimalDecrease}
                label="Уменьшить число знаков после запятой"
                disabled={!editable}
                onClick={() => changePrecision(-1)}
              />
              <IconButton
                icon={DecimalIncrease}
                label="Увеличить число знаков после запятой"
                disabled={!editable}
                onClick={() => changePrecision(1)}
              />
              <div className="menu-anchor">
                <button
                  type="button"
                  className="number-format-control"
                  aria-label="Числовой формат"
                  disabled={!editable}
                  aria-expanded={menu === "number-format"}
                  aria-haspopup="menu"
                  onClick={(e) => {
                    setNumberFormatAnchor(e.currentTarget.getBoundingClientRect());
                    setMenu(menu === "number-format" ? null : "number-format");
                  }}
                >
                  123
                </button>
                {menu === "number-format" && numberFormatAnchor && <NumberFormatMenu
                  style={currentStyle} anchor={numberFormatAnchor}
                  onApply={(format) => { const saved = setNumberFormat(format); grid.current?.focus(); return saved; }}
                  onClose={() => { setMenu(null); grid.current?.focus(); }}
                  onCustom={(kind) => { setMenu(null); setModal(kind); }}
                />}
              </div>
              <span className="separator" />
              <div className="menu-anchor">
                <button type="button" className="font-select" role="listbox" aria-label="Шрифт" aria-haspopup="menu" aria-expanded={menu === "font"} disabled={!editable}
                  onClick={(event) => { setFontAnchor(event.currentTarget.getBoundingClientRect()); setMenu(menu === "font" ? null : "font"); }}
                  onKeyDown={(event) => { if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); setFontAnchor(event.currentTarget.getBoundingClientRect()); setMenu("font"); } }}>
                  <span>{currentStyle.fontFamily || "Arial"}</span><ChevronDown size={10} style={{ transform: menu === "font" ? "rotate(180deg)" : undefined }} />
                </button>
                {menu === "font" && <FontMenu value={currentStyle.fontFamily || "Arial"} themed={!currentStyle.fontFamily} preferences={fontPreferences} anchor={fontAnchor}
                  onChoose={(font) => { style({ fontFamily: font }); setFontPreferences((previous) => rememberFont(previous, font)); setMenu(null); grid.current?.focus(); }}
                  onMore={() => { setMenu(null); setModal("more-fonts"); }} onClose={() => { setMenu(null); grid.current?.focus(); }} />}
              </div>
              <span className="separator" />
              <FontSizeControl value={currentStyle.fontSize || 10} disabled={!editable} open={menu === "font-size"}
                contextKey={`${sheet.id}:${sheet.rows}:${sheet.cols}:${JSON.stringify(sheet.merges || [])}`}
                onOpen={() => setMenu("font-size")} onClose={() => setMenu(null)} onFocusGrid={() => grid.current?.focus()}
                onApply={(size) => {
                  const latest = docRef.current?.state.sheets.find((entry) => entry.id === sheet.id);
                  return changeCells(selectedKeys().filter((key) => latest?.cells[key]?.style?.fontSize !== size).map((key) => ({ key, cell: { style: { fontSize: size } } })));
                }} />
              <span className="separator" />
              <IconButton
                icon={Bold}
                label="Полужирный (Ctrl+B)"
                disabled={!editable}
                active={currentStyle.bold}
                onClick={() => style({ bold: !currentStyle.bold })}
              />
              <IconButton
                icon={Italic}
                label="Курсив (Ctrl+I)"
                disabled={!editable}
                active={currentStyle.italic}
                onClick={() => style({ italic: !currentStyle.italic })}
              />
              <IconButton
                icon={Strikethrough}
                label="Зачёркнутый"
                disabled={!editable}
                active={currentStyle.strike}
                onClick={() => style({ strike: !currentStyle.strike })}
              />
              <button type="button" className="color-tool" title="Цвет текста" aria-label="Цвет текста" disabled={!editable} aria-haspopup="dialog" aria-expanded={menu === "text-color"} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { setColorAnchor(e.currentTarget.getBoundingClientRect()); setMenu(menu === "text-color" ? null : "text-color"); }}>
                <span
                  style={{ borderBottomColor: currentStyle.color || "#000" }}
                >
                  A
                </span>
              </button>
              <span className="separator" />
              <button type="button" className="color-tool" title="Цвет заливки" aria-label="Цвет заливки" disabled={!editable} aria-haspopup="dialog" aria-expanded={menu === "fill-color"} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { setColorAnchor(e.currentTarget.getBoundingClientRect()); setMenu(menu === "fill-color" ? null : "fill-color"); }}>
                <PaintBucket size={20} />
                <i style={{ background: currentStyle.background || "#fff" }} />
              </button>
              {["text-color", "fill-color"].includes(menu) && <ColorPalette
                key={menu} kind={menu === "text-color" ? "color" : "background"}
                value={currentStyle[menu === "text-color" ? "color" : "background"]}
                customColors={customColors} onCustomColors={setCustomColors} anchor={colorAnchor}
                onClose={() => { setMenu(null); grid.current?.focus(); }}
                onChoose={(color) => { style({ [menu === "text-color" ? "color" : "background"]: color }); setMenu(null); grid.current?.focus(); }}
                onConditional={() => { setMenu(null); setSidebar("conditional"); }}
                onBanding={() => { setMenu(null); setSidebar("banding"); }}
              />}
              <div className="menu-anchor">
                <IconButton
                icon={Grid2X2}
                data-border-control=""
                label="Границы ячеек"
                disabled={!editable}
                aria-haspopup="menu" aria-expanded={menu === "borders"}
                onClick={(e) => { setBorderAnchor(e.currentTarget.parentElement.getBoundingClientRect()); setMenu(menu === "borders" ? null : "borders"); }}
              />
                {menu === "borders" && borderAnchor && <BordersPopover options={borderOptions} onOptions={setBorderOptions} anchor={borderAnchor} onClose={() => { setMenu(null); grid.current?.focus(); }} onApply={(preset) => {
                  try { const saved = changeCells(borderChanges(sheet, bounds(), preset, borderOptions)); setMenu(null); grid.current?.focus(); return saved; }
                  catch (e) { setError(e.message); }
                }} />}
              </div>
              <div className="menu-anchor merge-split">
                <IconButton
                  icon={Merge}
                label={
                  (sheet.merges || []).some((m) => intersects(m, b))
                    ? "Отменить объединение"
                    : "Объединить ячейки"
                }
                disabled={!editable || (b.r === b.r2 && b.c === b.c2)}
                active={(sheet.merges || []).some((m) => intersects(m, b))}
                onClick={() => toggleMerge()}
                />
                <button type="button" className="merge-type-button" aria-label="Выбрать тип объединения" title="Выбрать тип объединения" aria-haspopup="menu" aria-expanded={menu === "merge-types"}
                  disabled={!editable || (b.r === b.r2 && b.c === b.c2)}
                  onClick={() => setMenu(menu === "merge-types" ? null : "merge-types")}><ChevronDown size={9} /></button>
                {menu === "merge-types" && <div className="popover merge-types-popover" role="menu" aria-label="Тип объединения">
                  {[
                    ["all", "Объединить все", b.r === b.r2 && b.c === b.c2],
                    ["vertical", "Объединить по вертикали", b.r === b.r2],
                    ["horizontal", "Объединить по горизонтали", b.c === b.c2],
                    ["unmerge", "Отменить объединение ячеек", !(sheet.merges || []).some((m) => intersects(m, b))],
                  ].map(([mode, label, disabled]) => <button role="menuitem" key={mode} disabled={disabled} onClick={() => requestMerge(mode === "unmerge" ? "all" : mode, mode === "unmerge")}>{label}</button>)}
                </div>}
              </div>
              <span className="separator" />
              <div className="menu-anchor">
                <IconButton
                  dropdown
                  icon={
                    currentStyle.align === "center"
                      ? AlignCenter
                      : currentStyle.align === "right"
                        ? AlignRight
                        : AlignLeft
                  }
                  label="Выравнивание по горизонтали"
                  disabled={!editable}
                  onClick={() => setMenu(menu === "align" ? null : "align")}
                />
                {menu === "align" && (
                  <div className="popover small-popover alignment-popover">
                    {[
                      ["left", AlignLeft],
                      ["center", AlignCenter],
                      ["right", AlignRight],
                    ].map(([align, Icon]) => (
                      <IconButton
                        key={align}
                        icon={Icon}
                        label={
                          {
                            left: "По левому краю",
                            center: "По центру",
                            right: "По правому краю",
                          }[align]
                        }
                        onClick={() => {
                          style({ align });
                          setMenu(null);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
              <div className="menu-anchor">
                <IconButton
                  dropdown
                  icon={
                    currentStyle.verticalAlign === "top"
                      ? AlignTop
                      : currentStyle.verticalAlign === "middle"
                        ? AlignMiddle
                        : AlignBottom
                  }
                  label="Выравнивание по вертикали"
                  disabled={!editable}
                  onClick={() =>
                    setMenu(menu === "vertical-align" ? null : "vertical-align")
                  }
                />
                {menu === "vertical-align" && (
                  <div className="popover small-popover alignment-popover">
                    {[
                      ["top", "По верхнему краю", AlignTop],
                      ["middle", "По центру", AlignMiddle],
                      ["bottom", "По нижнему краю", AlignBottom],
                    ].map(([value, label, Icon]) => (
                      <IconButton
                        key={value}
                        icon={Icon}
                        label={label}
                        active={
                          (currentStyle.verticalAlign || "bottom") === value
                        }
                        onClick={() => {
                          style({ verticalAlign: value });
                          setMenu(null);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
              <div className="menu-anchor">
                <IconButton
                dropdown
                icon={wrapMode(currentStyle) === "wrap" ? WrapText : wrapMode(currentStyle) === "clip" ? TextClip : TextOverflow}
                label="Перенос текста"
                disabled={!editable}
                onClick={() => setMenu(menu === "text-wrap" ? null : "text-wrap")}
                aria-haspopup="menu" aria-expanded={menu === "text-wrap"}
                />
                {menu === "text-wrap" && <div className="popover alignment-popover text-wrap-popover" role="menu" aria-label="Режим переноса текста">
                  {[["overflow", "Перекрывать соседние ячейки", TextOverflow], ["wrap", "Переносить по словам", WrapText], ["clip", "Обрезать текст", TextClip]].map(([mode, label, Icon]) => <IconButton key={mode} icon={Icon} label={label} role="menuitemradio" aria-checked={wrapMode(currentStyle) === mode} active={wrapMode(currentStyle) === mode}
                    onClick={() => { style({ wrap: mode === "wrap", wrapMode: mode }); setMenu(null); grid.current?.focus(); }} />)}
                </div>}
              </div>
              <div className="menu-anchor">
                <IconButton
                  dropdown
                  icon={rotationIcon(currentStyle.rotation)}
                  label="Поворот текста"
                  disabled={!editable}
                  onClick={() =>
                    setMenu(menu === "rotation" ? null : "rotation")
                  }
                />
                {menu === "rotation" && (
                  <RotationPopover
                    onClose={() => setMenu(null)}
                    rotation={currentStyle.rotation || 0}
                    onApply={(rotation) => {
                      style({ rotation });
                      setMenu(null);
                    }}
                  />
                )}
              </div>
              <span className="separator" />
              <IconButton
                icon={Link}
                label="Вставить ссылку (Ctrl+K)"
                disabled={!editable}
                onClick={openLink}
              />
              <IconButton
                icon={MessageSquarePlus}
                label="Добавить комментарий"
                disabled={!commentable}
                onClick={() => setModal("comments")}
              />
              <IconButton
                icon={Filter}
                label={sheet.filter ? "Удалить фильтр" : "Создать фильтр"}
                active={!!sheet.filter}
                disabled={!editable}
                onClick={toggleFilter}
              />
              {temporaryViewControl}
              <IconButton
                icon={ChartColumn}
                label="Вставить диаграмму"
                disabled={!editable}
                onClick={createChart}
              />
              <div className="menu-anchor">
                <IconButton
                  icon={FunctionSquare}
                  label="Вставить функцию"
                  disabled={!editable}
                  onClick={() =>
                    setMenu(menu === "functions" ? null : "functions")
                  }
                />
                {menu === "functions" && (
                  <div className="popover menu-popover">
                    {["SUM", "AVERAGE", "COUNT", "MAX", "MIN", "IF"].map(
                      (f) => (
                        <button
                          key={f}
                          onClick={() => {
                            setMenu(null);
                            startEdit(`=${f}(`);
                          }}
                        >
                          {f}
                        </button>
                      ),
                    )}
                  </div>
                )}
              </div>
              <span className="toolbar-spacer" />
              {chromeToggle}
            </div>
          ) : (
            <div
              className="toolbar readonly-toolbar"
              aria-label="Панель инструментов"
            >
              <IconButton
                icon={Search}
                label="Найти (Ctrl+F)"
                onClick={() => setModal("find")}
              />
              <IconButton
                icon={Printer}
                label="Печать"
                onClick={() => window.print()}
              />
              {temporaryViewControl}
              <span className="separator" />
              <select
                className="zoom-select"
                value={zoom}
                onChange={(e) => setZoom(+e.target.value)}
                aria-label="Масштаб"
              >
                {[50, 75, 90, 100, 125, 150, 200].map((z) => (
                  <option key={z} value={z}>
                    {z}%
                  </option>
                ))}
              </select>
              <span className="readonly-mode" title={personalView ? "Фильтры и сортировка видны только вам. Для редактирования закройте временный просмотр." : undefined}>
                <Eye size={18} />
                {personalView ? "Временный просмотр" : doc.role === "commenter"
                  ? "Комментирование"
                  : "Только просмотр"}
              </span>
              {personalView && <IconButton icon={X} label="Закрыть временный просмотр" onClick={closeTemporaryView} />}
              <span className="toolbar-spacer" />
              {commentable && (
                <IconButton
                  icon={MessageSquarePlus}
                  label="Добавить комментарий"
                  onClick={() => setModal("comments")}
                />
              )}
              {chromeToggle}
            </div>
          )}
          <div className="formula-bar">
            <input
              key={`${sheet.id}:${selection.r},${selection.c},${selection.r2},${selection.c2}:${JSON.stringify(doc.state.namedRanges || [])}`}
              className="name-box"
              aria-label="Диапазон"
              defaultValue={selectedNamedRange?namedRangeDisplay(selectedNamedRange,doc.state.sheets):`${address(selection.r, selection.c)}${selection.r !== selection.r2 || selection.c !== selection.c2 ? ":" + address(selection.r2, selection.c2) : ""}`}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const named = findNamedRange(e.target.value,doc.state.namedRanges||[],doc.state.sheets,sheet.id);
                  if (named) { e.preventDefault(); if (!selectNamedRange(named)) e.target.value = e.target.defaultValue; return; }
                  const [start, end] = e.target.value
                    .split(":")
                    .map(parseAddress);
                  if (
                    start &&
                    start.row < sheet.rows &&
                    start.col < sheet.cols &&
                    (!end || (end.row < sheet.rows && end.col < sheet.cols))
                  ) {
                    setSelection({
                      r: start.row,
                      c: start.col,
                      r2: end?.row ?? start.row,
                      c2: end?.col ?? start.col,
                    });
                    grid.current.scrollTop =
                      ((layout.offsets[layout.positions[start.row]] || 0) *
                        zoom) /
                      100;
                    grid.current.focus();
                  } else inform("Укажите существующую ячейку, например A1");
                }
              }}
            />
            <button type="button" className="named-ranges-toggle" aria-label="Открыть именованные диапазоны" onClick={() => setSidebar("named-ranges")}><ChevronDown size={12} /></button>
            <span className="separator" />
            <span className="fx">fx</span>
            <textarea
              rows={1}
              wrap="off"
              aria-label="Строка формул"
              className="formula-input"
              value={formula}
              readOnly={!editable}
              onFocus={() => {
                if (editable && !editingRef.current) startEdit();
              }}
              onChange={(e) => updateEdit(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.altKey) { insertEditNewline(e); return; }
                if (e.key === "Enter") {
                  e.preventDefault();
                  commit();
                  grid.current.focus();
                  move(1, 0);
                }
                if (e.key === "Escape") {
                  editingRef.current = null;
                  setEditing(null);
                  grid.current.focus();
                }
              }}
            />
          </div>
          {!connected && (
            <div className="connection-warning">
              <WifiOff size={15} />
              Нет соединения с сервером. Редактирование временно недоступно.
            </div>
          )}
          <div
            className="grid-container"
            ref={grid}
            role="grid"
            aria-label={sheet.name}
            aria-rowcount={sheet.rows}
            aria-colcount={sheet.cols}
            tabIndex={0}
            onScroll={(e) => setScrollTop(e.target.scrollTop)}
            onKeyDown={keyboard}
            onCopy={copy}
            onCut={(e) => copy(e, true)}
            onPaste={paste}
          >
            <table className="sheet-grid" data-hide-gridlines={sheet.hideGridlines || undefined} style={{ zoom: zoom / 100, width: 46 + Array.from({ length: visibleCols }, (_, c) => sheet.widths[c] || 100).reduce((a, b) => a + b, 0) }}>
              <colgroup>
                <col style={{ width: 46 }} />
                {Array.from({ length: visibleCols }, (_, c) => (
                  <col key={c} style={{ width: sheet.widths[c] || 100 }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th
                    className="corner"
                    onMouseDown={() =>
                      setSelection({
                        r: 0,
                        c: 0,
                        r2: sheet.rows - 1,
                        c2: sheet.cols - 1,
                      })
                    }
                  />
                  {Array.from({ length: visibleCols }, (_, c) => (
                    <th
                      scope="col"
                      key={c}
                      data-frozen-col-last={!printing && c === sheet.frozenCols - 1 || undefined}
                      style={!printing && c < sheet.frozenCols ? {position:"sticky",left:frozenColumnLeft(sheet,c),zIndex:4} : undefined}
                      className={c >= b.c && c <= b.c2 ? "selected-header" : ""}
                      onMouseDown={(e) => {
                        if (!e.target.closest(".resize-handle")) {
                          commit();
                          setSelection({ r: 0, c, r2: sheet.rows - 1, c2: c });
                          grid.current.focus();
                        }
                      }}
                    >
                      {colName(c)}
                      <span
                        className="resize-handle"
                        onMouseDown={(e) => {
                          if (!editable) return;
                          e.preventDefault();
                          e.stopPropagation();
                          const x = e.clientX,
                            initial = sheet.widths[c] || 100;
                          const up = (ev) => {
                            window.removeEventListener("mouseup", up);
                            operation({
                              type: "resize",
                              sheetId: sheet.id,
                              col: c,
                              width: initial + ((ev.clientX - x) * 100) / zoom,
                            });
                          };
                          window.addEventListener("mouseup", up, {
                            once: true,
                          });
                        }}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowIndexes.map((r, index) => (
                  <React.Fragment key={r}>
                    {index === layout.frozenCount && rowWindow.top > 0 && (
                      <tr
                        className="spacer-row"
                        aria-hidden="true"
                        style={{ height: rowWindow.top }}
                      >
                        <td colSpan={sheet.cols + 1} />
                      </tr>
                    )}
                    <tr
                      data-frozen-row-last={!printing && index === layout.frozenCount - 1 || undefined}
                      style={{
                        height: layout.heights[r],
                        ...(r < (sheet.frozen || 0) && !printing
                          ? {
                              position: "sticky",
                              top: 24 + layout.offsets[layout.positions[r]],
                              zIndex: 3,
                            }
                          : {}),
                      }}
                    >
                      <th
                        scope="row"
                        className={
                          r >= b.r && r <= b.r2 ? "selected-header" : ""
                        }
                        onMouseDown={() => {
                          commit();
                          setSelection({ r, c: 0, r2: r, c2: sheet.cols - 1 });
                          grid.current.focus();
                        }}
                      >
                        {r + 1}
                      </th>
                      {Array.from({ length: visibleCols }, (_, c) => {
                        const merged = mergeAt(sheet, r, c);
                        if (merged && (merged.r !== r || merged.c !== c))
                          return null;
                        const key = `${r},${c}`,
                          cell = sheet.cells[key] || {},
                          s = { ...cell.style, ...conditionalStyle(r, c) },
                          active = selection.r === r && selection.c === c,
                          selected =
                            r >= b.r && r <= b.r2 && c >= b.c && c <= b.c2,
                          edit = editing?.r === r && editing?.c === c;
                        const validation = validationAt(sheet, r, c),
                          validationValue =
                            validation?.type === "date" &&
                            !cell.value?.startsWith("=")
                              ? cell.value
                              : valueAt(r, c),
                          invalid =
                            validation &&
                            !validationMatches(validation, validationValue);
                        const peer = others.find(
                            (p) =>
                              p.cursor?.sheetId === sheet.id &&
                              p.cursor.row === (projection?.sourceAt(r, c).r ?? r) &&
                              p.cursor.col === c,
                          ),
                          hasComment = viewPreferences.comments !== "none" && doc.state.comments.some(
                            (co) =>
                              co.sheetId === sheet.id &&
                              co.key === `${projection?.sourceAt(r, c).r ?? r},${c}` &&
                              !co.resolved,
                          );
                        return (
                          <td
                            role="gridcell"
                            rowSpan={merged ? merged.r2 - merged.r + 1 : 1}
                            colSpan={merged ? merged.c2 - merged.c + 1 : 1}
                            aria-rowspan={
                              merged ? merged.r2 - merged.r + 1 : undefined
                            }
                            aria-colspan={
                              merged ? merged.c2 - merged.c + 1 : undefined
                            }
                            aria-label={address(r, c)}
                            aria-selected={selected}
                            key={c}
                            data-cell={key}
                            data-protected-view={!printing && viewPreferences.protections && protectionAt(doc.state, sheet.id, projection?.sourceAt(r,c).r ?? r, c).length > 0 || undefined}
                            data-frozen-col-last={!printing && c + (merged ? merged.c2 - merged.c : 0) === sheet.frozenCols - 1 || undefined}
                            data-invalid={invalid ? "true" : undefined}
                            aria-invalid={invalid || undefined}
                            className={`${selected ? "selected-cell" : ""} ${active ? "active-cell" : ""} ${peer ? "peer-cell" : ""} ${hasComment ? "has-comment" : ""} ${find && display(r, c).toLowerCase().includes(find.toLowerCase()) ? "search-match" : ""} ${sheet.filter && r === sheet.filter.range.r && c >= sheet.filter.range.c && c <= sheet.filter.range.c2 ? "filter-header-cell" : ""}`}
                            style={{
                              ...(!printing && c < sheet.frozenCols ? {position:"sticky",left:frozenColumnLeft(sheet,c),zIndex:2} : {}),
                              backgroundColor: s.background || "#fff",
                              color: s.color || "#202124",
                              fontWeight: s.bold ? 700 : 400,
                              fontStyle: s.italic ? "italic" : "normal",
                              fontFamily: s.fontFamily || "Arial",
                              fontSize: `${s.fontSize || 10}pt`,
                              textAlign:
                                s.align ||
                                (!(viewPreferences.formulas && !cell.literal && cell.value?.startsWith("=")) && typeof valueAt(r, c) === "number"
                                  ? "right"
                                  : "left"),
                              verticalAlign: s.verticalAlign || "bottom",
                              "--peer-color": peer?.color,
                            }}
                            onMouseDown={(e) => chooseCell(e, r, c)}
                            onMouseEnter={() => {
                              if (drag.current)
                                setSelection((prev) => ({
                                  ...prev,
                                  r2: r,
                                  c2: c,
                                }));
                            }}
                            onDoubleClick={() => {
                              if (!painter) startEdit();
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setSelection({ r, c, r2: r, c2: c });
                              setMenu("context");
                            }}
                            title={
                              cell.value?.startsWith("=")
                                ? cell.value
                                : undefined
                            }
                          >
                            {edit ? (
                              <textarea
                                rows={1}
                                wrap={wrapMode(s) === "wrap" ? "soft" : "off"}
                                ref={(el) => {
                                  if (
                                    el &&
                                    document.activeElement !== el &&
                                    !document.activeElement?.classList?.contains(
                                      "formula-input",
                                    )
                                  ) {
                                    el.focus();
                                    el.setSelectionRange(
                                      el.value.length,
                                      el.value.length,
                                    );
                                  }
                                }}
                                className="cell-editor"
                                aria-label={`Редактирование ${address(r, c)}`}
                                value={editing.value}
                                style={{
                                  whiteSpace: wrapMode(s) === "wrap" ? "pre-wrap" : "pre",
                                  height: Math.min(400, Math.max(23, (wrapMode(s) === "wrap"
                                    ? wrappedLines(editing.value, Array.from({ length: merged ? merged.c2 - merged.c + 1 : 1 }, (_, i) => sheet.widths[c + i] || 100).reduce((a, b) => a + b, 0) - 8, s)
                                    : editing.value.split("\n").length) * Math.ceil(((s.fontSize || 10) * 4) / 3 + 3) + 4)),
                                }}
                                onChange={(e) => updateEdit(e.target.value)}
                                onMouseDown={(e) => e.stopPropagation()}
                                onBlur={commit}
                                onKeyDown={(e) => {
                                  e.stopPropagation();
                                  if (e.key === "Enter" && e.altKey) { insertEditNewline(e); return; }
                                  if (e.key === "Enter" || e.key === "Tab") {
                                    e.preventDefault();
                                    commit();
                                    grid.current.focus();
                                    move(
                                      e.key === "Enter" ? 1 : 0,
                                      e.key === "Tab"
                                        ? e.shiftKey
                                          ? -1
                                          : 1
                                        : 0,
                                    );
                                  } else if (e.key === "Escape") {
                                    editingRef.current = null;
                                    setEditing(null);
                                    grid.current.focus();
                                  }
                                }}
                              />
                            ) : validation?.type === "list" && !(viewPreferences.formulas && !cell.literal && cell.value?.startsWith("=")) ? (
                              <button
                                className={`cell-dropdown color-${Math.max(0, validation.values.indexOf(String(valueAt(r, c)))) % 6}`}
                                disabled={!editable}
                                aria-label={`Список ${address(r, c)}`}
                                onMouseDown={(e) => openDropdown(e, r, c)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.stopPropagation();
                                    openDropdown(e, r, c);
                                  }
                                }}
                              >
                                <span>{display(r, c)}</span>
                                <ChevronDown size={12} />
                              </button>
                            ) : validation?.type === "checkbox" && !invalid && !(viewPreferences.formulas && !cell.literal && cell.value?.startsWith("=")) ? (
                              <CellCheckbox
                                label={`Флажок ${address(r, c)}`}
                                checked={
                                  String(valueAt(r, c)).toUpperCase() === "TRUE"
                                }
                                disabled={!editable}
                                onSelect={() => {
                                  setSelection({ r, c, r2: r, c2: c });
                                  drag.current = false;
                                }}
                                onToggle={(value) =>
                                  changeCells([
                                    {
                                      key,
                                      cell: { value: value ? "TRUE" : "FALSE" },
                                    },
                                  ])
                                }
                              />
                            ) : (
                              <CellContent
                                text={printing ? display(r, c) : gridDisplay(r, c)}
                                overflow={textOverflow(sheet, r, c, printing ? display(r, c) : gridDisplay(r, c), s, viewPreferences.formulas && !printing ? gridDisplay(r,c) : valueAt(r, c))}
                                style={s}
                                link={cell.link}
                                onLinkClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setLinkPreview({
                                    r,
                                    c,
                                    anchor:
                                      e.currentTarget.getBoundingClientRect(),
                                  });
                                }}
                                height={
                                  (merged
                                    ? Array.from(
                                        { length: merged.r2 - merged.r + 1 },
                                        (_, i) => layout.heights[merged.r + i],
                                      ).reduce((a, b) => a + b, 0)
                                    : layout.heights[r]) - 1
                                }
                              />
                            )}
                            {invalid && (
                              <span
                                className="invalid-marker"
                                title="Значение не соответствует проверке данных"
                              />
                            )}
                            <CellBorders sheet={sheet} r={r} c={c} layout={layout} />
                            {sheet.filter &&
                              r === sheet.filter.range.r &&
                              c >= sheet.filter.range.c &&
                              c <= sheet.filter.range.c2 && (
                                <button
                                  className={`column-filter-button ${sheet.filter.criteria[c] ? "has-criteria" : ""}`}
                                  aria-label={`Фильтр столбца ${colName(c)}`}
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                  }}
                                  onClick={(e) => openColumnFilter(e, c)}
                                >
                                  <Filter size={12} />
                                </button>
                              )}
                            {active && !editing && editable && (
                              <span
                                className="fill-handle"
                                title="Скопировать в выделенный диапазон"
                                onMouseDown={(e) => {
                                  e.stopPropagation();
                                  const source =
                                    sheet.cells[
                                      `${selection.r},${selection.c}`
                                    ];
                                  drag.current = true;
                                  const up = () => {
                                    fillRange(source, selectionRef.current);
                                  };
                                  window.addEventListener("mouseup", up, {
                                    once: true,
                                  });
                                }}
                              />
                            )}
                            {peer && (
                              <span className="peer-label">{peer.name}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  </React.Fragment>
                ))}
                {rowWindow.bottom > 0 && (
                  <tr
                    className="spacer-row"
                    aria-hidden="true"
                    style={{ height: rowWindow.bottom }}
                  >
                    <td colSpan={sheet.cols + 1} />
                  </tr>
                )}
              </tbody>
            </table>
            <div className="chart-layer" style={{ zoom: zoom / 100 }}>
              {(sheet.charts || []).map((chart) => (
                <ChartCard
                  key={chart.id}
                  chart={chart}
                  data={chartData(
                    chart,
                    valueAt,
                    (r) => layout.positions[r] !== -1,
                  )}
                  selected={selectedChart === chart.id}
                  editable={editable}
                  onSelect={() => setSelectedChart(chart.id)}
                  onEdit={() => {
                    setSelectedChart(chart.id);
                    setSidebar("chart");
                  }}
                  onDelete={() =>
                    operation({
                      type: "chart-delete",
                      sheetId: sheet.id,
                      id: chart.id,
                    })
                  }
                  onLayout={(patch) =>
                    operation({
                      type: "chart-layout",
                      sheetId: sheet.id,
                      id: chart.id,
                      ...patch,
                    })
                  }
                />
              ))}
            </div>
            <div className="add-rows">
              <button
                disabled={!editable}
                onClick={() =>
                  operation({ type: "grow", sheetId: sheet.id, rows: 100 })
                }
              >
                Добавить ещё 100 строк
              </button>
            </div>
          </div>
          <footer className="sheet-footer">
            <IconButton
              icon={Plus}
              label="Добавить лист"
              disabled={!editable}
              onClick={() => operation({ type: "sheet-add" })}
            />
            <div className="menu-anchor">
              <IconButton
                icon={Menu}
                label="Все листы"
                onClick={() => setMenu(menu === "sheets" ? null : "sheets")}
              />
              {menu === "sheets" && (
                <AllSheetsMenu sheets={doc.state.sheets} activeId={sheet.id} onSelect={s=>{commit();setSheetId(s.id);setSelection({r:0,c:0,r2:0,c2:0});if(grid.current){grid.current.scrollTop=0;grid.current.scrollLeft=0;}}} onClose={()=>{setMenu(null);grid.current?.focus();}}/>
              )}
            </div>
            <div className="sheet-tabs" ref={tabsContainer}>
              {doc.state.sheets.filter(s=>!s.hidden).map((s) => (
                <div
                  key={s.id}
                  className={`sheet-tab menu-anchor ${sheet.id === s.id ? "active" : ""}`}
                  data-sheet-id={s.id}
                  data-tab-color={s.tabColor || undefined}
                  style={{"--tab-color":s.tabColor}}
                  draggable={editable}
                  data-drop-position={tabDrop?.id===s.id?tabDrop.position:undefined}
                  onDragStart={event=>{if(!editable){event.preventDefault();return;}commit();tabDrag.current={documentId:id,sheetId:s.id};event.dataTransfer.effectAllowed="move";event.dataTransfer.setData("application/x-open-sheets-tab",JSON.stringify(tabDrag.current));setMenu(null);}}
                  onDragOver={event=>{
                    if(!editable||tabDrag.current?.documentId!==id||tabDrag.current.sheetId===s.id)return;
                    event.preventDefault();event.dataTransfer.dropEffect="move";const rect=event.currentTarget.getBoundingClientRect();setTabDrop({id:s.id,position:event.clientX<rect.left+rect.width/2?"before":"after"});
                    const viewport=tabsContainer.current?.getBoundingClientRect();if(viewport){if(event.clientX<viewport.left+24)tabsContainer.current.scrollLeft-=20;else if(event.clientX>viewport.right-24)tabsContainer.current.scrollLeft+=20;}
                  }}
                  onDrop={event=>{
                    const source=tabDrag.current;event.preventDefault();tabDrag.current=null;setTabDrop(null);if(!editable||source?.documentId!==id||source.sheetId===s.id)return;
                    const rect=event.currentTarget.getBoundingClientRect();moveTab(source.sheetId,s.id,event.clientX<rect.left+rect.width/2?"before":"after");
                  }}
                  onDragEnd={()=>{tabDrag.current=null;setTabDrop(null);}}
                >
                  <button
                    onClick={() => {
                      commit();
                      setSheetId(s.id);
                      setSelection({ r: 0, c: 0, r2: 0, c2: 0 });
                      grid.current.scrollTop = 0;
                      grid.current.scrollLeft = 0;
                    }}
                    onContextMenu={(e) => sheetMenu(e, s)}
                  >
                    {s.name}
                  </button>
                  <button
                    aria-label={`Меню ${s.name}`}
                    onClick={(e) => sheetMenu(e, s)}
                  >
                    <ChevronDown size={12} />
                  </button>
                  {menu === `sheet:${s.id}` && sheetAnchor && <SheetTabMenu anchor={sheetAnchor} name={s.name} editable={editable} color={s.tabColor} customColors={customColors} onCustomColors={setCustomColors}
                    onColor={color=>operation({type:"sheet-color",sheetId:s.id,color})} canMoveLeft={!!tabMoveTarget(doc.state.sheets,s.id,-1)} canMoveRight={!!tabMoveTarget(doc.state.sheets,s.id,1)}
                    canHide={doc.state.sheets.filter(item=>!item.hidden).length>1} canDelete={doc.state.sheets.filter(item=>!item.hidden).length>1}
                    onClose={()=>{setMenu(null);grid.current?.focus();}}
                    onAction={action=>{
                      if(action==="rename")setModal("rename");
                      else if(action==="delete")setModal("delete-sheet");
                      else if(action==="comments")setModal("comments");
                      else if(action==="hide")operation({type:"sheet-visibility",sheetId:s.id,hidden:true});
                      else if(action==="duplicate")duplicateTab(s.id);
                      else if(action==="move-left"||action==="move-right"){const target=tabMoveTarget(docRef.current.state.sheets,s.id,action==="move-left"?-1:1);moveTab(s.id,target?.id,action==="move-left"?"before":"after");}
                      else if(action==="protect"){setProtectionRequest(previous=>({key:previous.key+1,type:"sheet"}));setSidebar("protections");}
                    }}/>}
                </div>
              ))}
            </div>
            <span className="footer-summary">
              {numeric.length
                ? `Сумма: ${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 5 }).format(numeric.reduce((a, c) => a + c, 0))}`
                : connected
                  ? "В сети"
                  : "Не в сети"}
              <ChevronDown size={13} />
            </span>
          </footer>
        </section>
        {sidebar && (
          <Sidebar
            className={sidebar === "banding" ? "banding-sidebar" : sidebar === "protections" ? "banding-sidebar protection-sidebar" : sidebar === "named-ranges" ? "banding-sidebar named-sidebar" : ""}
            icon={sidebar === "banding" ? PaintRoller : ["named-ranges", "protections"].includes(sidebar) ? TableView : undefined}
            title={
              sidebar === "protections" ? "Защищенные листы и диапазоны" : sidebar === "named-ranges" ? "Именованные диапазоны" : sidebar === "banding" ? "Чередующиеся цвета" : sidebar === "conditional"
                ? "Условное форматирование"
                : sidebar === "validation"
                  ? "Проверка данных"
                  : "Редактор диаграмм"
            }
            onClose={() => setSidebar(null)}
          >
            {sidebar === "protections" ? <ProtectionPanel key={protectionRequest.key} initialType={protectionRequest.type} doc={doc} sheet={sheet} selection={b} user={user} editable={editable} operation={operation} onSelect={selectNamedRange} /> : sidebar === "named-ranges" ? <NamedRangesPanel state={doc.state} sheet={sheet} selection={b} editable={editable} operation={operation} onSelect={selectNamedRange} /> : sidebar === "banding" ? <BandingPanel
              key={`banding:${sheet.id}`} sheet={sheet} selection={b} editable={editable} operation={operation}
              onPreview={(rule) => setBandPreview(rule ? { sheetId: sheet.id, rule } : null)}
              onClose={() => setSidebar(null)}
            /> : sidebar === "conditional" ? (
              <ConditionalPanel
                key={`conditional:${sheet.id}`}
                sheet={sheet}
                selection={b}
                editable={editable}
                operation={operation}
              />
            ) : sidebar === "validation" ? (
              <ValidationPanel
                key={`validation:${sheet.id}`}
                sheet={sheet}
                selection={b}
                editable={editable}
                operation={operation}
              />
            ) : (
              sheet.charts?.find((c) => c.id === selectedChart) && (
                <ChartPanel
                  key={selectedChart}
                  chart={sheet.charts.find((c) => c.id === selectedChart)}
                  sheet={sheet}
                  operation={operation}
                  editable={editable}
                />
              )
            )}
          </Sidebar>
        )}
      </div>
      <input
        ref={fileInput}
        type="file"
        accept=".xlsx,.csv,.tsv,.txt"
        hidden
        onChange={async (e) => {
          const file = e.target.files[0];
          if (file) {
            try {
              if (file.size > 10e6)
                throw new Error("Максимальный размер файла: 10 МБ");
              if (file.name.endsWith(".xlsx")) {
                const { importXLSX } = await import("./files.js");
                const imported = await importXLSX(await file.arrayBuffer());
                await operation({
                  type: "import-range",
                  sheetId: sheet.id,
                  changes: imported.cells.map((item) => ({
                    key: selection.r + item.r + "," + (selection.c + item.c),
                    cell: item.cell,
                    replace: true,
                  })),
                  merges: imported.merges.map((m) => ({
                    r: m.r + selection.r,
                    r2: m.r2 + selection.r,
                    c: m.c + selection.c,
                    c2: m.c2 + selection.c,
                  })),
                  bandedRanges: (imported.bandedRanges || []).map((rule) => ({ ...rule, range: { r: rule.range.r + selection.r, r2: rule.range.r2 + selection.r, c: rule.range.c + selection.c, c2: rule.range.c2 + selection.c } })),
                  namedRanges: (imported.namedRanges || []).map(item => ({ ...item, range: { r: item.allRows ? 0 : item.range.r + selection.r, r2: item.allRows ? sheet.rows - 1 : item.range.r2 + selection.r, c: item.allCols ? 0 : item.range.c + selection.c, c2: item.allCols ? sheet.cols - 1 : item.range.c2 + selection.c } })),
                });
              } else
                pasteRows(parseCSV((await file.text()).replace(/^\uFEFF/, "")));
            } catch (error) {
              setError(error.message);
            }
            e.target.value = "";
          }
        }}
      />
      {menu === "context" && (
        <div className="popover context-popover">
          <button disabled={!editable} onClick={() => menuAction("clear")}>
            Удалить значения
          </button>
          <button disabled={!commentable} onClick={() => menuAction("comment")}>
            Добавить комментарий
          </button>
          <button onClick={() => menuAction("sort-up")}>
            Сортировать А → Я
          </button>
        </div>
      )}
      {menu === "dropdown" &&
        dropdown &&
        validationAt(sheet, dropdown.r, dropdown.c)?.type === "list" && (
          <div
            className="popover cell-dropdown-menu"
            role="listbox"
            aria-label={`Варианты ${address(dropdown.r, dropdown.c)}`}
            style={{
              left: Math.max(
                8,
                Math.min(dropdown.anchor.left, window.innerWidth - 250),
              ),
              top: Math.min(
                dropdown.anchor.bottom + 4,
                window.innerHeight - 300,
              ),
            }}
          >
            {validationAt(sheet, dropdown.r, dropdown.c).values.map(
              (value, i) => (
                <button
                  key={value}
                  role="option"
                  aria-selected={
                    String(valueAt(dropdown.r, dropdown.c)) === value
                  }
                  onClick={async () => {
                    await changeCells([
                      { key: `${dropdown.r},${dropdown.c}`, cell: { value } },
                    ]);
                    setMenu(null);
                  }}
                >
                  <span className={`dropdown-chip color-${i % 6}`}>
                    {value}
                  </span>
                </button>
              ),
            )}
            <button
              className="dropdown-edit"
              onClick={() => {
                setMenu(null);
                setSidebar("validation");
              }}
            >
              Изменить правило
            </button>
          </div>
        )}
      {modal === "more-fonts" && <MoreFontsDialog preferences={fontPreferences}
        onSave={(enabled) => { setFontPreferences((previous) => normalizeFontPreferences({ ...previous, enabled })); setModal(null); grid.current?.focus(); }}
        onClose={() => { setModal(null); grid.current?.focus(); }} />}
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <IconButton
            icon={X}
            label="Скрыть ошибку"
            onClick={() => setError("")}
          />
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      {linkPreview &&
        sheet.cells[`${linkPreview.r},${linkPreview.c}`]?.link && (
          <div
            className="popover link-preview"
            role="dialog"
            aria-label="Ссылка ячейки"
            style={{
              left: Math.max(
                8,
                Math.min(linkPreview.anchor.left, window.innerWidth - 330),
              ),
              top: Math.min(
                linkPreview.anchor.bottom + 6,
                window.innerHeight - 110,
              ),
            }}
          >
            <a
              href={sheet.cells[`${linkPreview.r},${linkPreview.c}`].link}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Открыть ссылку"
            >
              {sheet.cells[`${linkPreview.r},${linkPreview.c}`].link}
            </a>
            {editable && (
              <div>
                <button
                  className="text-button"
                  onClick={() => {
                    setSelection({
                      r: linkPreview.r,
                      c: linkPreview.c,
                      r2: linkPreview.r,
                      c2: linkPreview.c,
                    });
                    setLinkPreview(null);
                    setModal("link");
                  }}
                >
                  Изменить ссылку
                </button>
                <button
                  className="text-button"
                  onClick={() => {
                    changeCells([
                      {
                        key: `${linkPreview.r},${linkPreview.c}`,
                        cell: { link: null },
                      },
                    ]);
                    setLinkPreview(null);
                  }}
                >
                  Удалить ссылку
                </button>
              </div>
            )}
            <button
              className="text-button"
              onClick={() => setLinkPreview(null)}
            >
              Закрыть
            </button>
          </div>
        )}
      {modal === "link" && (
        <LinkDialog
          cell={sheet.cells[`${selection.r},${selection.c}`]}
          display={display(selection.r, selection.c)}
          onClose={() => setModal(null)}
          onApply={async (patch) => {
            if (
              !(await changeCells([
                { key: `${selection.r},${selection.c}`, cell: patch },
              ]))
            )
              throw new Error("Не удалось сохранить ссылку");
          }}
        />
      )}
      {["custom-currency", "custom-date", "custom-number"].includes(modal) && (
        <CustomNumberFormatDialog
          kind={modal} style={currentStyle} value={valueAt(selection.r, selection.c)}
          onClose={() => { setModal(null); grid.current?.focus(); }} onApply={setNumberFormat}
        />
      )}
      {modal === "share" && (
        <ShareModal
          id={id}
          doc={doc}
          user={user}
          onClose={() => setModal(null)}
          inform={inform}
        />
      )}
      {modal === "comments" && (
        <CommentsModal
          doc={personalView ? { ...doc, role: "viewer" } : doc}
          sheet={sourceSheet}
          selection={projection?.sourceAt(selection.r, selection.c) || selection}
          user={user}
          canComment={commentable}
          readOnlyReason={personalView ? "Закройте временный просмотр, чтобы комментировать документ." : undefined}
          operation={operation}
          onClose={() => setModal(null)}
          onSelect={(comment) => {
            const target=doc.state.sheets.find(item=>item.id===comment.sheetId);if(!target||target.hidden){inform(target?`Лист «${target.name}» скрыт.`:"Лист больше не существует");return;}
            setTemporaryView(null);
            setSheetId(comment.sheetId);
            const [r, c] = comment.key.split(",").map(Number);
            setSelection({ r, c, r2: r, c2: c });
            grid.current.scrollTop = Math.max(0, r * 24 - 100);
          }}
        />
      )}
      {modal === "history" && (
        <HistoryModal
          id={id}
          currentRevision={doc.revision}
          canRestore={editable}
          operation={operation}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "merge-confirm" && (
        <Modal title="Объединить ячейки?" onClose={() => { setMergeRequest(null); setModal(null); }}>
          <p>
            В каждом объединении сохранится только значение в верхней левой ячейке.
            Остальные значения будут удалены.
          </p>
          <div className="modal-actions">
            <button className="text-button" onClick={() => { setMergeRequest(null); setModal(null); }}>
              Отмена
            </button>
            <button
              className="primary"
              onClick={async () => {
                if (mergeRequest) await operation({ ...mergeRequest, discard: true });
                setMergeRequest(null);
                setModal(null);
              }}
            >
              Объединить
            </button>
          </div>
        </Modal>
      )}
      {menu?.startsWith("column-filter:") && sheet.filter && filterAnchor && (
        <FilterPopover
          key={`${sheet.id}:${menu}`}
          sheet={sheet}
          col={+menu.split(":")[1]}
          display={display}
          anchor={filterAnchor}
          editable={editable || personalView}
          onClose={() => setMenu(null)}
          onSort={(desc) => sortFiltered(+menu.split(":")[1], desc)}
          onApply={async (values) => {
            const criteria = { ...sheet.filter.criteria },
              col = +menu.split(":")[1];
            if (values === null) delete criteria[col];
            else criteria[col] = { values };
            if (personalView) {
              setTemporaryView((view) => ({ ...view, filter: { ...view.filter, criteria } }));
              setMenu(null);
              return;
            }
            if (
              await operation({
                type: "filter",
                sheetId: sheet.id,
                filter: { ...sheet.filter, criteria },
              })
            )
              setMenu(null);
          }}
        />
      )}
      {sortRequest && <SortDialog key={`${sortRequest.sheet.id}:${sortRequest.revision}`} sheet={sortRequest.sheet} range={sortRequest.range} column={sortRequest.column} onApply={(snapshot, range, rules, header) => applySort(snapshot, range, rules, header, sortRequest.revision)} onClose={() => setSortRequest(null)} />}
      {protectionPrompts[0] && <Modal title="Защищённый диапазон" onClose={() => { protectionPrompts[0].cancel(); setProtectionPrompts(queue => queue.slice(1)); }}>
        <p>{protectionPrompts[0].message}</p><ul>{protectionPrompts[0].warnings.map(item => <li key={item.id}>{item.description}</li>)}</ul>
        <div className="dialog-actions"><button type="button" onClick={() => { protectionPrompts[0].cancel(); setProtectionPrompts(queue => queue.slice(1)); }}>Отмена</button><button type="button" onClick={() => { protectionPrompts[0].confirm(); setProtectionPrompts(queue => queue.slice(1)); }}>Изменить всё равно</button></div>
      </Modal>}
      {modal === "find" && (
        <Modal title="Найти на листе" onClose={() => setModal(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              findNext();
            }}
          >
            <label>
              Значение
              <input
                autoFocus
                value={find}
                onChange={(e) => setFind(e.target.value)}
                placeholder="Текст или число"
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setFind("");
                  setModal(null);
                }}
              >
                Закрыть
              </button>
              <button className="primary">Найти далее</button>
            </div>
          </form>
        </Modal>
      )}
      {modal === "rename" && (
        <Modal title="Переименовать лист" onClose={() => setModal(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await operation({
                  type: "sheet-rename",
                  sheetId: sheet.id,
                  name: new FormData(e.target).get("name"),
                })
              )
                setModal(null);
            }}
          >
            <label>
              Имя листа
              <input
                name="name"
                autoFocus
                defaultValue={sheet.name}
                required
                maxLength={60}
              />
            </label>
            <div className="modal-actions">
              <button className="primary">Сохранить</button>
            </div>
          </form>
        </Modal>
      )}
      {modal === "delete-sheet" && (
        <Modal title="Удалить лист?" onClose={() => setModal(null)}>
          <p>
            Лист «{sheet.name}» и все его данные будут удалены у всех
            участников.
          </p>
          <div className="modal-actions">
            <button className="text-button" onClick={() => setModal(null)}>
              Отмена
            </button>
            <button
              className="danger"
              onClick={async () => {
                if (
                  await operation({ type: "sheet-delete", sheetId: sheet.id })
                )
                  setModal(null);
              }}
            >
              Удалить
            </button>
          </div>
        </Modal>
      )}
      {modal === "help" && (
        <Modal title="О Таблицах" onClose={() => setModal(null)}>
          <p>
            Открытая таблица на React, Express, Socket.IO и HyperFormula
            (GPLv3).
          </p>
          <div className="help-grid">
            <span>Ввод / редактирование</span>
            <kbd>Текст / F2 / двойной щелчок</kbd>
            <span>Следующая ячейка</span>
            <kbd>Enter / Tab / стрелки</kbd>
            <span>Выделить диапазон</span>
            <kbd>Shift + стрелки / мышь</kbd>
            <span>Копировать / вставить</span>
            <kbd>Ctrl+C / Ctrl+V</kbd>
            <span>Отменить / повторить</span>
            <kbd>Ctrl+Z / Ctrl+Y</kbd>
            <span>Полужирный / курсив</span>
            <kbd>Ctrl+B / Ctrl+I</kbd>
            <span>Найти</span>
            <kbd>Ctrl+F</kbd>
          </div>
          <p className="muted">
            Примеры формул: =SUM(A1:A10), =AVERAGE(B1:B5),
            =IF(A1&gt;0,"Да","Нет"). Ссылка на лист: ='Лист2'!A1.
          </p>
          <a
            href="https://hyperformula.handsontable.com/guide/built-in-functions.html"
            target="_blank"
            rel="noreferrer"
          >
            Список доступных функций ↗
          </a>
        </Modal>
      )}
    </main>
  );
}
