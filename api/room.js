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
      const type = z.type === "circle" ? "circle" : z.type === "text" ? "text" : "rect";
      const uid = String(z.uid || "").trim() || crypto.randomUUID();
      const label = String(z.label || "")
        .trim()
        .slice(0, type === "text" ? 80 : 40);
      const color =
        type === "text"
          ? "transparent"
          : String(z.color || "rgba(213,216,220,0.45)").slice(0, 64);
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
      if (type === "text") {
        const x = Number(z.x);
        const y = Number(z.y);
        if (![x, y].every(Number.isFinite) || !label) return null;
        return { ...meta, x, y };
      }
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
      const auto = body.auto === true || note === "自動保存";
      const force = body.force === true;
      const baseUpdatedAt = body.baseUpdatedAt != null ? String(body.baseUpdatedAt) : "";
      const now = new Date().toISOString();
      const entryId = crypto.randomUUID();

      const current = (await readRoom(roomId)) || emptyRoom(roomId);

      // 版が違う保存は拒否（古いタブの部分上書きを防ぐ）。force のみ上書き可
      if (
        !force &&
        baseUpdatedAt &&
        current.updatedAt &&
        baseUpdatedAt !== String(current.updatedAt)
      ) {
        return res.status(409).json({
          ok: false,
          error: "version_conflict",
          message: "他の保存と競合しています",
          data: {
            roomId,
            updatedAt: current.updatedAt,
            updatedBy: current.updatedBy,
            items: current.items || [],
            zones: current.zones || [],
            history: (current.history || []).slice(0, 40).map(({ id, at, by, note, count, zoneCount }) => ({
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

      // 自動保存かつ base 未送信のときだけ、件数減少の粗ガード
      if (auto && !baseUpdatedAt) {
        const curItems = Array.isArray(current.items) ? current.items.length : 0;
        const curZones = Array.isArray(current.zones) ? current.zones.length : 0;
        if (items.length < curItems || zones.length < curZones) {
          return res.status(409).json({
            ok: false,
            error: "version_conflict",
            message: "自動保存を拒否（サーバ側の方が新しい可能性）",
            data: {
              roomId,
              updatedAt: current.updatedAt,
              updatedBy: current.updatedBy,
              items: current.items || [],
              zones: current.zones || [],
              history: (current.history || []).slice(0, 40).map(({ id, at, by, note, count, zoneCount }) => ({
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
      }

      // 自動保存は履歴に実体を持たせず軽量化（手動保存のみ復元可能なスナップショットを残す）
      const entry = auto
        ? {
            id: entryId,
            at: now,
            by,
            note: note || "自動保存",
            count: items.length,
            zoneCount: zones.length,
          }
        : {
            id: entryId,
            at: now,
            by,
            note,
            count: items.length,
            zoneCount: zones.length,
            items,
            zones,
          };
      const prevHistory = Array.isArray(current.history) ? current.history : [];
      const history = [entry, ...prevHistory]
        .map((h) => {
          if (!h || typeof h !== "object") return null;
          // 古い自動保存の巨大スナップショットを段階的に落とす
          if (h.note === "自動保存" && (Array.isArray(h.items) || Array.isArray(h.zones))) {
            const { items: _i, zones: _z, ...meta } = h;
            return meta;
          }
          return h;
        })
        .filter(Boolean)
        .slice(0, MAX_HISTORY);

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
