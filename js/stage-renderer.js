/**
 * StageRenderer module.
 * DOM mapping for view and edit. Consumes layoutStage. No fetch/save.
 * SiteDocument src stays media/... . Preview remap via resolveSrc / previewMap.
 */

import { layoutStage } from "./site-document.js";

const STICKER_X_INSET = 0.02;

function px(stageX, stagePixelWidth) {
  return stageX * stagePixelWidth;
}

function applyBox(el, x, y, width, height, stagePixelWidth) {
  el.style.left = `${px(x, stagePixelWidth)}px`;
  el.style.top = `${px(y, stagePixelWidth)}px`;
  el.style.width = `${px(width, stagePixelWidth)}px`;
  el.style.height = `${px(height, stagePixelWidth)}px`;
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

function makeImg(src, className) {
  const img = document.createElement("img");
  img.className = className;
  img.src = src;
  img.alt = "";
  img.draggable = false;
  return img;
}

function stickerFromEvent(event) {
  const target = event.target;
  if (target && target.classList && target.classList.contains("wf-sticker")) {
    return target;
  }
  return null;
}

/**
 * @param {HTMLElement} element
 * @param {{
 *   mode: 'view' | 'edit',
 *   onEvent?: (event: object) => void,
 *   resolveSrc?: (src: string) => string,
 *   previewMap?: Map<string, string>
 * }} options
 * @returns {{ update(doc: object): void, setMode(mode: 'view' | 'edit', onEvent?: Function): void, destroy(): void }}
 */
export function createStage(element, options) {
  let mode = options && options.mode === "edit" ? "edit" : "view";
  let onEvent = options && options.onEvent;

  element.classList.add("wf-stage");

  let currentDoc = null;
  let destroyed = false;
  let selectedId = null;
  let drag = null;
  let listenersBound = false;

  function resolveMediaSrc(src) {
    if (options && typeof options.resolveSrc === "function") {
      const mapped = options.resolveSrc(src);
      if (typeof mapped === "string" && mapped.length > 0) return mapped;
    }
    const map = options && options.previewMap;
    if (map && typeof map.get === "function") {
      const mapped = map.get(src);
      if (typeof mapped === "string" && mapped.length > 0) return mapped;
    }
    return src;
  }

  const observer = new ResizeObserver(() => {
    if (!destroyed && currentDoc && !drag) paint(currentDoc);
  });
  observer.observe(element);

  function applyModeClass() {
    if (mode === "edit") element.classList.add("wf-stage-edit");
    else element.classList.remove("wf-stage-edit");
  }

  function cancelDrag() {
    if (!drag) return;
    const ended = drag;
    drag = null;
    ended.el.classList.remove("wf-sticker-dragging");
    if (typeof ended.el.releasePointerCapture === "function") {
      try {
        ended.el.releasePointerCapture(ended.pointerId);
      } catch {
        // already released
      }
    }
  }

  function bindEditListeners() {
    if (listenersBound) return;
    element.addEventListener("pointerdown", onPointerDown);
    element.addEventListener("pointermove", onPointerMove);
    element.addEventListener("pointerup", onPointerUp);
    element.addEventListener("pointercancel", onPointerUp);
    listenersBound = true;
  }

  function unbindEditListeners() {
    if (!listenersBound) return;
    element.removeEventListener("pointerdown", onPointerDown);
    element.removeEventListener("pointermove", onPointerMove);
    element.removeEventListener("pointerup", onPointerUp);
    element.removeEventListener("pointercancel", onPointerUp);
    listenersBound = false;
  }

  function emit(event) {
    if (mode !== "edit") return;
    if (typeof onEvent === "function") onEvent(event);
  }

  function applySelection() {
    for (const img of element.querySelectorAll(".wf-sticker")) {
      if (selectedId && img.dataset.id === selectedId) {
        img.classList.add("wf-sticker-selected");
      } else {
        img.classList.remove("wf-sticker-selected");
      }
    }
  }

  function select(id) {
    if (selectedId === id) {
      applySelection();
      return;
    }
    selectedId = id;
    applySelection();
    emit({ type: "stickerselect", id });
  }

  function paint(doc) {
    const layout = layoutStage(doc);
    const stagePixelWidth = element.clientWidth || 0;
    element.style.height = `${px(layout.contentHeight, stagePixelWidth)}px`;
    element.replaceChildren();

    for (const strip of layout.strips) {
      const img = makeImg(resolveMediaSrc(strip.src), "wf-strip");
      applyBox(img, strip.x, strip.y, strip.width, strip.height, stagePixelWidth);
      element.appendChild(img);
    }

    if (selectedId && !layout.stickers.some((sticker) => sticker.id === selectedId)) {
      selectedId = null;
      emit({ type: "stickerselect", id: null });
    }

    for (const sticker of layout.stickers) {
      const img = makeImg(resolveMediaSrc(sticker.src), "wf-sticker");
      applyBox(
        img,
        sticker.x,
        sticker.y,
        sticker.width,
        sticker.height,
        stagePixelWidth
      );
      img.style.zIndex = String(sticker.z);
      img.dataset.id = sticker.id;
      if (mode === "view") {
        img.style.pointerEvents = "none";
      } else {
        img.style.pointerEvents = "auto";
        img.style.touchAction = "none";
      }
      element.appendChild(img);
    }

    if (mode === "edit") applySelection();
  }

  function onPointerDown(event) {
    if (destroyed || mode !== "edit" || !currentDoc) return;
    const stickerEl = stickerFromEvent(event);
    if (!stickerEl) {
      select(null);
      return;
    }
    event.preventDefault();
    const id = stickerEl.dataset.id;
    select(id);
    const layout = layoutStage(currentDoc);
    const item = layout.stickers.find((sticker) => sticker.id === id);
    if (!item) return;
    if (typeof stickerEl.setPointerCapture === "function") {
      stickerEl.setPointerCapture(event.pointerId);
    }
    drag = {
      pointerId: event.pointerId,
      el: stickerEl,
      id,
      originX: item.x,
      originY: item.y,
      width: item.width,
      height: item.height,
      startClientX: event.clientX,
      startClientY: event.clientY,
      x: item.x,
      y: item.y,
      moved: false,
    };
    stickerEl.classList.add("wf-sticker-dragging");
  }

  function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    const stagePixelWidth = element.clientWidth || 1;
    const dx = (event.clientX - drag.startClientX) / stagePixelWidth;
    const dy = (event.clientY - drag.startClientY) / stagePixelWidth;
    drag.x = clampStickerX(drag.originX + dx, drag.width);
    drag.y = drag.originY + dy;
    if (dx !== 0 || dy !== 0) drag.moved = true;
    applyBox(drag.el, drag.x, drag.y, drag.width, drag.height, stagePixelWidth);
  }

  function onPointerUp(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const ended = drag;
    drag = null;
    ended.el.classList.remove("wf-sticker-dragging");
    if (typeof ended.el.releasePointerCapture === "function") {
      try {
        ended.el.releasePointerCapture(event.pointerId);
      } catch {
        // already released
      }
    }
    if (ended.moved) {
      emit({
        type: "stickerdragend",
        id: ended.id,
        x: ended.x,
        y: ended.y,
      });
      return;
    }
    if (currentDoc) paint(currentDoc);
  }

  applyModeClass();
  if (mode === "edit") bindEditListeners();

  return {
    update(doc) {
      if (destroyed) return;
      currentDoc = doc;
      if (drag) return;
      paint(doc);
    },
    setMode(nextMode, nextOnEvent) {
      if (destroyed) return;
      const next = nextMode === "edit" ? "edit" : "view";
      if (typeof nextOnEvent === "function") onEvent = nextOnEvent;
      if (next === mode) {
        if (currentDoc) paint(currentDoc);
        return;
      }
      cancelDrag();
      if (next === "view") {
        selectedId = null;
        unbindEditListeners();
      } else {
        bindEditListeners();
      }
      mode = next;
      applyModeClass();
      if (currentDoc) paint(currentDoc);
    },
    destroy() {
      destroyed = true;
      observer.disconnect();
      cancelDrag();
      unbindEditListeners();
      currentDoc = null;
      selectedId = null;
      element.classList.remove("wf-stage-edit");
      element.replaceChildren();
    },
  };
}
