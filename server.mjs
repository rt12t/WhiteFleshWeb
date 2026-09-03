/**
 * Local designer server. Serves the repo and writes data/ + media/ on Save.
 * Public GitHub Pages does not run this file.
 */

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4173;
const HOST = "127.0.0.1";
const MAX_BODY = 16 * 1024 * 1024;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

const SRC_CHARS_RE = /^[A-Za-z0-9/._-]+$/;

function send(res, status, body, headers = {}) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, {
    "Content-Length": payload.length,
    ...headers,
  });
  res.end(payload);
}

function sendJson(res, status, data) {
  send(res, status, JSON.stringify(data), {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
}

function isSafeRel(rel) {
  return (
    typeof rel === "string" &&
    rel.length > 0 &&
    !rel.startsWith("/") &&
    !rel.includes("\\") &&
    !rel.includes("..") &&
    !rel.includes("://") &&
    SRC_CHARS_RE.test(rel)
  );
}

function isAllowedWrite(rel) {
  if (rel === "data/site.json") return true;
  if (rel === ".nojekyll") return true;
  return rel.startsWith("media/bg/") || rel.startsWith("media/sticker/");
}

async function readBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY) {
      const err = new Error("body too large");
      err.code = "TOO_LARGE";
      throw err;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function writeSafeFile(rel, data) {
  if (!isSafeRel(rel) || !isAllowedWrite(rel)) {
    throw new Error(`blocked path ${rel}`);
  }
  const dest = path.resolve(ROOT, rel);
  const rootWithSep = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;
  if (dest !== ROOT && !dest.startsWith(rootWithSep)) {
    throw new Error(`blocked path ${rel}`);
  }
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, data);
  return rel;
}

async function handleSave(req, res) {
  let raw;
  try {
    raw = await readBody(req);
  } catch (err) {
    if (err && err.code === "TOO_LARGE") {
      sendJson(res, 413, { ok: false, message: "文件过大（超过 12MB）" });
      return;
    }
    sendJson(res, 400, { ok: false, message: "无法写入本地仓库" });
    return;
  }

  let payload;
  try {
    payload = JSON.parse(raw.toString("utf8"));
  } catch {
    sendJson(res, 400, { ok: false, message: "无法写入本地仓库" });
    return;
  }

  const files = Array.isArray(payload && payload.files) ? payload.files : [];
  if (files.length === 0) {
    sendJson(res, 400, { ok: false, message: "无法写入本地仓库" });
    return;
  }

  const filesWritten = [];
  try {
    for (const file of files) {
      const rel = file && file.path;
      let data;
      if (typeof file.text === "string") {
        data = file.text;
      } else if (typeof file.bytes === "string") {
        data = Buffer.from(file.bytes, "base64");
      } else {
        throw new Error("missing file bytes");
      }
      filesWritten.push(await writeSafeFile(rel, data));
    }
  } catch (err) {
    console.error(err);
    sendJson(res, 400, { ok: false, message: "无法写入本地仓库" });
    return;
  }

  sendJson(res, 200, {
    ok: true,
    filesWritten,
    message: "已保存到仓库，请 push 到 GitHub",
  });
}

async function serveStatic(req, res, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    send(res, 400, "Bad Request", { "Content-Type": "text/plain; charset=utf-8" });
    return;
  }
  if (pathname === "/" || pathname === "/index.html") pathname = "/edit.html";
  const rel = pathname.replace(/^\/+/, "");
  if (!isSafeRel(rel)) {
    send(res, 404, "Not Found", { "Content-Type": "text/plain; charset=utf-8" });
    return;
  }
  const dest = path.resolve(ROOT, rel);
  const rootWithSep = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;
  if (dest !== ROOT && !dest.startsWith(rootWithSep)) {
    send(res, 404, "Not Found", { "Content-Type": "text/plain; charset=utf-8" });
    return;
  }
  try {
    const data = await fs.readFile(dest);
    const ext = path.extname(dest).toLowerCase();
    send(res, 200, data, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
  } catch {
    send(res, 404, "Not Found", { "Content-Type": "text/plain; charset=utf-8" });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
  if (req.method === "GET" && url.pathname === "/__wf/ping") {
    sendJson(res, 200, { ok: true });
    return;
  }
  if (req.method === "POST" && url.pathname === "/__wf/save") {
    await handleSave(req, res);
    return;
  }
  if (req.method === "GET" || req.method === "HEAD") {
    await serveStatic(req, res, url);
    return;
  }
  send(res, 405, "Method Not Allowed", { "Content-Type": "text/plain; charset=utf-8" });
});

server.listen(PORT, HOST, () => {
  console.log(`http://${HOST}:${PORT}`);
  console.log("按 F2 进入编辑。");
});
