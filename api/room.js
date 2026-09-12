import { put, list } from "@vercel/blob";

const MAX_HISTORY = 40;
const PLAN = { w: 3388, h: 2058, pxPerCm: 1 };

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function bad(res, code, message) {
  return res.status(code).json({ ok: false, error: message });
}

function safeRoomId(raw) {
  const id = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 48);
  return id || "kyodo-2f";
}

function pathnameFor(roomId) {
  return `rooms/${roomId}.json`;
}

async function readRoom(roomId) {
  const path = pathnameFor(roomId);
  const listed = await list({ prefix: path, limit: 1 });
  const blob = listed.blobs.find((b) => b.pathname === path);
  if (!blob) return null;
  const res = await fetch(blob.url, {
    headers: {
      Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
    },
  });
  if (!res.ok) return null;
  return res.json();
}

function emptyRoom(roomId) {
  return {
    roomId,
    plan: PLAN,
    updatedAt: null,
    updatedBy: null,
    items: [],
    history: [],
  };
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    const roomId = safeRoomId(req.query.id || req.query.room || "kyodo-2f");

    if (req.method === "GET") {
      const data = (await readRoom(roomId)) || emptyRoom(roomId);
      return res.status(200).json({ ok: true, data });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const items = Array.isArray(body.items) ? body.items : null;
      if (!items) return bad(res, 400, "items required");

      const by = String(body.by || "anonymous").trim().slice(0, 40) || "anonymous";
      const note = String(body.note || "").trim().slice(0, 80);
      const now = new Date().toISOString();
      const entryId = crypto.randomUUID();

      const current = (await readRoom(roomId)) || emptyRoom(roomId);
      const entry = {
        id: entryId,
        at: now,
        by,
        note,
        count: items.length,
        items,
      };
      const history = [entry, ...(current.history || [])].slice(0, MAX_HISTORY);

      const next = {
        roomId,
        plan: PLAN,
        updatedAt: now,
        updatedBy: by,
        items,
        history,
      };

      await put(pathnameFor(roomId), JSON.stringify(next), {
        access: "private",
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: true,
      });

      return res.status(200).json({
        ok: true,
        data: {
          roomId,
          updatedAt: now,
          updatedBy: by,
          items,
          savedEntry: entry,
          history: history.map(({ id, at, by, note, count }) => ({ id, at, by, note, count })),
        },
      });
    }

    return bad(res, 405, "method not allowed");
  } catch (err) {
    console.error(err);
    return bad(res, 500, err?.message || "server error");
  }
}
