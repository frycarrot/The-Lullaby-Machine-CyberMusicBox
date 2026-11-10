# 开发说明

纯静态网页，没有构建步骤，直接放到 GitHub Pages（仓库根目录）就能用。

## 本地预览

- 双击 `手机预览.cmd`，或运行 `node tools/serve.mjs`，电脑打开 `http://localhost:8849/`。手机连同一个 Wi-Fi，打开窗口里打印的局域网地址。
- 声音需要先点一下页面上的按钮才能播放（浏览器规定）。支持 Audio Session 的浏览器会在点击播放时请求 playback 模式，并等待 AudioContext 恢复后再播放；旧版 iOS 或内嵌浏览器仍可能需要关闭静音。
- 截图检查：服务开着时运行 `node tools/shot.mjs`（可加场景名，如 `node tools/shot.mjs desktop-end`），图片在 `tools/_shots/`。它借用 `CarrotHomeSystem/tools/ui-inspector` 里装好的 Playwright 和本机 Edge。

## 文件

| 文件 | 作用 |
| --- | --- |
| `index.html` / `style.css` | 页面、按钮、寄语卡片、贴纸带码弹窗 |
| `js/musicbox.js` | 纸带码协议：解析、校验、版式、生成链接。浏览器挂在 `window.MB`，Node 里可 `require` |
| `js/notation.js` | 高音谱号路径；把旋律前 4 小节画成五线谱 SVG；图形戳点阵 SVG（卡片和盒盖阴刻共用） |
| `js/audio.js` | Web Audio 合成的八音盒音色、混响、星光叮铃 |
| `js/scene.js` | three.js 场景：追光、木雕八音盒、信封信纸、纸带路径与软纸变形、粒子 |
| `js/poster.js` | 保存图片：单张竖版信纸，整合 To、图形戳、旋律、八音盒照片（`MBScene.snapshot`）、寄语与 From；随文本加高 |
| `js/app.js` | 读链接、等字体、按钮与弹窗 |
| `vendor/three.min.js` | three.js r158 |
| `fonts/` | Pinyon Script 与 OFL 许可 |

## 几个关键约定

- **纸带码**：`[八音盒:速度|拍号|旋律:(x,y+y);...|图形:(x,y);...|To:|From:|寄语:...]`，寄语必须最后。限制都在 `musicbox.js` 的 `LIMITS` 里，改了要同步 README。
- **时间**：1 列 = 八分音符 = `30 / 速度` 秒。纸带速度恒定，音符在孔经过读孔线（`scene.js` 的 `D.combX`）时发声；声音按 AudioContext 时钟提前排好，画面跟着同一个时钟走，所以不会错拍。
- **版式**（单位：列）：前端 4 列放谱号 → 旋律 → 最后一个孔后 3 列是虚线孔 → 再 3.5 列开始图形戳。播放停在虚线孔到达读孔线的那一刻。
- **纸带变形**：纸带是一张细分平面，每帧沿一条固定路径重新摆放顶点：盒内是平的，出口处下垂并轻轻起伏，桌面部分有微微的拱起和翘起的端头。纸带只投影不接收阴影（双面薄片自阴影会整条发黑）。
- **配色**：色板在 `musicbox.js` 的 `PALETTES`（纸带 / 信封+信纸+封舌内衬 / 木色），纸带码里写 `纸带3|信封2|木色4`。木色只给一个底色，`scene.js` 的 `woodSet()` 推出外板、内壁、端面、盖子几种深浅；换木色时 `paintBoxWood()` 只重画贴图。追光偏暖，淡色要比“看起来合适”的再饱和一点才不会被染成米色。`node tools/colors.mjs` 生成 12 种组合的总览图。
- **取景**：`scene.js` 的 `resize()` 按屏幕高度留出顶部标题和底部按钮（`UI_TOP` / `UI_BOTTOM`），用 `setViewOffset` 把八音盒放在中间偏下。改了标题或按钮的高度要同步这两个数。
- **播放状态**：`rest`（盒内展示纸带，首次播放先倒回起点）→ `play` →（暂停）`paused` / （播完）`done`。暂停后接着播只重新排还没经过读孔线的音；`done` 时先倒带。
- **导出图片**：五线谱、角花这些 SVG 用 `MBNote.drawSVG` 直接画进 canvas，不走 `<img>`，避免 Safari 判定画布被污染而导不出图。
- **字体**：中文用霞鹜文楷 Light（jsDelivr 分片加载）。清松手写体 5 试过，缺大量简体字，所以没有用。3D 贴图里的字要等字体到了再画，`app.js` 会等最多 6 秒，来晚了再重画一遍。
- **网址**：`js/musicbox.js` 的 `BASE_URL` 和 README 里的链接要一起改。
