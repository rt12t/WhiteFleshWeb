/**
 * SiteDocument module.
 * Parse, invariants, layout math, immutable ops. No I/O.
 */

const SCHEMA_VERSION = 1;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const SRC_CHARS_RE = /^[A-Za-z0-9/._-]+$/;
const DEFAULT_STICKER_WIDTH = 0.2;
const STICKER_X_INSET = 0.02;
const GAP_MIN = 0;
const GAP_MAX = 2;
const WIDTH_MAX = 2;
const DEFAULT_BG_REPEAT = "repeat";
const DEFAULT_BG_ALIGN = "center";
const BACKGROUND_REPEATS = new Set([
  "no-repeat",
  "repeat",
  "repeat-x",
  "repeat-y",
]);
const BACKGROUND_ALIGNS = new Set([
  "top-left",
  "top",
  "top-right",
  "left",
  "center",
  "right",
  "bottom-left",
  "bottom",
  "bottom-right",
]);
const ALIGN_TO_CSS = {
  "top-left": "left top",
  top: "center top",
  "top-right": "right top",
  left: "left center",
  center: "center center",
  right: "right center",
  "bottom-left": "left bottom",
  bottom: "center bottom",
  "bottom-right": "right bottom",
};

function fail(message) {
  return { ok: false, error: { message } };
}

function okDoc(doc) {
  return { ok: true, doc };
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function normalizeColor(value) {
  if (typeof value !== "string" || !COLOR_RE.test(value)) return null;
  return value.toLowerCase();
}

function isValidSrc(src) {
  if (typeof src !== "string") return false;
  if (!src.startsWith("media/")) return false;
  if (src.startsWith("/")) return false;
  if (src.includes("\\")) return false;
  if (src.includes("://")) return false;
  if (src.includes("..")) return false;
  if (!SRC_CHARS_RE.test(src)) return false;
  return src.length > "media/".length;
}

function stripHeight(strip) {
  return strip.intrinsicHeight / strip.intrinsicWidth;
}

function stickerHeight(sticker) {
  return sticker.width * (sticker.intrinsicHeight / sticker.intrinsicWidth);
}

function usedIds(doc) {
  const ids = new Set();
  for (const strip of doc.strips) ids.add(strip.id);
  for (const sticker of doc.stickers) ids.add(sticker.id);
  return ids;
}

function makeId(prefix, ids) {
  for (;;) {
    const id = prefix + Math.random().toString(16).slice(2, 10);
    if (!ids.has(id)) return id;
  }
}

function parseBackgroundImage(raw) {
  if (raw === undefined || raw === null || raw === "") return { ok: true, value: null };
  if (!isValidSrc(raw)) return fail("backgroundImage invalid");
  return { ok: true, value: raw };
}

function parseBackgroundRepeat(raw) {
  if (raw === undefined) return DEFAULT_BG_REPEAT;
  if (typeof raw !== "string" || !BACKGROUND_REPEATS.has(raw)) return null;
  return raw;
}

function parseBackgroundAlign(raw) {
  if (raw === undefined) return DEFAULT_BG_ALIGN;
  if (typeof raw !== "string" || !BACKGROUND_ALIGNS.has(raw)) return null;
  return raw;
}

function parseBackgroundFixed(raw) {
  if (raw === undefined) return false;
  if (typeof raw !== "boolean") return null;
  return raw;
}

function cloneDoc(doc) {
  return {
    schemaVersion: SCHEMA_VERSION,
    backgroundColor: doc.backgroundColor,
    backgroundImage: doc.backgroundImage || null,
    backgroundRepeat: doc.backgroundRepeat || DEFAULT_BG_REPEAT,
    backgroundAlign: doc.backgroundAlign || DEFAULT_BG_ALIGN,
    backgroundFixed: Boolean(doc.backgroundFixed),
    gap: doc.gap,
    strips: doc.strips.map((strip) => ({
      id: strip.id,
      src: strip.src,
      intrinsicWidth: strip.intrinsicWidth,
      intrinsicHeight: strip.intrinsicHeight,
    })),
    stickers: doc.stickers.map((sticker) => ({
      id: sticker.id,
      src: sticker.src,
      x: sticker.x,
      y: sticker.y,
      width: sticker.width,
      z: sticker.z,
      intrinsicWidth: sticker.intrinsicWidth,
      intrinsicHeight: sticker.intrinsicHeight,
    })),
  };
}

function parseStrip(raw, index, ids) {
  if (!isObject(raw)) return fail(`strips[${index}] must be an object`);
  if (!isNonEmptyString(raw.id)) return fail(`strips[${index}].id invalid`);
  if (ids.has(raw.id)) return fail(`duplicate id ${raw.id}`);
  if (!isValidSrc(raw.src)) return fail(`strips[${index}].src invalid`);
  if (!isFiniteNumber(raw.intrinsicWidth) || raw.intrinsicWidth <= 0) {
    return fail(`strips[${index}].intrinsicWidth invalid`);
  }
  if (!isFiniteNumber(raw.intrinsicHeight) || raw.intrinsicHeight <= 0) {
    return fail(`strips[${index}].intrinsicHeight invalid`);
  }
  ids.add(raw.id);
  return okDoc({
    id: raw.id,
    src: raw.src,
    intrinsicWidth: raw.intrinsicWidth,
    intrinsicHeight: raw.intrinsicHeight,
  });
}

function parseSticker(raw, index, ids) {
  if (!isObject(raw)) return fail(`stickers[${index}] must be an object`);
  if (!isNonEmptyString(raw.id)) return fail(`stickers[${index}].id invalid`);
  if (ids.has(raw.id)) return fail(`duplicate id ${raw.id}`);
  if (!isValidSrc(raw.src)) return fail(`stickers[${index}].src invalid`);
  if (!isFiniteNumber(raw.x)) return fail(`stickers[${index}].x invalid`);
  if (!isFiniteNumber(raw.y)) return fail(`stickers[${index}].y invalid`);
  if (!isFiniteNumber(raw.width) || raw.width <= 0 || raw.width > WIDTH_MAX) {
    return fail(`stickers[${index}].width invalid`);
  }
  if (!isFiniteNumber(raw.z) || !Number.isInteger(raw.z)) {
    return fail(`stickers[${index}].z invalid`);
  }
  if (!isFiniteNumber(raw.intrinsicWidth) || raw.intrinsicWidth <= 0) {
    return fail(`stickers[${index}].intrinsicWidth invalid`);
  }
  if (!isFiniteNumber(raw.intrinsicHeight) || raw.intrinsicHeight <= 0) {
    return fail(`stickers[${index}].intrinsicHeight invalid`);
  }
  ids.add(raw.id);
  return okDoc({
    id: raw.id,
    src: raw.src,
    x: raw.x,
    y: raw.y,
    width: raw.width,
    z: raw.z,
    intrinsicWidth: raw.intrinsicWidth,
    intrinsicHeight: raw.intrinsicHeight,
  });
}

/**
 * @param {string | object} input
 * @returns {{ ok: true, doc: object } | { ok: false, error: { message: string } }}
 */
export function parseSiteDocument(input) {
  let raw = input;
  if (typeof input === "string") {
    try {
      raw = JSON.parse(input);
    } catch {
      return fail("JSON parse failed");
    }
  }
  if (!isObject(raw)) return fail("document must be an object");
  if (raw.schemaVersion !== SCHEMA_VERSION) {
    return fail("schemaVersion must be 1");
  }
  const backgroundColor = normalizeColor(raw.backgroundColor);
  if (!backgroundColor) return fail("backgroundColor invalid");
  const imageParsed = parseBackgroundImage(raw.backgroundImage);
  if (!imageParsed.ok) return imageParsed;
  const backgroundRepeat = parseBackgroundRepeat(raw.backgroundRepeat);
  if (!backgroundRepeat) return fail("backgroundRepeat invalid");
  const backgroundAlign = parseBackgroundAlign(raw.backgroundAlign);
  if (!backgroundAlign) return fail("backgroundAlign invalid");
  const backgroundFixed = parseBackgroundFixed(raw.backgroundFixed);
  if (backgroundFixed === null) return fail("backgroundFixed invalid");
  if (!isFiniteNumber(raw.gap) || raw.gap < GAP_MIN || raw.gap > GAP_MAX) {
    return fail("gap invalid");
  }
  if (!Array.isArray(raw.strips)) return fail("strips must be an array");
  if (!Array.isArray(raw.stickers)) return fail("stickers must be an array");

  const ids = new Set();
  const strips = [];
  for (let i = 0; i < raw.strips.length; i++) {
    const parsed = parseStrip(raw.strips[i], i, ids);
    if (!parsed.ok) return parsed;
    strips.push(parsed.doc);
  }
  const stickers = [];
  for (let i = 0; i < raw.stickers.length; i++) {
    const parsed = parseSticker(raw.stickers[i], i, ids);
    if (!parsed.ok) return parsed;
    stickers.push(parsed.doc);
  }

  return okDoc({
    schemaVersion: SCHEMA_VERSION,
    backgroundColor,
    backgroundImage: imageParsed.value,
    backgroundRepeat,
    backgroundAlign,
    backgroundFixed,
    gap: raw.gap,
    strips,
    stickers,
  });
}

/**
 * Stable pretty JSON, 2-space, trailing newline.
 * @param {object} doc
 * @returns {string}
 */
export function serializeSiteDocument(doc) {
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    backgroundColor: doc.backgroundColor,
    backgroundImage: doc.backgroundImage || null,
    backgroundRepeat: doc.backgroundRepeat || DEFAULT_BG_REPEAT,
    backgroundAlign: doc.backgroundAlign || DEFAULT_BG_ALIGN,
    backgroundFixed: Boolean(doc.backgroundFixed),
    gap: doc.gap,
    strips: doc.strips.map((strip) => ({
      id: strip.id,
      src: strip.src,
      intrinsicWidth: strip.intrinsicWidth,
      intrinsicHeight: strip.intrinsicHeight,
    })),
    stickers: doc.stickers.map((sticker) => ({
      id: sticker.id,
      src: sticker.src,
      x: sticker.x,
      y: sticker.y,
      width: sticker.width,
      z: sticker.z,
      intrinsicWidth: sticker.intrinsicWidth,
      intrinsicHeight: sticker.intrinsicHeight,
    })),
  };
  return JSON.stringify(payload, null, 2) + "\n";
}

/**
 * CSS values for the page behind the collage.
 * Hosts resolve `imageSrc` (blob preview or committed path) then apply to `html`.
 * @param {object} doc
 * @returns {{
 *   color: string,
 *   imageSrc: string | null,
 *   repeat: string,
 *   position: string,
 *   attachment: string
 * }}
 */
export function pageBackgroundStyle(doc) {
  const align = BACKGROUND_ALIGNS.has(doc.backgroundAlign)
    ? doc.backgroundAlign
    : DEFAULT_BG_ALIGN;
  const repeat = BACKGROUND_REPEATS.has(doc.backgroundRepeat)
    ? doc.backgroundRepeat
    : DEFAULT_BG_REPEAT;
  return {
    color: doc.backgroundColor,
    imageSrc: doc.backgroundImage || null,
    repeat,
    position: ALIGN_TO_CSS[align],
    attachment: doc.backgroundFixed ? "fixed" : "scroll",
  };
}

/**
 * @param {object} doc
 * @returns {{
 *   stackHeight: number,
 *   contentHeight: number,
 *   strips: Array<{ id: string, src: string, x: number, y: number, width: number, height: number }>,
 *   stickers: Array<{ id: string, src: string, x: number, y: number, width: number, height: number, z: number }>
 * }}
 */
export function layoutStage(doc) {
  const gap = doc.gap;
  const strips = [];
  let y = 0;
  for (let i = 0; i < doc.strips.length; i++) {
    const strip = doc.strips[i];
    const height = stripHeight(strip);
    strips.push({
      id: strip.id,
      src: strip.src,
      x: 0,
      y,
      width: 1,
      height,
    });
    y += height;
    if (i < doc.strips.length - 1) y += gap;
  }

  const n = doc.strips.length;
  const stackHeight =
    n === 0
      ? 0
      : doc.strips.reduce((sum, strip) => sum + stripHeight(strip), 0) +
        gap * (n - 1);

  const laidStickers = doc.stickers.map((sticker) => ({
    id: sticker.id,
    src: sticker.src,
    x: sticker.x,
    y: sticker.y,
    width: sticker.width,
    height: stickerHeight(sticker),
    z: sticker.z,
  }));
  laidStickers.sort((a, b) => {
    if (a.z !== b.z) return a.z - b.z;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });

  let contentHeight = stackHeight;
  for (const sticker of laidStickers) {
    const bottom = sticker.y + sticker.height;
    if (bottom > contentHeight) contentHeight = bottom;
  }
  if (contentHeight < 0) contentHeight = 0;

  return { stackHeight, contentHeight, strips, stickers: laidStickers };
}

function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function clampStickerX(x, width) {
  const minX = STICKER_X_INSET - width;
  const maxX = 1 - STICKER_X_INSET;
  return clamp(x, minX, maxX);
}

function maxStickerZ(doc) {
  let maxZ = 0;
  for (const sticker of doc.stickers) {
    if (sticker.z > maxZ) maxZ = sticker.z;
  }
  return maxZ;
}

function findStripIndex(doc, id) {
  return doc.strips.findIndex((strip) => strip.id === id);
}

function findStickerIndex(doc, id) {
  return doc.stickers.findIndex((sticker) => sticker.id === id);
}

/**
 * Immutable. Never mutates `doc`.
 * @param {object} doc
 * @param {object} op
 * @returns {{ ok: true, doc: object } | { ok: false, error: { message: string } }}
 */
export function applyOp(doc, op) {
  if (!isObject(op) || typeof op.type !== "string") {
    return fail("op invalid");
  }
  const next = cloneDoc(doc);

  switch (op.type) {
    case "setBackgroundColor": {
      const color = normalizeColor(op.backgroundColor);
      if (!color) return fail("backgroundColor invalid");
      next.backgroundColor = color;
      return okDoc(next);
    }
    case "setBackgroundImage": {
      if (op.src === undefined || op.src === null || op.src === "") {
        next.backgroundImage = null;
        return okDoc(next);
      }
      if (!isValidSrc(op.src)) return fail("src invalid");
      next.backgroundImage = op.src;
      return okDoc(next);
    }
    case "setBackgroundRepeat": {
      if (typeof op.backgroundRepeat !== "string" || !BACKGROUND_REPEATS.has(op.backgroundRepeat)) {
        return fail("backgroundRepeat invalid");
      }
      next.backgroundRepeat = op.backgroundRepeat;
      return okDoc(next);
    }
    case "setBackgroundAlign": {
      if (typeof op.backgroundAlign !== "string" || !BACKGROUND_ALIGNS.has(op.backgroundAlign)) {
        return fail("backgroundAlign invalid");
      }
      next.backgroundAlign = op.backgroundAlign;
      return okDoc(next);
    }
    case "setBackgroundFixed": {
      if (typeof op.backgroundFixed !== "boolean") return fail("backgroundFixed invalid");
      next.backgroundFixed = op.backgroundFixed;
      return okDoc(next);
    }
    case "setGap": {
      if (!isFiniteNumber(op.gap) || op.gap < GAP_MIN || op.gap > GAP_MAX) {
        return fail("gap invalid");
      }
      next.gap = op.gap;
      return okDoc(next);
    }
    case "addStrip": {
      if (!isValidSrc(op.src)) return fail("src invalid");
      if (!isFiniteNumber(op.intrinsicWidth) || op.intrinsicWidth <= 0) {
        return fail("intrinsicWidth invalid");
      }
      if (!isFiniteNumber(op.intrinsicHeight) || op.intrinsicHeight <= 0) {
        return fail("intrinsicHeight invalid");
      }
      const ids = usedIds(next);
      let id = op.id;
      if (id === undefined || id === null) {
        id = makeId("strip-", ids);
      } else if (!isNonEmptyString(id)) {
        return fail("id invalid");
      } else if (ids.has(id)) {
        return fail(`duplicate id ${id}`);
      }
      const strip = {
        id,
        src: op.src,
        intrinsicWidth: op.intrinsicWidth,
        intrinsicHeight: op.intrinsicHeight,
      };
      let index = next.strips.length;
      if (op.index !== undefined && op.index !== null) {
        if (!isFiniteNumber(op.index) || !Number.isInteger(op.index)) {
          return fail("index invalid");
        }
        index = clamp(op.index, 0, next.strips.length);
      }
      next.strips.splice(index, 0, strip);
      return okDoc(next);
    }
    case "removeStrip": {
      const index = findStripIndex(next, op.id);
      if (index < 0) return fail("strip not found");
      next.strips.splice(index, 1);
      return okDoc(next);
    }
    case "moveStrip": {
      const from = findStripIndex(next, op.id);
      if (from < 0) return fail("strip not found");
      if (!isFiniteNumber(op.toIndex)) return fail("toIndex invalid");
      const n = next.strips.length;
      const to = clamp(Math.round(op.toIndex), 0, n - 1);
      const [item] = next.strips.splice(from, 1);
      next.strips.splice(to, 0, item);
      return okDoc(next);
    }
    case "addSticker": {
      if (!isValidSrc(op.src)) return fail("src invalid");
      if (!isFiniteNumber(op.x)) return fail("x invalid");
      if (!isFiniteNumber(op.y)) return fail("y invalid");
      if (!isFiniteNumber(op.intrinsicWidth) || op.intrinsicWidth <= 0) {
        return fail("intrinsicWidth invalid");
      }
      if (!isFiniteNumber(op.intrinsicHeight) || op.intrinsicHeight <= 0) {
        return fail("intrinsicHeight invalid");
      }
      let width = DEFAULT_STICKER_WIDTH;
      if (op.width !== undefined && op.width !== null) {
        if (!isFiniteNumber(op.width) || op.width <= 0 || op.width > WIDTH_MAX) {
          return fail("width invalid");
        }
        width = op.width;
      }
      const ids = usedIds(next);
      let id = op.id;
      if (id === undefined || id === null) {
        id = makeId("sticker-", ids);
      } else if (!isNonEmptyString(id)) {
        return fail("id invalid");
      } else if (ids.has(id)) {
        return fail(`duplicate id ${id}`);
      }
      next.stickers.push({
        id,
        src: op.src,
        x: op.x,
        y: op.y,
        width,
        z: maxStickerZ(next) + 1,
        intrinsicWidth: op.intrinsicWidth,
        intrinsicHeight: op.intrinsicHeight,
      });
      return okDoc(next);
    }
    case "removeSticker": {
      const index = findStickerIndex(next, op.id);
      if (index < 0) return fail("sticker not found");
      next.stickers.splice(index, 1);
      return okDoc(next);
    }
    case "moveSticker": {
      const index = findStickerIndex(next, op.id);
      if (index < 0) return fail("sticker not found");
      if (!isFiniteNumber(op.x) || !isFiniteNumber(op.y)) {
        return fail("position invalid");
      }
      const sticker = next.stickers[index];
      sticker.x = clampStickerX(op.x, sticker.width);
      sticker.y = op.y;
      return okDoc(next);
    }
    default:
      return fail("unknown op");
  }
}
