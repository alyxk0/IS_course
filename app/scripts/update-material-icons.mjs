import { mkdir, writeFile } from "node:fs/promises";

// Deliberately pinned: updating the upstream artwork is a reviewed visual change.
const revision = "49d4db35df873165d6bd6ba09b063c7dafbac2f4";
const names = {
  Search: "search",
  Undo2: "undo",
  Redo2: "redo",
  Printer: "print",
  PaintRoller: "format_paint",
  DecimalDecrease: "decimal_decrease",
  DecimalIncrease: "decimal_increase",
  ChevronDown: "expand_more",
  Minus: "remove",
  Plus: "add",
  Bold: "format_bold",
  Italic: "format_italic",
  Strikethrough: "strikethrough_s",
  Underline: "format_underlined",
  ChevronRight: "chevron_right",
  FormatText: "text_format",
  FontSize: "format_size",
  FormatClear: "format_clear",
  BandingColor: "water_drop",
  Theme: "format_paint",
  SortData: "sort",
  Shuffle: "shuffle",
  ColumnStats: "lightbulb",
  DataCleanup: "auto_fix_high",
  SplitText: "open_with",
  DataExtract: "output",
  Database: "database",
  Slicer: "filter_list",
  PaintBucket: "format_color_fill",
  Grid2X2: "border_all",
  BorderInside: "border_inner",
  BorderHorizontal: "border_horizontal",
  BorderVertical: "border_vertical",
  BorderOuter: "border_outer",
  BorderLeft: "border_left",
  BorderTop: "border_top",
  BorderRight: "border_right",
  BorderBottom: "border_bottom",
  BorderClear: "border_clear",
  BorderStyle: "border_style",
  AddCircle: "add_circle",
  Colorize: "colorize",
  Merge: "cell_merge",
  AlignLeft: "format_align_left",
  AlignCenter: "format_align_center",
  AlignRight: "format_align_right",
  AlignTop: "vertical_align_top",
  AlignMiddle: "vertical_align_center",
  AlignBottom: "vertical_align_bottom",
  RotateText: "text_rotation_angledown",
  TextRotationNone: "text_rotation_none",
  TextTiltUp: "text_rotation_angleup",
  TextVertical: "text_rotate_vertical",
  TextUp: "text_rotate_up",
  TextDown: "text_rotation_down",
  WrapText: "wrap_text",
  TextOverflow: "format_text_overflow",
  TextClip: "format_text_clip",
  MessageSquarePlus: "add_comment",
  Filter: "filter_alt",
  TableView: "table_view",
  FunctionSquare: "functions",
  Cloud: "cloud_done",
  History: "history",
  MessageSquare: "chat_bubble",
  Lock: "lock",
  Share2: "share",
  Menu: "menu",
  X: "close",
  Check: "check",
  Download: "download",
  Upload: "upload",
  Trash2: "delete",
  Settings: "settings",
  LogOut: "logout",
  ArrowLeft: "arrow_back",
  WifiOff: "wifi_off",
  ExternalLink: "open_in_new",
  Eye: "visibility",
  ChartColumn: "insert_chart",
  ListChecks: "checklist",
  Palette: "palette",
  ColorReset: "format_color_reset",
  SquareCheck: "check_box",
  Link: "link",
  CheckCheck: "done_all",
  MoreVertical: "more_vert",
  Pencil: "edit",
  ArrowUp: "arrow_upward",
  ArrowDown: "arrow_downward",
  FileSpreadsheet: "table_chart",
};
const root = `https://raw.githubusercontent.com/google/material-design-icons/${revision}`;
async function download(path) {
  const response = await fetch(`${root}/${path}`);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.text();
}
const artwork = {};
// Bound requests rather than fetching the entire upstream icon collection.
const entries = Object.entries(names);
for (let offset = 0; offset < entries.length; offset += 6) {
  await Promise.all(
    entries.slice(offset, offset + 6).map(async ([name, symbol]) => {
      const svg = await download(
        `symbols/web/${symbol}/materialsymbolsoutlined/${symbol}_20px.svg`,
      );
      const width = svg.match(/\bwidth="(\d+)"/)?.[1], height = svg.match(/\bheight="(\d+)"/)?.[1];
      const viewBox = svg.match(/viewBox="([\d .-]+)"/)?.[1] || (width && height ? `0 0 ${width} ${height}` : null);
      const paths = [...svg.matchAll(/<path d="([^"]+)"\s*\/>/g)].map(
        (match) => match[1],
      );
      if (
        !viewBox ||
        !paths.length ||
        /<(?:script|use|image|circle|rect|polygon)\b/i.test(svg)
      )
        throw new Error(`Unsupported upstream SVG: ${symbol}`);
      artwork[name] = { viewBox, paths };
    }),
  );
}
const license = await download("LICENSE");
await mkdir("src/assets", { recursive: true });
await mkdir("licenses", { recursive: true });
await writeFile(
  "src/assets/material-symbols.json",
  JSON.stringify(
    Object.fromEntries(Object.keys(names).map((name) => [name, artwork[name]])),
    null,
    2,
  ) + "\n",
);
await writeFile("licenses/material-symbols-LICENSE.txt", license);
await writeFile(
  "licenses/material-symbols-NOTICE.md",
  `# Google Material Symbols\n\nCopyright Google LLC. Licensed under Apache-2.0; see material-symbols-LICENSE.txt.\n\n` +
    `Source: https://github.com/google/material-design-icons/tree/${revision}/symbols/web\n\n` +
    `Subset: outlined, optical size 20. Original view boxes and paths are preserved in src/assets/material-symbols.json.\n\n` +
    `Reproduce with \`node scripts/update-material-icons.mjs\`.\n\n` +
    Object.entries(names)
      .map(([name, symbol]) => `- ${name}: ${symbol}`)
      .join("\n") +
    "\n",
);
console.log(`Stored ${entries.length} Material Symbols and their license.`);
