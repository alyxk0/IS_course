import { X, ChevronDown } from "./SheetIcons.jsx";
import sheetsLogo from "../assets/sheets-2026.svg";
export function SheetLogo({ size = 32 }) {
  return (
    <img
      className="sheet-logo"
      src={sheetsLogo}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
    />
  );
}
export function IconButton({
  icon: Icon,
  label,
  onClick,
  active,
  disabled,
  children,
  dropdown,
  ...rest
}) {
  return (
    <button
      type="button"
      className={`icon-button ${active ? "active" : ""}${dropdown ? " icon-button-dropdown" : ""}`}
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      {...rest}
    >
      {Icon && <Icon size={Icon.sheetIcon ? 20 : 18} strokeWidth={1.8} />}{" "}
      {children}
      {dropdown && <ChevronDown size={9} className="dropdown-arrow" />}
    </button>
  );
}
export function Modal({ title, children, onClose, wide }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <header>
          <h2>{title}</h2>
          <IconButton icon={X} label="Закрыть" onClick={onClose} />
        </header>
        {children}
      </section>
    </div>
  );
}
