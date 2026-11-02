import { io } from "socket.io-client";
const uniqueId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
async function request(path, options = {}, timeout = 10000) {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch("/api" + path, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
      signal: controller.signal,
    });
    const result = await response.json();
    if (!response.ok)
      throw Object.assign(new Error(result.error || "Ошибка запроса"), {
        status: response.status,
        code: result.code, protectionWarnings: result.protectionWarnings, revision: result.revision,
      });
    return result;
  } finally {
    clearTimeout(timer);
  }
}
class PollingClient {
  constructor(interval) {
    this.interval = interval;
    this.id = uniqueId();
    this.listeners = new Map();
    this.connected = false;
    this.closed = false;
    this.revision = -1;
    this.structureRevision = 0;
    this.cursor = null;
    this.lastHeartbeat = 0;
    this.generation = 0;
  }
  on(event, callback) {
    const list = this.listeners.get(event) || [];
    list.push(callback);
    this.listeners.set(event, list);
    return this;
  }
  fire(event, payload) {
    for (const callback of this.listeners.get(event) || []) callback(payload);
  }
  async connect() {
    this.closed = false;
    try {
      const { user } = await request("/me");
      if (this.closed) return;
      if (!user)
        throw Object.assign(new Error("Войдите в аккаунт"), { status: 401 });
      this.connected = true;
      this.fire("connect");
    } catch (error) {
      if (!this.closed) {
        this.fire("connect_error", error);
        this.fail(error);
      }
    }
    return this;
  }
  fail(error) {
    if (this.closed) return;
    if (error.status === 401 || error.status === 403) {
      this.fire("access-changed");
      return;
    }
    if (this.connected) {
      this.connected = false;
      this.fire("disconnect");
    }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (!this.closed) this.connect();
    }, 1500);
  }
  accept(document) {
    if (!document || document.revision < this.revision) return;
    const changed = document.revision !== this.revision,
      structural = document.structureRevision > this.structureRevision;
    this.revision = document.revision;
    this.structureRevision = document.structureRevision || 0;
    this.role = document.role;
    if (changed)
      this.fire("document", {
        ...document,
        changeType: structural ? "structure" : document.changeType,
      });
  }
  async join(id, ack) {
    const generation = ++this.generation;
    clearTimeout(this.timer);
    this.documentId = id;
    this.revision = -1;
    try {
      const result = await request(`/documents/${id}/join`, {
        method: "POST",
        body: JSON.stringify({ clientId: this.id }),
      });
      if (this.closed || generation !== this.generation) return;
      this.revision = result.document.revision;
      this.structureRevision = result.document.structureRevision || 0;
      this.role = result.document.role;
      this.lastHeartbeat = Date.now();
      ack?.({ document: result.document });
      this.fire("presence", result.people);
      this.schedule(generation);
    } catch (error) {
      ack?.({ error: error.message });
      this.fail(error);
    }
  }
  schedule(generation) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.poll(generation), this.interval);
  }
  async poll(generation) {
    if (this.closed || generation !== this.generation || !this.documentId)
      return;
    try {
      const result = await request(
        `/documents/${this.documentId}/poll?revision=${this.revision}`,
        {},
        8000,
      );
      if (this.closed || generation !== this.generation) return;
      if (result.role !== this.role) {
        this.role = result.role;
        this.fire("access-changed");
      }
      if (result.document) this.accept(result.document);
      this.fire("presence", result.people);
      if (Date.now() - this.lastHeartbeat > 5000) await this.heartbeat();
      if (!this.closed && generation === this.generation)
        this.schedule(generation);
    } catch (error) {
      this.fail(error);
    }
  }
  async heartbeat() {
    if (!this.documentId || this.closed) return;
    const cursor = this.cursor;
    this.lastHeartbeat = Date.now();
    await request(
      `/documents/${this.documentId}/presence`,
      { method: "POST", body: JSON.stringify({ clientId: this.id, cursor }) },
      8000,
    );
  }
  emit(event, payload, ack) {
    if (event === "join") {
      this.join(payload, ack);
      return this;
    }
    if (event === "cursor") {
      this.cursor = payload;
      if (this.connected && this.documentId && !this.cursorTimer)
        this.cursorTimer = setTimeout(() => {
          this.cursorTimer = null;
          this.heartbeat().catch((e) => this.fail(e));
        }, 100);
      return this;
    }
    return this;
  }
  timeout(ms) {
    return {
      emit: (event, payload, ack) =>
        this.sendOperation(event, payload, ack, ms),
    };
  }
  async sendOperation(event, operation, ack, timeout) {
    if (event !== "operation" || !this.connected || !this.documentId) {
      ack?.(null, { error: "Нет соединения с таблицей" });
      return;
    }
    const id = this.documentId,
      generation = this.generation,
      requestId = uniqueId();
    try {
      const result = await request(
        `/documents/${id}/operations`,
        { method: "POST", body: JSON.stringify({ operation, requestId }) },
        timeout,
      );
      if (!this.closed && generation === this.generation)
        this.accept(result.document);
      ack?.(null, { ok: true, revision: result.revision });
    } catch (error) {
      if (error.status === 401 || error.status === 403 && error.code !== "protected_range") this.fail(error);
      ack?.(error.status ? null : error, { error: error.message, code: error.code, protectionWarnings: error.protectionWarnings, revision: error.revision });
    }
  }
  disconnect() {
    this.closed = true;
    this.generation++;
    clearTimeout(this.timer);
    clearTimeout(this.cursorTimer);
    this.cursorTimer = null;
    const was = this.connected;
    this.connected = false;
    if (this.documentId) {
      request(
        `/documents/${this.documentId}/leave`,
        {
          method: "POST",
          body: JSON.stringify({ clientId: this.id }),
          keepalive: true,
        },
        3000,
      ).catch(() => {});
    }
    if (was) this.fire("disconnect");
    return this;
  }
}
export function createRealtime() {
  let client = null,
    closed = false,
    starting = false,
    retry;
  const listeners = new Map();
  const facade = {
    get connected() {
      return !!client?.connected;
    },
    get id() {
      return client?.id;
    },
    on(event, callback) {
      const list = listeners.get(event) || [];
      list.push(callback);
      listeners.set(event, list);
      client?.on(event, callback);
      return facade;
    },
    async connect() {
      if (starting || client) return facade;
      starting = true;
      closed = false;
      try {
        const runtime = await request("/runtime");
        if (closed) return facade;
        client =
          runtime.transport === "poll"
            ? new PollingClient(runtime.intervalMs || 750)
            : io({ autoConnect: false });
        for (const [event, callbacks] of listeners)
          for (const callback of callbacks) client.on(event, callback);
        client.connect();
      } catch (error) {
        if (!closed) {
          for (const callback of listeners.get("connect_error") || [])
            callback(error);
          retry = setTimeout(() => facade.connect(), 1500);
        }
      } finally {
        starting = false;
      }
      return facade;
    },
    emit(event, payload, ack) {
      client?.emit(event, payload, ack);
      return facade;
    },
    timeout(ms) {
      return {
        emit: (event, payload, ack) =>
          client
            ? client.timeout(ms).emit(event, payload, ack)
            : ack?.(null, { error: "Нет соединения" }),
      };
    },
    disconnect() {
      closed = true;
      clearTimeout(retry);
      client?.disconnect();
      return facade;
    },
  };
  return facade;
}
