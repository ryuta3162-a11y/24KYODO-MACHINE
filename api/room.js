import { put, list } from "@vercel/blob";

const MAX_HISTORY = 40;
const PLANS = {
  "kyodo-2f": { w: 3388, h: 2058, pxPerCm: 1 },
  "kyodo-3f": { w: 2313, h: 1438, pxPerCm: 1 },
};

function planFor(roomId) {
  return PLANS[roomId] || PLANS["kyodo-2f"];
}

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
    plan: planFor(roomId),
    updatedAt: null,
    updatedBy: null,
    items: [],
    zones: [],
    history: [],
  };
}

function normalizeZones(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((z) => {
      if (!z || typeof z !== "object") return null;
      const type = z.type === "circle" ? "circle" : "rect";
      const uid = String(z.uid || "").trim() || crypto.randomUUID();
      const label = String(z.label || "").trim().slice(0, 40);
      const color = String(z.color || "rgba(213,216,220,0.45)").slice(0, 64);
      const labelDx = Number(z.labelDx);
      const labelDy = Number(z.labelDy);
      const meta = {
        uid,
        type,
        label,
        color,
        labelDx: Number.isFinite(labelDx) ? labelDx : 0,
        labelDy: Number.isFinite(labelDy) ? labelDy : 0,
        flipX: !!z.flipX,
        flipY: !!z.flipY,
        vertical: !!z.vertical,
      };
      if (type === "circle") {
        const cx = Number(z.cx);
        const cy = Number(z.cy);
        const r = Number(z.r);
        if (![cx, cy, r].every(Number.isFinite) || r < 4) return null;
        return { ...meta, cx, cy, r };
      }
      const x = Number(z.x);
      const y = Number(z.y);
      const w = Number(z.w);
      const h = Number(z.h);
      if (![x, y, w, h].every(Number.isFinite) || w < 4 || h < 4) return null;
      return { ...meta, x, y, w, h };
    })
    .filter(Boolean);
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
      if (!Array.isArray(data.zones)) data.zones = [];
      return res.status(200).json({ ok: true, data });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const items = Array.isArray(body.items) ? body.items : null;
      if (!items) return bad(res, 400, "items required");
      const zones = normalizeZones(body.zones);

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
        zoneCount: zones.length,
        items,
        zones,
      };
      const history = [entry, ...(current.history || [])].slice(0, MAX_HISTORY);

      const next = {
        roomId,
        plan: planFor(roomId),
        updatedAt: now,
        updatedBy: by,
        items,
        zones,
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
          zones,
          savedEntry: entry,
          history: history.map(({ id, at, by, note, count, zoneCount }) => ({
            id,
            at,
            by,
            note,
            count,
            zoneCount,
          })),
        },
      });
    }

    return bad(res, 405, "method not allowed");
  } catch (err) {
    console.error(err);
    return bad(res, 500, err?.message || "server error");
  }
}
