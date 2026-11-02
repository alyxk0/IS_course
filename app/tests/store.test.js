import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../server/store.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";

function setup() {
  const store = createStore(":memory:");
  const owner = { id: "owner", email: "owner@example.com", name: "Owner" },
    editor = { id: "editor", email: "editor@example.com", name: "Editor" },
    viewer = { id: "viewer", email: "viewer@example.com", name: "Viewer" };
  for (const u of [owner, editor, viewer])
    store.db
      .prepare("INSERT INTO users VALUES(?,?,?,?)")
      .run(u.id, u.email, u.name, "hash");
  const doc = store.createDoc(owner);
  return { store, owner, editor, viewer, doc, sheetId: doc.state.sheets[0].id };
}
test("merges enforce data-loss confirmation, covered cells, filter and frozen boundaries", () => {
  const { store, owner, viewer, doc, sheetId } = setup(),
    range = { r: 0, c: 0, r2: 1, c2: 1 };
  const apply = (op) => store.apply(doc.id, owner, { sheetId, ...op });
  apply({
    type: "cells",
    changes: [
      { key: "0,0", cell: { value: "Keep" } },
      { key: "1,1", cell: { value: "Discard" } },
    ],
  });
  assert.throws(
    () => apply({ type: "merge", range, action: "merge" }),
    /Подтвердите/,
  );
  assert.equal(
    store.getDoc(doc.id).state.sheets[0].cells["1,1"].value,
    "Discard",
  );
  let next = apply({ type: "merge", range, action: "merge", discard: true });
  assert.deepEqual(next.state.sheets[0].merges, [range]);
  assert.equal(next.state.sheets[0].cells["1,1"].value, "");
  assert.throws(
    () =>
      apply({
        type: "cells",
        changes: [{ key: "1,0", cell: { value: "Hidden" } }],
      }),
    /объединённой/,
  );
  assert.throws(() => apply({ type: "freeze", rows: 1 }), /пересекает/);
  assert.throws(
    () =>
      apply({
        type: "filter",
        filter: { range: { r: 0, c: 0, r2: 3, c2: 2 }, criteria: {} },
      }),
    /пересекает/,
  );
  next = apply({
    type: "merge",
    range: { r: 1, c: 1, r2: 1, c2: 1 },
    action: "unmerge",
  });
  assert.deepEqual(next.state.sheets[0].merges, []);
  apply({ type: "freeze", rows: 1 });
  assert.throws(
    () => apply({ type: "merge", range, action: "merge", discard: true }),
    /закреплённые/,
  );
  store.db
    .prepare("INSERT INTO permissions VALUES(?,?,?)")
    .run(doc.id, viewer.email, "viewer");
  assert.throws(
    () =>
      store.apply(doc.id, viewer, {
        type: "merge",
        sheetId,
        range,
        action: "merge",
        discard: true,
      }),
    /прав/,
  );
  store.db.close();
});
test("filter conditions and merge ranges follow structural edits", () => {
  const { store, owner, doc, sheetId } = setup();
  const apply = (op) => store.apply(doc.id, owner, { sheetId, ...op });
  apply({
    type: "filter",
    filter: {
      range: { r: 0, c: 0, r2: 4, c2: 2 },
      criteria: { 1: { values: ["Москва"] } },
    },
  });
  assert.throws(
    () =>
      apply({
        type: "filter",
        filter: {
          range: { r: 0, c: 0, r2: 4, c2: 2 },
          criteria: { 5: { values: ["bad"] } },
        },
      }),
    /условия/,
  );
  apply({
    type: "merge",
    action: "merge",
    range: { r: 6, c: 0, r2: 7, c2: 2 },
  });
  let next = apply({
    type: "structure",
    axis: "col",
    action: "insert",
    index: 0,
    count: 1,
  });
  assert.deepEqual(next.state.sheets[0].filter.range, {
    r: 0,
    c: 1,
    r2: 4,
    c2: 3,
  });
  assert.deepEqual(next.state.sheets[0].filter.criteria, {
    2: { values: ["Москва"] },
  });
  assert.deepEqual(next.state.sheets[0].merges, [{ r: 6, c: 1, r2: 7, c2: 3 }]);
  next = apply({
    type: "structure",
    axis: "row",
    action: "delete",
    index: 0,
    count: 4,
  });
  assert.equal(next.state.sheets[0].filter, null);
  assert.deepEqual(next.state.sheets[0].merges, [{ r: 2, c: 1, r2: 3, c2: 3 }]);
  store.db.close();
});
test("restoring a version is atomic, guarded against concurrent edits and preserves access", () => {
  const { store, owner, editor, viewer, doc, sheetId } = setup();
  store.db
    .prepare("INSERT INTO permissions VALUES(?,?,?)")
    .run(doc.id, viewer.email, "viewer");
  store.db
    .prepare("INSERT INTO permissions VALUES(?,?,?)")
    .run(doc.id, editor.email, "editor");
  store.apply(doc.id, owner, {
    type: "cells",
    sheetId,
    changes: [{ key: "0,0", cell: { value: "old" } }],
  });
  store.apply(doc.id, editor, {
    type: "cells",
    sheetId,
    changes: [{ key: "0,0", cell: { value: "new" } }],
  });
  assert.throws(
    () =>
      store.apply(doc.id, owner, {
        type: "restore",
        revision: 1,
        expectedRevision: 1,
      }),
    /изменилась/,
  );
  assert.throws(
    () =>
      store.apply(doc.id, viewer, {
        type: "restore",
        revision: 1,
        expectedRevision: 2,
      }),
    /прав/,
  );
  const next = store.apply(doc.id, editor, {
    type: "restore",
    revision: 1,
    expectedRevision: 2,
  });
  assert.equal(next.revision, 3);
  assert.equal(next.state.sheets[0].cells["0,0"].value, "old");
  assert.equal(store.role(doc.id, viewer), "viewer");
  assert.equal(store.role(doc.id, editor), "editor");
  assert.equal(
    JSON.parse(
      store.db
        .prepare(
          "SELECT state FROM versions WHERE document_id=? AND revision=2",
        )
        .get(doc.id).state,
    ).sheets[0].cells["0,0"].value,
    "new",
  );
  store.db.close();
});
test("an invalid imported merged range rolls back cell values and revision", () => {
  const { store, owner, doc, sheetId } = setup();
  store.apply(doc.id, owner, {
    type: "cells",
    sheetId,
    changes: [{ key: "0,1", cell: { value: "Existing" } }],
  });
  assert.throws(
    () =>
      store.apply(doc.id, owner, {
        type: "import-range",
        sheetId,
        changes: [{ key: "0,0", cell: { value: "Imported" } }],
        merges: [{ r: 0, c: 0, r2: 1, c2: 1 }],
      }),
    /существующие/,
  );
  const next = store.getDoc(doc.id);
  assert.equal(next.revision, 1);
  assert.equal(next.state.sheets[0].cells["0,0"], undefined);
  assert.equal(next.state.sheets[0].cells["0,1"].value, "Existing");
  store.db.close();
});
test("documents, sessions and permissions survive database reopening", () => {
  const filename = join(tmpdir(), `open-sheets-${randomUUID()}.sqlite`);
  let store = createStore(filename);
  try {
    const user = {
      id: "u1",
      email: "persist@example.com",
      name: "Persistence",
    };
    store.db
      .prepare("INSERT INTO users VALUES(?,?,?,?)")
      .run(user.id, user.email, user.name, "hash");
    const doc = store.createDoc(user);
    store.db
      .prepare("INSERT INTO permissions VALUES(?,?,?)")
      .run(doc.id, "reader@example.com", "viewer");
    store.db
      .prepare("INSERT INTO sessions VALUES(?,?,?)")
      .run("test-session", user.id, Date.now() + 60000);
    store.apply(doc.id, user, {
      type: "cells",
      sheetId: doc.state.sheets[0].id,
      changes: [{ key: "0,0", cell: { value: "saved" } }],
    });
    store.db.close();
    store = createStore(filename);
    assert.equal(
      store.getDoc(doc.id).state.sheets[0].cells["0,0"].value,
      "saved",
    );
    assert.equal(
      store.role(doc.id, { id: "u2", email: "reader@example.com" }),
      "viewer",
    );
    assert.equal(
      store.db
        .prepare("SELECT user_id FROM sessions WHERE token=?")
        .get("test-session").user_id,
      user.id,
    );
  } finally {
    store.db.close();
    for (const suffix of ["", "-wal", "-shm"])
      rmSync(filename + suffix, { force: true });
  }
});
test("rights are checked server-side, including comments and revocation", () => {
  const { store, owner, editor, viewer, doc, sheetId } = setup();
  const op = {
    type: "cells",
    sheetId,
    changes: [{ key: "0,0", cell: { value: "42" } }],
  };
  assert.throws(() => store.apply(doc.id, viewer, op), /прав/);
  store.db
    .prepare("INSERT INTO permissions VALUES(?,?,?)")
    .run(doc.id, viewer.email, "viewer");
  assert.throws(() => store.apply(doc.id, viewer, op), /прав/);
  store.db
    .prepare("UPDATE permissions SET role=? WHERE email=?")
    .run("commenter", viewer.email);
  assert.throws(() => store.apply(doc.id, viewer, op), /прав/);
  store.apply(doc.id, viewer, {
    type: "comment",
    sheetId,
    key: "0,0",
    text: "Review",
  });
  assert.equal(store.getDoc(doc.id).state.comments.length, 1);
  store.db
    .prepare("INSERT INTO permissions VALUES(?,?,?)")
    .run(doc.id, editor.email, "editor");
  store.apply(doc.id, editor, op);
  assert.equal(store.getDoc(doc.id).state.sheets[0].cells["0,0"].value, "42");
  store.db.prepare("DELETE FROM permissions WHERE email=?").run(editor.email);
  assert.throws(() => store.apply(doc.id, editor, op), /прав/);
  store.db.close();
});
test("independent changes merge and undo never overwrites a collaborator", () => {
  const { store, owner, editor, doc, sheetId } = setup();
  store.db
    .prepare("INSERT INTO permissions VALUES(?,?,?)")
    .run(doc.id, editor.email, "editor");
  store.apply(doc.id, owner, {
    type: "cells",
    sheetId,
    changes: [{ key: "0,0", cell: { value: "first" } }],
  });
  store.apply(doc.id, editor, {
    type: "cells",
    sheetId,
    changes: [
      { key: "0,1", cell: { value: "parallel" } },
      { key: "0,0", cell: { value: "collaborator" } },
    ],
  });
  store.apply(doc.id, owner, {
    type: "cells",
    sheetId,
    changes: [{ key: "0,0", cell: null, expected: { value: "first" } }],
  });
  const cells = store.getDoc(doc.id).state.sheets[0].cells;
  assert.equal(cells["0,0"].value, "collaborator");
  assert.equal(cells["0,1"].value, "parallel");
  assert.equal(store.getDoc(doc.id).revision, 3);
  store.db.close();
});
test("invalid batch rolls back atomically and last sheet cannot be deleted", () => {
  const { store, owner, doc, sheetId } = setup();
  assert.throws(() =>
    store.apply(doc.id, owner, {
      type: "cells",
      sheetId,
      changes: [
        { key: "0,0", cell: { value: "valid" } },
        { key: "99999999,0", cell: { value: "invalid" } },
      ],
    }),
  );
  assert.deepEqual(store.getDoc(doc.id).state.sheets[0].cells, {});
  assert.equal(store.getDoc(doc.id).revision, 0);
  assert.throws(
    () => store.apply(doc.id, owner, { type: "sheet-delete", sheetId }),
    /единственный/,
  );
  store.db.close();
});
test("structural operations update formulas across sheets and move formatting", () => {
  const { store, owner, doc, sheetId } = setup();
  store.apply(doc.id, owner, {
    type: "cells",
    sheetId,
    changes: [
      { key: "0,0", cell: { value: "10", style: { bold: true } } },
      { key: "1,0", cell: { value: "20" } },
      { key: "0,1", cell: { value: "=SUM(A1:A2)" } },
    ],
  });
  let next = store.apply(doc.id, owner, { type: "sheet-add" });
  const second = next.state.sheets[1].id;
  store.apply(doc.id, owner, {
    type: "cells",
    sheetId: second,
    changes: [{ key: "0,0", cell: { value: "='Лист1'!A1" } }],
  });
  next = store.apply(doc.id, owner, {
    type: "structure",
    sheetId,
    axis: "row",
    action: "insert",
    index: 0,
    count: 1,
  });
  assert.equal(next.state.sheets[0].cells["1,0"].style.bold, true);
  assert.equal(next.state.sheets[0].cells["1,1"].value, "=SUM(A2:A3)");
  assert.match(next.state.sheets[1].cells["0,0"].value, /A2$/);
  next = store.apply(doc.id, owner, {
    type: "sheet-rename",
    sheetId,
    name: "Данные",
  });
  assert.match(next.state.sheets[1].cells["0,0"].value, /Данные/);
  next = store.apply(doc.id, owner, {
    type: "structure",
    sheetId,
    axis: "row",
    action: "delete",
    index: 1,
    count: 1,
  });
  assert.match(next.state.sheets[1].cells["0,0"].value, /#REF!/);
  store.db.close();
});
