/**
 * Host boot. Public view by default. F2 toggles edit chrome.
 * Local-dev Save writes the clone via /__wf/save. Else FS then ZIP.
 * SiteDocument src stays media/... . Preview via previewMap blob URLs.
 */

import { applyOp } from "./site-document.js";
import { ingest } from "./media-ingest.js";
import { createStage } from "./stage-renderer.js";
import { applyPageBackground } from "./page-background.js";
import {
  PublishedFetchAdapter,
  FileSystemAccessAdapter,
  ZipDownloadAdapter,
  LocalDevAdapter,
  probeLocalDev,
} from "./persist.js";

const FALLBACK_COLOR = "#f2c3d8";
const DEFAULT_GAP = 0.06;

const previewMap = new Map();
const pendingBlobs = [];

let doc = null;
let stage = null;
let selectedId = null;
let ingesting = false;
let saving = false;
let editMode = false;
let localDev = false;

function emptyDoc() {
  return {
    schemaVersion: 1,
    backgroundColor: FALLBACK_COLOR,
    backgroundImage: null,
    backgroundRepeat: "repeat",
    backgroundAlign: "center",
    backgroundFixed: false,
    gap: DEFAULT_GAP,
    strips: [],
    stickers: [],
  };
}

function setPageFromDoc(next) {
  applyPageBackground(next, resolveSrc);
}

function $(id) {
  return document.getElementById(id);
}

function setStatus(text) {
  const el = $("status");
  if (el) el.textContent = text || "";
}

function fileName(src) {
  const i = src.lastIndexOf("/");
  return i >= 0 ? src.slice(i + 1) : src;
}

function usedPaths() {
  const used = new Set();
  if (doc) {
    if (doc.backgroundImage) used.add(doc.backgroundImage);
    for (const strip of doc.strips) used.add(strip.src);
    for (const sticker of doc.stickers) used.add(sticker.src);
  }
  for (const blob of pendingBlobs) used.add(blob.relativePath);
  return used;
}

function resolveSrc(src) {
  return previewMap.get(src) || src;
}

function setChoiceGroup(container, value, enabled) {
  if (!container) return;
  container.querySelectorAll("[data-value]").forEach((btn) => {
    const on = btn.dataset.value === value;
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.disabled = !enabled;
  });
}

function renderChrome() {
  if (!doc) return;
  const colorInput = $("bg-color");
  const gapSlider = $("gap");
  const gapNumber = $("gap-number");
  const stripList = $("strip-list");
  const deleteBtn = $("delete-sticker");
  if (colorInput) colorInput.value = doc.backgroundColor;
  const hasImage = Boolean(doc.backgroundImage);
  const thumb = $("bg-image-thumb");
  const preview = $("bg-image-preview");
  const fixed = $("bg-fixed");
  const remove = $("bg-image-remove");
  if (thumb) {
    if (hasImage) {
      thumb.hidden = false;
      thumb.src = resolveSrc(doc.backgroundImage);
    } else {
      thumb.hidden = true;
      thumb.removeAttribute("src");
    }
  }
  if (preview) {
    preview.classList.toggle("wf-page-bg-preview-filled", hasImage);
    preview.title = hasImage ? "更换最底背景图" : "选择最底背景图";
  }
  setChoiceGroup($("bg-repeat"), doc.backgroundRepeat || "repeat", hasImage);
  setChoiceGroup($("bg-align"), doc.backgroundAlign || "center", hasImage);
  if (fixed) {
    fixed.checked = Boolean(doc.backgroundFixed);
    fixed.disabled = !hasImage;
  }
  if (remove) remove.disabled = !hasImage;
  const gapUi = Math.min(doc.gap, 0.4);
  if (gapSlider) gapSlider.value = String(gapUi);
  if (gapNumber) gapNumber.value = String(gapUi);
  if (deleteBtn) deleteBtn.disabled = !selectedId;
  if (!stripList) return;

  stripList.replaceChildren();
  doc.strips.forEach((strip, index) => {
    const li = document.createElement("li");
    li.className = "wf-strip-row";
    li.dataset.id = strip.id;

    const rowThumb = document.createElement("img");
    rowThumb.alt = "";
    rowThumb.src = resolveSrc(strip.src);

    const name = document.createElement("span");
    name.className = "wf-strip-name";
    name.textContent = fileName(strip.src);

    const actions = document.createElement("div");
    actions.className = "wf-strip-actions";

    const up = document.createElement("button");
    up.type = "button";
    up.dataset.action = "up";
    up.textContent = "上移";
    up.disabled = index === 0;

    const down = document.createElement("button");
    down.type = "button";
    down.dataset.action = "down";
    down.textContent = "下移";
    down.disabled = index === doc.strips.length - 1;

    const del = document.createElement("button");
    del.type = "button";
    del.dataset.action = "delete";
    del.textContent = "删除";

    actions.append(up, down, del);
    li.append(rowThumb, name, actions);
    stripList.appendChild(li);
  });
}

function commit(op) {
  if (!doc) return false;
  const result = applyOp(doc, op);
  if (!result.ok) {
    setStatus(result.error && result.error.message ? result.error.message : "操作失败");
    return false;
  }
  doc = result.doc;
  setPageFromDoc(doc);
  if (stage) stage.update(doc);
  if (editMode) renderChrome();
  return true;
}

function viewportCenterStage() {
  const root = $("stage");
  const rect = root.getBoundingClientRect();
  const w = root.clientWidth || 1;
  return {
    x: (window.innerWidth / 2 - rect.left) / w,
    y: (window.innerHeight / 2 - rect.top) / w,
  };
}

function stickerTopLeft(blob) {
  const width = 0.2;
  const height = width * (blob.intrinsicHeight / blob.intrinsicWidth);
  const c = viewportCenterStage();
  return { x: c.x - width / 2, y: c.y - height / 2 };
}

function startWithDoc(next) {
  doc = next;
  selectedId = null;
  setPageFromDoc(doc);
  $("load-fail").hidden = true;
  if (stage) stage.update(doc);
  applyEditChrome();
}

function applyEditChrome() {
  const saveBtn = $("save");
  const chrome = $("chrome");
  const fail = $("load-fail");
  document.body.classList.toggle("wf-editing", editMode);
  if (saveBtn) saveBtn.hidden = !editMode;
  if (!editMode) {
    if (chrome) chrome.hidden = true;
    if (fail) fail.hidden = true;
    document.title = "白肉";
    return;
  }
  document.title = "白肉编辑";
  if (!doc) {
    if (fail) fail.hidden = false;
    if (chrome) chrome.hidden = true;
    return;
  }
  if (fail) fail.hidden = true;
  if (chrome) chrome.hidden = false;
  renderChrome();
}

function setEditMode(on) {
  const next = Boolean(on);
  if (next === editMode) {
    applyEditChrome();
    return;
  }
  editMode = next;
  if (stage) stage.setMode(editMode ? "edit" : "view", onStageEvent);
  if (!editMode) selectedId = null;
  applyEditChrome();
}

function onStageEvent(event) {
  if (event.type === "stickerselect") {
    selectedId = event.id;
    const deleteBtn = $("delete-sticker");
    if (deleteBtn) deleteBtn.disabled = !selectedId;
    return;
  }
  if (event.type === "stickerdragend") {
    commit({ type: "moveSticker", id: event.id, x: event.x, y: event.y });
  }
}

async function ingestFile(role, file) {
  if (!file || !doc || ingesting) return;
  ingesting = true;
  try {
    const result = await ingest(file, role, usedPaths());
    if (!result.ok) {
      setStatus(result.error.message);
      return;
    }
    pendingBlobs.push(result.blob);
    previewMap.set(result.blob.relativePath, result.previewUrl);
    if (role === "strip") {
      commit({
        type: "addStrip",
        src: result.blob.relativePath,
        intrinsicWidth: result.blob.intrinsicWidth,
        intrinsicHeight: result.blob.intrinsicHeight,
      });
    } else if (role === "page") {
      commit({
        type: "setBackgroundImage",
        src: result.blob.relativePath,
      });
    } else {
      const pos = stickerTopLeft(result.blob);
      commit({
        type: "addSticker",
        src: result.blob.relativePath,
        x: pos.x,
        y: pos.y,
        intrinsicWidth: result.blob.intrinsicWidth,
        intrinsicHeight: result.blob.intrinsicHeight,
      });
    }
    setStatus("");
  } finally {
    ingesting = false;
  }
}

function bindChrome() {
  $("bg-color").addEventListener("input", (event) => {
    commit({ type: "setBackgroundColor", backgroundColor: event.target.value });
  });

  function pickPageBackground() {
    $("bg-image-file").click();
  }
  $("bg-image-preview").addEventListener("click", pickPageBackground);
  $("bg-image-preview").addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      pickPageBackground();
    }
  });
  $("bg-image-file").addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    ingestFile("page", file);
  });
  $("bg-image-remove").addEventListener("click", () => {
    commit({ type: "setBackgroundImage", src: null });
  });
  $("bg-repeat").addEventListener("click", (event) => {
    const btn = event.target.closest("[data-value]");
    if (!btn || btn.disabled) return;
    commit({ type: "setBackgroundRepeat", backgroundRepeat: btn.dataset.value });
  });
  $("bg-align").addEventListener("click", (event) => {
    const btn = event.target.closest("[data-value]");
    if (!btn || btn.disabled) return;
    commit({ type: "setBackgroundAlign", backgroundAlign: btn.dataset.value });
  });
  $("bg-fixed").addEventListener("change", (event) => {
    commit({ type: "setBackgroundFixed", backgroundFixed: event.target.checked });
  });

  function setGapFromUi(raw) {
    const gap = Number(raw);
    if (!Number.isFinite(gap)) return;
    const clamped = Math.min(0.4, Math.max(0, gap));
    commit({ type: "setGap", gap: clamped });
  }

  $("gap").addEventListener("input", (event) => {
    setGapFromUi(event.target.value);
  });
  $("gap-number").addEventListener("input", (event) => {
    setGapFromUi(event.target.value);
  });

  $("strip-list").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button || !doc) return;
    const row = button.closest("[data-id]");
    if (!row) return;
    const id = row.dataset.id;
    const index = doc.strips.findIndex((strip) => strip.id === id);
    if (index < 0) return;
    const action = button.dataset.action;
    if (action === "up") commit({ type: "moveStrip", id, toIndex: index - 1 });
    else if (action === "down") commit({ type: "moveStrip", id, toIndex: index + 1 });
    else if (action === "delete") commit({ type: "removeStrip", id });
  });

  $("add-strip").addEventListener("click", () => {
    $("strip-file").click();
  });
  $("strip-file").addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    ingestFile("strip", file);
  });

  $("add-sticker").addEventListener("click", () => {
    $("sticker-file").click();
  });
  $("sticker-file").addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    ingestFile("sticker", file);
  });

  $("delete-sticker").addEventListener("click", () => {
    if (!selectedId) return;
    const id = selectedId;
    selectedId = null;
    commit({ type: "removeSticker", id });
  });

  $("start-empty").addEventListener("click", () => {
    setStatus("");
    startWithDoc(emptyDoc());
  });

  $("save").addEventListener("click", () => {
    saveNow();
  });
}

function bindHotkeys() {
  window.addEventListener("keydown", (event) => {
    if (event.key === "F2") {
      event.preventDefault();
      setEditMode(!editMode);
      return;
    }
    if (event.key === "Escape" && editMode) {
      event.preventDefault();
      setEditMode(false);
      return;
    }
    const saveCombo =
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      (event.key === "s" || event.key === "S");
    if (saveCombo && editMode) {
      event.preventDefault();
      saveNow();
    }
  });
}

function showLocalHint() {
  if (!localDev) return;
  const existing = $("edit-hint");
  if (existing) return;
  const hint = document.createElement("p");
  hint.id = "edit-hint";
  hint.className = "wf-edit-hint";
  hint.textContent = "按 F2 进入编辑";
  document.body.appendChild(hint);
  window.setTimeout(() => {
    hint.classList.add("wf-edit-hint-hide");
  }, 4000);
  window.setTimeout(() => {
    hint.remove();
  }, 5200);
}

async function saveNow() {
  if (!doc || saving || !editMode) return;
  saving = true;
  const btn = $("save");
  if (btn) btn.disabled = true;
  const canFs = typeof window.showDirectoryPicker === "function";
  try {
    const blobs = pendingBlobs.slice();
    if (localDev) {
      const result = await LocalDevAdapter.save(doc, blobs);
      if (result.ok) {
        pendingBlobs.length = 0;
        setStatus(result.message || "已保存到仓库，请 push 到 GitHub");
        return;
      }
      const zip = await ZipDownloadAdapter.save(doc, blobs);
      if (zip.ok) setStatus("无法写入本地仓库，改为下载 ZIP");
      else setStatus(result.message || "无法写入本地仓库");
      return;
    }
    if (canFs) {
      const result = await FileSystemAccessAdapter.save(doc, blobs);
      if (result.ok) {
        setStatus(result.message || "已保存到文件夹");
        return;
      }
      if (result.aborted) return;
      const zip = await ZipDownloadAdapter.save(doc, blobs);
      if (zip.ok) setStatus("无法写入文件夹，改为下载 ZIP");
      else setStatus(zip.message || "保存失败");
      return;
    }
    const zip = await ZipDownloadAdapter.save(doc, blobs);
    if (zip.ok) setStatus(zip.message || "已下载 ZIP");
    else setStatus(zip.message || "保存失败");
  } catch (err) {
    console.error(err);
    if (localDev) {
      setStatus("无法写入本地仓库");
      return;
    }
    try {
      const zip = await ZipDownloadAdapter.save(doc, pendingBlobs.slice());
      if (zip.ok) {
        setStatus(canFs ? "无法写入文件夹，改为下载 ZIP" : "已下载 ZIP");
      } else {
        setStatus(zip.message || "保存失败");
      }
    } catch (zipErr) {
      console.error(zipErr);
      setStatus("保存失败");
    }
  } finally {
    saving = false;
    if (btn) btn.disabled = false;
  }
}

async function boot() {
  setPageFromDoc(null);
  const root = $("stage");
  if (!root) {
    console.error("missing #stage");
    return;
  }

  localDev = await probeLocalDev();
  bindChrome();
  bindHotkeys();

  try {
    stage = createStage(root, {
      mode: "view",
      onEvent: onStageEvent,
      previewMap,
      resolveSrc,
    });
  } catch (err) {
    console.error(err);
    return;
  }

  try {
    const result = await PublishedFetchAdapter.load();
    if (!result.ok) {
      failSafe(result.error);
    } else {
      startWithDoc(result.doc);
    }
  } catch (err) {
    failSafe(err);
  }

  if (localDev) showLocalHint();
}

function failSafe(err) {
  if (err) console.error(err);
  setPageFromDoc(null);
  doc = null;
  applyEditChrome();
}

boot();
