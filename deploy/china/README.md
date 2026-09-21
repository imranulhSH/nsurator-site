# 中国站域名与 HTTPS

正式地址为 `https://www.nsurator.com.cn/`。根域名 `nsurator.com.cn`
的 HTTP 和 HTTPS 请求均通过 301 跳转到正式地址，完整保留路径和查询参数。
浏览器会继承原链接的标签，例如：

- `https://nsurator.com.cn/support.html?lang=en#guide`
  → `https://www.nsurator.com.cn/support.html?lang=en#guide`
- `http://nsurator.com.cn/support.html?lang=zh#privacy`
  → `https://www.nsurator.com.cn/support.html?lang=zh#privacy`

## DNS

阿里云云解析 DNS，权威服务器为 `dns27.hichina.com` / `dns28.hichina.com`。

| 主机记录 | 类型 | 记录值 | TTL |
| --- | --- | --- | --- |
| `@` | A | `120.55.90.75` | 600 秒 |
| `www` | A | `120.55.90.75` | 600 秒 |

没有配置 AAAA；不能仅在 Nginx 增加域名而漏掉根域名的 DNS 记录。

## 服务器配置

`nginx-site.conf` 是 `/etc/nginx/sites-available/nsurator-cn` 的配置副本。
现有 `sites-enabled/nsurator-cn` 软链接加载它。该文件不会由 GitHub Pages
部署到中国站服务器，修改后需要单独备份、检查并平滑重载 Nginx。
网站目录和已有百度授权转发规则由原服务器配置维护。

证书由现有 Certbot 账户管理，路径为
`/etc/letsencrypt/live/www.nsurator.com.cn/`，覆盖 `www.nsurator.com.cn`
与 `nsurator.com.cn`。`certbot.timer` 已启用，使用 nginx 验证与安装插件。
未来续期保留原有私钥轮换策略。私钥、ACME 账户凭据和恢复材料不得提交到仓库。

## 2026-09-21 修复记录

原根域名没有 A/AAAA 记录，Nginx 未配置根域名，证书也仅覆盖 `www`。
本次新增根域名 A 记录及跳转配置，复用现有私钥扩展证书。
新证书有效期至 2026-12-20；`nginx -t` 和平滑重载成功。
服务端实际请求返回 301 → 200，HTTPS 证书校验成功；Chrome 验证了上面的
英文使用说明和中文隐私标签，语言、路径和标签均保留。
网站页面内容及现有授权转发配置校验保持一致。

变更前的配置和证书备份在服务器非公开目录：
`/var/backups/nsurator-apex-20260921T160000Z/`。
本机恢复记录保存在受限权限的 `~/Desktop/Nsurator-Secrets/`。
回退服务器配置前先检查备份内容，恢复后执行 `nginx -t`，通过后重载 Nginx。
