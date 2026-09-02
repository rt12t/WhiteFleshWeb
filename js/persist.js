/**
 * Persist module.
 * Port + adapters. SiteDocument/StageRenderer depend on PersistPort, not fetch.
 */

import { parseSiteDocument, serializeSiteDocument } from "./site-document.js";

/**
 * @typedef {{
 *   load: () => Promise<{ ok: true, doc: object } | { ok: false, error: { message: string } }>,
 *   save: (doc: object, blobs: object[]) => Promise<{
 *     ok: boolean,
 *     method: 'fs' | 'zip' | 'fetch' | 'memory' | 'local',
 *     filesWritten: string[],
 *     message?: string,
 *     aborted?: boolean
 *   }>
 * }} PersistPort
 */

const SITE_JSON_PATH = "data/site.json";
const NOJEKYLL_PATH = ".nojekyll";
const ZIP_NAME = "whiteflesh-site.zip";
const SRC_CHARS_RE = /^[A-Za-z0-9/._-]+$/;

function errMessage(err) {
  return err && err.message ? err.message : String(err);
}

function isAbort(err) {
  return Boolean(err && (err.name === "AbortError" || err.code === 20));
}

function isProtectedPath(path) {
  return (
    path === "index.html" ||
    path === "edit.html" ||
    path === "js" ||
    path.startsWith("js/")
  );
}

function isSafeMediaPath(path) {
  return (
    typeof path === "string" &&
    path.startsWith("media/") &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    !path.includes("://") &&
    !path.includes("..") &&
    SRC_CHARS_RE.test(path) &&
    path.length > "media/".length
  );
}

function committedJson(doc) {
  const json = serializeSiteDocument(doc);
  if (json.includes("blob:")) {
    throw new Error("serializeSiteDocument blob:");
  }
  return json;
}

function blobList(blobs) {
  return Array.isArray(blobs) ? blobs : [];
}

function arrayBufferToBase64(buffer) {
  const bytes =
    buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function probeLocalDev() {
  try {
    const res = await fetch("/__wf/ping", { cache: "no-store" });
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data && data.ok);
  } catch {
    return false;
  }
}

async function loadJSZip() {
  if (globalThis.JSZip) return globalThis.JSZip;
  await import("../vendor/jszip.min.js");
  if (globalThis.JSZip) return globalThis.JSZip;
  throw new Error("JSZip missing");
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function writeFile(dir, name, data) {
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(data);
  } finally {
    await writable.close();
  }
}

async function writeRelative(root, relativePath, data) {
  const parts = relativePath.split("/").filter(Boolean);
  const fileName = parts.pop();
  let dir = root;
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, { create: true });
  }
  await writeFile(dir, fileName, data);
}

async function fileExistsAtRoot(root, name) {
  try {
    await root.getFileHandle(name);
    return true;
  } catch {
    return false;
  }
}

export const PublishedFetchAdapter = {
  /**
   * @returns {Promise<{ ok: true, doc: object } | { ok: false, error: { message: string } }>}
   */
  async load() {
    try {
      const res = await fetch("data/site.json");
      if (!res.ok) {
        return { ok: false, error: { message: `fetch data/site.json ${res.status}` } };
      }
      const text = await res.text();
      return parseSiteDocument(text);
    } catch (err) {
      return {
        ok: false,
        error: { message: errMessage(err) },
      };
    }
  },
  /**
   * @returns {Promise<{ ok: boolean, method: string, filesWritten: string[], message?: string }>}
   */
  async save() {
    return {
      ok: false,
      method: "fetch",
      filesWritten: [],
      message: "viewer cannot save",
    };
  },
};

export const FileSystemAccessAdapter = {
  async load() {
    return { ok: false, error: { message: "FileSystemAccessAdapter load not used" } };
  },
  /**
   * @param {object} doc
   * @param {object[]} blobs
   */
  async save(doc, blobs) {
    if (typeof window === "undefined" || typeof window.showDirectoryPicker !== "function") {
      return {
        ok: false,
        method: "fs",
        filesWritten: [],
        message: "已下载 ZIP",
      };
    }

    let root;
    try {
      root = await window.showDirectoryPicker({ mode: "readwrite" });
    } catch (err) {
      return {
        ok: false,
        method: "fs",
        filesWritten: [],
        aborted: isAbort(err),
        message: isAbort(err) ? undefined : "无法写入文件夹，改为下载 ZIP",
      };
    }

    try {
      const json = committedJson(doc);
      const filesWritten = [];

      await writeRelative(root, SITE_JSON_PATH, json);
      filesWritten.push(SITE_JSON_PATH);

      for (const blob of blobList(blobs)) {
        const path = blob && blob.relativePath;
        if (!isSafeMediaPath(path) || isProtectedPath(path)) {
          return {
            ok: false,
            method: "fs",
            filesWritten,
            message: "无法写入文件夹，改为下载 ZIP",
          };
        }
        await writeRelative(root, path, blob.bytes);
        filesWritten.push(path);
      }

      if (!(await fileExistsAtRoot(root, NOJEKYLL_PATH))) {
        await writeFile(root, NOJEKYLL_PATH, "");
        filesWritten.push(NOJEKYLL_PATH);
      }

      return {
        ok: true,
        method: "fs",
        filesWritten,
        message: "已保存到文件夹",
      };
    } catch (err) {
      if (isAbort(err)) {
        return { ok: false, method: "fs", filesWritten: [], aborted: true };
      }
      return {
        ok: false,
        method: "fs",
        filesWritten: [],
        message: "无法写入文件夹，改为下载 ZIP",
      };
    }
  },
};

export const LocalDevAdapter = {
  async load() {
    return PublishedFetchAdapter.load();
  },
  /**
   * @param {object} doc
   * @param {object[]} blobs
   */
  async save(doc, blobs) {
    try {
      const json = committedJson(doc);
      const files = [{ path: SITE_JSON_PATH, text: json }];
      const filesWritten = [SITE_JSON_PATH];

      for (const blob of blobList(blobs)) {
        const path = blob && blob.relativePath;
        if (!isSafeMediaPath(path) || isProtectedPath(path)) {
          return {
            ok: false,
            method: "local",
            filesWritten,
            message: "无法写入本地仓库",
          };
        }
        files.push({ path, bytes: arrayBufferToBase64(blob.bytes) });
        filesWritten.push(path);
      }

      const res = await fetch("/__wf/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok) {
        return {
          ok: false,
          method: "local",
          filesWritten: [],
          message: (data && data.message) || "无法写入本地仓库",
        };
      }
      return {
        ok: true,
        method: "local",
        filesWritten: Array.isArray(data.filesWritten) ? data.filesWritten : filesWritten,
        message: "已保存到仓库，请 push 到 GitHub",
      };
    } catch (err) {
      return {
        ok: false,
        method: "local",
        filesWritten: [],
        message: errMessage(err),
      };
    }
  },
};

export const ZipDownloadAdapter = {
  async load() {
    return { ok: false, error: { message: "ZipDownloadAdapter load not used" } };
  },
  /**
   * @param {object} doc
   * @param {object[]} blobs
   */
  async save(doc, blobs) {
    try {
      const JSZip = await loadJSZip();
      const json = committedJson(doc);
      const zip = new JSZip();
      const filesWritten = [];

      zip.file(SITE_JSON_PATH, json);
      filesWritten.push(SITE_JSON_PATH);

      for (const blob of blobList(blobs)) {
        const path = blob && blob.relativePath;
        if (!isSafeMediaPath(path) || isProtectedPath(path)) {
          return {
            ok: false,
            method: "zip",
            filesWritten,
            message: "无法写入文件夹，改为下载 ZIP",
          };
        }
        zip.file(path, blob.bytes);
        filesWritten.push(path);
      }

      zip.file(NOJEKYLL_PATH, "");
      filesWritten.push(NOJEKYLL_PATH);

      const packed = await zip.generateAsync({ type: "blob" });
      triggerDownload(packed, ZIP_NAME);
      return {
        ok: true,
        method: "zip",
        filesWritten,
        message: "已下载 ZIP",
      };
    } catch (err) {
      return {
        ok: false,
        method: "zip",
        filesWritten: [],
        message: errMessage(err),
      };
    }
  },
};

/** Tests. Empty stub. */
export const MemoryAdapter = {};
