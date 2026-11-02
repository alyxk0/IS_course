import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { bodyLimit } from "hono/body-limit";
import bcrypt from "bcryptjs";
import { createD1Store, failure } from "./d1Store.js";

export const app = new Hono();
app.use(
  "/api/*",
  bodyLimit({
    maxSize: 4 * 1024 * 1024,
    onError: (c) => c.json({ error: "Запрос превышает 4 МБ" }, 413),
  }),
);
app.use("/api/*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "same-origin");
  const origin = c.req.header("Origin");
  if (
    c.req.method !== "GET" &&
    origin &&
    new URL(origin).host !== new URL(c.req.url).host
  )
    return c.json({ error: "Недопустимый источник запроса" }, 403);
  if (!c.env.DB) return c.json({ error: "База данных не подключена" }, 503);
  const store = createD1Store(c.env.DB),
    token = getCookie(c, "session") || "";
  c.set("store", store);
  c.set("token", token);
  c.set("user", token ? await store.userBySession(token) : null);
  await next();
});
app.get("/api/runtime", (c) => c.json({ transport: "poll", intervalMs: 750 }));
app.get("/api/me", (c) => c.json({ user: c.get("user") }));
app.post("/api/auth/:action", async (c) => {
  const store = c.get("store"),
    ip = c.req.header("CF-Connecting-IP") || "local",
    digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(ip),
    ),
    key = Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join(""),
    now = Date.now();
  await store
    .prepare(
      "INSERT INTO auth_rate(key,attempts,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires<? THEN 1 ELSE attempts+1 END,expires=CASE WHEN expires<? THEN ? ELSE expires END",
      key,
      now + 60000,
      now,
      now,
      now + 60000,
    )
    .run();
  const rate = await store
    .prepare("SELECT attempts FROM auth_rate WHERE key=?", key)
    .first();
  if (rate.attempts > 30)
    return c.json(
      { error: "Слишком много попыток. Попробуйте через минуту." },
      429,
    );
  const data = await c.req.json(),
    email = String(data.email || "")
      .trim()
      .toLowerCase(),
    password = data.password,
    action = c.req.param("action");
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    typeof password !== "string" ||
    password.length < 8 ||
    password.length > 128
  )
    return c.json(
      { error: "Введите email и пароль длиной от 8 до 128 символов" },
      400,
    );
  let user = await store
    .prepare("SELECT * FROM users WHERE email=?", email)
    .first();
  if (action === "register") {
    if (
      typeof data.name !== "string" ||
      !data.name.trim() ||
      data.name.length > 80
    )
      return c.json({ error: "Введите ваше имя" }, 400);
    if (user) return c.json({ error: "Этот email уже зарегистрирован" }, 409);
    const id = crypto.randomUUID(),
      passwordHash = await bcrypt.hash(password, 12);
    try {
      await store
        .prepare(
          "INSERT INTO users(id,email,name,password) VALUES(?,?,?,?)",
          id,
          email,
          data.name.trim(),
          passwordHash,
        )
        .run();
    } catch (error) {
      if (String(error).includes("UNIQUE"))
        return c.json({ error: "Этот email уже зарегистрирован" }, 409);
      throw error;
    }
    user = { id, email, name: data.name.trim() };
  } else if (action === "login") {
    if (!user || !(await bcrypt.compare(password, user.password)))
      return c.json({ error: "Неверный email или пароль" }, 401);
  } else return c.json({ error: "Неизвестное действие" }, 404);
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  await store
    .prepare(
      "INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)",
      token,
      user.id,
      now + 30 * 86400000,
    )
    .run();
  setCookie(c, "session", token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: new URL(c.req.url).protocol === "https:",
    maxAge: 30 * 86400,
    path: "/",
  });
  return c.json({ id: user.id, email: user.email, name: user.name });
});
app.use("/api/*", async (c, next) => {
  if (!c.get("user")) return c.json({ error: "Войдите в аккаунт" }, 401);
  await next();
});
app.post("/api/logout", async (c) => {
  await c
    .get("store")
    .prepare("DELETE FROM sessions WHERE token=?", c.get("token"))
    .run();
  deleteCookie(c, "session", { path: "/" });
  return c.json({ ok: true });
});
app.get("/api/documents", async (c) => {
  const user = c.get("user"),
    result = await c
      .get("store")
      .prepare(
        `SELECT DISTINCT d.id,d.title,d.updated,d.owner,u.name AS ownerName FROM documents d JOIN users u ON u.id=d.owner LEFT JOIN permissions p ON p.document_id=d.id WHERE d.owner=? OR p.email=? ORDER BY d.updated DESC`,
        user.id,
        user.email,
      )
      .all();
  return c.json(result.results);
});
app.post("/api/documents", async (c) =>
  c.json(await c.get("store").createDocument(c.get("user"), c.get("token"))),
);
app.use("/api/documents/:id/*", async (c, next) => {
  const doc = await c
    .get("store")
    .getDoc(c.req.param("id"), c.get("user"), c.get("token"), false);
  c.set("document", doc);
  await next();
});
app.get("/api/documents/:id", async (c) =>
  c.json(
    await c
      .get("store")
      .getDoc(c.req.param("id"), c.get("user"), c.get("token")),
  ),
);
app.get("/api/documents/:id/members", async (c) => {
  const store = c.get("store"),
    doc = c.get("document"),
    owner = await store
      .prepare("SELECT id,email,name FROM users WHERE id=?", doc.owner)
      .first(),
    members = await store
      .prepare(
        "SELECT p.email,p.role,u.name FROM permissions p LEFT JOIN users u ON u.email=p.email WHERE p.document_id=?",
        doc.id,
      )
      .all();
  return c.json({ owner, members: members.results });
});
app.put("/api/documents/:id/members", async (c) => {
  const user = c.get("user"),
    doc = c.get("document"),
    store = c.get("store");
  if (doc.role !== "owner")
    return c.json({ error: "Только владелец может управлять доступом" }, 403);
  const data = await c.req.json(),
    email = String(data.email || "")
      .trim()
      .toLowerCase(),
    role = data.role;
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    !["viewer", "commenter", "editor", "remove"].includes(role)
  )
    return c.json({ error: "Проверьте email и роль" }, 400);
  if (email === user.email)
    return c.json({ error: "Нельзя изменить роль владельца" }, 400);
  const sessionValid =
      "EXISTS(SELECT 1 FROM sessions WHERE token=? AND user_id=? AND expires>?)",
    args = [c.get("token"), user.id, Date.now()];
  if (role === "remove")
    await store
      .prepare(
        `DELETE FROM permissions WHERE document_id=? AND email=? AND ${sessionValid}`,
        doc.id,
        email,
        ...args,
      )
      .run();
  else
    await store
      .prepare(
        `INSERT INTO permissions(document_id,email,role) SELECT ?,?,? WHERE ${sessionValid} ON CONFLICT(document_id,email) DO UPDATE SET role=excluded.role`,
        doc.id,
        email,
        role,
        ...args,
      )
      .run();
  if (role === "remove")
    await store
      .prepare(
        "DELETE FROM presence WHERE document_id=? AND user_id IN(SELECT id FROM users WHERE email=?)",
        doc.id,
        email,
      )
      .run();
  return c.json({ ok: true });
});
app.get("/api/documents/:id/history", async (c) => {
  const store = c.get("store"),
    id = c.req.param("id"),
    result = await store
      .prepare(
        "SELECT h.revision,h.created,u.name,h.changes,EXISTS(SELECT 1 FROM versions v WHERE v.document_id=h.document_id AND v.revision=h.revision) AS restorable FROM history h JOIN users u ON u.id=h.user_id WHERE h.document_id=? ORDER BY h.id DESC LIMIT 100",
        id,
      )
      .all(),
    entries = result.results.map((h) => ({
      ...h,
      changes: JSON.parse(h.changes),
    }));
  const initial = await store
    .prepare(
      "SELECT v.revision,v.created,u.name FROM versions v JOIN users u ON u.id=v.user_id WHERE v.document_id=? AND v.revision=0",
      id,
    )
    .first();
  if (initial)
    entries.push({ ...initial, restorable: 1, changes: { type: "create" } });
  return c.json(entries);
});
app.get("/api/documents/:id/versions/:revision", async (c) => {
  const revision = Number(c.req.param("revision"));
  if (!Number.isInteger(revision) || revision < 0)
    throw failure("Неверная версия");
  const version = await c.get("store").getVersion(c.req.param("id"), revision);
  return c.json({ ...version, state: JSON.parse(version.state) });
});
app.post("/api/documents/:id/operations", async (c) => {
  const data = await c.req.json(),
    doc = await c
      .get("store")
      .apply(
        c.req.param("id"),
        c.get("user"),
        c.get("token"),
        data.operation,
        data.requestId,
      );
  return c.json({ ok: true, revision: doc.ackRevision, document: doc });
});
app.post("/api/documents/:id/join", async (c) => {
  const data = await c.req.json(),
    store = c.get("store"),
    id = c.req.param("id");
  await store.updatePresence(
    id,
    c.get("user"),
    c.get("token"),
    data.clientId,
    null,
  );
  return c.json({
    document: await store.getDoc(id, c.get("user"), c.get("token")),
    people: await store.people(id),
  });
});
app.post("/api/documents/:id/presence", async (c) => {
  const data = await c.req.json();
  await c
    .get("store")
    .updatePresence(
      c.req.param("id"),
      c.get("user"),
      c.get("token"),
      data.clientId,
      data.cursor ?? null,
    );
  return c.json({ ok: true });
});
app.post("/api/documents/:id/leave", async (c) => {
  const { clientId } = await c.req.json();
  await c
    .get("store")
    .prepare(
      "DELETE FROM presence WHERE document_id=? AND client_id=? AND user_id=?",
      c.req.param("id"),
      String(clientId || ""),
      c.get("user").id,
    )
    .run();
  return c.json({ ok: true });
});
app.get("/api/documents/:id/poll", async (c) => {
  const store = c.get("store"),
    doc = c.get("document"),
    revision = Number(c.req.query("revision") ?? -1);
  return c.json({
    revision: doc.revision,
    role: doc.role,
    structureRevision: doc.structure_revision,
    ...(doc.revision !== revision
      ? { document: await store.getDoc(doc.id, c.get("user"), c.get("token")) }
      : {}),
    people: await store.people(doc.id),
  });
});
app.all("/api/*", (c) => c.json({ error: "Неизвестный API-запрос" }, 404));
app.onError((error, c) => {
  if (error.status) return c.json({ error: error.message, code: error.code, protectionWarnings: error.protectionWarnings, revision: error.revision }, error.status);
  console.error("Worker request failed", error.message);
  return c.json({ error: "Внутренняя ошибка сервера" }, 500);
});
export default app;
