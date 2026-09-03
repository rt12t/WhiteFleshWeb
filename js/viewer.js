/**
 * Viewer boot. Fetch → parse → createStage view. No editor chrome.
 */

import { createStage } from "./stage-renderer.js";
import { PublishedFetchAdapter } from "./persist.js";
import { applyPageBackground } from "./page-background.js";

function failSafe(err) {
  applyPageBackground(null);
  if (err) console.error(err);
}

async function boot() {
  applyPageBackground(null);
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
    applyPageBackground(result.doc);
    stage.update(result.doc);
  } catch (err) {
    failSafe(err);
  }
}

boot();
