/**
 * Apply SiteDocument page background to html/body.
 * Gaps show this layer. Stage itself stays transparent.
 */

import { pageBackgroundStyle } from "./site-document.js";

const FALLBACK_COLOR = "#f2c3d8";

function cssUrl(src) {
  return `url(${JSON.stringify(src)})`;
}

/**
 * @param {object | null} doc
 * @param {(src: string) => string=} resolveSrc
 */
export function applyPageBackground(doc, resolveSrc) {
  const html = document.documentElement;
  const body = document.body;
  const style = pageBackgroundStyle(
    doc || {
      backgroundColor: FALLBACK_COLOR,
      backgroundImage: null,
      backgroundRepeat: "repeat",
      backgroundAlign: "center",
      backgroundFixed: false,
    }
  );
  const color = style.color || FALLBACK_COLOR;
  html.style.backgroundColor = color;
  html.style.backgroundSize = "auto";
  if (style.imageSrc) {
    const src =
      typeof resolveSrc === "function" ? resolveSrc(style.imageSrc) : style.imageSrc;
    html.style.backgroundImage = cssUrl(src);
    html.style.backgroundRepeat = style.repeat;
    html.style.backgroundPosition = style.position;
    html.style.backgroundAttachment = style.attachment;
    body.style.background = "transparent";
    return;
  }
  html.style.backgroundImage = "none";
  html.style.backgroundRepeat = "";
  html.style.backgroundPosition = "";
  html.style.backgroundAttachment = "";
  html.style.backgroundSize = "";
  body.style.background = color;
}
