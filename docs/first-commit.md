# 首次提交准备

首次提交保存一个可运行的 Vue 站点基线，连同 Pages 入口、按版本打包、Nginx 配置、验证脚本和维护文档。

## 文件范围

提交 `.github/workflows/`、`pages-entry/`、`www/src/`、`www/public/`、应用配置、根目录 npm 清单与锁文件、`scripts/`、`deploy/`、`compose.release.yml`、`.env.release.example`、README 和本目录中的维护文档。`.gitattributes` 将文本统一为 LF，二进制文件不转换行尾。

`.gitignore` 排除依赖、`dist/`、`release/`、缓存、本地工具 `.tools/`、机器状态 `.local/`、历史页面快照 `reference/`、旧的过程计划、IDE 状态、日志和真实 `.env*` 文件；保留没有秘密的 `.env.release.example`。常见证书私钥扩展名也已忽略。实际证书、令牌和环境值不属于源码提交。

忽略规则只影响未跟踪文件。今后已经跟踪的文件不会因新增规则自动退出 Git；每次提交仍应查看暂存差异。

## 验证与提交

使用 Node.js 24 和配套 npm：

```sh
npm ci
npm test
npm run build
```

执行 `npm run release` 可准备当前版本的挂载目录与压缩包。已有同版本产物时脚本拒绝覆盖；无需为了再次检查源码而重新打包。发布包校验、Nginx 验证和上传步骤见 [发布说明](releases.md)。

首次建仓库时使用 `main`；如果仓库已由你初始化，保留现有仓库并检查当前分支。以下 Git 命令供实际执行首提交时使用：

```sh
git init -b main
git add .
git status --short --ignored
git diff --cached --stat
git diff --cached --check
git diff --cached
git commit -m "feat: 初始化 Vue 3 个人网站与发布流程"
```

确认暂存区没有 `node_modules/`、`www/dist/`、`release/`、`.tools/`、`.local/`、`reference/`、真实环境文件或日志。保留当前配置的 Git 作者身份。远程仓库地址由实际 GitHub 仓库决定。

版本号位于 `www/package.json`；首次正式版本使用 `1.0.0`，对应 Git 标签 `v1.0.0`。只有准备正式发布时才创建和推送标签，避免将尚待调整的首次预览标记成正式版本。
