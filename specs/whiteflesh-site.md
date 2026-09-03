# White Flesh static collage site

Graduation showcase site. Static GitHub Pages. Designer with zero code edits a vertical collage: background color, full-width stacked images with visible gaps, stickers anywhere.

This spec is the source of truth for implementation and for later `/code-review` Spec axis. If code and this file disagree, this file wins until the spec is changed.

## 1. Goal

Ship a public silent visual page plus a separate Chinese editor.

Public page: stacked full-width images, gaps that show the page background color, GIFs/images floating as stickers. Works on mobile and desktop at any viewport. Hosted on GitHub Pages.

Editor: designer pulls the repo, double-clicks `start.bat`, presses **F2** to enter edit, changes color/gap/strips/stickers, clicks top-right `保存`. The local server writes `data/` and `media/` into the clone. Designer then pushes with GitHub Desktop. Public URL updates. No code. No npm. Public GitHub Pages has no editor chrome.

Inspiration only: Unity project `D:\PersonalWork\LiziGraduationProject\Lizi\Assets` and reference video `D:\PersonalWork\LiziGraduationProject\WhiteFleshWebRef\Showcase.mp4`. Do not copy Unity scenes, scripts, or the video into this repo.

## 2. Out of scope / MUST NOT

- MUST NOT copy Unity project code, prefabs, or scenes.
- MUST NOT copy `背景\0015.gif` (~400MB) or `贴纸\ggg.gif` (~35MB).
- MUST NOT ingest or commit any file `> 12MB`.
- MUST NOT put editor chrome on `index.html` (the published public page).
- MUST NOT require the designer to run a terminal or npm. Double-click `start.bat` is the designer host. Node.js is required once so that script can serve and write files.
- MUST NOT use a backend, database, or required build step for the published viewer. The local `server.mjs` exists only for designer Save-to-clone.
- MUST NOT use root-absolute URLs (`/media/...`). Relative URLs only.
- MUST NOT chroma-key, re-encode, or strip GIF frames. Render files as `<img>` (GIFs animate natively). Opaque sticker backgrounds stay opaque.
- MUST NOT add sticker rotate/free-resize in v1 (width is set on ingest; drag moves only).
- MUST NOT link the editor from the public page. F2 on the published `index.html` MUST do nothing because that page does not load editor JS.

## 3. Glossary

Use these terms in code and comments.

Domain:

- **SiteDocument**: the in-memory / JSON layout. Color, optional page wallpaper, gap, strips, stickers.
- **Page background**: `html` layer behind the collage. Solid `backgroundColor`, plus optional `backgroundImage` tiled/aligned/fixed like itch.io.
- **Strip**: one full-width stacked background image or GIF. Order in the array is top-to-bottom.
- **Sticker**: one image/GIF placed in stage space, not constrained to a strip. Floats over strips and gaps.
- **Stage**: the collage coordinate space. Width is always `1`. Y uses the same unit as X.
- **Gap**: empty band between consecutive strips. Page background (color and optional image) shows through.
- **MediaBlob**: bytes + relative path + intrinsic size, produced by ingest, committed by save.
- **Viewer**: `index.html`. No chrome. GitHub Pages public URL.
- **Editor**: `edit.html`. Chinese chrome, hidden until F2. Same stage drawing as viewer. Local `start.bat` serves this page at `/`.

Design vocabulary (keep exact): **module**, **interface**, **implementation**, **depth**, **seam**, **adapter**, **leverage**, **locality**.

## 4. Visual model

Reference look (video ~18s, 1280×720, vertical collage): white flesh, pink pipes, organ GIFs, full-width stacked images, visible gaps between images, stickers floating anywhere.

Rules:

1. The page (behind the collage) is filled with `backgroundColor`. If `backgroundImage` is set, that image paints on `html` at intrinsic size (`background-size: auto`) using `backgroundRepeat`, `backgroundAlign` → CSS `background-position`, and `backgroundFixed` → `background-attachment: fixed | scroll`. Gaps show this layer.
2. Strips stack vertically, each displayed at 100% of stage width. Height from stored intrinsic aspect ratio: `height = intrinsicHeight / intrinsicWidth` in stage units.
3. Between strip `i` and strip `i+1` there is exactly one gap of height `gap` (stage units). No extra gap above the first strip or below the last strip from `gap` itself.
4. Gaps are empty: the page background shows through. No checker is stored in the document. Editor MAY draw a non-saved checker overlay behind the stage to help judge gaps; public viewer MUST NOT.
5. Stickers are `position: absolute` in stage space and may overlap strips, gaps, other stickers, and the edges of the stage.
6. Public page is silent visual: no instructions, no editor UI, no “open editor” link. `<title>白肉</title>` is enough.
7. Seed `backgroundColor` MUST contrast with the white flesh images so gaps read as gaps. Seed value: `#f2c3d8`.

## 5. Coordinate system

Stage space:

- Origin: top-left of the first strip (top-left of the stack). If there are no strips, origin is the top-left of the stage container.
- +X right, +Y down.
- `1.0` on both axes = current stage pixel width (`container.clientWidth`).
- Layout MUST be computed from `SiteDocument` fields only (stored intrinsics + gap). MUST NOT wait on image decode to reserve size (avoids jump).

Strip `i` (0-based):

```
stripWidth  = 1
stripHeight = intrinsicHeight / intrinsicWidth
stripX      = 0
stripY      = sum_{k=0..i-1} (stripHeight_k + gap)
```

Stack height:

```
stackHeight = 0                                 if n == 0
            = sum(stripHeight) + gap * (n - 1)  if n >= 1
```

Sticker box:

```
stickerWidth  = width
stickerHeight = width * (intrinsicHeight / intrinsicWidth)
sticker left/top = (x, y)
```

Used content height (page scroll height in stage units):

```
contentHeight = max(
  stackHeight,
  max over stickers of (y + stickerHeight),
  0
)
```

Pixel mapping (implementation hides this; tests can use `layoutStage`):

```
pxX = stageX * stagePixelWidth
pxY = stageY * stagePixelWidth
```

On viewport resize, stage pixel width changes; stage units do not. Composition scales uniformly. Gap scales with width (not a raw CSS `px` that blows up on mobile).

Editor drag clamp (on commit):

- Keep at least `0.02` stage units of the sticker horizontally inside `(0, 1)`.
- Y is not clamped. Stickers may sit above the first strip (`y < 0`) or below the stack; `contentHeight` grows.

Z-order: sticker `z` ascending, later paint on top. New sticker `z = max(existing z, 0) + 1`. Drag MUST NOT change `z`.

## 6. Data shape

Committed file: `data/site.json` (UTF-8, JSON). Viewer and editor both read this file with a relative URL from the site root: `data/site.json`.

`src` values are relative to the site root (the directory that contains `index.html`), never relative to the JSON file, never `http(s):`, never `data:`, never `blob:` in the committed file.

### 6.1 Schema v1

```json
{
  "schemaVersion": 1,
  "backgroundColor": "#f2c3d8",
  "backgroundImage": null,
  "backgroundRepeat": "repeat",
  "backgroundAlign": "center",
  "backgroundFixed": false,
  "gap": 0.06,
  "strips": [
    {
      "id": "strip-flesh-torso",
      "src": "media/bg/flesh-torso.png",
      "intrinsicWidth": 1920,
      "intrinsicHeight": 1080
    }
  ],
  "stickers": [
    {
      "id": "sticker-spine-walker",
      "src": "media/sticker/spine-walker.gif",
      "x": 0.08,
      "y": 0.35,
      "width": 0.18,
      "z": 1,
      "intrinsicWidth": 648,
      "intrinsicHeight": 659
    }
  ]
}
```

| Field | Type | Rules |
|---|---|---|
| `schemaVersion` | number | MUST be `1`. Other values → parse error. |
| `backgroundColor` | string | `#` + 6 hex digits, e.g. `#f2c3d8`. Case-insensitive. No alpha. |
| `backgroundImage` | string or `null` | Optional. Missing/`null`/`""` → no page wallpaper. Else a valid `media/` src. SHOULD live under `media/page/`. |
| `backgroundRepeat` | string | Optional. Default `repeat`. One of `no-repeat`, `repeat`, `repeat-x`, `repeat-y`. |
| `backgroundAlign` | string | Optional. Default `center`. One of `top-left`, `top`, `top-right`, `left`, `center`, `right`, `bottom-left`, `bottom`, `bottom-right`. Maps to CSS `background-position`. |
| `backgroundFixed` | boolean | Optional. Default `false`. `true` → `background-attachment: fixed`. |
| `gap` | number | Finite, `>= 0`, `<= 2`. |
| `strips` | array | Order = visual top-to-bottom. May be empty. |
| `strips[].id` | string | Non-empty. Unique among all strip and sticker ids. |
| `strips[].src` | string | Root-relative media path. See path rules. |
| `strips[].intrinsicWidth` | number | Finite, `> 0`. |
| `strips[].intrinsicHeight` | number | Finite, `> 0`. |
| `stickers` | array | May be empty. |
| `stickers[].id` | string | Same uniqueness rule as strips. |
| `stickers[].src` | string | Root-relative media path. |
| `stickers[].x` | number | Finite. |
| `stickers[].y` | number | Finite. |
| `stickers[].width` | number | Finite, `> 0`, `<= 2`. |
| `stickers[].z` | number | Finite integer. |
| `stickers[].intrinsicWidth` | number | Finite, `> 0`. |
| `stickers[].intrinsicHeight` | number | Finite, `> 0`. |

Unknown extra JSON keys: ignore on parse, drop on serialize (forward-tolerant read, strict write).

### 6.2 Path rules for `src`

A valid `src` MUST match all of:

- Characters: ASCII letters, digits, `/`, `.`, `-`, `_` only.
- MUST start with `media/`.
- MUST NOT contain `..`.
- MUST NOT start with `/`.
- MUST NOT contain `\`.
- MUST NOT contain `://`.
- Strips SHOULD live under `media/bg/`.
- Stickers SHOULD live under `media/sticker/`.
- Page wallpaper SHOULD live under `media/page/`.

### 6.3 Parse errors

`parseSiteDocument` fails (does not throw through the viewer; returns an error the host displays) when:

- JSON is not an object.
- `schemaVersion` missing or not `1`.
- Required fields missing or wrong type.
- Duplicate ids.
- Invalid `src`.
- Non-finite numbers, `gap` out of range, `width` out of range, intrinsic ≤ 0.

Viewer on parse/fetch failure: fill the page with `#f2c3d8` (or last known good color if any), draw nothing else, log the error. MUST NOT show editor chrome. MUST NOT blank-crash the page (no uncaught exception).

Editor on parse/fetch failure: Chinese message `无法加载 data/site.json`, offer to start from an empty document (color `#f2c3d8`, `gap` 0.06, empty arrays).

## 7. Modules and interfaces

Four deep modules. Callers learn these interfaces only. Implementation stays behind them.

### 7.1 SiteDocument

**Category:** in-process (pure). No I/O.

**Interface** (small; this is the test surface):

```
parseSiteDocument(jsonText | object) -> { ok: true, doc } | { ok: false, error }
serializeSiteDocument(doc) -> string   // stable pretty JSON, 2-space, trailing newline
layoutStage(doc) -> Layout
applyOp(doc, op) -> { ok: true, doc } | { ok: false, error }
```

`Layout`:

```
{
  stackHeight,
  contentHeight,
  strips:  [{ id, src, x, y, width, height }],
  stickers:[{ id, src, x, y, width, height, z }]
}
```

Stickers in `Layout` MUST be sorted by `z` ascending, then `id` for ties.

`op` is a tagged object. Exhaustive v1 list:

| `op.type` | Fields | Effect |
|---|---|---|
| `setBackgroundColor` | `backgroundColor` | Replace color after validating hex. |
| `setBackgroundImage` | `src` | `null`/`""` clears. Else validate as `src` and set `backgroundImage`. Does not delete the file. |
| `setBackgroundRepeat` | `backgroundRepeat` | One of `no-repeat`, `repeat`, `repeat-x`, `repeat-y`. |
| `setBackgroundAlign` | `backgroundAlign` | One of the nine align tokens. |
| `setBackgroundFixed` | `backgroundFixed` | Boolean. |
| `setGap` | `gap` | Replace gap after validating range. |
| `addStrip` | `id?`, `src`, `intrinsicWidth`, `intrinsicHeight`, `index?` | Insert. Default index = append. Default id = `strip-` + unique suffix. |
| `removeStrip` | `id` | Remove. Error if missing. Does not delete the file. |
| `moveStrip` | `id`, `toIndex` | Reorder. `toIndex` clamped to `[0, length-1]`. |
| `addSticker` | `id?`, `src`, `x`, `y`, `width?`, `intrinsicWidth`, `intrinsicHeight` | Default width `0.2`. Default id = `sticker-` + unique suffix. `z = maxZ+1`. |
| `removeSticker` | `id` | Remove. Error if missing. Does not delete the file. |
| `moveSticker` | `id`, `x`, `y` | Set position (after clamp on x as in §5). |

`applyOp` MUST treat `doc` as immutable: return a new object, never mutate the input.

Unknown `op.type` → `{ ok: false }`.

**Depth:** parse, invariants, layout math, and all mutations sit here. Viewer, editor, and tests call `applyOp` + `layoutStage`. They do not reimplement gap math.

### 7.2 Media ingest

**Category:** in-process / local File. One production path. Tests pass a `File` (or a structural fake with the same fields). Do not invent a persist port here.

**Interface:**

```
ingest(file, role) -> Promise<
  | { ok: true, blob: MediaBlob, previewUrl: string }
  | { ok: false, error: IngestError }
>
```

`role`: `'strip' | 'sticker' | 'page'`.

`MediaBlob`:

```
{
  relativePath,     // media/bg/<ascii> or media/sticker/<ascii> or media/page/<ascii>
  bytes,            // ArrayBuffer
  mime,             // image/gif | image/png | image/jpeg | image/webp
  byteLength,
  intrinsicWidth,
  intrinsicHeight
}
```

`previewUrl`: blob: URL for immediate stage preview. Editor owns revoke-on-replace/destroy. Committed JSON MUST NEVER store `blob:` or `previewUrl`.

**IngestError codes** (Chinese `message` for editor UI):

| code | when | message |
|---|---|---|
| `too-large` | `file.size > 12 * 1024 * 1024` | `文件过大（超过 12MB）` |
| `unsupported-type` | MIME/extension not in allowlist | `不支持的格式` |
| `unreadable` | cannot decode dimensions | `无法读取图片` |

Allowlist: `.gif .png .jpg .jpeg .webp` and MIME `image/gif image/png image/jpeg image/webp`. Empty MIME: trust extension if in allowlist, then verify decode.

**ASCII rename:** output filename uses `[a-z0-9._-]`. If the original base is already ASCII and unique, keep a slug of it. Otherwise `strip-<8hex>.<ext>`, `sticker-<8hex>.<ext>`, or `page-<8hex>.<ext>`. Spaces, CJK, and punctuation are not copied into `relativePath`. Collision: append `-2`, `-3`, … against already-used paths in the current document + pending blobs.

**Dimensions:** decode via `createImageBitmap` or `Image()`. GIF: first-frame size is enough.

**MUST NOT** write to disk. Ingest only produces a `MediaBlob`. Persist writes it on Save.

### 7.3 StageRenderer

**Category:** DOM. Shared by viewer and editor. **Leverage:** one drawing path so public and editor cannot drift.

Internal seam (pure, also the geometry test surface if DOM tests are heavy): consume `layoutStage(doc)`. Do not recompute strip Y in the renderer.

**Interface:**

```
createStage(element, options) -> StageHandle

options = {
  mode: 'view' | 'edit',
  onEvent?: (event) => void
}

StageHandle = {
  update(doc): void,     // replace drawn layout from doc
  destroy(): void
}
```

`update` MUST use `layoutStage(doc)` and the committed `src` paths, except: while a sticker/strip is pending ingest, the host MAY pass a transient document whose `src` is the `previewUrl`. That transient document is editor-only memory; Save serializes committed relative paths.

Events (edit mode only; view mode MUST NOT emit):

| event.type | fields |
|---|---|
| `stickerselect` | `id` (string or `null` if deselect) |
| `stickerdragend` | `id`, `x`, `y` (stage units, x clamped) |

Live drag preview MAY stay inside the renderer until `stickerdragend`. The SiteDocument updates on `stickerdragend` at minimum (live `applyOp` on move is allowed).

View mode:

- No selection outline, no drag, no handles, no toolbar leakage.
- Pointer events on stickers: none needed. Page scrolls normally.
- GIFs animate.

Edit mode:

- Click sticker → select.
- Click empty stage → deselect (`id: null`).
- Pointer drag on selected or any sticker moves it (touch + mouse). `touch-action: none` on stickers.
- Selected sticker: 2px outline. Outline is editor-only, not in the document.

Implementation constraints:

- Draw with DOM `<img>`, not canvas (GIF animation).
- Strips: block, width 100% of stage, height from layout aspect.
- Stickers: absolutely positioned from stage units.
- `overflow-x: hidden` on the stage; vertical overflow visible (page scroll).
- Observe container width (`ResizeObserver`) and re-map pixels. Callers do not listen to resize.
- `createStage` does not fetch JSON and does not save.

Deletion test: if this module is deleted, both `index.html` and `edit.html` would each reimplement stacking, gaps, sticker mapping, and resize. That is the depth this module earns.

### 7.4 Persist

**Category:** true I/O. **Real seam** (two+ adapters).

**Interface (port):**

```
PersistPort = {
  load() -> Promise<{ ok: true, doc } | { ok: false, error }>,
  save(doc, blobs: MediaBlob[]) -> Promise<SaveResult>
}

SaveResult = {
  ok: boolean,
  method: 'fs' | 'zip' | 'fetch' | 'memory',
  filesWritten: string[],   // root-relative paths
  message?: string          // Chinese for editor
}
```

`load` always returns a parsed `SiteDocument` or error. It does not mount the stage.

Adapters:

| Adapter | Used by | `load` | `save` |
|---|---|---|---|
| `PublishedFetchAdapter` | viewer; editor initial load | `fetch('data/site.json')` relative | `ok: false` (`viewer cannot save`) |
| `LocalDevAdapter` | editor Save when `start.bat` / `server.mjs` is running | same fetch | POST `/__wf/save`, write clone |
| `FileSystemAccessAdapter` | editor Save fallback, Chromium | not required for v1 (editor loads via fetch) | `showDirectoryPicker`, write files |
| `ZipDownloadAdapter` | editor Save fallback | n/a | build zip, trigger download |
| `MemoryAdapter` | tests | in-memory json | in-memory map |

One adapter would be a hypothetical seam. Fetch vs local-dev vs FS vs zip vs memory → real seam. SiteDocument and StageRenderer MUST depend on `PersistPort`, not on `fetch` / `showDirectoryPicker` directly.

`save` writes at least:

- `data/site.json` (from `serializeSiteDocument(doc)` with committed relative `src` values, never blob URLs)
- each `MediaBlob.relativePath`

`save` MAY write `.nojekyll` (empty) if missing when using FS adapter.

`save` MUST NOT overwrite `index.html`, `edit.html`, or `js/` unless those files are absent (they are not part of designer media save).

## 8. Pages and files

| Path | Role |
|---|---|
| `index.html` | Public viewer. Stage root only. No editor CSS. No toolbar. |
| `edit.html` | Designer page. Stage + hidden Chinese chrome. F2 toggles edit. Top-right `保存`. |
| `start.bat` | Designer double-click host. Opens local `http://127.0.0.1:4173/` as `edit.html`. |
| `server.mjs` | Local static server + `/__wf/save` write of `data/` and `media/`. Not used on Pages. |
| `.nojekyll` | Empty. GitHub Pages: do not run Jekyll. |
| `data/site.json` | Committed layout. |
| `media/bg/` | Strip files, ASCII names. |
| `media/sticker/` | Sticker files, ASCII names. |
| `media/page/` | Page wallpaper files, ASCII names. |
| `css/stage.css` | Shared stage rules. Linked from both HTML files. |
| `css/editor.css` | Editor chrome. Linked from `edit.html` only. |
| `js/site-document.js` | SiteDocument module. |
| `js/media-ingest.js` | Ingest module. |
| `js/stage-renderer.js` | StageRenderer module. |
| `js/persist.js` | Port + adapters. |
| `js/viewer.js` | Boot viewer: fetch → parse → createStage view. |
| `js/editor.js` | Boot designer page: fetch → createStage view → F2 edit chrome → save. |
| `vendor/jszip.min.js` | Optional vendored zip impl for ZipDownloadAdapter. Committed file. No npm for designer. |
| `README.md` | Designer + Pages instructions (Chinese). |

Vanilla ES modules, relative imports, no bundler required. `type="module"` is OK because the supported editor host is GitHub Pages HTTPS, not `file://`.

`index.html` MUST include `<meta name="viewport" content="width=device-width, initial-scale=1">`. Same on `edit.html`.

`index.html` body: margin 0. Page background from the document (color + optional image) set by JS after load, fallback `#f2c3d8` in CSS. Wallpaper paints on `html`; `body` is transparent when an image is set so gaps show the tiles.

## 9. Editor UI (Chinese)

`edit.html` chrome language: Simplified Chinese. Public page: no copy required.

Required controls:

| Control | Label | Behavior |
|---|---|---|
| Color | `背景色` | `input type="color"` bound to `backgroundColor`. |
| Page wallpaper preview | (click gray box) | File picker, `role: 'page'`, ingest, `setBackgroundImage`. Shows thumbnail when set. |
| Repeat | `重复` | `无` `no-repeat` / `平铺` `repeat` / `水平` `repeat-x` / `垂直` `repeat-y`. Disabled with no image. |
| Align | `对齐` | Nine-point align. Disabled with no image. |
| Fixed | `固定` | Checkbox → `backgroundFixed`. Disabled with no image. |
| Remove wallpaper | `移除图片` | `setBackgroundImage` `src: null`. Disabled with no image. |
| Gap | `间距` | Range slider `0`–`0.4` step `0.005`, plus numeric readout. `applyOp setGap`. |
| Strip list | `背景图` | One row per strip, thumbnail or filename, in order. |
| Add strip | `添加背景图` | File picker, `role: 'strip'`, ingest, `addStrip`. |
| Strip up | `上移` | `moveStrip` toIndex-1. |
| Strip down | `下移` | `moveStrip` toIndex+1. |
| Strip delete | `删除` | `removeStrip`. Confirm not required. |
| Add sticker | `添加贴纸` | File picker, `role: 'sticker'`. Place at viewport-center converted to stage units. `addSticker`. |
| Delete sticker | `删除所选贴纸` | `removeSticker` on selection. Disabled when none selected. |
| Save | `保存` | Fixed top-right. Visible only in edit mode. Run save flow §10. |
| Status | (live text) | Success / error messages below. |
| Edit toggle | `F2` | Enter / leave edit mode. Esc leaves edit. Hidden on public `index.html`. |

File pickers: `accept="image/gif,image/png,image/jpeg,image/webp,.gif,.png,.jpg,.jpeg,.webp"`.

Layout of chrome: a panel that does not cover the whole collage. Desktop: panel at top or left, stage remains visible and scrollable. Mobile: panel stacked above the stage, collapsible is allowed but not required. Stage still uses full viewport width.

Editor MUST work for the listed operations with a mouse and with a finger (sticker drag).

## 10. Save flow

No backend. Save produces files the designer uploads to GitHub.

### 10.1 In-memory until Save

Edits live in the current `SiteDocument` plus a list of pending `MediaBlob`s. Object URLs are for preview. Closing the tab without Save discards them. Opening `edit.html` always `load()`s published `data/site.json` (fetch). Directory handle persistence across visits is optional and not required.

### 10.2 Click `保存`

1. `serializeSiteDocument(doc)` MUST use `media/...` paths for every strip/sticker. If a pending blob exists, its `relativePath` is already the `src`.
2. If the page is served by `server.mjs` (`GET /__wf/ping` ok): POST `/__wf/save` with `data/site.json` and pending media. Write into the clone. Status: `已保存到仓库，请 push 到 GitHub`. `method: 'local'`.
3. Else try File System Access (Chromium):
   - `window.showDirectoryPicker({ mode: 'readwrite' })`.
   - User selects the **repo root** (folder that contains or will contain `index.html`).
   - Create `data/` if needed. Write `data/site.json`.
   - For each pending `MediaBlob`, create `media/bg`, `media/sticker`, or `media/page` as needed, write the file.
   - If `.nojekyll` is missing, write an empty one.
   - Status: `已保存到文件夹`. `method: 'fs'`.
4. If local write and FS are missing, denied, or throw: Zip fallback.
   - Zip root = repo root layout.
   - Always include `data/site.json`.
   - Include every pending blob at its `relativePath`.
   - Include `.nojekyll` as empty file.
   - Do not need to re-pack already-committed media that was not changed.
   - Download filename: `whiteflesh-site.zip`.
   - Status: `无法写入文件夹，改为下载 ZIP` when falling back from FS failure; `已下载 ZIP` when FS was never available; `无法写入本地仓库，改为下载 ZIP` when local ping existed but write failed.
   - `method: 'zip'`.
5. Designer pushes with GitHub Desktop. Pages rebuilds. Viewer reads the new JSON + media.

### 10.3 Designer loop (required README steps, Chinese)

README MUST say, in this order:

1. Pull the repo with GitHub Desktop.
2. Double-click `start.bat`. Browser opens the local page.
3. Press **F2**. Edit. Click top-right `保存`.
4. In GitHub Desktop, commit and **Push origin**.
5. Wait for Pages. Hard-refresh the public URL.

MUST NOT tell the designer to run `git` on the command line. GitHub Desktop is the GUI push path. `start.bat` is the only local host they need.

### 10.4 What the viewer reads after publish

`PublishedFetchAdapter.load` → `data/site.json` → `parseSiteDocument` → `createStage(..., { mode: 'view' }).update(doc)`. Images load from relative `src`.

## 11. GitHub Pages

- Source: repo root (not `/docs`).
- Relative URLs so project pages (`https://USER.github.io/REPO/`) and user pages both work.
- `.nojekyll` present.
- No Jekyll `_config.yml` required.
- No GitHub Action required. Default Pages from branch root is enough.
- After designer upload, Pages serves new JSON. No rebuild of JS needed for content-only edits.

## 12. Responsive

MUST:

- Viewport meta on both pages.
- Stage width = 100% of the layout viewport. No fixed 1280px stage.
- No horizontal scrollbar at 320px–4K (stickers may be clipped by `overflow-x: hidden`).
- Vertical scroll for the collage.
- Touch drag on stickers in editor (`pointer` events, not mouse-only).
- Gap and sticker sizes scale with width because they are stage units.

CSS `px` is allowed for editor chrome (buttons, padding), not for gap between strips.

## 13. Seed assets

Copy from pack `D:\PersonalWork\LiziGraduationProject\WhiteFleshWebRef\白肉(1)\白肉\`. Rename to ASCII. Skip any file `> 12MB`.

**MUST NOT copy:**

- `背景\0015.gif`
- `贴纸\ggg.gif`

**MUST copy (Phase 1):**

| Source | Dest |
|---|---|
| `背景\0000.png` | `media/bg/flesh-torso.png` |
| `背景\0001-export.png` | `media/bg/pink-pipes.png` |
| `背景\心脏怪人1.gif` | `media/bg/heart-figure.gif` |
| `背景\无头1.gif` | `media/bg/headless.gif` |
| `背景\脑子怪人2.gif` | `media/bg/brain-figure.gif` |
| `贴纸\0000.gif` | `media/sticker/spine-walker.gif` |
| `贴纸\crawl1.gif` | `media/sticker/crawl.gif` |
| `贴纸\walk9.gif` | `media/sticker/walk.gif` |
| `贴纸\飞行的眼1.gif` | `media/sticker/flying-eye.gif` |
| `贴纸\太阳1.gif` | `media/sticker/sun.gif` |
| `贴纸\月亮1.gif` | `media/sticker/moon.gif` |
| `贴纸\教皇1.gif` | `media/sticker/pope.gif` |

Optional extra copies allowed if `<= 12MB` and ASCII-renamed. Not required.

Seed `data/site.json` MUST include all five strips in the dest-table order, `gap: 0.06`, `backgroundColor: "#f2c3d8"`, and at least five stickers at distinct `(x, y)` so some sit on images and some sit in gaps. Intrinsic fields MUST match real pixel sizes of the copied files.

Do not commit `specs/_frames` or the reference video.

## 14. Security / robustness

- Reject `src` that escape `media/` (§6.2).
- Cap ingest at 12MB before reading the whole file into a second buffer when `file.size` is already known.
- Viewer: failed `<img>` still occupy layout box (empty/broken, size from intrinsic). Do not collapse the stack.
- Editor ingest error: show the Chinese `message`, do not add a strip/sticker.
- No eval, no inline remote scripts besides optional nothing. Vendor zip is local.

## 15. Acceptance

Global, all phases that ship the relevant surface:

**A1.** Opening `index.html` on GitHub Pages shows the stacked collage, pink-ish gaps, animated GIFs, stickers not locked to a grid.

**A2.** `index.html` has no color picker, no file input, no save button, no Chinese editor labels.

**A3.** Resizing the browser from ~320px wide to desktop keeps strips full-width, gaps proportional, stickers in the same relative places.

**A4.** Local `start.bat` opens `edit.html`. Designer presses F2, then can change color, gap, add/delete/reorder strips, add local images as stickers, drag stickers, without writing code. Public `index.html` stays chrome-free.

**A5.** Local Save writes `data/site.json` + new media into the clone. Designer pushes. After Pages refresh, `index.html` shows the new layout. Folder picker / zip remain fallbacks when the local server is not running.

**A6.** Files `> 12MB` are refused with `文件过大（超过 12MB）`. `0015.gif` and `ggg.gif` are not in the repo.

**A7.** All committed URLs are relative. `.nojekyll` exists. No npm step to view the site.

**A8.** Editor strings listed in §9 appear in Chinese. Public page needs no body text.

**A9.** `parseSiteDocument` / `layoutStage` / `applyOp` cover mutations; renderer does not duplicate stack math.

**A10.** Viewer fetch failure does not throw through to a blank white error page.

## 16. Spec axis notes (for later review)

A change fails this spec if it:

- Hosts editor UI on published `index.html`.
- Requires `npm run build` for the designer. `start.bat` / Node is the intended designer host, not a fail.
- Stores sticker positions in raw CSS pixels.
- Uses a single combined HTML for view+edit toggled by a query param that still injects chrome on the public URL (query-param editor on `index.html` is a fail).
- Commits `0015.gif` or `ggg.gif` or any `> 12MB` file.
- Saves `blob:` URLs into `data/site.json`.
- Implements two different stacking algorithms in viewer vs editor.

A change is not a fail if it:

- Adds `vendor/jszip.min.js`.
- Adds JSDoc types.
- Adds an extra optional seed image `<= 12MB`.
- Adds an editor-only unsaved checker overlay.
- Uses GitHub Desktop wording in README in addition to web upload.
