import { useEffect, useRef, useState } from "react";
export default function CellCheckbox({
  checked,
  disabled,
  label,
  onSelect,
  onToggle,
}) {
  const [display, setDisplay] = useState(checked),
    [pending, setPending] = useState(false),
    latest = useRef(checked),
    mounted = useRef(true);
  latest.current = checked;
  useEffect(() => setDisplay(checked), [checked]);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  async function toggle(event) {
    const value = event.target.checked;
    setDisplay(value);
    setPending(true);
    try {
      await onToggle(value);
    } finally {
      requestAnimationFrame(() => {
        if (mounted.current) {
          setDisplay(latest.current);
          setPending(false);
        }
      });
    }
  }
  return (
    <input
      type="checkbox"
      className="cell-checkbox"
      aria-label={label}
      checked={display}
      disabled={disabled || pending}
      onMouseDown={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onChange={toggle}
    />
  );
}
