# 官网可编辑源文件

`index.html`、`support.html` 从既有导出包提取，资源改用本地文件并在第一个运行时脚本前加入 `window.__resources` 映射。首页采用 2026-09-29 的双语设计稿，支持页沿用原有内容与深链；`credits.html` 列出截图素材的作者、来源与许可。日常修改这三个源文件及 `motion.js`，无需编辑巨大的 base64 导出包。

```sh
python3 scripts/build-site.py --check
python3 scripts/build-site.py --out /absolute/path/to/site-output
python3 -m http.server 8080 --directory /absolute/path/to/site-output
```

在浏览器打开 `http://localhost:8080/`。资源使用 `/assets/` 根路径，需要从站点根部署和预览；不能直接双击 HTML，也不适用于未配置根路径的子目录部署。

`../assets/` 按解码后原始内容的完整 SHA-256 命名，同内容只保留一份；`asset-manifest.json` 记录来源 UUID、外部模块映射、大小和校验值。构建会验证资源存在及哈希，输出三页、资源和 `build-report.json`，报告原包大小、共享资源收益及 gzip 估算；不会读取、复制或覆盖独立维护的隐私页、CNAME 或服务器配置。输出目录复用时不会删除其他文件，正式发布宜选空目录并明确合并独立页面。

原始导入命令为 `python3 scripts/build-site.py --extract-bundles --out /absolute/path/to/site-output`，已有 `src` 时会拒绝再次导入，防止覆盖后续编辑。

Apple 下载徽章与 TMDB 标志直接采用官方 SVG，来源记录在资源清单。开放影片逐图署名位于 `credits.html`；不包含未使用的 Agent 327 素材。首页图片仅展示，中英文截图随页面语言切换，播放器共用一张示意画面，播放诊断沿用原先的双语素材与裁切高度。

可选的 `src/motion.js` 由源码维护者编辑。在页面需要的位置加入 `<script src="__SITE_MOTION__"></script>`，构建会以其内容哈希生成输出 `assets/*.js` 并仅在输出 HTML 中替换占位地址；不会重写源 HTML 或 JavaScript。两页引用同一份输出资源。无占位引用时不额外打包该脚本。

运行方式：首个内联脚本提供本地资源映射，原 DC runtime 据此加载本地 React / ReactDOM 并渲染 `x-dc` 与 `text/x-dc`；不再需要导出包的 gzip 解压、Blob URL 或整页替换 loader。当前页面没有 `x-import`，因此不需要 `__resourceBlobs` 或 Babel CDN。仍需 JavaScript；原 runtime 使用 `new Function`，部署时若配置 CSP，应按实际运行方式检查兼容性。此拆包不修改运行时安全策略。

动画可访问性回归检查使用 Node.js 内置测试工具，无需安装依赖：`node --test tests/motion.test.cjs`。检查减少动态效果、重复进入及标签隐藏时的取消行为；浏览器的实际渲染仍需预览确认。

首页通过稳定容器上的 `data-reveal` 接入动效：首屏标题及介绍错开入场，主截图和播放器轻微缩放并上移，七个功能区保持整块图文共同进入，诊断面板单独渐显。手机缩短位移；元素只播放一次，语言切换不会重放整个页面，FAQ 使用可逆展开过渡。所有内容默认可见，系统减少动态效果或切到后台时取消动画。导航使用 `data-section-link` 跟随章节高亮，滚动期间不运行逐帧 JavaScript 循环。

App 深链可用 `?lang=zh` / `?lang=en` 显式选择官网语言，例如
`support.html?lang=en#guide`、`support.html?lang=zh#privacy` 和
`support.html?lang=zh#oss`。语言参数优先于浏览器记忆，且在首次渲染前解析；
没有有效参数时沿用已保存的中英文选择，再回退到页面默认语言。
手动切换会同步当前网址和浏览器记忆，刷新及站内跳转保留语言。
`node --test tests/*.test.cjs` 同时检查语言优先级、存储不可用、标签导航及动画。

支持文档通过 `doc` 参数保留所属页面，章节仍使用原生锚点，例如
`support.html?lang=en&doc=guide#s2`。旧的 `#guide` / `#terms` / `#oss`
链接继续有效，载入时补齐文档参数；目录链接、刷新和前进后退使用同一套路由。
首页、支持页和署名页监听历史与页面恢复事件，同步正文、标题及语言选择。

隐私政策以根目录独立维护的 `privacy.html` 为唯一正文。首页和支持页直接链接
`privacy.html?lang=zh#zh-hans` 或 `privacy.html?lang=en#english`；旧的
`support.html#privacy` 以及 `doc=privacy` 链接按语言转到该页。支持页不再保留
另一份政策。常规构建仍不复制此文件；发布时须单独核对两站的正式政策版本，
避免把工作区中尚未提交的政策改动混入发布。
