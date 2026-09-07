# 页面结构与路由

## 源码布局

| 路径 | 用途 |
| --- | --- |
| `www/src/views/HomeView.vue` | 首页、项目区与页脚 |
| `www/src/data/projects.js` | 五张卡片的数据、介绍、技术栈和仓库地址 |
| `www/src/components/ConstructionSign.vue` | 原版施工牌子 |
| `www/src/styles/original.css` | 保留原版页面与施工牌子样式 |
| `www/src/styles/projects.css` | 新卡片与图标样式 |
| `www/src/views/NotFoundView.vue` | www 原有 404 视觉的 Vue 页面 |
| `www/src/router/index.js` | 首页、显式 404 与未知路径匹配 |
| `www/public/404.html` | Nginx 缺失静态资源使用的独立错误页 |
| `www/public/licenses/` | 随构建发布的完整第三方许可证 |

首页来源为 `http://dashboard.19271949.xyz/`，404 来源为 `https://www.19271949.xyz/404.html`（2026-09-06 获取）。恢复后的施工牌子保持原版。原始快照只在本地 `reference/` 保留，不加入 Git 或发布包；构建和验证不依赖这些快照。

项目 1 使用用户中心前端与后端的公开仓库入口，访问按钮按要求指向 Dashboard；这不表示 Dashboard 当前部署的内容已等同于这两份仓库。项目 2 待定，另外三张明确标为示例，未填写的仓库链接不可点击。

## 404 与 Nginx

Vue Router 使用 HTML5 history、区分大小写和严格尾斜杠匹配：

- `/` 与 `/index.html`：首页。
- `/404`：明确的 404 预览入口。
- 其余路径：保留原地址，由 catch-all 渲染 404，不跳转成 `/404`。

`deploy/nginx/www.locations.conf` 是可包含在 `server` 内的片段。未知页面使用 `error_page 404 =404 @frontend_404`，以 **HTTP 404** 返回 Vue 的 `index.html`；浏览器加载脚本后显示错误页面。缺失的 `/assets/`、`/icons/` 文件使用独立静态 `404.html`。不要把未知路径改成统一返回 200。

静态 `/404.html` 设置为 `internal`，直接访问也返回 404。Vue 的显式路由使用 `/404`，二者用途不同。客户端站内跳转不会产生新的 HTML 请求；HTTP 状态码以直接访问或刷新时的服务器响应为准。

原生 Nginx 部署时保留现有 TLS、API 代理等配置，仅将站点 `root` 指向发布目录，并合并片段中的 location；不要重复声明同一个 `location /`。容器版使用 `www.container.conf` 包裹这个片段。具体挂载命令见 [发布说明](releases.md)。

对正在运行的真实 Nginx 站点执行验证：

```powershell
$env:SITE_URL = 'http://127.0.0.1:8080'
node scripts/verify-http.mjs
```

```sh
SITE_URL=http://127.0.0.1:8080 node scripts/verify-http.mjs
```

检查覆盖首页、构建资源、深层未知路径、错误大小写、`/www` 和缺失静态资源。请替换为自己的 Nginx 地址；Vite preview 不用于这项状态码检查。

## 增加合法页面

`www/` 是源码目录，`www.19271949.xyz` 是域名，`/www` 是独立 URL 路径。目前没有 `/www` 页面。

新增 `/www` 页面时，先创建 Vue 页面并在路由表注册，然后在 Nginx 的 `server` 内精确放行：

```nginx
location = /www {
    try_files /index.html =404;
    add_header Cache-Control "no-cache" always;
}
```

同步调整验证脚本中 `/www` 的预期状态。其他未知路径继续返回 404；不要仅为未来计划放行整个 `/www/*`。

依据：[Nginx error_page](https://nginx.org/en/docs/http/ngx_http_core_module.html#error_page)、[Vue Router history 注意事项](https://router.vuejs.org/guide/essentials/history-mode.html#caveat)、[Vite public 目录](https://vite.dev/guide/assets.html#the-public-directory)。
