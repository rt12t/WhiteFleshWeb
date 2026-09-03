/**
 * Media ingest. File → MediaBlob + previewUrl. No disk write.
 * Committed JSON never stores blob: or previewUrl.
 */

const MAX_BYTES = 12 * 1024 * 1024;

const MIME_BY_EXT = {
  gif: "image/gif",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

const EXT_BY_MIME = {
  "image/gif": "gif",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

const ALLOWED_MIME = new Set(Object.keys(EXT_BY_MIME));

function fail(code, message) {
  return { ok: false, error: { code, message } };
}

function extFromName(name) {
  if (typeof name !== "string") return "";
  const i = name.lastIndexOf(".");
  if (i < 0 || i === name.length - 1) return "";
  return name.slice(i + 1).toLowerCase();
}

function baseFromName(name) {
  if (typeof name !== "string") return "";
  const i = name.lastIndexOf("/");
  const slash = name.lastIndexOf("\\");
  const cut = Math.max(i, slash);
  const file = cut >= 0 ? name.slice(cut + 1) : name;
  const dot = file.lastIndexOf(".");
  return dot >= 0 ? file.slice(0, dot) : file;
}

function isAsciiBase(base) {
  return typeof base === "string" && base.length > 0 && /^[A-Za-z0-9._-]+$/.test(base);
}

function hex8() {
  const bytes = new Uint8Array(4);
  if (globalThis.crypto && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 4; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function usedSet(usedPaths) {
  const set = new Set();
  if (!usedPaths) return set;
  if (typeof usedPaths[Symbol.iterator] !== "function") return set;
  for (const path of usedPaths) {
    if (typeof path === "string") set.add(path);
  }
  return set;
}

function uniquePath(dir, base, ext, used) {
  let candidate = `${dir}/${base}.${ext}`;
  if (!used.has(candidate)) return candidate;
  let n = 2;
  for (;;) {
    candidate = `${dir}/${base}-${n}.${ext}`;
    if (!used.has(candidate)) return candidate;
    n += 1;
  }
}

function resolveType(file) {
  const ext = extFromName(file && file.name);
  const mime = typeof file.type === "string" ? file.type.toLowerCase() : "";
  if (mime && ALLOWED_MIME.has(mime)) {
    return { mime, ext: EXT_BY_MIME[mime] };
  }
  const emptyMime = !mime || mime === "application/octet-stream";
  if (emptyMime && MIME_BY_EXT[ext]) {
    return { mime: MIME_BY_EXT[ext], ext: ext === "jpeg" ? "jpg" : ext };
  }
  return null;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("unreadable"));
    img.src = url;
  });
}

async function decodeSize(file, previewUrl) {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file);
      const width = bmp.width;
      const height = bmp.height;
      if (typeof bmp.close === "function") bmp.close();
      if (width > 0 && height > 0) return { width, height };
    } catch {
      // Image() fallback
    }
  }
  const img = await loadImage(previewUrl);
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  if (!(width > 0 && height > 0)) throw new Error("unreadable");
  return { width, height };
}

/**
 * @param {File} file
 * @param {'strip' | 'sticker' | 'page'} role
 * @param {Iterable<string>=} usedPaths document + pending relative paths
 * @returns {Promise<
 *   | { ok: true, blob: {
 *       relativePath: string,
 *       bytes: ArrayBuffer,
 *       mime: string,
 *       byteLength: number,
 *       intrinsicWidth: number,
 *       intrinsicHeight: number
 *     }, previewUrl: string }
 *   | { ok: false, error: { code: string, message: string } }
 * >}
 */
export async function ingest(file, role, usedPaths) {
  if (role !== "strip" && role !== "sticker" && role !== "page") {
    return fail("unsupported-type", "不支持的格式");
  }
  if (!file || typeof file.size !== "number") {
    return fail("unreadable", "无法读取图片");
  }
  if (file.size > MAX_BYTES) {
    return fail("too-large", "文件过大（超过 12MB）");
  }

  const type = resolveType(file);
  if (!type) return fail("unsupported-type", "不支持的格式");

  const dir =
    role === "strip" ? "media/bg" : role === "page" ? "media/page" : "media/sticker";
  const rawBase = baseFromName(file.name);
  const base = isAsciiBase(rawBase)
    ? rawBase.toLowerCase()
    : `${role}-${hex8()}`;
  const relativePath = uniquePath(dir, base, type.ext, usedSet(usedPaths));

  const previewUrl = URL.createObjectURL(file);
  try {
    const size = await decodeSize(file, previewUrl);
    const bytes = await file.arrayBuffer();
    return {
      ok: true,
      blob: {
        relativePath,
        bytes,
        mime: type.mime,
        byteLength: bytes.byteLength,
        intrinsicWidth: size.width,
        intrinsicHeight: size.height,
      },
      previewUrl,
    };
  } catch {
    URL.revokeObjectURL(previewUrl);
    return fail("unreadable", "无法读取图片");
  }
}
