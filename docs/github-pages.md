# GitHub Pages 网站入口

Pages 发布 `pages-entry/`，页面显示正式域名 **https://www.19271949.xyz/**。访问者可以点击进入网站、直接查看项目或打开 GitHub 主页。此页不自动跳转，正式 Vue 应用仍在自己的服务器上运行。

## 仓库设置

1. 将首次提交推送到自己的 GitHub 仓库，默认分支使用 `main`。
2. 打开仓库 **Settings → Pages → Build and deployment → Source**，选择 **GitHub Actions**。
3. 该仓库 Pages 的 **Custom domain 留空**，不要填写 `www.19271949.xyz`，也不要为这个入口页添加 `CNAME` 文件或修改正式站点的 DNS。
4. 如果配置了 `github-pages` 环境的分支限制，允许 `main` 部署。
5. 打开 **Actions → Deploy GitHub Pages entry → Run workflow**，选择 `main` 手动运行首次部署。以后提交 `pages-entry/` 或该工作流的修改会自动部署。

部署成功后，在 Pages 设置或 Actions 的 `github-pages` 环境中查看实际访问地址：

- 仓库名为 `LCQaha.github.io`：通常是 `https://lcqaha.github.io/`。
- 普通项目仓库：通常是 `https://lcqaha.github.io/<仓库名>/`。

入口页的图标都使用相对路径，因此可在上述两种地址下加载；正式网站和 GitHub 链接使用完整 URL。

如果账号的个人 Pages 绑定了自定义域名，项目 Pages 可能继承该域名。工作流会核对 GitHub 返回的 Pages 地址，只有 `当前仓库所有者.github.io` 主机名才允许部署。遇到继承域名报错时，先检查账号和仓库的 Pages 域名设置；不要直接删除守卫或修改现有正式站点的 DNS。可以选用没有继承域名的账号或仓库布局，并以 Pages 设置显示的地址为准。

## 工作流

`.github/workflows/pages.yml` 使用 GitHub 官方 Pages Actions，上传范围只有 `pages-entry/`。它不构建 Vue，也不上传 `www/`、依赖、历史备份或本地发布目录。Actions 固定到已核对的提交 SHA，更新时需要同步检查对应版本。

需要改变正式域名时，统一修改 `pages-entry/index.html` 中的站点链接、canonical、显示文字，以及 `scripts/release.test.mjs` 中对应的入口验证，再执行 `npm test`。

官方依据：[自定义 Pages 工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)、[设置发布来源](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)、[自定义域名与项目站点继承](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/about-custom-domains-and-github-pages)。
