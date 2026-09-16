# LCQ · 19271949.xyz

Vue 3 + Vite + Vue Router 4 个人项目首页，源码位于 `www/`。保留原版施工牌子，提供两张项目卡片、GitHub 仓库入口和自定义 404 页面。

## 开发与验证

使用 Node.js 24 LTS 和配套 npm，版本提示见 `.nvmrc`。在仓库根目录执行：

```sh
npm ci
npm test
npm run dev
```

开发默认端口为 `5173`。生产构建与本地预览：

```sh
npm run build
npm run preview
```

构建输出到 `www/dist/`，Vite preview 默认端口为 `4173`。Vite 的 SPA 回退适合开发预览；验证真实 HTTP 404 状态需要使用 Nginx。

## 两种部署

| 用途 | 发布内容 | 访问地址 |
| --- | --- | --- |
| GitHub Pages 网站入口 | `pages-entry/` 静态页 | GitHub 提供的 `*.github.io` 地址，页面可点击进入正式网站 |
| 正式 Vue 网站 | `release/v1.0.0/` 内的文件 | `https://www.19271949.xyz/`，由自己的 Nginx 承载 |

- [GitHub Pages 设置与工作流](docs/github-pages.md)：只部署入口页，使用相对资源地址，适配个人和项目 Pages。
- [版本规范、打包、挂载与回滚](docs/releases.md)：版本目录、校验文件、GitHub Draft Release，以及原生 Nginx / Docker Compose 两种方式。
- [代码结构与 404 路由](docs/architecture.md)：修改卡片、新增页面和 Nginx 路由配合。
- [首次提交清单](docs/first-commit.md)：包含与排除范围、检查命令和建议提交信息。
- [用户中心部署笔记补充](docs/deployment/README.md)：Nginx 审查修订、MySQL 和 Spring Boot 部署教程。

当前应用版本为 `1.0.0`。执行一次：

```sh
npm test
npm run release -- --expect-tag v1.0.0
```

会生成 `release/v1.0.0/`、`release/www-v1.0.0.tar.gz` 及同名 `.sha256` 文件。目录中直接包含 `index.html`，可以挂载为 Nginx 站点根目录。**相同版本不覆盖；`release/v1.0.0` 是存储目录，网站 URL 仍从 `/` 开始。**

推送 `main` 上的入口页改动会触发 Pages 工作流；推送与应用版本相符的 `v*` 标签会构建并创建含压缩包的 GitHub Draft Release。仓库与 Pages 设置需要按文档完成；这些文件本身不会修改远程站点。

## 编辑内容

项目数据集中在 `www/src/data/projects.js`。每个 `description` 数组保留 3–5 行介绍；`repositories` 可增加前后端等多个仓库，空地址显示“待补充”。项目 1 指向 Dashboard，项目 2 待定。

Dashboard 目前沿用已验证可访问的 HTTP 地址。启用 HTTPS 后，同步修改项目数据和 `www/index.html` 中的无脚本备用链接。

第三方图标和依赖声明位于 [www/public/THIRD_PARTY_NOTICES.md](www/public/THIRD_PARTY_NOTICES.md)，完整许可证随每次构建发布。项目自身暂未选择开源许可证。
