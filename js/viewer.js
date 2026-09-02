/**
 * Viewer boot. Fetch → parse → createStage view. No editor chrome.
 */

import { createStage } from "./stage-renderer.js";
import { PublishedFetchAdapter } from "./persist.js";

const FALLBACK_COLOR = "#f2c3d8";

function setPageColor(color) {
  const value = color || FALLBACK_COLOR;
  document.documentElement.style.backgroundColor = value;
  document.body.style.backgroundColor = value;
}

function failSafe(err) {
  setPageColor(FALLBACK_COLOR);
  if (err) console.error(err);
}

async function boot() {
  setPageColor(FALLBACK_COLOR);
  const root = document.getElementById("stage");
  if (!root) {
    failSafe(new Error("missing #stage"));
    return;
  }

  let stage;
  try {
    stage = createStage(root, { mode: "view" });
  } catch (err) {
    failSafe(err);
    return;
  }

  try {
    const result = await PublishedFetchAdapter.load();
    if (!result.ok) {
      failSafe(result.error);
      return;
    }
    setPageColor(result.doc.backgroundColor);
    stage.update(result.doc);
  } catch (err) {
    failSafe(err);
  }
}

boot();
