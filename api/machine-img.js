import { head, BlobNotFoundError } from "@vercel/blob";
import { cors, safeCustomPath } from "./customMachines.js";

export default async function handler(req, res) {
  cors(res, "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "method not allowed" });

  const path = safeCustomPath(req.query.path);
  if (!path) return res.status(400).json({ ok: false, error: "invalid path" });

  try {
    const meta = await head(path);
    const upstream = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
    });
    if (!upstream.ok) {
      return res.status(upstream.status).json({ ok: false, error: "blob fetch failed" });
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Type", meta.contentType || upstream.headers.get("content-type") || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400, immutable");
    return res.status(200).send(buf);
  } catch (err) {
    if (err instanceof BlobNotFoundError || err?.name === "BlobNotFoundError") {
      return res.status(404).json({ ok: false, error: "not found" });
    }
    console.error(err);
    return res.status(500).json({ ok: false, error: err?.message || "image failed" });
  }
}
