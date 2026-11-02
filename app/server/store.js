import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { applyDocumentOperation } from "./documentOperations.js";

export function createStore(filename) {
  if (filename !== ":memory:")
    mkdirSync(dirname(filename), { recursive: true });
  const db = new Database(filename);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL, state TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS permissions (document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE, email TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('viewer','commenter','editor')), PRIMARY KEY(document_id,email));
    CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY AUTOINCREMENT, document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id), revision INTEGER NOT NULL, changes TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS versions (document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE, revision INTEGER NOT NULL, user_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL, state TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY(document_id,revision));
    INSERT OR IGNORE INTO versions(document_id,revision,user_id,title,state,created) SELECT id,revision,owner,title,state,updated FROM documents;
  `);
  const userById = (id) =>
    db.prepare("SELECT id,email,name FROM users WHERE id=?").get(id);
  const getDoc = (id) => {
    const doc = db.prepare("SELECT * FROM documents WHERE id=?").get(id);
    return doc && { ...doc, state: JSON.parse(doc.state) };
  };
  const role = (id, user) => {
    const doc = db.prepare("SELECT owner FROM documents WHERE id=?").get(id);
    if (!doc || !user) return null;
    if (doc.owner === user.id) return "owner";
    return (
      db
        .prepare("SELECT role FROM permissions WHERE document_id=? AND email=?")
        .get(id, user.email)?.role || null
    );
  };
  const createDoc = (user, title = "Новая таблица") => {
    const id = randomUUID();
    const state = {
      sheets: [
        {
          id: randomUUID(),
          name: "Лист1",
          cells: {},
          widths: {},
          rows: 1000,
          cols: 26,
          frozen: 0,
        },
      ],
      comments: [],
    };
    db.prepare(
      "INSERT INTO documents (id,owner,title,state,updated) VALUES (?,?,?,?,?)",
    ).run(id, user.id, title, JSON.stringify(state), Date.now());
    db.prepare("INSERT INTO versions VALUES(?,?,?,?,?,?)").run(
      id,
      0,
      user.id,
      title,
      JSON.stringify(state),
      Date.now(),
    );
    return getDoc(id);
  };
  const apply = db.transaction((id, user, op) => {
    const doc = applyDocumentOperation(
      getDoc(id),
      user,
      op,
      role(id, user),
      op.type === "restore" && Number.isInteger(op.revision)
        ? db
            .prepare(
              "SELECT title,state FROM versions WHERE document_id=? AND revision=?",
            )
            .get(id, op.revision)
        : null,
    );
    const state = doc.state;
    db.prepare(
      "UPDATE documents SET title=?,state=?,revision=?,updated=? WHERE id=?",
    ).run(doc.title, JSON.stringify(state), doc.revision, Date.now(), id);
    db.prepare(
      "INSERT INTO history(document_id,user_id,revision,changes,created) VALUES(?,?,?,?,?)",
    ).run(id, user.id, doc.revision, JSON.stringify(op), Date.now());
    db.prepare("INSERT INTO versions VALUES(?,?,?,?,?,?)").run(
      id,
      doc.revision,
      user.id,
      doc.title,
      JSON.stringify(state),
      Date.now(),
    );
    db.prepare(
      "DELETE FROM versions WHERE document_id=? AND revision<>0 AND revision < ?",
    ).run(id, Math.max(0, doc.revision - 99));
    return { ...getDoc(id), changeType: op.type };
  });
  return { db, userById, getDoc, role, createDoc, apply };
}
