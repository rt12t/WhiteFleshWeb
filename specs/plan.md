# White Flesh implementation plan

Planner-only. Implementers follow `specs/whiteflesh-site.md` plus this file. Max 3 serial phases. Each phase shippable on GitHub Pages.

## Design twice (chosen)

Two shapes considered for the core:

**A. Document-as-JSON, hosts paint.** Viewer and editor each walk `strips`/`stickers` and set CSS. Persist is `fetch` + ad-hoc download. Small code. Layout math leaks to both hosts. Save logic leaks into editor chrome. **Shallow.** Deletion test fails: delete “renderer” and both pages still hold the algorithm.

**B. Four deep modules, two hosts.** `SiteDocument` owns parse, invariants, layout, ops. `MediaIngest` owns file→blob+ASCII path. `StageRenderer` owns DOM mapping for view and edit. `PersistPort` has four adapters (fetch, fs, zip, memory). Hosts only boot. **Deep.** Same layout for public + editor. Save swaps adapters without touching the stage.

**Pick B.** Depth sits at SiteDocument (layout+ops) and Persist (I/O). StageRenderer is the second leverage point: one drawing path. Ingest stays a function, not a fake persist port (one production path; tests pass `File`).

Rejected extra seams: no virtual-fs for ingest, no canvas renderer, no CSS-pixel document, no query-param editor on `index.html`.

## Modules

| Module | Interface (caller learns this) | Implementation hides | Seam / adapters | Dep category |
|---|---|---|---|---|
| **SiteDocument** | `parseSiteDocument`, `serializeSiteDocument`, `layoutStage`, `applyOp` | hex/gap/src validation, strip Y, contentHeight, id uniqueness, immutable ops | none (pure) | in-process |
| **MediaIngest** | `ingest(file, role)` | 12MB cap, MIME, decode, ASCII rename, collision | none (File in, MediaBlob out) | in-process / local File |
| **StageRenderer** | `createStage(el, {mode, onEvent}).update(doc)` | ResizeObserver, px map, GIF `<img>`, drag, selection outline | internal: consume `layoutStage` | DOM |
| **Persist** | `PersistPort.load/save` | fetch, directory write, zip, memory | **real seam**: PublishedFetch, FileSystemAccess, ZipDownload, Memory | true I/O |

**Leverage:** hosts and tests call the four interfaces. Gap math changes once. Save method changes once per adapter.

**Locality:** bugs in stacking live in `js/site-document.js`. Bugs in drag live in `js/stage-renderer.js`. Bugs in GitHub upload live in `js/persist.js`.

**Internal vs external seams:** StageRenderer’s use of `layoutStage` is internal to drawing. Do not export a second public layout from the renderer. Persist is the only external I/O seam.

## File list (all phases)

```
.nojekyll
index.html
edit.html
start.bat
server.mjs
README.md
css/stage.css
css/editor.css
data/site.json
js/site-document.js
js/media-ingest.js
js/stage-renderer.js
js/persist.js
js/viewer.js
js/editor.js
vendor/jszip.min.js
media/bg/flesh-torso.png
media/bg/pink-pipes.png
media/bg/heart-figure.gif
media/bg/headless.gif
media/bg/brain-figure.gif
media/sticker/spine-walker.gif
media/sticker/crawl.gif
media/sticker/walk.gif
media/sticker/flying-eye.gif
media/sticker/sun.gif
media/sticker/moon.gif
media/sticker/pope.gif
specs/whiteflesh-site.md
specs/plan.md
```

Vanilla ES modules. Relative imports. No bundler. No required npm for designer.

## Host wiring

`js/viewer.js`: `PublishedFetchAdapter.load` → `createStage(root, {mode:'view'}).update(doc)`. On fail: page color `#f2c3d8`, no chrome.

`js/editor.js`: same load → `createStage(root, {mode:'view'})`. F2 → `setMode('edit')` + chrome. Save: `LocalDevAdapter` when `/__wf/ping` ok, else `FileSystemAccessAdapter` then `ZipDownloadAdapter`. Pending `MediaBlob[]` passed into `save`.

Do not import editor modules from `index.html`.

## Phase split

Serial. Stop after each phase with a working Pages site.

### Phase 1 — foundation + viewer + seed

Shippable public collage. No editor yet (`edit.html` may be absent).

Create SiteDocument, StageRenderer (view mode only is enough if edit events are stubbed but unused), PublishedFetchAdapter, viewer boot, CSS stage, seed media + JSON, `.nojekyll`.

Skip ingest, editor chrome, fs/zip.

### Phase 2 — editor

Shippable `edit.html`. Designer changes color, gap, strips, stickers, drag. Preview uses blob URLs. Closing tab loses work. No Save yet (or Save disabled with Chinese `尚未实现保存` is OK; prefer omit Save until Phase 3 so A5 is not half-true).

Add MediaIngest, editor chrome, StageRenderer edit events, `applyOp` wiring.

### Phase 3 — save/export + README + polish

Shippable designer loop: Save → FS or ZIP → GitHub web upload → public URL updates. README Chinese. Responsive polish (320px, touch drag). Vendor JSZip. FileSystemAccess + ZipDownload adapters.

## Seed copy (Phase 1, implementer)

From `D:\PersonalWork\LiziGraduationProject\WhiteFleshWebRef\白肉(1)\白肉\`.

Skip `背景\0015.gif`, `贴纸\ggg.gif`, any `> 12MB`.

Rename per spec table. Write `data/site.json` with real intrinsics:

- flesh-torso.png 1920×1080
- pink-pipes.png 1932×1092
- heart-figure.gif 1600×899
- headless.gif 1653×925
- brain-figure.gif 2069×1165
- spine-walker.gif 648×659
- crawl.gif 574×470
- walk.gif 493×581
- flying-eye.gif 318×226
- sun.gif 204×315
- moon.gif 288×382
- pope.gif 166×150

## Test surface (no extra framework required)

If tests are added, they target interfaces:

- `parseSiteDocument` / `applyOp` / `layoutStage` (pure, easiest).
- `ingest` with small fixture files.
- Persist `MemoryAdapter`.

Do not test renderer internals (DOM class names). Do not test GitHub.

## Implementation notes

- `<img>` not canvas → GIF animation.
- Sticker `src` in committed JSON never `blob:`.
- Gap is stage units, not CSS `px`.
- `touch-action: none` on editor stickers.
- `showDirectoryPicker` needs HTTPS (Pages) and a user gesture (the `保存` click).
- JSZip: commit min file under `vendor/`. Do not `npm install` as a designer step.
- Editor UI Simplified Chinese labels from spec §9.
- Public `<title>白肉</title>`.
