# 用户中心部署笔记补充

依据 `YuPi_UserCenter.md` 中「上线与部署」「Spring yml」「Spring Security + Session」「CloudFlare证书」整理，核查日期：2026-09-07。沿用原笔记的目录职责、Compose 配置、启动、更新和排错结构。

1. [Nginx 部署审查与修订示例](nginx-review.md)：先修复配置路径、443、证书挂载和 API 代理问题。
2. [MySQL 部署与规范](mysql.md)：建立数据库、账号、持久化和备份恢复流程。
3. [Spring Boot 部署与规范](springboot.md)：构建应用镜像、加载生产配置、连接数据库并接入 Nginx。

## 三篇共用的部署约定

```text
浏览器 HTTPS
    ↓
Cloudflare（代理 DNS、Full strict）
    ↓ 443
Nginx ── app-net ── usercenter-backend:8080
                         │
                  usercenter-db-net（internal）
                         │
                      mysql:3306
```

| 项目 | 约定 |
| --- | --- |
| 服务器 | 单台 Linux 云服务器，示例按 Ubuntu/Debian、Bash 编写 |
| 前置工具 | 已安装 Docker Engine、Compose v2；通过官方安装说明核对，不混用旧的 `docker-compose` |
| 入口域名 | `dashboard.19271949.xyz` |
| 前端 | `/srv/www/dashboard.19271949.xyz/releases/<版本>/public`，`current` 选择版本 |
| 容器编排 | `/opt/docker/nginx`、`/opt/docker/mysql`、`/opt/docker/usercenter-backend` 各自管理 |
| 生产数据库 | `usercenter_prod`，应用账号 `usercenter_app` |
| 对外端口 | Nginx 的 80/443；SSH 按管理员来源控制；MySQL 和后端不发布宿主机端口 |
| 内部路由 | Nginx 将 `/api/...` 原样传给后端；后端只配置一次 `/api` 前缀 |
| 密码 | `/opt/secrets/usercenter/DB_PASSWORD`，由 MySQL 和后端只读挂载 |

原文 Linux 环境变量示例中的 `/usercenter` 与其前面的生产库 `usercenter_prod` 不一致，本套教程统一为后者。开发库、测试库保持独立。

普通的 `app-net` 自定义 bridge 网络不等于 Docker 的 `internal: true`。本方案另建数据库内部网络，Nginx 不加入该网络；Docker 管理员仍有能力访问容器，网络分层不能替代宿主机权限管理。[Docker 网络说明](https://docs.docker.com/engine/network/)、[Compose 网络属性](https://docs.docker.com/reference/compose-file/networks/)

## 使用范围

这是可合并回原笔记的补充文档。此次没有操作腾讯云服务器、数据库或 Cloudflare；检查结论针对笔记和当前仓库文件，不能据此判断线上是否已经修好。

当前仓库是 `www` 的 Vue 前端，未包含用户中心的 `pom.xml` 和后端代码。Spring Boot 教程明确给出版本与接口前提；实际部署前需在后端仓库核对。原始微信目录内的笔记保留原样。

`www` 主站已有独立发布流程与 HTTP 404 约定，见 [原发布说明](../releases.md)；本套教程中的 Dashboard SPA 配置只用于用户中心域名。

服务器安装入口：[Docker Ubuntu 安装](https://docs.docker.com/engine/install/ubuntu/)、[Docker Compose 插件安装](https://docs.docker.com/compose/install/linux/)。
