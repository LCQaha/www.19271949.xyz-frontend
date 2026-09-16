# 【腾讯云】Nginx 部署审查与修订

这次检查对应原笔记第 1448–1685 行的 Nginx 章节，以及第 4193 行开始的 Cloudflare 证书补充。原稿已经有目录分工、版本目录、只读挂载、启动前检查和日志等内容；主要缺口是几段配置还没有接成一套能实际启动、联调和维护的流程。

## 一、先修哪些问题

| 优先级 | 原文位置与问题 | 会发生什么 | 修改办法 |
| --- | --- | --- | --- |
| 必修 | 1496 行创建 `conf`，1538 行却挂载 `conf.d`，1569 行又让配置保存到 `conf` | 开启 `create_host_path: false` 后直接因目录不存在失败；若两个目录都存在，也可能加载错配置 | 宿主机统一用 `/opt/docker/nginx/conf.d` |
| 必修 | 1533 行只映射 `80:80`，1585 行监听了容器 443 | 80 能跳转，但外部无法访问源站 HTTPS | 加 `443:443`，同时检查云安全组和宿主机防火墙 |
| 必修 | 1591 行引用证书，Compose 没有证书挂载 | `nginx -t` 报找不到证书 | 增加 `/opt/docker/nginx/certs:/etc/nginx/certs:ro` |
| 必修 | 1515 行后缺少域名兜底配置，后面的证书附录才有 | 未匹配 Host 可能落入首个业务站点 | 补齐 80/443 的 default server |
| 必修 | 1611、4340 行 `proxy_pass ...:8080/` 带尾斜杠 | `/api/user/...` 被转成 `/user/...`；后端若本来带 `/api` 就 404 | 本套教程保留 `/api`，使用不带 URI 的 `proxy_pass http://usercenter_api;` |
| 必修 | 1660 行只用 HTTP 自测 | 返回 301 也可能被当成成功，未验证证书、页面或回源 | 增加带 SNI、CA 校验的源站 HTTPS 自测和公网 HTTPS 验证 |
| 应补 | 1571 行只处理“后端尚未启动”，没处理后端重建后 IP 变化 | 静态解析的 upstream 可能继续请求旧 IP，出现 502 | 使用 Docker DNS 动态解析，或每次后端重建后执行 Nginx 检查及 reload |
| 应补 | 1506 行只创建空 `index.html` | HTTP 200，但用户看到白页 | 上传真实构建产物，检查入口文件、资源和版本后再切 `current` |
| 应补 | HTML 缓存没说明，只有 `/assets/` 缓存 | 更新后入口缓存与带 hash 的资源版本不匹配 | HTML 用 `no-cache`；缺失资源返回 404，只有带 hash 的资源长期缓存 |
| 应补 | “只放行 Cloudflare IP”没有落实到 Docker 发布端口、IPv6与更新流程 | 规则可能未覆盖实际访问路径 | 优先在腾讯云安全组限制入口，核查 Docker 防火墙转发路径和全部地址族 |
| 应补 | 日志仅提到恢复真实 IP，没有可信代理边界 | 客户端可伪造转发头，影响审计、协议判断等 | 只信官方 Cloudflare 网段，在 Nginx 统一重建给后端的头 |
| 应补 | 缺少 Session、CSRF、数据库联调与回滚说明 | 首页打开了，登录仍可能失败；回滚也缺操作顺序 | 按后两篇教程做端到端验收和版本回滚 |

`proxy_pass` 有 URI 时会替换匹配的 location 前缀；没有 URI 时保留请求路径。这不是格式偏好，必须依据后端实际路径决定。[Nginx proxy_pass](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass)

## 二、证书附录中需要改正的说法

1. **Full (strict) 不只信 Cloudflare Origin CA。** 它也接受受信任公共 CA 签发的有效源站证书，并核对有效期和主机名。它本身不是“所有请求无条件用 443 回源”的开关；本方案通过边缘 Always Use HTTPS、源站 HTTPS 和回源配置共同形成 HTTPS 链路。[Full strict](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/)

2. **不要把“必须拼上根证书”当成 Nginx 的通用要求。** Origin CA 根证书用于客户端信任校验；Origin CA 签发的源站证书可按官方指引直接配置到 Nginx。公共 CA 场景通常发送叶子证书及必要中间证书，不必发送信任根。526 应检查 SAN、有效期和实际回源证书，不能断言“九成缺根”，也不能写成“因为模式是 Full”。[Origin CA 安装](https://developers.cloudflare.com/ssl/origin-configuration/origin-ca/)、[526 排查](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-526/)

3. **现代 Nginx 的默认 443 站点可以直接拒绝握手。** `ssl_reject_handshake on` 不要求为兜底站点另外维护一张自签证书。[Nginx ssl_reject_handshake](https://nginx.org/en/docs/http/ngx_http_ssl_module.html#ssl_reject_handshake)

4. **恢复真实 IP 后，`$remote_addr` 就是恢复后的地址。** 此时应使用它向后端传递地址。后端直接信任任意请求里的 `CF-Connecting-IP` 不安全；是否可信取决于整个代理链。[Nginx Real IP](https://nginx.org/en/docs/http/ngx_http_realip_module.html)、[Cloudflare 恢复访客 IP](https://developers.cloudflare.com/support/troubleshooting/restoring-visitor-ips/restoring-original-visitor-ips/)

5. **`error_page` 不会默认替换上游所有 5xx。** `proxy_intercept_errors` 默认是 `off`，Spring Boot 的 JSON 错误会透传；Nginx 自己生成的 502/504 则可能是 HTML。前端应能处理网络故障或非 JSON 响应。[Nginx proxy_intercept_errors](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_intercept_errors)

6. **边缘证书不要按固定 CN 判断。** 应核对证书信任校验成功、SAN 覆盖访问域名、Cloudflare 面板证书状态，以及实际响应。`cf-ray` 只能辅助判断经过 Cloudflare，不能证明某一种回源模式。HSTS 不会使浏览器绕过 Cloudflare 直连源站，它只是要求浏览器使用 HTTPS。[Universal SSL](https://developers.cloudflare.com/ssl/edge-certificates/universal-ssl/)、[HSTS](https://developers.cloudflare.com/ssl/edge-certificates/additional-options/http-strict-transport-security/)

## 三、统一目录与 Docker 配置

以下是 Dashboard 的完整示例。已有多站点 Nginx 应逐项合并，避免覆盖其他域名配置。该配置不适用于当前仓库 `www` 主站的特殊 404 路由规则。

### 1. 目录结构

```text
/opt/docker/nginx/
├── compose.yml
├── .env                         # 只放镜像引用，不放私钥
├── conf.d/
│   ├── 00-catchall.conf
│   ├── 10-cloudflare-realip.conf
│   ├── 20-upstream.conf
│   └── dashboard.conf
└── certs/
    ├── dashboard.pem            # Cloudflare 创建的源站证书
    ├── dashboard.key            # 对应私钥
    └── origin-ca-root.pem       # 本地 curl 验证用，选证书签发 CA 对应的根

/srv/www/dashboard.19271949.xyz/
├── releases/v1.0.0/public/       # 真实构建产物
├── current -> releases/v1.0.0
└── shared/
```

```bash
sudo install -d -m 0755 /opt/docker/nginx/conf.d
sudo install -d -m 0700 /opt/docker/nginx/certs
sudo install -d -m 0755 \
  /srv/www/dashboard.19271949.xyz/releases/v1.0.0/public \
  /srv/www/dashboard.19271949.xyz/shared

# 已有网络先检查，不要重复创建或擅自删除
sudo docker network inspect app-net
# 仅当上条明确返回网络不存在时执行
sudo docker network create --driver bridge app-net
```

前端 `public` 内要有可读取的实际文件，父目录要允许容器 worker 遍历。不要通过 `chmod -R 777` 解决权限问题。挂载站点父目录，才能让容器同时看到 `current` 和其 `releases` 目标。

### 2. 准备证书

在 Cloudflare 创建覆盖 `dashboard.19271949.xyz` 的 Origin CA 证书，将 Certificate 和 Private key 分别保存到上面的 `.pem`、`.key`，可以用 `sudoedit` 编辑。私钥设置为 root 所有、0600；Nginx 主进程读取它。根证书从 [Origin CA 官方下载位置](https://developers.cloudflare.com/ssl/origin-configuration/origin-ca/#cloudflare-origin-ca-root-certificate) 获取，按实际签发 CA 选择。

```bash
sudo chmod 0600 /opt/docker/nginx/certs/dashboard.key
sudo openssl x509 -in /opt/docker/nginx/certs/dashboard.pem \
  -noout -subject -issuer -dates -ext subjectAltName

# 两次输出的公钥摘要必须相同；此命令不打印私钥
sudo openssl x509 -in /opt/docker/nginx/certs/dashboard.pem -pubkey -noout \
  | openssl pkey -pubin -outform DER | openssl dgst -sha256
sudo openssl pkey -in /opt/docker/nginx/certs/dashboard.key -pubout -outform DER \
  | openssl dgst -sha256
```

Origin CA 证书不被普通浏览器直接信任。灰云直连若需要浏览器信任，应使用公共 CA 证书。长有效期仍需记录到期日、私钥保存位置和泄露后的吊销重签流程。

### 3. 固定镜像

示例沿用原笔记 `nginx:1.30.4`。先确认仓库中能拉取该标签；拉取失败就先查官方标签，不能假定本机 Windows Nginx 同版本意味着 Docker 镜像一定存在。下面的动态 upstream 要求开源 Nginx **至少 1.27.3**。[官方镜像](https://hub.docker.com/_/nginx)

```bash
cd /opt/docker/nginx
sudo docker pull nginx:1.30.4
# 仅在 pull 成功后执行，记录刚拉取镜像的不可变引用
sudo docker image inspect nginx:1.30.4 --format '{{index .RepoDigests 0}}'
sudoedit /opt/docker/nginx/.env
```

在 `.env` 中写 `NGINX_IMAGE=刚才输出的完整仓库名@sha256:摘要`，替换为真实值。

### 4. compose.yml

```yaml
name: nginx-prod
services:
  nginx:
    image: ${NGINX_IMAGE:?请在.env设置已验证的Nginx镜像引用}
    restart: unless-stopped
    stop_signal: SIGQUIT
    stop_grace_period: 30s
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - type: bind
        source: /opt/docker/nginx/conf.d
        target: /etc/nginx/conf.d
        read_only: true
        bind:
          create_host_path: false
      - type: bind
        source: /opt/docker/nginx/certs
        target: /etc/nginx/certs
        read_only: true
        bind:
          create_host_path: false
      - type: bind
        source: /srv/www
        target: /srv/www
        read_only: true
        bind:
          create_host_path: false
    logging:
      driver: local
      options:
        max-size: "10m"
        max-file: "5"
    networks:
      - app-net
networks:
  app-net:
    external: true
    name: app-net
```

这里会发布宿主机端口，应与腾讯云安全组联动控制访问来源。Docker 发布的端口可能绕过通常的 UFW 入站规则；使用 iptables 与 nftables 后端时处理方式也不同，不要盲目复制一段 `iptables` 命令。明确你的 Docker 防火墙后端后再配置，并从外部验证。[Docker 防火墙说明](https://docs.docker.com/engine/network/packet-filtering-firewalls/)

## 四、Nginx 配置文件

以下文件由官方镜像的 `http` 块包含，因此 `.conf` 内不再包一层 `http {}`。

### 1. 00-catchall.conf

```nginx
server_tokens off;

server {
    listen 80 default_server;
    server_name _;
    return 444;
}

server {
    listen 443 ssl default_server;
    server_name _;
    ssl_reject_handshake on;
    return 444;
}
```

如果启用 IPv6，必须同时补上对应的 `[::]:80`、`[::]:443` 监听，并核查 Docker 发布端口、腾讯云安全组和 Cloudflare IPv6 来源策略。不要只改 DNS 的 AAAA 记录。

### 2. 10-cloudflare-realip.conf

从 [Cloudflare IPv4 列表](https://www.cloudflare.com/ips-v4/) 和 [IPv6 列表](https://www.cloudflare.com/ips-v6/) 取当前全部网段，每个网段写一行 `set_real_ip_from 网段;`，最后加 `real_ip_header CF-Connecting-IP;`。不要使用 `0.0.0.0/0` 或 `::/0` 作为信任来源。

下面脚本只生成候选配置，下载或解析失败就终止；需要服务器已安装 `curl` 和 `python3`。运行后检查输出是否为完整网段，再安装到 `conf.d`：

```bash
set -euo pipefail
ip_workdir=$(mktemp -d)
curl -fsS https://www.cloudflare.com/ips-v4/ -o "$ip_workdir/ips-v4"
curl -fsS https://www.cloudflare.com/ips-v6/ -o "$ip_workdir/ips-v6"
python3 - "$ip_workdir" <<'PY'
import ipaddress, pathlib, sys
p = pathlib.Path(sys.argv[1])
lines = []
for filename, version in [('ips-v4', 4), ('ips-v6', 6)]:
    networks = [ipaddress.ip_network(x.strip()) for x in
                (p / filename).read_text().splitlines() if x.strip()]
    if not networks or any(n.version != version or n.prefixlen == 0 for n in networks):
        raise SystemExit('Cloudflare IP 列表无效，请人工核查')
    lines.extend(f'set_real_ip_from {n};' for n in networks)
lines.append('real_ip_header CF-Connecting-IP;')
(p / '10-cloudflare-realip.conf').write_text('\n'.join(lines) + '\n')
PY
cat "$ip_workdir/10-cloudflare-realip.conf"
# 检查后执行；已有文件先备份，之后按第六节 nginx -t / reload
sudo install -m 0644 "$ip_workdir/10-cloudflare-realip.conf" \
  /opt/docker/nginx/conf.d/10-cloudflare-realip.conf
```

Cloudflare 网段变化时，安全组与这份信任列表都要更新。若 Docker/NAT 或其他入口代理改变了 Nginx 看到的连接源地址，应先查日志确认，不能为了“修好 IP”把整个 Docker 子网无条件加入信任列表。

### 3. 20-upstream.conf

```nginx
upstream usercenter_api {
    zone usercenter_api 64k;
    resolver 127.0.0.11 valid=10s ipv6=off;
    resolver_timeout 5s;
    server usercenter-backend:8080 resolve;
    keepalive 16;
}
```

`127.0.0.11` 是本方案自定义 Docker 网络内的 DNS。`resolve` 配合共享内存 `zone`，让后端容器重建、IP 改变后可以重新解析。后端尚未就绪时 API 会报网关错误，静态页面仍可服务；这不等于已经实现后端健康检查和零停机发布。旧版开源 Nginx 不支持该用法时，应升级至已验证版本，或在每次后端重建后检查并 reload。[Nginx upstream resolve](https://nginx.org/en/docs/http/ngx_http_upstream_module.html#server)、[Docker DNS](https://docs.docker.com/engine/network/#dns-services)

### 4. dashboard.conf

```nginx
server {
    listen 80;
    server_name dashboard.19271949.xyz;
    return 301 https://dashboard.19271949.xyz$request_uri;
}

server {
    listen 443 ssl;
    http2 on;
    server_name dashboard.19271949.xyz;

    ssl_certificate /etc/nginx/certs/dashboard.pem;
    ssl_certificate_key /etc/nginx/certs/dashboard.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    root /srv/www/dashboard.19271949.xyz/current/public;
    index index.html;
    client_max_body_size 12m;

    location = /index.html {
        try_files $uri =404;
        add_header Cache-Control "no-cache" always;
    }
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache" always;
    }
    location ^~ /assets/ {
        try_files $uri =404;
        add_header Cache-Control "public, max-age=604800, immutable";
    }

    # 管理端点仅供容器内部探活，不公开到互联网
    location = /api/actuator { return 404; }
    location ^~ /api/actuator/ { return 404; }
    location = /api { return 404; }

    location /api/ {
        proxy_pass http://usercenter_api;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Port 443;
        proxy_set_header Forwarded "";
        proxy_set_header X-Forwarded-Prefix "";
        proxy_set_header X-Forwarded-Ssl "";
        proxy_set_header CF-Connecting-IP "";
        proxy_connect_timeout 5s;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
        proxy_intercept_errors off;
        proxy_cache off;
        proxy_hide_header Cache-Control;
        add_header Cache-Control "no-store" always;
    }
}
```

这里没有去掉 `/api`，也没有把 API 回退为 `index.html`。`/assets/` 的长期缓存前提是文件名带内容 hash；如果前端实际输出到 `/static/` 或使用固定文件名，需要调整目录和缓存策略。上传大小还需与 Spring Boot multipart 限制一致。[Nginx try_files](https://nginx.org/en/docs/http/ngx_http_core_module.html#try_files)

Cloudflare 控制台中给 `/api/*` 配置绕过缓存的规则，并确认没有更高优先级的 Cache Everything 规则覆盖它。会话、用户资料与 CSRF 令牌不得被 CDN 共享缓存。[Cloudflare Cache Rules](https://developers.cloudflare.com/cache/how-to/cache-rules/)

## 五、首次启动与验收

1. 上传真实前端产物，确认 `public/index.html` 非空，建立指向有效版本的 `current`。不要将源码目录直接作为站点根目录。
```bash
# 首次部署；先上传实际前端产物，且 current 还不存在时执行
sudo ln -s releases/v1.0.0 /srv/www/dashboard.19271949.xyz/current
# 上条若提示已存在，先 readlink 核对；后续切换按第六节操作
test -s /srv/www/dashboard.19271949.xyz/current/public/index.html
```

2. 证书和以上四个 `.conf` 就位，安全组及 Docker 端口检查完成，再启动。

```bash
cd /opt/docker/nginx
sudo docker compose config -q
sudo docker compose pull
sudo docker compose run --rm --no-deps nginx nginx -t
# 前面的检查全部成功后再执行
sudo docker compose up -d
sudo docker compose ps
sudo docker compose logs --tail=100 nginx

curl -sSI -H 'Host: dashboard.19271949.xyz' http://127.0.0.1/
# 期望 301 且 Location 指向正确 HTTPS 域名

sudo curl -fsSI \
  --cacert /opt/docker/nginx/certs/origin-ca-root.pem \
  --resolve dashboard.19271949.xyz:443:127.0.0.1 \
  https://dashboard.19271949.xyz/
# 期望真实 CA 校验通过，返回 200；不要把 -k 的成功当成证书正确
```

源站自测通过后，Cloudflare DNS 开启代理，确认边缘证书 Active，设置 Full (strict) 和 Always Use HTTPS，再执行：

```bash
curl -fsSI https://dashboard.19271949.xyz/
curl -sSI https://dashboard.19271949.xyz/assets/__missing__.js
# 第一条应 200；第二条应 404，不能返回前端 HTML 入口作为成功响应
```

从浏览器打开首页及实际存在的深层路由、刷新页面，再检查 Network 面板。MySQL 和后端部署完成后，按 [Spring Boot 教程](springboot.md) 验证 CSRF → 登录 → 查询登录态 → 退出。

## 六、更新、回滚与故障定位

### 1. 改 Nginx 配置或替换证书

先保存上一份文件，再修改。命令使用固定目录，避免原笔记中“没有 cd 就 exec”的问题：

```bash
cd /opt/docker/nginx
sudo docker compose exec -T nginx nginx -t &&
sudo docker compose exec -T nginx nginx -s reload
sudo docker compose logs --tail=100 nginx
```

`nginx -t` 失败时，现有 worker 一般仍服务旧配置；应恢复文件，不要继续 restart。修改 Compose 的端口、挂载、镜像时，用 `config -q` 检查后执行 `up -d`，单纯 reload 或 restart 不会应用新的容器配置。

### 2. 切换前端版本

确认新版本文件完整且校验通过后，在站点父目录创建临时链接，再原子替换 `current`：

```bash
cd /srv/www/dashboard.19271949.xyz
test -s releases/v1.0.1/public/index.html
readlink current
# 确认上一条输出并记录，且 .current-next 不存在，再执行
sudo ln -s releases/v1.0.1 .current-next &&
sudo mv -Tf .current-next current
```

回滚时同样指回已验证的旧目录。本套父目录挂载可以看到新链接；如果只挂载 `current` 的解析目标，切链接不一定改变容器内挂载，需要重建容器。旧标签页仍可能请求旧 hash 资源，仅保留旧目录并不意味着新根目录能提供这些资源，需要制定兼容资源保留策略。

### 3. 常见报错

| 现象 | 优先检查 |
| --- | --- |
| `bind source path does not exist` | `conf.d`、`certs` 和 `/srv/www` 实际路径 |
| `cannot load certificate` | 挂载、文件权限、PEM 内容和私钥配对 |
| HTTP 跳转，HTTPS 连不上 | `443:443`、源站监听、安全组、宿主机转发规则 |
| Cloudflare 521 / 525 / 526 | 分别优先查连接拒绝、TLS 握手、证书验证；不要混为同一个问题 |
| 页面 200 但白屏 | 空首页、资源路径、浏览器 JS 错误、旧 HTML 缓存 |
| API 404 | 实际 Controller/context-path 是否恰好一个 `/api`，代理有无尾斜杠 |
| API 502 | 后端是否 healthy、双方是否都在 `app-net`、DNS和容器端口 |
| 登录 403 | CSRF 获取和提交、Session Cookie、权限；不要直接关闭 CSRF |
| 重启后全部用户掉线 | 内存 Session 会丢失，见后端教程的单实例限制 |

这里给出的是文档修订方案，尚未在实际腾讯云服务器执行以上验收。
