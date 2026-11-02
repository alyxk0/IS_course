import { useState, useRef } from "react";
import { IconButton } from "./UI.jsx";
import {
  TextRotationNone,
  TextTiltUp,
  RotateText,
  TextVertical,
  TextUp,
  TextDown,
} from "./SheetIcons.jsx";
const presets = [
  ["Без поворота", 0, TextRotationNone],
  ["Наклон вверх", 45, TextTiltUp],
  ["Наклон вниз", -45, RotateText],
  ["Вертикальный текст", "vertical", TextVertical],
  ["Повернуть вверх", 90, TextUp],
  ["Повернуть вниз", -90, TextDown],
];
export const rotationIcon = (value) =>
  presets.find(([, rotation]) => rotation === (value || 0))?.[2] ||
  (value > 0 ? TextTiltUp : RotateText);
export default function RotationPopover({ rotation, onApply, onClose }) {
  const submitted = useRef(false);
  const [angle, setAngle] = useState(
      String(rotation === "vertical" ? 0 : rotation || 0),
    ),
    [error, setError] = useState("");
  function apply() {
    if (submitted.current) return;
    const value = Number(angle);
    if (
      !angle.trim() ||
      !Number.isInteger(value) ||
      value < -90 ||
      value > 90
    ) {
      setError("Введите целое число от -90 до 90");
      return;
    }
    submitted.current = true;
    onApply(value);
  }
  return (
    <div
      className="popover rotation-popover"
      aria-label="Поворот текста"
      onKeyDownCapture={(e) => {
        if (e.key === "Escape") {
          submitted.current = true;
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
    >
      {presets.map(([label, value, Icon]) => (
        <IconButton
          key={label}
          icon={Icon}
          label={label}
          active={rotation === value}
          onClick={() => onApply(value)}
        />
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <label>
          <input
            aria-label="Угол поворота"
            inputMode="numeric"
            value={angle}
            onChange={(e) => setAngle(e.target.value)}
            onBlur={(e) => {
              if (!e.relatedTarget?.closest(".rotation-popover")) apply();
            }}
            required
          />
          <span aria-hidden="true">°</span>
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
