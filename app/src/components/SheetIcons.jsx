import artwork from "../assets/material-symbols.json";

// Local Google Material Symbols artwork, Apache-2.0. Attribution: licenses/.
function symbol(name) {
  const { viewBox, paths } = artwork[name];
  function Icon({
    size = 20,
    color = "currentColor",
    strokeWidth: _strokeWidth,
    ...props
  }) {
    return (
      <svg
        width={size}
        height={size}
        viewBox={viewBox}
        fill={color}
        aria-hidden="true"
        focusable="false"
        {...props}
      >
        {paths.map((d, index) => (
          <path key={index} d={d} />
        ))}
      </svg>
    );
  }
  Icon.displayName = name;
  Icon.sheetIcon = true;
  return Icon;
}

export const Search = symbol("Search"),
  SortData = symbol("SortData"),
  Shuffle = symbol("Shuffle"),
  ColumnStats = symbol("ColumnStats"),
  DataCleanup = symbol("DataCleanup"),
  SplitText = symbol("SplitText"),
  DataExtract = symbol("DataExtract"),
  Database = symbol("Database"),
  Slicer = symbol("Slicer"),
  Undo2 = symbol("Undo2"),
  Redo2 = symbol("Redo2"),
  Printer = symbol("Printer"),
  PaintRoller = symbol("PaintRoller"),
  ChevronDown = symbol("ChevronDown"),
  Minus = symbol("Minus"),
  Plus = symbol("Plus"),
  Bold = symbol("Bold"),
  Italic = symbol("Italic"),
  Strikethrough = symbol("Strikethrough"),
  PaintBucket = symbol("PaintBucket"),
  Grid2X2 = symbol("Grid2X2"),
  BorderInside = symbol("BorderInside"),
  BorderHorizontal = symbol("BorderHorizontal"),
  BorderVertical = symbol("BorderVertical"),
  BorderOuter = symbol("BorderOuter"),
  BorderLeft = symbol("BorderLeft"),
  BorderTop = symbol("BorderTop"),
  BorderRight = symbol("BorderRight"),
  BorderBottom = symbol("BorderBottom"),
  BorderClear = symbol("BorderClear"),
  BorderStyle = symbol("BorderStyle"),
  AddCircle = symbol("AddCircle"),
  Colorize = symbol("Colorize"),
  Merge = symbol("Merge"),
  AlignLeft = symbol("AlignLeft"),
  AlignCenter = symbol("AlignCenter"),
  AlignRight = symbol("AlignRight"),
  WrapText = symbol("WrapText"),
  TextOverflow = symbol("TextOverflow"),
  TextClip = symbol("TextClip"),
  MessageSquarePlus = symbol("MessageSquarePlus"),
  Filter = symbol("Filter"),
  TableView = symbol("TableView"),
  FunctionSquare = symbol("FunctionSquare"),
  Cloud = symbol("Cloud"),
  History = symbol("History"),
  MessageSquare = symbol("MessageSquare"),
  Lock = symbol("Lock"),
  Share2 = symbol("Share2"),
  Menu = symbol("Menu"),
  X = symbol("X"),
  Check = symbol("Check"),
  Download = symbol("Download"),
  Upload = symbol("Upload"),
  Trash2 = symbol("Trash2"),
  Settings = symbol("Settings"),
  LogOut = symbol("LogOut"),
  ArrowLeft = symbol("ArrowLeft"),
  WifiOff = symbol("WifiOff"),
  ExternalLink = symbol("ExternalLink"),
  Eye = symbol("Eye"),
  ChartColumn = symbol("ChartColumn"),
  ListChecks = symbol("ListChecks"),
  Palette = symbol("Palette"),
  SquareCheck = symbol("SquareCheck"),
  Link = symbol("Link"),
  CheckCheck = symbol("CheckCheck"),
  MoreVertical = symbol("MoreVertical"),
  Pencil = symbol("Pencil"),
  ArrowUp = symbol("ArrowUp"),
  ArrowDown = symbol("ArrowDown"),
  FileSpreadsheet = symbol("FileSpreadsheet"),
  DecimalDecrease = symbol("DecimalDecrease"),
  DecimalIncrease = symbol("DecimalIncrease"),
  AlignTop = symbol("AlignTop"),
  AlignMiddle = symbol("AlignMiddle"),
  AlignBottom = symbol("AlignBottom"),
  RotateText = symbol("RotateText"),
  TextRotationNone = symbol("TextRotationNone"),
  TextTiltUp = symbol("TextTiltUp"),
  TextVertical = symbol("TextVertical"),
  TextUp = symbol("TextUp"),
  TextDown = symbol("TextDown"),
  ColorReset = symbol("ColorReset"),
  Underline = symbol("Underline"),
  ChevronRight = symbol("ChevronRight"),
  FormatText = symbol("FormatText"),
  Theme = symbol("Theme"),
  FontSize = symbol("FontSize"),
  FormatClear = symbol("FormatClear"),
  BandingColor = symbol("BandingColor");
