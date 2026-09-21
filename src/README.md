# 官网可编辑源文件

`index.html`、`support.html` 从既有导出包提取，资源改用本地文件并在第一个运行时脚本前加入 `window.__resources` 映射。文案、图片和原 DC React 运行时保留；首页功能区已改为自然页面流和一次性渐显，支持页的滚动导航也不再触发整页渲染。日常修改这两个源文件及 `motion.js`，无需编辑巨大的 base64 导出包。

```sh
python3 scripts/build-site.py --check
python3 scripts/build-site.py --out /absolute/path/to/site-output
python3 -m http.server 8080 --directory /absolute/path/to/site-output
```

在浏览器打开 `http://localhost:8080/`。资源使用 `/assets/` 根路径，需要从站点根部署和预览；不能直接双击 HTML，也不适用于未配置根路径的子目录部署。

`../assets/` 按解码后原始内容的完整 SHA-256 命名，同内容只保留一份；`asset-manifest.json` 记录来源 UUID、外部模块映射、大小和校验值。构建会验证资源存在及哈希，输出两页、资源和 `build-report.json`，报告原包大小、共享资源收益及 gzip 估算；不会读取、复制或覆盖独立维护的隐私页、CNAME 或服务器配置。输出目录复用时不会删除其他文件，正式发布宜选空目录并明确合并独立页面。

原始导入命令为 `python3 scripts/build-site.py --extract-bundles --out /absolute/path/to/site-output`，已有 `src` 时会拒绝再次导入，防止覆盖后续编辑。

可选的 `src/motion.js` 由源码维护者编辑。在页面需要的位置加入 `<script src="__SITE_MOTION__"></script>`，构建会以其内容哈希生成输出 `assets/*.js` 并仅在输出 HTML 中替换占位地址；不会重写源 HTML 或 JavaScript。两页引用同一份输出资源。无占位引用时不额外打包该脚本。

运行方式：首个内联脚本提供本地资源映射，原 DC runtime 据此加载本地 React / ReactDOM 并渲染 `x-dc` 与 `text/x-dc`；不再需要导出包的 gzip 解压、Blob URL 或整页替换 loader。当前页面没有 `x-import`，因此不需要 `__resourceBlobs` 或 Babel CDN。仍需 JavaScript；原 runtime 使用 `new Function`，部署时若配置 CSP，应按实际运行方式检查兼容性。此拆包不修改运行时安全策略。

动画可访问性回归检查使用 Node.js 内置测试工具，无需安装依赖：`node --test tests/motion.test.cjs`。检查减少动态效果、重复进入及标签隐藏时的取消行为；浏览器的实际渲染仍需预览确认。

App 深链可用 `?lang=zh` / `?lang=en` 显式选择官网语言，例如
`support.html?lang=en#guide`、`support.html?lang=zh#privacy` 和
`support.html?lang=zh#oss`。语言参数优先于浏览器记忆，且在首次渲染前解析；
没有有效参数时沿用已保存的中英文选择，再回退到页面默认语言。
手动切换会同步当前网址和浏览器记忆，刷新及站内跳转保留语言。
`node --test tests/*.test.cjs` 同时检查语言优先级、存储不可用、标签导航及动画。
