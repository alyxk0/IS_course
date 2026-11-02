import { applyDocumentOperation } from "../server/documentOperations.js";
export const STRUCTURAL_CHANGES = new Set([
  "restore",
  "structure",
  "merge",
  "sheet-delete",
  "import-range",
]);
export function splitState(text) {
  const chunks = [];
  for (let start = 0; start < text.length;) {
    let end = Math.min(text.length, start + 250000);
    const code = text.charCodeAt(end - 1);
    if (end < text.length && code >= 0xd800 && code <= 0xdbff) end--;
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}
export const failure = (message, status = 400) =>
  Object.assign(new Error(message), { status });
export function createD1Store(db) {
  const prepare = (query, ...params) => db.prepare(query).bind(...params);
  async function userBySession(token) {
    return prepare(
      "SELECT u.id,u.email,u.name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?",
      token,
      Date.now(),
    ).first();
  }
  async function stateAt(id, revision) {
    const result = await prepare(
      "SELECT content FROM document_states WHERE document_id=? AND revision=? ORDER BY part",
      id,
      revision,
    ).all();
    if (!result.results.length)
      throw failure("Сохранённое состояние не найдено", 404);
    return result.results.map((r) => r.content).join("");
  }
  async function getDoc(id, user, token, full = true) {
    const doc = await prepare(
      `SELECT d.*,CASE WHEN d.owner=? THEN 'owner' ELSE p.role END AS role FROM documents d LEFT JOIN permissions p ON p.document_id=d.id AND p.email=? WHERE d.id=? AND (d.owner=? OR p.role IS NOT NULL) AND EXISTS(SELECT 1 FROM sessions s WHERE s.token=? AND s.user_id=? AND s.expires>?)`,
      user.id,
      user.email,
      id,
      user.id,
      token,
      user.id,
      Date.now(),
    ).first();
    if (!doc) throw failure("Нет доступа к этой таблице", 403);
    if (full) doc.state = JSON.parse(await stateAt(id, doc.revision));
    return {
      ...doc,
      changeType: doc.change_type,
      structureRevision: doc.structure_revision,
    };
  }
  async function getVersion(id, revision) {
    const version = await prepare(
      "SELECT revision,title,created FROM versions WHERE document_id=? AND revision=?",
      id,
      revision,
    ).first();
    if (!version)
      throw failure("Эта версия недоступна для восстановления", 404);
    return { ...version, state: await stateAt(id, revision) };
  }
  async function createDocument(user, token) {
    const id = crypto.randomUUID(),
      state = {
        sheets: [
          {
            id: crypto.randomUUID(),
            name: "Лист1",
            cells: {},
            widths: {},
            rows: 1000,
            cols: 26,
            frozen: 0,
          },
        ],
        comments: [],
      },
      now = Date.now(),
      title = "Новая таблица";
    const result = await db.batch([
      prepare(
        "INSERT INTO documents(id,owner,title,revision,updated) SELECT ?,?,?,0,? WHERE EXISTS(SELECT 1 FROM sessions WHERE token=? AND user_id=? AND expires>?)",
        id,
        user.id,
        title,
        now,
        token,
        user.id,
        now,
      ),
      prepare(
        "INSERT INTO versions(document_id,revision,user_id,title,created) SELECT id,0,owner,title,updated FROM documents WHERE id=?",
        id,
      ),
      prepare(
        "INSERT INTO document_states(document_id,revision,part,content) SELECT id,0,0,? FROM documents WHERE id=?",
        JSON.stringify(state),
        id,
      ),
    ]);
    if (result[0].meta.changes !== 1) throw failure("Войдите в аккаунт", 401);
    return getDoc(id, user, token);
  }
  async function apply(id, user, token, op, requestId) {
    if (
      !op ||
      typeof op.type !== "string" ||
      typeof requestId !== "string" ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(requestId)
    )
      throw failure("Неверное действие");
    for (let attempt = 0; attempt < 8; attempt++) {
      const doc = await getDoc(id, user, token);
      const existing = await prepare(
        "SELECT revision FROM mutations WHERE document_id=? AND request_id=? AND user_id=?",
        id,
        requestId,
        user.id,
      ).first();
      if (existing) return { ...doc, ackRevision: existing.revision };
      const version =
        op.type === "restore" && Number.isInteger(op.revision)
          ? await getVersion(id, op.revision)
          : null;
      const baseRevision = doc.revision,
        next = applyDocumentOperation(doc, user, op, doc.role, version),
        chunks = splitState(JSON.stringify(next.state));
      const revision = next.revision,
        now = next.updated,
        structure = STRUCTURAL_CHANGES.has(op.type)
          ? revision
          : doc.structure_revision;
      const statements = [
        prepare(
          `UPDATE documents SET title=?,revision=?,updated=?,mutation_id=?,change_type=?,structure_revision=? WHERE id=? AND revision=? AND NOT EXISTS(SELECT 1 FROM mutations WHERE document_id=? AND request_id=?) AND EXISTS(SELECT 1 FROM sessions s WHERE s.token=? AND s.user_id=? AND s.expires>?) AND (owner=? OR EXISTS(SELECT 1 FROM permissions p WHERE p.document_id=documents.id AND p.email=? AND (p.role='editor' OR (p.role='commenter' AND ?='comment'))))`,
          next.title,
          revision,
          now,
          requestId,
          op.type,
          structure,
          id,
          baseRevision,
          id,
          requestId,
          token,
          user.id,
          now,
          user.id,
          user.email,
          op.type,
        ),
        prepare(
          `INSERT OR IGNORE INTO versions(document_id,revision,user_id,title,created) SELECT id,revision,?,title,updated FROM documents WHERE id=? AND mutation_id=?`,
          user.id,
          id,
          requestId,
        ),
        ...chunks.map((chunk, part) =>
          prepare(
            "INSERT OR IGNORE INTO document_states(document_id,revision,part,content) SELECT id,revision,?,? FROM documents WHERE id=? AND mutation_id=?",
            part,
            chunk,
            id,
            requestId,
          ),
        ),
        prepare(
          "INSERT INTO history(document_id,user_id,revision,changes,created) SELECT id,?,revision,?,updated FROM documents WHERE id=? AND mutation_id=? AND NOT EXISTS(SELECT 1 FROM mutations WHERE document_id=? AND request_id=?)",
          user.id,
          JSON.stringify(op),
          id,
          requestId,
          id,
          requestId,
        ),
        prepare(
          "INSERT OR IGNORE INTO mutations(document_id,request_id,user_id,revision,created) SELECT id,?, ?,revision,updated FROM documents WHERE id=? AND mutation_id=?",
          requestId,
          user.id,
          id,
          requestId,
        ),
        prepare(
          "DELETE FROM versions WHERE document_id=? AND revision<>0 AND revision<? AND EXISTS(SELECT 1 FROM documents WHERE id=? AND mutation_id=?)",
          id,
          Math.max(0, revision - 99),
          id,
          requestId,
        ),
      ];
      const results = await db.batch(statements);
      if (results[0].meta.changes === 1)
        return {
          ...next,
          mutation_id: requestId,
          changeType: op.type,
          structureRevision: structure,
          structure_revision: structure,
          ackRevision: revision,
        };
    }
    throw failure("Таблица активно меняется. Повторите действие.", 409);
  }
  async function updatePresence(id, user, token, clientId, cursor) {
    if (
      typeof clientId !== "string" ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(clientId)
    )
      throw failure("Неверный идентификатор подключения");
    if (
      cursor !== null &&
      (!cursor ||
        !Number.isInteger(cursor.row) ||
        cursor.row < 0 ||
        cursor.row >= 10000 ||
        !Number.isInteger(cursor.col) ||
        cursor.col < 0 ||
        cursor.col >= 200 ||
        typeof cursor.sheetId !== "string" ||
        cursor.sheetId.length > 100)
    )
      throw failure("Неверный курсор");
    const now = Date.now();
    const result = await prepare(
      "INSERT INTO presence(document_id,client_id,user_id,session_token,cursor,updated) VALUES(?,?,?,?,?,?) ON CONFLICT(document_id,client_id) DO UPDATE SET session_token=excluded.session_token,cursor=excluded.cursor,updated=excluded.updated WHERE presence.user_id=excluded.user_id",
      id,
      clientId,
      user.id,
      token,
      cursor ? JSON.stringify(cursor) : null,
      now,
    ).run();
    if (!result.meta.changes)
      throw failure("Идентификатор подключения уже используется", 409);
  }
  async function people(id) {
    const now = Date.now();
    const result = await prepare(
      `SELECT a.client_id,u.id,u.name,a.cursor FROM presence a JOIN users u ON u.id=a.user_id JOIN sessions s ON s.token=a.session_token AND s.expires>? JOIN documents d ON d.id=a.document_id LEFT JOIN permissions p ON p.document_id=d.id AND p.email=u.email WHERE a.document_id=? AND a.updated>? AND (d.owner=u.id OR p.role IS NOT NULL)`,
      now,
      id,
      now - 20000,
    ).all();
    return result.results.map((p) => ({
      socketId: p.client_id,
      id: p.id,
      name: p.name,
      color: ["#1a73e8", "#a142f4", "#e8710a", "#188038", "#d93025"][
        [...p.id].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 5
      ],
      cursor: p.cursor ? JSON.parse(p.cursor) : null,
    }));
  }
  return {
    prepare,
    userBySession,
    stateAt,
    getDoc,
    getVersion,
    createDocument,
    apply,
    updatePresence,
    people,
  };
}
