# 白肉

毕业展示用静态拼贴站。公开页只看画面。设计师在本地按 F2 编辑，点右上角「保存」写回仓库，再 push 即可。GitHub Pages 托管。不用 npm，不用写代码。

## 设计师怎么改

1. 用 GitHub Desktop 把仓库拉到电脑。
2. 安装一次 [Node.js](https://nodejs.org/)（只用来双击开本地预览，不用敲命令）。
3. 双击仓库根目录的 `start.bat`。浏览器会打开本地页面。
4. 按 **F2** 进入编辑。右上角出现「保存」。再按 F2 或 Esc 退出编辑。
5. 改背景色、间距、背景图、贴纸。点右上角 **保存**。文件会直接写进这个仓库的 `data/` 和 `media/`。
6. 打开 GitHub Desktop，提交，再点 **Push origin**。等 GitHub Pages 更新后，公开网址就是新画面。

不要用 `file://` 直接打开 html。必须走 `start.bat` 开出来的本地地址，保存才能自动写盘。

公开的 GitHub Pages 网址没有编辑按钮，按 F2 也不会出现工具栏。编辑只在本地 `start.bat` 里做。

## 公开站

仓库 Settings → Pages → 分支 `main`、目录 `/`（仓库根）。打开 Pages 地址即可看拼贴。强制刷新后能看到最新提交。
