# www 版本与发布流程

正式站点是 `https://www.19271949.xyz/`。本项目先生成可校验的版本包，再由维护者选择上传和切换服务器；运行 `npm run release` 只准备本地产物，不会推送 Git、创建线上发布或修改服务器。

## 版本约定

网站版本只维护在 `www/package.json` 的 `version` 字段，当前起始版本为 `1.0.0`。根目录 `package.json` 不另设网站版本。

| 变更 | 版本示例 | 适用情况 |
| --- | --- | --- |
| patch | `1.0.0` → `1.0.1` | 修复错误、兼容的样式和文案调整 |
| minor | `1.0.0` → `1.1.0` | 增加兼容的新页面或功能 |
| major | `1.0.0` → `2.0.0` | 不兼容的公开路由、行为或部署约定变更 |
| 预发布 | `1.1.0-alpha.1`、`1.1.0-beta.1`、`1.1.0-rc.1` | 早期验证、测试版、正式发布候选版 |

项目采用 [SemVer](https://semver.org/)，并将预发布格式限制为 `alpha.N`、`beta.N`、`rc.N`，其中 `N` 是无前导零的非负整数。版本字段不带 `v`，不接受 `+build` 元数据；Git 标签和版本目录统一加 `v`。

| 用途 | `1.0.0` 对应值 |
| --- | --- |
| `www/package.json` | `1.0.0` |
| Git tag | `v1.0.0` |
| 可直接挂载的目录 | `release/v1.0.0/` |
| 部署压缩包 | `release/www-v1.0.0.tar.gz` |
| 压缩包校验文件 | `release/www-v1.0.0.tar.gz.sha256` |
| Compose 环境变量 | `SITE_VERSION=v1.0.0` |

`release/v1.0.0` 是文件存储位置，不是浏览器 URL 的前缀。Vite 的 `base` 保持 `/`，不要改成 `/release/v1.0.0/`。容器挂载后，首页仍是 `/`，资源仍是 `/assets/...`。

后续升级版本时，在仓库根目录选择一条命令执行：

```sh
# 修订版本
npm version patch --workspace=www --no-git-tag-version

# 或指定下一个候选版本
npm version 1.1.0-rc.1 --workspace=www --no-git-tag-version
```

这会同步更新 `www/package.json` 和根目录 `package-lock.json`，但不会自动提交或创建 Git tag。两份文件需要一起审阅、提交。不要手工只改其中一份。[npm version 说明](https://docs.npmjs.com/cli/v11/commands/npm-version/)

## 准备本地版本包

使用 Node.js 24、随附的 npm，以及可执行的 `tar`。在仓库根目录运行以下命令；每一步成功后再执行下一步：

```sh
node --version
npm --version
tar --version
npm ci
npm test
```

`npm ci` 使用已提交的锁文件安装依赖；`npm test` 检查首页、404 路由与返回导航、图标和版本规则。发布脚本会构建网站，但不会代替前面的测试。

首次准备当前 `1.0.0` 候选包时，不需要先提升版本：

```sh
npm run release -- --expect-tag v1.0.0
```

若已经升级成其他版本，将 `--expect-tag` 改成对应标签。标签与 `www/package.json` 不一致时，脚本立即拒绝执行。也可以运行 `npm run release`，由脚本直接读取版本；正式准备时推荐保留标签检查。

输出目录结构如下：

```text
release/
├── v1.0.0/
│   ├── index.html
│   ├── 404.html
│   ├── assets/
│   ├── icons/
│   ├── licenses/
│   ├── THIRD_PARTY_NOTICES.md
│   ├── version.json
│   └── manifest.sha256
├── www-v1.0.0.tar.gz
└── www-v1.0.0.tar.gz.sha256
```

目录中还会包含站点使用的其他公开资源。`index.html` 就在版本目录根部，挂载时不需要再拼接 `www/dist`。

- `.tar.gz.sha256` 校验整个压缩包，上传前后使用同一份文件。
- `manifest.sha256` 列出站点文件的 SHA256，包含 `version.json`，不包含清单自身；可在解压后逐文件校验。
- `version.json` 记录网站版本、标签、UTC 构建时间及 Git commit。第一次 Git 提交之前，本地构建的 `commit` 为 `null`；GitHub Actions 在标签提交上构建时会记录该提交。正式候选应从已提交且干净的工作区构建。
- `release/` 已被 Git 忽略。压缩包与校验文件放在版本目录外，避免作为网站内容挂载。

脚本先生成临时目录，待压缩包和校验文件准备好后才放出最终版本目录。同名版本目录、压缩包或校验文件只要有一个已经存在，就拒绝覆盖；应提升版本，不能用覆盖旧包的方式修改已准备的版本。首次生成的本地候选包不等于已经正式发布，后续 CI 构建的时间和压缩包哈希也可能不同。

## 手动上传与校验

以下示例供维护者日后执行，不代表已经上传。先确定真实 SSH 地址和服务器部署目录；`USER@SERVER` 与 `/ABSOLUTE/DEPLOY/ROOT` 都是必须替换的占位符。

在本地 PowerShell、仓库根目录运行：

```powershell
$releaseHost = 'USER@SERVER'
$deployRoot = '/ABSOLUTE/DEPLOY/ROOT'

ssh $releaseHost "mkdir -p '$deployRoot/release' '$deployRoot/deploy/nginx'"
scp release/www-v1.0.0.tar.gz release/www-v1.0.0.tar.gz.sha256 "${releaseHost}:${deployRoot}/release/"
scp compose.release.yml .env.release.example "${releaseHost}:${deployRoot}/"
scp deploy/nginx/www.container.conf deploy/nginx/www.locations.conf "${releaseHost}:${deployRoot}/deploy/nginx/"
```

登录 Linux 服务器后校验、解压。`set -e` 让失败的校验或已存在的版本目录中止后续步骤：

```sh
set -eu
cd '/ABSOLUTE/DEPLOY/ROOT/release'
sha256sum --check www-v1.0.0.tar.gz.sha256
mkdir v1.0.0
tar -xzf www-v1.0.0.tar.gz -C v1.0.0
find v1.0.0 -type d -exec chmod 0755 {} +
find v1.0.0 -type f -exec chmod 0644 {} +
cd v1.0.0
sha256sum --check manifest.sha256
cat version.json
```

所有校验通过后再切换服务。`mkdir v1.0.0` 故意不加 `-p`，避免向已有版本目录继续解压。压缩包内部根目录就是网站文件，使用 `-C v1.0.0` 即可，不需要 `--strip-components`。权限归一化不会改变文件内容或 SHA256；它避免在 Windows 生成的 tar 包把目录 777、文件 666 的兼容权限带到 Linux。若服务器已有更严格的属主策略，在校验后按现有部署规范设置属主。

## 选择 Nginx 原生部署或 Compose

两种方式选择一种即可，均继续使用已有的域名和 TLS 证书。

**已有原生 Nginx：** 在实际处理 `www.19271949.xyz` 的 HTTPS `server` 中，把 `root` 指向解压后的版本目录，并引入路由片段：

```nginx
root /ABSOLUTE/DEPLOY/ROOT/release/v1.0.0;
include /ABSOLUTE/DEPLOY/ROOT/deploy/nginx/www.locations.conf;
```

将占位路径替换为实际绝对路径。保留现有 `listen`、`server_name` 和证书设置；替换与片段冲突的旧 `location`，不要直接追加重复规则。配置完成后，在有对应权限的服务器终端运行：

```sh
sudo nginx -t
```

通过后再重新加载：

```sh
sudo nginx -s reload
```

**Docker Compose：** 在服务器的部署根目录运行。首次配置时复制环境变量示例：

```sh
cd '/ABSOLUTE/DEPLOY/ROOT'
cp .env.release.example .env.release
cat .env.release
```

确认内容为 `SITE_VERSION=v1.0.0`。已有 `.env.release` 时直接修改其中的 `SITE_VERSION`，不要重复复制模板覆盖其他配置。

Compose 使用 `./release/${SITE_VERSION}` 作为只读 bind mount，容器内路径固定为 `/usr/share/nginx/html`。两个 Nginx 配置分别挂载到 `/etc/nginx/conf.d/default.conf` 和 `/etc/nginx/snippets/www.locations.conf`。相对路径以 `compose.release.yml` 所在目录为基准；`create_host_path: false` 会让不存在的版本或配置路径报错，而不是自动创建空目录。[Compose 挂载说明](https://docs.docker.com/reference/compose-file/services/#volumes)

配置使用 `nginx:1.30.4-alpine`。该标签已在 2026-09-07 的 [Docker Hub 官方 Nginx 标签列表](https://hub.docker.com/_/nginx) 中确认；目标服务器仍需在首次使用时实际拉取镜像。

```sh
docker compose --env-file .env.release -f compose.release.yml config --quiet
docker compose --env-file .env.release -f compose.release.yml pull www
docker compose --env-file .env.release -f compose.release.yml run --rm --no-deps www nginx -t
```

以上全部通过后，切换到所选版本：

```sh
docker compose --env-file .env.release -f compose.release.yml up -d --no-deps --force-recreate www
docker compose --env-file .env.release -f compose.release.yml ps
```

容器只监听宿主机的 `127.0.0.1:8080`，供现有 HTTPS 反向代理转发；它不申请、不替换证书。如果 TLS Nginx 运行在宿主机，可在对应的现有 HTTPS `server` 中使用：

```nginx
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_intercept_errors off;
}
```

外层代理应保留容器返回的 404 状态和正文。若 TLS 代理也运行在容器中，`127.0.0.1` 指向它自身，应使用现有容器网络的服务地址，不能直接照搬上面的宿主机示例。

切换后可验证：

```sh
curl -sS -I -H 'Host: www.19271949.xyz' http://127.0.0.1:8080/
curl -sS -H 'Host: www.19271949.xyz' http://127.0.0.1:8080/version.json
curl -sS -i -H 'Host: www.19271949.xyz' http://127.0.0.1:8080/__release_check__/missing
curl -sS -I -H 'Host: www.19271949.xyz' http://127.0.0.1:8080/assets/__missing__.js
curl -sS -I https://www.19271949.xyz/
curl -sS -i https://www.19271949.xyz/__release_check__/missing
```

首页应为 200，`version.json` 应匹配选择的版本，未知页面和缺失脚本应为 404。未知页面响应包含 Vue 入口，浏览器中应显示定制 404 并能返回首页。原生 Nginx 部署只需验证正式 HTTPS 地址及其 `/version.json`，不使用 8080。

## 回滚与后续路由

保留已经验证的旧版本目录及对应压缩包。比如从 `v1.0.1` 回退到仍在服务器上的 `v1.0.0`，在部署根目录运行：

```sh
sed -i 's/^SITE_VERSION=.*/SITE_VERSION=v1.0.0/' .env.release
docker compose --env-file .env.release -f compose.release.yml config --quiet
docker compose --env-file .env.release -f compose.release.yml run --rm --no-deps www nginx -t
```

通过后再执行前面的 `up -d --no-deps --force-recreate www`，并检查 `/version.json`、首页和 404。不要用 `docker compose restart` 切版本，它不会应用新的挂载配置。单容器重建可能造成短暂中断。[Compose up](https://docs.docker.com/reference/cli/docker/compose/up/)、[restart 说明](https://docs.docker.com/reference/cli/docker/compose/restart/)

原生 Nginx 的回滚方式是将 `root` 改回旧版本的绝对路径，运行 `nginx -t` 后 reload。前端产物切换不会自动恢复同期修改的 Nginx 配置；若配置也变更，需要恢复对应版本。

现有首页响应使用 `Cache-Control: no-cache`，带 hash 的资源使用长期缓存。仅保留旧版本目录不会让当前容器自动提供旧资源；旧标签页在切换后请求旧 chunk 时仍可能得到 404，刷新可加载当前版本。若以后需要支持长时间打开的页面，再增加共享旧资源保留或有次数限制的 `vite:preloadError` 刷新处理，不要在校验完成后修改版本目录。[Vite 发布后的资源加载说明](https://vite.dev/guide/build.html#load-error-handling)

目前只有首页是合法的前端业务路由。以后新增例如 `/about` 的有效路由时，除了 Vue Router，还需在 `www.locations.conf` 增加精确放行，保证直接打开或刷新返回 200：

```nginx
location = /about {
    try_files /index.html =404;
    add_header Cache-Control "no-cache" always;
}
```

合法路径及大小写、末尾斜杠策略应与 Vue Router 一致，尤其是在 Windows 上验证时。未知路径继续返回 HTTP 404 并加载 Vue 错误页；不要把全站改成返回 200 的 SPA fallback。`/404` 本身也应保持 404。

## 日后使用 Git 标签生成 GitHub 草稿发布

下面操作由维护者在准备正式候选时执行；本地打包不会自动执行这些命令。先将已审阅的代码、版本、锁文件和 Release 工作流提交到仓库，确认工作区干净。以下假定 GitHub 远程名称已经配置为 `origin`，并以当前 `1.0.0` 为例：

```sh
git status --short
git tag -a v1.0.0 -m "www v1.0.0"
git push origin HEAD
git push origin v1.0.0
```

只有确认 `git status --short` 无未提交变更后，才执行后面的标签和推送。版本升级后使用匹配的新标签；已有标签不移动、不强推覆盖。

推送标签会触发 Release 工作流，在标签提交上安装依赖、测试、校验版本并构建，生成附带部署包和校验文件的 **Draft Release**。草稿供维护者核对，不等于已经公开发布，更不会自动部署服务器；审核后再决定是否发布草稿及上传部署包。`alpha`、`beta`、`rc` 标签会同时标记为 GitHub 预发布候选。

部署时下载附件 `www-v1.0.0.tar.gz` 及其 `.sha256`，再按上文校验和解压。GitHub 自动提供的 **Source code (zip/tar.gz)** 是源码快照，不是可直接挂载的部署包。
