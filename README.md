# White Flesh

[中文](README.zh-CN.md)

## Requirements

- [Node.js](https://nodejs.org/) (local preview server only)

## Edit

1. Clone this repository.
2. Install Node.js once.
3. Double-click `start.bat` in the repository root. The browser opens `http://127.0.0.1:4173/`.
4. Press **F2** to enter edit mode. Press **F2** or **Esc** to exit.
5. Edit background color, spacing, background strips, and stickers.
6. Click **保存** at the top right. Changes are written to `data/` and `media/`.
7. Commit and push to `origin`.

Do not open HTML via `file://`. Editing is available only on the local `start.bat` server, not on the public GitHub Pages URL.

## Publish

1. Open the repository on GitHub → **Settings** → **Pages**.
2. Set source to branch `main`, folder `/` (root).
3. Open the Pages URL. Hard-refresh after each push.
