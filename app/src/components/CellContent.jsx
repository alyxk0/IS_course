import { useMemo } from "react";
import { rotatedTextMetrics, textGraphemes } from "../gridModel.js";
import { wrapMode } from "../../shared/textWrapping.js";
import { textDecoration } from "../../shared/textStyles.js";
export default function CellContent({
  text,
  style = {},
  height,
  link,
  onLinkClick,
  overflow,
}) {
  const rotation = style.rotation || 0;
  const metrics = useMemo(
    () => (rotation ? rotatedTextMetrics(text, style) : null),
    [
      text,
      rotation,
      style.fontSize,
      style.fontFamily,
      style.bold,
      style.italic,
    ],
  );
  const Tag = link ? "a" : "span";
  return (
    <span
      className={`cell-value ${wrapMode(style) === "wrap" ? "wrap" : ""} ${rotation ? "rotated-value" : ""} ${overflow ? "overflowing-value" : ""}`}
      style={{
        height,
        ...(overflow ? { width: overflow.width, marginLeft: overflow.offset } : {}),
        justifyContent:
          style.verticalAlign === "top"
            ? "flex-start"
            : style.verticalAlign === "middle"
              ? "center"
              : "flex-end",
        lineHeight: `${Math.ceil(((style.fontSize || 10) * 4) / 3 + 3)}px`,
        alignItems: rotation
          ? style.align === "left"
            ? "flex-start"
            : style.align === "right"
              ? "flex-end"
              : "center"
          : "stretch",
      }}
    >
      <Tag
        className={`cell-text${link ? " cell-link" : ""}`}
        href={link || undefined}
        target={link ? "_blank" : undefined}
        rel={link ? "noopener noreferrer" : undefined}
        onClick={link ? onLinkClick : undefined}
        style={{ color: link ? style.color || "#1155cc" : undefined, textDecoration: rotation ? "none" : textDecoration(style, link), ...(overflow ? { width: overflow.textWidth, position: "relative", left: overflow.textOffset } : {}) }}
      >
        {rotation ? (
          <span
            className="rotation-frame"
            style={{ width: metrics.width, height: metrics.height }}
          >
            {rotation === "vertical" ? (
              <span className="vertical-text-columns">
                {String(text)
                  .split("\n")
                  .map((line, i) => (
                    <span key={i}>
                      {textGraphemes(line).map((char, j) => (
                        <span key={j} style={{ textDecoration: textDecoration(style, link) }}>{char}</span>
                      ))}
                    </span>
                  ))}
              </span>
            ) : (
              <span
                className="angled-text"
                style={{
                  transform: `translate(-50%, -50%) rotate(${-rotation}deg)`,
                  textDecoration: textDecoration(style, link),
                }}
              >
                {text}
              </span>
            )}
          </span>
        ) : (
          text
        )}
      </Tag>
    </span>
  );
}
