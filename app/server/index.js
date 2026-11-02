import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createStore } from "./store.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const store = createStore(
  process.env.DB_PATH || path.join(root, "data/sheets.db"),
);
const { db } = store;
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "4mb" }));
app.use(cookieParser());
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  if (
    req.method !== "GET" &&
    req.headers.origin &&
    new URL(req.headers.origin).host !== req.headers.host
  )
    return res.status(403).json({ error: "Недопустимый источник запроса" });
  const session = db
    .prepare("SELECT user_id FROM sessions WHERE token=? AND expires>?")
    .get(req.cookies.session || "", Date.now());
  req.user = session ? store.userById(session.user_id) : null;
  next();
});
const auth = (req, res, next) =>
  req.user ? next() : res.status(401).json({ error: "Войдите в аккаунт" });
const check = (req, res, next) => {
  req.role = store.role(req.params.id, req.user);
  return req.role
    ? next()
    : res.status(403).json({ error: "Нет доступа к этой таблице" });
};
const attempts = new Map();
app.post("/api/auth/:action", async (req, res) => {
  const key = req.ip;
  const entry = attempts.get(key) || { count: 0, until: Date.now() + 60000 };
  if (entry.until < Date.now()) {
    entry.count = 0;
    entry.until = Date.now() + 60000;
  }
  entry.count++;
  attempts.set(key, entry);
  if (entry.count > 30)
    return res
      .status(429)
      .json({ error: "Слишком много попыток. Попробуйте через минуту." });
  const { email: rawEmail, password, name } = req.body;
  const email = String(rawEmail || "")
    .trim()
    .toLowerCase();
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    typeof password !== "string" ||
    password.length < 8 ||
    password.length > 128
  )
    return res
      .status(400)
      .json({ error: "Введите email и пароль длиной от 8 до 128 символов" });
  let user;
  if (req.params.action === "register") {
    if (typeof name !== "string" || !name.trim() || name.length > 80)
      return res.status(400).json({ error: "Введите ваше имя" });
    if (db.prepare("SELECT id FROM users WHERE email=?").get(email))
      return res.status(409).json({ error: "Этот email уже зарегистрирован" });
    const hash = await bcrypt.hash(password, 12);
    try {
      db.prepare("INSERT INTO users VALUES(?,?,?,?)").run(
        randomUUID(),
        email,
        name.trim(),
        hash,
      );
    } catch {
      return res.status(409).json({ error: "Этот email уже зарегистрирован" });
    }
    user = db.prepare("SELECT * FROM users WHERE email=?").get(email);
  } else if (req.params.action === "login") {
    user = db.prepare("SELECT * FROM users WHERE email=?").get(email);
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ error: "Неверный email или пароль" });
  } else return res.status(404).json({ error: "Неизвестное действие" });
  const token = randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
    token,
    user.id,
    Date.now() + 30 * 86400000,
  );
  res.cookie("session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    maxAge: 30 * 86400000,
  });
  res.json(store.userById(user.id));
});
app.post("/api/logout", auth, (req, res) => {
  db.prepare("DELETE FROM sessions WHERE token=?").run(req.cookies.session);
  res.clearCookie("session");
  res.json({ ok: true });
});
app.get("/api/me", (req, res) => res.json({ user: req.user }));
app.get("/api/runtime", (req, res) => res.json({ transport: "socket.io" }));
app.get("/api/documents", auth, (req, res) =>
  res.json(
    db
      .prepare(
        `SELECT DISTINCT d.id,d.title,d.updated,d.owner,u.name AS ownerName FROM documents d JOIN users u ON u.id=d.owner LEFT JOIN permissions p ON p.document_id=d.id WHERE d.owner=? OR p.email=? ORDER BY d.updated DESC`,
      )
      .all(req.user.id, req.user.email),
  ),
);
app.post("/api/documents", auth, (req, res) =>
  res.json(store.createDoc(req.user)),
);
app.get("/api/documents/:id", auth, check, (req, res) =>
  res.json({ ...store.getDoc(req.params.id), role: req.role }),
);
app.get("/api/documents/:id/members", auth, check, (req, res) => {
  const doc = store.getDoc(req.params.id);
  res.json({
    owner: store.userById(doc.owner),
    members: db
      .prepare(
        "SELECT p.email,p.role,u.name FROM permissions p LEFT JOIN users u ON u.email=p.email WHERE p.document_id=?",
      )
      .all(doc.id),
  });
});
app.put("/api/documents/:id/members", auth, check, (req, res) => {
  if (req.role !== "owner")
    return res
      .status(403)
      .json({ error: "Только владелец может управлять доступом" });
  const email = String(req.body.email || "")
    .trim()
    .toLowerCase();
  const role = req.body.role;
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    !["viewer", "commenter", "editor", "remove"].includes(role)
  )
    return res.status(400).json({ error: "Проверьте email и роль" });
  if (email === req.user.email)
    return res.status(400).json({ error: "Нельзя изменить роль владельца" });
  if (role === "remove")
    db.prepare("DELETE FROM permissions WHERE document_id=? AND email=?").run(
      req.params.id,
      email,
    );
  else
    db.prepare(
      "INSERT INTO permissions VALUES(?,?,?) ON CONFLICT(document_id,email) DO UPDATE SET role=excluded.role",
    ).run(req.params.id, email, role);
  io.to(req.params.id).emit("access-changed");
  for (const client of io.sockets.adapter.rooms.get(req.params.id) || []) {
    const peer = io.sockets.sockets.get(client);
    if (!store.role(req.params.id, peer.data.user)) {
      peer.leave(req.params.id);
      peer.data.documentId = null;
      peer.data.cursor = null;
    }
  }
  presence(req.params.id);
  res.json({ ok: true });
});
app.get("/api/documents/:id/history", auth, check, (req, res) => {
  const entries = db
    .prepare(
      "SELECT h.revision,h.created,u.name,h.changes,EXISTS(SELECT 1 FROM versions v WHERE v.document_id=h.document_id AND v.revision=h.revision) AS restorable FROM history h JOIN users u ON u.id=h.user_id WHERE document_id=? ORDER BY h.id DESC LIMIT 100",
    )
    .all(req.params.id)
    .map((h) => ({ ...h, changes: JSON.parse(h.changes) }));
  const initial = db
    .prepare(
      "SELECT v.revision,v.created,u.name FROM versions v JOIN users u ON u.id=v.user_id WHERE v.document_id=? AND v.revision=0",
    )
    .get(req.params.id);
  if (initial)
    entries.push({ ...initial, restorable: 1, changes: { type: "create" } });
  res.json(entries);
});
app.get("/api/documents/:id/versions/:revision", auth, check, (req, res) => {
  const revision = Number(req.params.revision);
  if (!Number.isInteger(revision) || revision < 0)
    return res.status(400).json({ error: "Неверная версия" });
  const version = db
    .prepare(
      "SELECT revision,title,state,created FROM versions WHERE document_id=? AND revision=?",
    )
    .get(req.params.id, revision);
  if (!version)
    return res
      .status(404)
      .json({ error: "Эта версия недоступна для восстановления" });
  res.json({ ...version, state: JSON.parse(version.state) });
});
const server = createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 4e6,
  allowRequest: (req, callback) =>
    callback(
      null,
      !req.headers.origin ||
        new URL(req.headers.origin).host === req.headers.host,
    ),
});
io.use((socket, next) => {
  const cookies = Object.fromEntries(
    (socket.handshake.headers.cookie || "")
      .split(";")
      .map((c) => c.trim().split("=")),
  );
  const session = db
    .prepare("SELECT user_id FROM sessions WHERE token=? AND expires>?")
    .get(cookies.session || "", Date.now());
  if (!session) return next(new Error("Войдите в аккаунт"));
  socket.data.user = store.userById(session.user_id);
  socket.data.token = cookies.session;
  next();
});
function presence(id) {
  const users = [...(io.sockets.adapter.rooms.get(id) || [])]
    .map((s) => io.sockets.sockets.get(s))
    .filter(Boolean)
    .filter((s) => store.role(id, s.data.user))
    .map((s) => ({
      socketId: s.id,
      id: s.data.user.id,
      name: s.data.user.name,
      color: s.data.color,
      cursor: s.data.cursor,
    }));
  io.to(id).emit("presence", users);
}
io.on("connection", (socket) => {
  socket.data.color = ["#1a73e8", "#a142f4", "#e8710a", "#188038", "#d93025"][
    Math.floor(Math.random() * 5)
  ];
  const validSession = () =>
    !!db
      .prepare("SELECT token FROM sessions WHERE token=? AND expires>?")
      .get(socket.data.token, Date.now());
  socket.on("join", (id, ack) => {
    if (!validSession() || !store.role(id, socket.data.user))
      return ack?.({ error: "Нет доступа" });
    if (socket.data.documentId) {
      const old = socket.data.documentId;
      socket.leave(old);
      presence(old);
    }
    socket.join(id);
    socket.data.documentId = id;
    socket.data.cursor = null;
    ack?.({
      document: { ...store.getDoc(id), role: store.role(id, socket.data.user) },
    });
    presence(id);
  });
  socket.on("operation", (op, ack) => {
    try {
      const id = socket.data.documentId;
      if (!validSession()) throw new Error("Сессия завершена. Войдите заново.");
      if (!id || !op || typeof op !== "object")
        throw new Error("Таблица не открыта");
      const doc = store.apply(id, socket.data.user, op);
      for (const client of io.sockets.adapter.rooms.get(id) || []) {
        const peer = io.sockets.sockets.get(client);
        if (store.role(id, peer.data.user)) peer.emit("document", doc);
        else peer.leave(id);
      }
      ack?.({ ok: true, revision: doc.revision });
    } catch (error) {
      ack?.({ error: error.message, code: error.code, protectionWarnings: error.protectionWarnings, revision: error.revision });
    }
  });
  socket.on("cursor", (cursor) => {
    const id = socket.data.documentId;
    if (!id || !validSession() || !store.role(id, socket.data.user)) return;
    if (
      !cursor ||
      !Number.isInteger(cursor.row) ||
      !Number.isInteger(cursor.col) ||
      cursor.row < 0 ||
      cursor.row >= 10000 ||
      cursor.col < 0 ||
      cursor.col >= 200
    )
      return;
    socket.data.cursor = {
      row: cursor.row,
      col: cursor.col,
      sheetId: String(cursor.sheetId).slice(0, 60),
    };
    presence(id);
  });
  socket.on("disconnect", () => {
    if (socket.data.documentId) presence(socket.data.documentId);
  });
});
app.use(express.static(path.join(root, "dist")));
app.get("/{*path}", (req, res) =>
  res.sendFile(path.join(root, "dist/index.html")),
);
app.use((error, req, res, next) => {
  console.error(error.message);
  res.status(error.status || 500).json({
    error:
      error.status === 400
        ? "Некорректный запрос"
        : "Внутренняя ошибка сервера",
  });
});
const port = Number(process.env.PORT || 3001);
server.listen(port, "0.0.0.0", () =>
  console.log(`Таблицы: http://localhost:${port}`),
);
