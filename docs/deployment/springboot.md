# 【腾讯云】Spring Boot 部署与规范

延续原笔记的 Docker 部署方式：Nginx 和 MySQL 可以直接运行官方镜像；Spring Boot 还需要先把自己的代码打成可执行 Jar，再制作包含 Jar 的应用镜像。配置、数据库和用户上传文件应独立于镜像管理。

本文先在开发机或 CI 构建，再把同一个镜像交给服务器运行。命令分为「开发机 Bash／WSL」和「服务器 Bash」，不要直接把 Bash 命令粘进 PowerShell。

## 一、部署前先确认

### 1. 版本与代码前提

当前资料没有提供后端 `pom.xml`，所以不能断言项目使用哪一版 Java、Spring Boot 或哪一个 Jar 文件名。**下面完整示例以已兼容 Java 17 的 Spring Boot 3.x、Maven、Servlet Web 应用为前提**；这是示例适用范围，不是让旧项目直接升级。

| 需要检查 | 检查位置／方法 |
| --- | --- |
| Spring Boot 版本 | `pom.xml` 的 parent 或 dependencyManagement |
| 编译 Java 版本 | `java.version`、`maven.compiler.release`、compiler 插件及 `./mvnw -v` |
| 可执行 Jar | 包含 Spring Boot loader、`BOOT-INF/classes` 和依赖；不能使用 `.original` 或普通薄 Jar |
| 路由前缀 | `/api` 来自 context-path 还是 Controller，不能叠加成 `/api/api` |
| 数据访问 | Connector/J、MyBatis-Plus、Druid starter 与当前 Boot 版本兼容 |
| 数据库结构 | 使用后端项目真实、已审阅的建表或迁移脚本 |
| 登录机制 | 原笔记是 Spring Security + Session + CSRF，要把 Cookie 与反向代理一起验收 |

Boot 2.7 的最低 Java 基线为 8，Boot 3 和 Boot 4 为 17；具体支持的 Java 上限依小版本而变。Java 21 编译的字节码不能因为“17 是最低要求”就放进 Java 17 镜像。旧 Boot 的依赖体系、`javax`/`jakarta` 差异也不能靠换 JDK 解决。[Boot 2.7 要求](https://docs.spring.io/spring-boot/docs/2.7.18/reference/html/getting-started.html#getting-started.system-requirements)、[Boot 3.5 要求](https://docs.spring.io/spring-boot/3.5/system-requirements.html)、[Boot 4 要求](https://docs.spring.io/spring-boot/system-requirements.html)

### 2. 与前两篇统一的连接关系

```text
浏览器请求 /api/user/...
    ↓ HTTPS，同源，不写 localhost:8080
Nginx：proxy_pass http://usercenter_api;  （保留 /api）
    ↓ app-net
usercenter-backend:8080
    ↓ usercenter-db-net
mysql:3306/usercenter_prod
```

本篇主线用 `server.servlet.context-path: /api`，Controller 只写 `/user/...` 等业务前缀。如果实际代码已统一 `@RequestMapping("/api/...")`，保留代码前缀并去掉本篇 context-path，随后将内部探活地址改为 `/actuator/health/readiness`，并在 Nginx 另行阻止 `/actuator` 与 `/actuator/` 的公网访问。

后端容器里的 `localhost` 是后端自身。数据库地址必须用同一网络中的 `mysql`，不是 `localhost`，也不是服务器公网 IP。

## 二、目录结构与职责

```text
开发机：后端项目/
├── pom.xml
├── mvnw
├── src/
├── target/                          # Maven 产物
└── deploy-image/                    # 本次制作镜像的最小上下文
    ├── Dockerfile
    ├── .dockerignore
    ├── app.jar
    └── runtime-image.txt            # 本次使用的基础镜像 digest 记录

服务器：
/opt/docker/usercenter-backend/
├── compose.yml
└── .env                            # APP_VERSION、APP_IMAGE；无密码

/srv/usercenter-backend/
├── releases/
│   ├── v1.0.0/
│   │   ├── app-image.tar
│   │   ├── app-image.tar.sha256
│   │   └── config/application-prod.yml
│   └── v1.0.1/...
└── shared/                         # 以后有上传文件时再挂载专用子目录

/opt/secrets/usercenter/DB_PASSWORD  # MySQL 教程中已创建的同一密码文件
```

| 内容 | 保存原则 |
| --- | --- |
| Jar 与镜像 | 同一版本构建一次，发布后不覆盖原标签 |
| 生产非秘密配置 | 随发布版本保存，回滚时与应用配套 |
| 密码 | 由 Compose secret 挂载，不打进 Jar 或镜像 |
| 日志 | 写 stdout/stderr，由 Docker 限额轮转 |
| 数据库和上传文件 | 属于持久化数据，不随应用回滚或删除 |

## 三、准备生产配置与健康检查

### 1. application-prod.yml

部署时保存到服务器 `/srv/usercenter-backend/releases/v1.0.0/config/application-prod.yml`。该文件补充 Jar 内的公共配置，保留原项目 MyBatis/Druid 等必要设置。生产 Profile 由 Compose 激活，不在公共 `application.yml` 中写死 `dev`。

```yaml
server:
  address: 0.0.0.0
  port: 8080
  shutdown: graceful
  forward-headers-strategy: framework
  servlet:
    context-path: /api
    session:
      timeout: 30m
      cookie:
        http-only: true
        secure: true
        same-site: lax

spring:
  config:
    import: "configtree:/run/secrets/"
  lifecycle:
    timeout-per-shutdown-phase: 30s
  datasource:
    url: ${DB_URL}
    username: ${DB_USERNAME}
    password: ${DB_PASSWORD}
    driver-class-name: com.mysql.cj.jdbc.Driver
  sql:
    init:
      mode: never
  servlet:
    multipart:
      max-file-size: 10MB
      max-request-size: 12MB

management:
  endpoints:
    web:
      exposure:
        include: health
  endpoint:
    health:
      show-details: never
      probes:
        enabled: true
      group:
        readiness:
          include: readinessState,db
        liveness:
          include: livenessState

logging:
  level:
    root: info
    com.lcq.usercenter: info
```

关键点：

- `configtree` 把 `/run/secrets/DB_PASSWORD` 的内容读成 Spring 属性，供 `${DB_PASSWORD}` 使用；它不是自动设置系统环境变量。这里不加 `optional:`，也不提供密码默认值。configtree 从 Boot 2.4 起提供。
- `server.address` 要允许 Nginx 从容器网络连接；不公开后端端口通过 Compose 无 `ports` 实现。
- `forward-headers-strategy` 依赖 [Nginx 修订配置](nginx-review.md) 清除不可信的转发头。只加此项并不能安全地信任所有请求来源。
- `secure: true` 表示浏览器只通过 HTTPS 发送 Session Cookie。正式登录测试应走域名 HTTPS；在公网直接访问 HTTP 后端会造成 Cookie 不生效。
- `spring.sql.init.mode: never` 防止误用自动初始化脚本，不会替你关闭 Flyway、Liquibase 或自写初始化逻辑。若项目使用这些迁移工具，需要单独设计迁移账号与发布步骤。

上传配置允许单文件最多 10 MiB，总请求最多 12 MiB，为 multipart 边界和字段留出空间；Nginx 的请求体限制对应设为 `12m`。

配置来源：[Spring 外部配置](https://docs.spring.io/spring-boot/reference/features/external-config.html)、[ConfigTree 版本](https://docs.spring.io/spring-boot/api/java/org/springframework/boot/env/ConfigTreePropertySource.html)、[反向代理配置](https://docs.spring.io/spring-boot/how-to/webserver.html#howto.webserver.use-behind-a-proxy-server)、[数据库初始化](https://docs.spring.io/spring-boot/how-to/data-initialization.html)。

### 2. 健康检查需要后端实际支持

在后端 `pom.xml` 加入 Actuator；如果已经有，不重复添加。依赖版本交给现有 Spring Boot 依赖管理：

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-actuator</artifactId>
</dependency>
```

本例没有单独的 management 端口，因此容器内部地址为：

```text
GET http://127.0.0.1:8080/api/actuator/health/readiness
```

在**现有** Spring Security 规则中，先于兜底认证规则放行探针 GET。Boot 3 写法片段如下；合并进去，不要因此删掉原登录、管理员和 CSRF 规则，也不要多创建一个互相冲突的过滤链：

```java
.requestMatchers(
    HttpMethod.GET,
    "/actuator/health/readiness",
    "/actuator/health/liveness"
).permitAll()
```

这里的 `/api` 是 context-path，Security matcher 不包含它。自定义鉴权 Filter 也要允许探针请求通过。Nginx 已屏蔽 `/api/actuator`，不对公网暴露环境变量、堆转储或管理端点。[Spring Security 请求匹配](https://docs.spring.io/spring-security/reference/servlet/authorization/authorize-http-requests.html)、[Actuator 探针](https://docs.spring.io/spring-boot/3.5/reference/actuator/endpoints.html#actuator.endpoints.kubernetes-probes)

本例把 `db` 显式加入 readiness，所以数据库连接异常时不宣称服务就绪。liveness 只判断应用自身，避免数据库故障引起全体进程重启。数据库探针也不能证明业务表正确、权限完整或登录流程无误。

## 四、开发机：打包 Jar 并制作镜像

### 1. 先测试，再打包

在后端仓库的 Bash／WSL 中执行。先按原笔记配置独立测试库和 `TEST_DB_*`，确保集成测试显式激活 `test`；不要让测试指向生产库。

```bash
java -version
./mvnw -v
./mvnw -B clean verify
```

没有 Maven Wrapper 的项目使用已核对版本的 `mvn`。`verify` 失败先修复，不把 `-DskipTests` 写成默认部署步骤。若 `pom.xml` 没有 Spring Boot Maven 插件，应在已有构建配置中补齐 `spring-boot-maven-plugin` 的 `repackage` 设置，直到产物确实是可执行 Jar。[Spring Boot Maven 打包](https://docs.spring.io/spring-boot/maven-plugin/packaging.html)

### 2. 选中正确的 Jar

```bash
set -euo pipefail
artifact_name=$(./mvnw -q -Dstyle.color=never -DforceStdout \
  help:evaluate -Dexpression=project.build.finalName)
test -s "target/$artifact_name.jar"
jar tf "target/$artifact_name.jar" > /tmp/usercenter-jar-entries.txt
grep -q '^BOOT-INF/classes/' /tmp/usercenter-jar-entries.txt
grep -q '^BOOT-INF/lib/' /tmp/usercenter-jar-entries.txt

# deploy-image 作为本地构建目录，应加入后端项目 .gitignore
mkdir -p deploy-image
cp "target/$artifact_name.jar" deploy-image/app.jar
```

多模块项目要进入实际启动模块，或使用它的 `target` 路径；自定义 classifier 的项目先核对产物名称。不要用 `COPY target/*.jar`，因为一个目录中可能有多个 Jar。

### 3. Dockerfile

保存到 `deploy-image/Dockerfile`：

```dockerfile
# syntax=docker/dockerfile:1
ARG RUNTIME_IMAGE
FROM ${RUNTIME_IMAGE}

USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 app \
    && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin app

WORKDIR /app
COPY --chown=10001:10001 app.jar /app/app.jar
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
```

本例采用 Ubuntu Jammy 变体，因此可以用 `apt-get`，不要换成 Alpine 后仍照抄安装命令。容器运行时使用 JRE 即可；测试编译在构建机 JDK 完成。`curl` 为健康检查显式安装，不能假设所有 Java 镜像都自带。[Eclipse Temurin 官方镜像](https://hub.docker.com/_/eclipse-temurin)

`EXPOSE` 是端口声明，不会公开宿主机端口。JSON 数组形式的 ENTRYPOINT 让 Java 正确接收停止信号，不用 `nohup`、后台 `&` 或无限 `tail` 来维持容器。[Dockerfile ENTRYPOINT](https://docs.docker.com/reference/dockerfile/#entrypoint)

`deploy-image/.dockerignore`：

```text
*
!Dockerfile
!.dockerignore
!app.jar
```

### 4. 构建并导出镜像

先在服务器执行 `uname -m`：`x86_64` 对应 `linux/amd64`，`aarch64` 对应 `linux/arm64`。下面开发机命令以 `linux/amd64` 为例；架构不同必须修改，特别留意 JNI 等原生依赖。

```bash
cd deploy-image
docker pull --platform linux/amd64 eclipse-temurin:17-jre-jammy
runtime_image=$(docker image inspect eclipse-temurin:17-jre-jammy \
  --format '{{index .RepoDigests 0}}')
printf '%s\n' "$runtime_image" > runtime-image.txt

# v1.0.0 是演示发布号，已有同名发布时改用新版本，不覆盖
docker build --platform linux/amd64 \
  --build-arg RUNTIME_IMAGE="$runtime_image" \
  -t usercenter-backend:v1.0.0 .

docker image inspect usercenter-backend:v1.0.0 --format '{{.Id}}'
docker save -o app-image.tar usercenter-backend:v1.0.0
sha256sum app-image.tar > app-image.tar.sha256
```

镜像 digest 固定基础镜像内容；构建时 apt 软件包源仍会变化，所以要保存本次最终镜像，发布或回滚时加载原镜像，不把“重新构建同版本”当成复现。镜像标签和构建记录一起保存；若以后使用私有镜像仓库，改用 Registry digest 部署即可。

将 `app-image.tar`、`.sha256`、Dockerfile 和 `runtime-image.txt` 上传到服务器的版本目录。示例使用 SCP；替换服务器别名和用户名，并先按下一节创建上传目录：

```bash
# 开发机执行；server-alias 为你已配置好的 SSH 主机别名
scp app-image.tar app-image.tar.sha256 Dockerfile runtime-image.txt \
  server-alias:~/usercenter-upload/v1.0.0/
```

## 五、服务器：配置 Docker

### 1. 创建目录并核对前置条件

```bash
mkdir -p ~/usercenter-upload/v1.0.0
sudo install -d -m 0755 /opt/docker/usercenter-backend
sudo install -d -m 0755 /srv/usercenter-backend/releases/v1.0.0/config
sudo install -d -m 0755 /srv/usercenter-backend/shared

sudo docker network inspect app-net
sudo docker network inspect usercenter-db-net
sudo docker compose --env-file /opt/docker/mysql/.env -f /opt/docker/mysql/compose.yml ps
sudo test -s /opt/secrets/usercenter/DB_PASSWORD
```

`usercenter-db-net` 应是 `Internal: true`，MySQL 应 healthy。缺少网络或密码文件时先完成 [MySQL 教程](mysql.md)，不要在本篇重新生成一份不同的数据库密码。

上传完成后：

```bash
cd ~/usercenter-upload/v1.0.0
sha256sum -c app-image.tar.sha256
# 校验成功后再执行
sudo cp app-image.tar app-image.tar.sha256 Dockerfile runtime-image.txt \
  /srv/usercenter-backend/releases/v1.0.0/
sudo docker load -i /srv/usercenter-backend/releases/v1.0.0/app-image.tar
sudo docker image inspect usercenter-backend:v1.0.0 --format '{{.Id}}'
# 与构建机记录的镜像 ID 对照

sudoedit /srv/usercenter-backend/releases/v1.0.0/config/application-prod.yml
# 将第三节的非秘密生产配置写入此文件
```

### 2. .env

保存到 `/opt/docker/usercenter-backend/.env`：

```dotenv
APP_VERSION=v1.0.0
APP_IMAGE=usercenter-backend:v1.0.0
```

`.env` 在这里用于 Compose 插值。它不会把所有键自动变成容器里的环境变量；容器内的变量由下面 `environment` 明确声明。

### 3. compose.yml

```yaml
name: usercenter-prod
services:
  usercenter-backend:
    image: ${APP_IMAGE:?请在.env设置APP_IMAGE}
    pull_policy: never
    restart: unless-stopped
    init: true
    user: "10001:10001"
    read_only: true
    tmpfs:
      - /tmp:rw,noexec,nosuid,size=128m,mode=1777
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    mem_limit: 768m
    stop_grace_period: 60s
    environment:
      SPRING_PROFILES_ACTIVE: prod
      SPRING_CONFIG_ADDITIONAL_LOCATION: file:/app/config/
      DB_URL: "jdbc:mysql://mysql:3306/usercenter_prod?sslMode=REQUIRED&connectionTimeZone=UTC"
      DB_USERNAME: usercenter_app
      JAVA_TOOL_OPTIONS: "-XX:MaxRAMPercentage=60.0 -XX:+ExitOnOutOfMemoryError -Duser.timezone=UTC"
    volumes:
      - type: bind
        source: /srv/usercenter-backend/releases/${APP_VERSION:?请设置APP_VERSION}/config
        target: /app/config
        read_only: true
        bind:
          create_host_path: false
    secrets:
      - source: db_password
        target: DB_PASSWORD
    healthcheck:
      test:
        - CMD-SHELL
        - >-
          test "$$(curl -sS --max-time 3 -o /dev/null -w '%{http_code}'
          http://127.0.0.1:8080/api/actuator/health/readiness)" = "200"
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 60s
    logging:
      driver: local
      options:
        max-size: "10m"
        max-file: "5"
    networks:
      - app-net
      - usercenter-db-net

secrets:
  db_password:
    file: /opt/secrets/usercenter/DB_PASSWORD

networks:
  app-net:
    external: true
    name: app-net
  usercenter-db-net:
    external: true
    name: usercenter-db-net
```

配置说明：

1. **没有 `ports`。** Nginx 通过 Docker 网络连接服务名 `usercenter-backend:8080`。不需要开放云安全组 8080，也不会与 `www` 示例的宿主机 `127.0.0.1:8080` 冲突。
2. **没有跨项目 `depends_on`。** MySQL 属于另一个 Compose 项目，不能在这里引用不存在的 `mysql` 服务。首次按 MySQL healthy → 后端 healthy → Nginx/API 验收的顺序执行；服务器重启后仍需依赖应用的数据库重连能力，并检查服务最终恢复。[Compose 启动依赖](https://docs.docker.com/compose/how-tos/startup-order/)
3. **TLS 显式要求加密。** `sslMode=REQUIRED` 适用于这里的同机、受控 Docker 内网和 MySQL 自动生成的 TLS 证书，但不验证服务器身份。跨主机或需要防冒充时，部署受信任 CA、SAN 含 `mysql` 的服务器证书与 Java truststore，改为 `VERIFY_IDENTITY`。不要把 `useSSL=false&allowPublicKeyRetrieval=true` 当成万能修复。[Connector/J TLS 配置](https://dev.mysql.com/doc/connector-j/en/connector-j-connp-props-security.html)
4. **768 MiB 只是初始示例。** JVM 堆之外还有线程栈、Metaspace、直接内存等；要结合 MySQL、Nginx、OS 的总预算调整，不能把服务器全部内存都给 `-Xmx`。`-XX:+ExitOnOutOfMemoryError` 便于进程失败后由重启策略拉起，仍需排查泄漏和容量。
5. **探活严格比较 200。** 单纯 `curl -f` 可能把登录 302 当作成功；Compose 中 `$$` 让 `$` 留给容器 shell。`unhealthy` 只表示探针失败，普通 Docker Compose 不会仅因 unhealthy 自动重启容器。[Compose 插值](https://docs.docker.com/reference/compose-file/interpolation/)、[Docker 健康检查](https://docs.docker.com/reference/dockerfile/#healthcheck)
6. **Secret 权限沿用 MySQL 篇。** 非 root 的 UID 10001 必须能读取挂载文件。源文件父目录由 root 持有且 0700，文件 0444；本地 Compose 文件 secret 是只读 bind，不能依赖 `uid/gid/mode` 自动改宿主文件所有权。它不是加密保管库，Docker 管理员可读取。[Compose secrets](https://docs.docker.com/reference/compose-file/services/#secrets)
7. **只读根文件系统需要配合应用。** 本例只允许 `/tmp` 临时写入。若业务上传文件或生成报表，将专用目录持久化挂载并设为 UID 10001 可写；不要把上传内容写入 Jar 所在目录。若本地库需要在临时目录执行文件，先评估再调整 `noexec`。

## 六、首次启动与联调

### 1. 启动后端

```bash
cd /opt/docker/usercenter-backend
sudo docker compose config -q
sudo docker compose up -d
sudo docker compose ps
sudo docker compose logs --tail=200 usercenter-backend

# 等启动完成再执行，期望 HTTP 200、JSON 中 status 为 UP
sudo docker compose exec -T usercenter-backend \
  curl -sS -i http://127.0.0.1:8080/api/actuator/health/readiness

backend_id=$(sudo docker compose ps -q usercenter-backend)
sudo docker inspect "$backend_id" --format '{{.State.Health.Status}}'
```

日志应明确激活 `prod`，不能仍显示 `dev` 或默认 Profile。端点返回 401/302，先查 Security 放行；返回 503，查数据库连接；返回 404，查 Actuator 依赖、context-path 与探针配置，不要通过移除健康检查掩盖问题。

### 2. 接入 Nginx

确认 Nginx 已采用 [修订示例](nginx-review.md) 中 `usercenter_api` upstream 和 `/api/` location，然后检查并 reload：

```bash
cd /opt/docker/nginx
sudo docker compose exec -T nginx nginx -t &&
sudo docker compose exec -T nginx nginx -s reload
```

如果仍沿用旧静态 upstream，后端重建改变 IP 后也需要 reload。动态 DNS 会更新地址，但 Nginx 并不自动读取 Compose 的 healthy 状态，单实例重建期间仍可能短暂出现 502。

### 3. 验证 Session 与 CSRF

原笔记明确给出 `GET /api/auth/csrf`，可先做只读自测：

```bash
curl -sS -D /tmp/usercenter-csrf.headers \
  -c /tmp/usercenter.cookies \
  https://dashboard.19271949.xyz/api/auth/csrf
```

此接口的预期是 HTTP 200 和 JSON，包括 CSRF token 及要提交的 headerName；具体外层包装按项目实现，不假定 `code` 固定为某值。Token 和 Cookie 属于会话信息，不贴进公开日志。

再在浏览器完成实际业务验收：

| 操作 | 期望结果 |
| --- | --- |
| 打开前端，获取 CSRF token | 请求走同源 `/api`，不再出现开发机 localhost 地址 |
| 使用测试账号登录 | 携带同一会话 Cookie 和正确 CSRF Header，登录成功 |
| 登录后获取当前用户 | 保持登录态，Cookie 具备 Secure、HttpOnly，域名和 Path 正确 |
| 登录／退出后再次获取 CSRF | 依据服务端令牌生命周期刷新，不能永久复用旧 token |
| 普通用户访问管理员接口 | 返回预期 403 JSON |
| 退出后访问受保护接口 | 返回预期 401 JSON |
| 不存在的 API | 不应以 HTTP 200 返回前端 `index.html` |
| 浏览器刷新深层前端页面 | SPA 页面正常恢复，资源无错误缓存 |

不要因为生产环境出现 403 就关闭 CSRF，也不要配置“任意 Origin + 携带凭据”的跨域。此方案前后端走同一域名，无需为了基本登录另外开放跨域。

## 七、更新、回滚和日常维护

### 1. 发布新版本

1. 构建并验证 `v1.0.1` 镜像，上传到新的版本目录，校验 SHA-256 后 `docker load`。
2. 为新版本保存配套 `config/application-prod.yml`，审查配置差异；真实密码仍只来自 secret。
3. 若有数据库结构变更，先备份并验证兼容迁移方案。运行账号只有业务读写权限，建表/改表用迁移账号或管理员执行。
4. 记录旧的 `.env` 和镜像 ID，将 `APP_VERSION`、`APP_IMAGE` **一起**切到 `v1.0.1`。
5. 执行以下命令，然后重新做健康检查和登录联调。

```bash
cd /opt/docker/usercenter-backend
sudo docker compose config -q
sudo docker compose up -d --no-deps usercenter-backend
sudo docker compose logs --tail=200 usercenter-backend
```

`docker compose restart` 不会应用新镜像、环境变量或挂载路径。单实例更新会有短暂停机；不要把 `restart: unless-stopped` 称为高可用。[Compose restart](https://docs.docker.com/reference/cli/docker/compose/restart/)

只修改当前版本内的挂载文件时，应记录这次配置变更，并重建容器以重新读取配置与 secrets：

```bash
cd /opt/docker/usercenter-backend
sudo docker compose up -d --no-deps --force-recreate usercenter-backend
```

### 2. 回滚应用

先确认当前数据库结构仍兼容旧代码。保留旧镜像与旧版本配置，将 `.env` 恢复为：

```dotenv
APP_VERSION=v1.0.0
APP_IMAGE=usercenter-backend:v1.0.0
```

再执行 `config -q`、`up -d --no-deps usercenter-backend`，验证健康与登录流程。没有旧镜像时从保存的旧 `app-image.tar` 加载；不要临时重新构建一个同名旧标签冒充原发布。

回滚 Jar／镜像不会回滚数据库。删除列、重写数据等不可逆迁移需要独立的数据恢复决策；不要为了回退代码自动用旧备份覆盖现有生产数据。

### 3. 停机、日志和 Session 边界

```bash
cd /opt/docker/usercenter-backend
sudo docker compose logs --tail=200 -f usercenter-backend
sudo docker compose stop usercenter-backend
# 需要恢复服务时
sudo docker compose up -d
```

停止时 Docker 发出终止信号，Spring Boot 按配置进行 graceful shutdown。本例每个 Spring 生命周期停机阶段允许 30 秒，Docker 总等待 60 秒；有多个耗时阶段时需增加并实测。[Spring Boot 优雅停机](https://docs.spring.io/spring-boot/3.5/reference/web/graceful-shutdown.html)

默认内存 Session 会在重启／更新时丢失，用户需要重新登录，多副本也不能自动共享会话。以后需要保留登录态或扩容，再采用 Spring Session + Redis/JDBC 等共享会话方案，并验证序列化与版本兼容；不要先把单实例直接扩成多副本。[Spring Session](https://docs.spring.io/spring-session/reference/)

## 八、常见问题

| 现象 | 原因与处理 |
| --- | --- |
| `UnsupportedClassVersionError` | Jar 编译版本高于运行 JRE，核对实际字节码和镜像 |
| `no main manifest attribute` | 普通 Jar 或错误产物，检查 Boot repackage |
| 找不到 `DB_PASSWORD` | configtree 导入、secret 文件名、读取权限、prod 激活有误 |
| MySQL `Access denied` | 密码／账号／host 不一致；改 secret 不会自动修改数据库密码 |
| `Communications link failure` | 数据库未就绪、服务名/网络错误、TLS配置或连接被中断 |
| `Public Key Retrieval is not allowed` | 优先检查 JDBC TLS 是否实际建立和驱动兼容性，不通用关闭 SSL |
| 健康检查 404 | Actuator 不在包内、路径前缀或版本配置不匹配 |
| 健康检查 401／302 | 探针被 Security 或自定义 Filter 拦截 |
| 容器 running 但 unhealthy | 看 health 日志；普通 Compose 不会仅因此自动重启 |
| 容器退出 137／OOMKilled | 查看 `docker inspect` 与宿主机内存，减少内存占用或增加容量 |
| 登录成功后仍未登录 | Cookie 未保存／发送、HTTPS转发头不正确、CSRF流程或Session丢失 |
| 只读文件系统错误 | 应用在写容器根目录；配置专用可写持久化目录 |
| 后端重建后 Nginx 502 | 确认动态 DNS配置、网络和实际8080监听，再做请求验证 |

本文是部署操作教程；本次未取得实际后端源码、Jar、生产服务器或数据库，不能宣称以上配置已完成真实运行验收。
