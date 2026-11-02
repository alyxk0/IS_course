import React, { useState, useEffect } from "react";
import { api, address, roleNames } from "../api.js";
import { Modal, IconButton } from "./UI.jsx";
import { Link, Lock, CheckCheck, X } from "./SheetIcons.jsx";
export function ShareModal({ id, doc, user, onClose, inform }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = () =>
    api(`/documents/${id}/members`)
      .then(setData)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, [id]);
  async function update(email, role) {
    setBusy(true);
    setError("");
    try {
      await api(`/documents/${id}/members`, {
        method: "PUT",
        body: { email, role },
      });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={`Доступ к файлу «${doc.title}»`} onClose={onClose}>
      <p className="muted">
        Приглашённый пользователь получит доступ после регистрации с указанным
        email.
      </p>
      {doc.role === "owner" && (
        <form
          className="invite-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = e.target;
            const values = new FormData(f);
            await update(values.get("email"), values.get("role"));
            f.reset();
          }}
        >
          <input
            type="email"
            name="email"
            placeholder="Добавьте email пользователя"
            aria-label="Email пользователя"
            required
          />
          <select name="role" aria-label="Права приглашения">
            <option value="editor">Редактор</option>
            <option value="commenter">Комментатор</option>
            <option value="viewer">Читатель</option>
          </select>
          <button className="primary" disabled={busy}>
            Добавить
          </button>
        </form>
      )}
      <h3>Пользователи с доступом</h3>
      {data ? (
        <>
          <div className="member">
            <span className="avatar">{data.owner.name[0].toUpperCase()}</span>
            <div>
              <strong>
                {data.owner.name}
                {data.owner.id === user.id ? " (вы)" : ""}
              </strong>
              <small>{data.owner.email}</small>
            </div>
            <span>Владелец</span>
          </div>
          {data.members.map((m) => (
            <div className="member" key={m.email}>
              <span className="avatar secondary">
                {(m.name || m.email)[0].toUpperCase()}
              </span>
              <div>
                <strong>{m.name || m.email}</strong>
                <small>{m.email}</small>
              </div>
              {doc.role === "owner" ? (
                <select
                  aria-label={`Права ${m.email}`}
                  disabled={busy}
                  value={m.role}
                  onChange={(e) => update(m.email, e.target.value)}
                >
                  <option value="viewer">Читатель</option>
                  <option value="commenter">Комментатор</option>
                  <option value="editor">Редактор</option>
                  <option value="remove">Удалить доступ</option>
                </select>
              ) : (
                <span>{roleNames[m.role]}</span>
              )}
            </div>
          ))}
        </>
      ) : (
        <p>Загрузка…</p>
      )}
      <h3>Общий доступ</h3>
      <div className="restricted">
        <span className="lock-circle">
          <Lock size={20} />
        </span>
        <div>
          <strong>Доступ ограничен</strong>
          <small>Только добавленные пользователи могут открыть файл.</small>
        </div>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="modal-actions spread">
        <button
          className="outlined"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(location.href);
              inform("Ссылка скопирована");
            } catch {
              setError(
                "Не удалось скопировать. Скопируйте адрес из строки браузера.",
              );
            }
          }}
        >
          <Link size={17} />
          Копировать ссылку
        </button>
        <button className="primary" onClick={onClose}>
          Готово
        </button>
      </div>
    </Modal>
  );
}
export function CommentsModal({
  doc,
  sheet,
  selection,
  user,
  canComment,
  readOnlyReason,
  operation,
  onClose,
  onSelect,
}) {
  const [text, setText] = useState(""),
    [showResolved, setShowResolved] = useState(false);
  const comments = doc.state.comments.filter(
    (c) => showResolved || !c.resolved,
  );
  return (
    <Modal title="Комментарии" onClose={onClose}>
      <div className="comment-location">
        Новый комментарий · {sheet.name}!{address(selection.r, selection.c)}
      </div>
      {canComment ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await operation({
                type: "comment",
                sheetId: sheet.id,
                key: `${selection.r},${selection.c}`,
                text,
              })
            )
              setText("");
          }}
        >
          <textarea
            autoFocus
            placeholder="Добавьте комментарий"
            aria-label="Текст комментария"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={5000}
            required
          />
          <div className="modal-actions">
            <button className="primary" disabled={!text.trim()}>
              Комментировать
            </button>
          </div>
        </form>
      ) : (
        <p className="muted">
            {readOnlyReason || "Для добавления комментариев запросите права комментатора."}
        </p>
      )}
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={showResolved}
          onChange={(e) => setShowResolved(e.target.checked)}
        />
        Показать решённые
      </label>
      <div className="comments-list">
        {comments.length ? (
          comments
            .slice()
            .reverse()
            .map((c) => (
              <article className="comment" key={c.id}>
                <header>
                  <span className="avatar small">
                    {c.name[0].toUpperCase()}
                  </span>
                  <div>
                    <strong>{c.name}</strong>
                    <small>{new Date(c.created).toLocaleString("ru-RU")}</small>
                  </div>
                  {["owner", "editor"].includes(doc.role) && (
                    <IconButton
                      icon={CheckCheck}
                      label={
                        c.resolved ? "Открыть обсуждение" : "Отметить решённым"
                      }
                      active={c.resolved}
                      onClick={() =>
                        operation({ type: "resolve-comment", id: c.id })
                      }
                    />
                  )}
                </header>
                <button className="comment-cell" onClick={() => onSelect(c)}>
                  {doc.state.sheets.find((s) => s.id === c.sheetId)?.name}!
                  {address(...c.key.split(",").map(Number))}
                </button>
                <p>{c.text}</p>
                {c.resolved && (
                  <small className="muted">Обсуждение завершено</small>
                )}
              </article>
            ))
        ) : (
          <p className="empty-comments">Здесь пока нет комментариев</p>
        )}
      </div>
    </Modal>
  );
}
export function HistoryModal({
  id,
  onClose,
  currentRevision,
  canRestore,
  operation,
}) {
  const [entries, setEntries] = useState(null),
    [error, setError] = useState(""),
    [preview, setPreview] = useState(null),
    [loading, setLoading] = useState(false),
    [restoreBase, setRestoreBase] = useState(null),
    [restoring, setRestoring] = useState(false);
  useEffect(() => {
    api(`/documents/${id}/history`)
      .then(setEntries)
      .catch((e) => setError(e.message));
  }, [id]);
  const names = {
    create: "Создана таблица",
    cells: "Изменение ячеек",
    title: "Название документа",
    "sheet-add": "Добавлен лист",
    "sheet-delete": "Удалён лист",
    "sheet-rename": "Переименован лист",
    "sheet-visibility": "Видимость листа",
    "sheet-color": "Цвет вкладки листа",
    "sheet-move": "Перемещён лист",
    "sheet-duplicate": "Создана копия листа",
    resize: "Ширина столбца",
    grow: "Добавлены строки",
    freeze: "Закрепление строк",
    comment: "Комментарий",
    "resolve-comment": "Статус комментария",
    merge: "Объединение ячеек",
    filter: "Настройка фильтра",
    structure: "Изменение структуры",
    restore: "Восстановление версии",
    "import-range": "Импорт диапазона",
    "conditional-set": "Настройка условного форматирования",
    "conditional-delete": "Удалено правило оформления",
    "conditional-move": "Изменён порядок правил",
    "validation-set": "Настройка проверки данных",
    "validation-delete": "Удалена проверка данных",
    "chart-set": "Настройка диаграммы",
    "chart-delete": "Удалена диаграмма",
    "chart-layout": "Положение и размер диаграммы",
  };
  return (
    <Modal title="История изменений" onClose={onClose}>
      <p className="muted">
        Последние 100 изменений и начальная версия. Восстановление создаёт новую
        версию и сохраняет текущие права доступа.
      </p>
      {error && <p className="error">{error}</p>}
      {loading && <p>Загружаем содержимое версии…</p>}
      {preview && (
        <section className="version-preview">
          <header>
            <strong>
              Версия {preview.revision} · {preview.title}
            </strong>
            <IconButton
              icon={X}
              label="Закрыть просмотр версии"
              onClick={() => setPreview(null)}
            />
          </header>
          <p className="muted">
            Первые 30 заполненных ячеек. Формулы показаны как текст.
          </p>
          <div className="version-cells">
            {preview.state.sheets.map((sheet) => (
              <React.Fragment key={sheet.id}>
                <h4>{sheet.name}</h4>
                {Object.entries(sheet.cells)
                  .filter(([, cell]) => cell.value)
                  .sort(([a], [b]) => {
                    const [ar, ac] = a.split(",").map(Number),
                      [br, bc] = b.split(",").map(Number);
                    return ar - br || ac - bc;
                  })
                  .slice(0, 30)
                  .map(([key, cell]) => (
                    <div key={key}>
                      <code>{address(...key.split(",").map(Number))}</code>
                      <span>{cell.value}</span>
                    </div>
                  ))}
                {!Object.values(sheet.cells).some((c) => c.value) && (
                  <p className="muted">Пустой лист</p>
                )}
              </React.Fragment>
            ))}
          </div>
          {canRestore && preview.revision !== currentRevision && (
            <>
              <p className="muted">
                Содержимое всех листов заменит текущую версию {restoreBase}. Это
                изменение увидят все участники.
              </p>
              <button
                className="primary"
                disabled={restoring}
                onClick={async () => {
                  setRestoring(true);
                  try {
                    if (
                      await operation({
                        type: "restore",
                        revision: preview.revision,
                        expectedRevision: restoreBase,
                      })
                    )
                      onClose();
                  } finally {
                    setRestoring(false);
                  }
                }}
              >
                {restoring ? "Восстановление…" : "Восстановить эту версию"}
              </button>
            </>
          )}
        </section>
      )}
      <div className="history-list">
        {entries ? (
          entries.length ? (
            entries.map((h) => (
              <article key={h.revision}>
                <span className="history-dot" />
                <div>
                  <strong>{names[h.changes.type] || h.changes.type}</strong>
                  <p>
                    {h.name} · {new Date(h.created).toLocaleString("ru-RU")}
                  </p>
                  <small>
                    Версия {h.revision}
                    {h.changes.changes
                      ? ` · ${h.changes.changes.length} ячеек`
                      : ""}
                  </small>
                  {!!h.restorable && (
                    <button
                      className="version-open"
                      onClick={async () => {
                        setLoading(true);
                        setError("");
                        try {
                          const version = await api(
                            `/documents/${id}/versions/${h.revision}`,
                          );
                          setPreview(version);
                          setRestoreBase(currentRevision);
                        } catch (e) {
                          setError(e.message);
                        } finally {
                          setLoading(false);
                        }
                      }}
                    >
                      Просмотреть версию {h.revision}
                    </button>
                  )}
                </div>
              </article>
            ))
          ) : (
            <p>Таблица ещё не изменялась.</p>
          )
        ) : (
          <p>Загрузка…</p>
        )}
      </div>
    </Modal>
  );
}
