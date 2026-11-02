import { useState } from "react";
import { Modal } from "./UI.jsx";
import { safeLink } from "../../shared/links.js";
export default function LinkDialog({ cell = {}, display, onApply, onClose }) {
  const formula = cell.value?.startsWith("="),
    original = cell.value || "";
  const [text, setText] = useState(formula ? display : original),
    [url, setUrl] = useState(cell.link || safeLink(original) || ""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title={cell.link ? "Изменить ссылку" : "Вставить ссылку"}
      onClose={onClose}
    >
      <form
        className="link-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const link = safeLink(url);
          if (!link) {
            setError("Укажите ссылку http, https или mailto");
            return;
          }
          setBusy(true);
          try {
            await onApply({
              link,
              ...(!formula && (text !== original || !original)
                ? { value: text || link }
                : {}),
            });
            onClose();
          } catch (error) {
            setError(error.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Текст
          <input
            aria-label="Текст ссылки"
            value={text}
            readOnly={formula}
            onChange={(e) => setText(e.target.value)}
            maxLength={32000}
          />
        </label>
        <label>
          Ссылка
          <input
            autoFocus
            aria-label="Адрес ссылки"
            placeholder="https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            maxLength={2048}
            required
          />
        </label>
        {formula && (
          <p className="field-hint">
            Ссылка будет добавлена к результату формулы.
          </p>
        )}
        {error && <p className="error">{error}</p>}
        <footer>
          <button type="button" className="text-button" onClick={onClose}>
            Отмена
          </button>
          <button className="primary" disabled={busy} type="submit">
            Применить
          </button>
        </footer>
      </form>
    </Modal>
  );
}
