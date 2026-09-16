# 【腾讯云】MySQL 部署与规范

本篇接在 Nginx 部署之后，目标是在同一台腾讯云 Linux 服务器上运行用户中心数据库，并给 Spring Boot 提供稳定的内部连接地址。命令面向 **Ubuntu/Debian + Bash + Docker Engine + Compose v2**；先核对 `docker version`、`docker compose version`。本文是部署教程，写入本文不代表服务器已经执行了这些命令。

示例选择官方 `mysql:8.4` LTS 系列，生产部署时固定实际拉取到的 digest。8.4 是本教程选定的兼容系列，不能把 `latest` 或会随发行线变化的 `lts` 标签当成固定版本。[MySQL 发行模型](https://dev.mysql.com/doc/refman/8.4/en/mysql-releases.html)、[官方镜像支持标签](https://hub.docker.com/_/mysql)

#### 1. 先明确目录、账号与连接关系

```text
/opt/docker/mysql/
├── compose.yml                 # MySQL 服务、挂载、健康检查
├── .env                        # 只有 MYSQL_IMAGE，不放密码
├── image-record.txt            # 拉取时间、digest、MySQL 版本
├── schema.sql                  # 审查后的建表 SQL，首次导入时准备
├── backup.sh                   # 逻辑备份脚本
└── restore-check.sh            # 隔离恢复演练脚本

/opt/secrets/                    # root:root，0700
├── mysql/                      # root:root，0700
│   └── MYSQL_ROOT_PASSWORD     # root:root，0444
└── usercenter/                 # root:root，0700
    └── DB_PASSWORD             # root:root，0444；MySQL 与后端共享

/srv/mysql/
├── data/                       # MySQL 实际数据，挂到 /var/lib/mysql
└── backups/                    # SQL 压缩备份、校验文件，root 专用
```

| 对象 | 职责 | 不应该放什么 |
| --- | --- | --- |
| `/opt/docker/mysql` | 管理服务配置和维护脚本 | 明文账号密码、实际数据库文件 |
| `/srv/mysql/data` | 保存表、索引、系统表、redo/binlog 等运行数据 | 下载的 SQL、手工备份、其他应用文件 |
| `/srv/mysql/backups` | 保存可校验、可恢复的逻辑备份 | 唯一一份灾难恢复副本 |
| `root@localhost` | 容器内管理、导入结构、授权、维护 | 应用连接池凭据 |
| `usercenter_app@%` | 后端访问 `usercenter_prod` | 全局权限、授权权限、日常建表权限 |
| `usercenter-db-net` | 只有数据库和需要访问它的后端加入 | Nginx、无关测试容器 |

连接链路如下：

```text
Nginx ── app-net ── Spring Boot
                        │
               usercenter-db-net（internal）
                        │
                    mysql:3306
                        │
                 usercenter_prod
```

后端连接 `mysql:3306/usercenter_prod`。这里的 `mysql` 是 Docker 网络中的服务名，不是公网域名；后端容器里的 `localhost` 指后端自己。MySQL 不写 `ports:`，腾讯云安全组也不开放 3306/33060。服务间通过自定义网络直接访问，不需要 `expose:` 才能通信。

#### 2. 建目录、生成密码并固定镜像

**1）在服务器上进入管理员 Bash。** 后面的服务器命令默认在这个会话中执行，脚本则通过 `bash 文件名` 执行。

```bash
sudo -i
bash
set -euo pipefail
umask 077

docker version
docker compose version
openssl version

install -d -o root -g root -m 0750 /opt/docker/mysql /srv/mysql
install -d -o root -g root -m 0700 /srv/mysql/data /srv/mysql/backups
install -d -o root -g root -m 0700 \
  /opt/secrets /opt/secrets/mysql /opt/secrets/usercenter

# 只检查；已有数据时不要继续按“全新实例”初始化。
find /srv/mysql/data -mindepth 1 -maxdepth 1 -printf '%f\n'
```

全新实例的 `data` 应为空。如果输出已有 `mysql`、`ibdata1` 等文件，先确定其来源和版本，按已有实例接管或迁移。不要靠清空 `data` 解决密码错误或初始化失败。

**2）仅当密码文件不存在时生成密码。** 以下命令不会打印密码，也不会覆盖已有密码：

```bash
for secret_file in \
  /opt/secrets/mysql/MYSQL_ROOT_PASSWORD \
  /opt/secrets/usercenter/DB_PASSWORD
do
  if [ -e "$secret_file" ]; then
    test -f "$secret_file" && test -s "$secret_file"
    printf '保留已有密码文件：%s\n' "$secret_file"
  else
    secret_value=$(openssl rand -hex 32)
    printf '%s' "$secret_value" > "$secret_file"
    unset secret_value
  fi
  chown root:root "$secret_file"
  chmod 0444 "$secret_file"
done

stat -c '%a %U:%G %n' \
  /opt/secrets /opt/secrets/mysql /opt/secrets/usercenter \
  /opt/secrets/mysql/MYSQL_ROOT_PASSWORD /opt/secrets/usercenter/DB_PASSWORD
```

密码由 32 个随机字节生成，写成没有末尾换行的 64 位十六进制文本，便于 MySQL 和 Spring Boot 读取同一个值。不要把文件内容复制进 Git、截图或 `.env`。已有密码文件若含末尾换行，先确认数据库实际密码、文件内容和后端读取方式；确认换行只是文件格式后，再受控规范化并重建读取它的容器。不要盲目去掉密码本身的空白，也不要把文件规范化误当成数据库改密。

为什么文件是 `0444`，父目录却是 `0700`？普通宿主机用户不能穿过 root 专有目录读取文件；文件单独挂进容器后，MySQL 用户和后端的非 root 用户可以读到它。本例针对普通 rootful Docker；已有 ACL、rootless Docker 或用户命名空间映射需要另外验证读取权限。不要用 `chmod -R 777` 修复。

本地 Compose 的文件型 secrets 是只读 bind mount，**不是加密的秘密管理服务**，其 `uid/gid/mode` 不能用来重写宿主文件权限，所以权限在宿主机设置。宿主 root、Docker 管理员及获得该 secret 的容器仍可读取内容。[Compose secrets 使用说明](https://docs.docker.com/compose/how-tos/use-secrets/)、[文件型 secret 的权限限制](https://docs.docker.com/reference/compose-file/services/#secrets)

**3）拉取选定系列并记录实际镜像。** 首次部署执行以下命令；以后不要自动覆盖 `.env` 触发数据库升级。

```bash
cd /opt/docker/mysql
test ! -e .env || { echo '.env 已存在，请先检查当前版本记录。' >&2; exit 1; }

docker pull mysql:8.4
mysql_image_ref=$(docker image inspect mysql:8.4 --format '{{index .RepoDigests 0}}')
case "$mysql_image_ref" in
  mysql@sha256:*|docker.io/library/mysql@sha256:*) ;;
  *) echo '没有取得可识别的官方镜像 digest，停止。' >&2; exit 1 ;;
esac

printf 'MYSQL_IMAGE=%s\n' "$mysql_image_ref" > .env
{
  date -Is
  printf 'source_tag=mysql:8.4\nimage=%s\n' "$mysql_image_ref"
  docker run --rm --network none "$mysql_image_ref" mysqld --version
} > image-record.txt
chmod 0640 .env image-record.txt
cat image-record.txt
```

标签可能指向新镜像，digest 指向具体内容。实际补丁号由输出确定，不照抄笔记里某个“最新版本号”。正式上线前，还要用该镜像验证后端驱动、SQL 和备份恢复流程。[按 digest 拉取镜像](https://docs.docker.com/reference/cli/docker/image/pull/#pull-an-image-by-digest-immutable-identifier)

#### 3. 创建并核对数据库内部网络

```bash
if docker network inspect usercenter-db-net >/dev/null 2>&1; then
  network_properties=$(docker network inspect usercenter-db-net \
    --format '{{.Driver}} {{.Internal}}')
  if [ "$network_properties" != 'bridge true' ]; then
    printf '已有网络属性不符合要求：%s；先安排迁移，不要直接删除在用网络。\n' \
      "$network_properties" >&2
    exit 1
  fi
else
  docker network create --driver bridge --internal usercenter-db-net
fi

docker network inspect usercenter-db-net \
  --format 'driver={{.Driver}} internal={{.Internal}} containers={{json .Containers}}'
```

`internal` 限制该网络与其他网络之间的通信；它不阻止宿主机访问容器，也不能防止有 Docker 管理权限的人加入网络。后端同时加入 `app-net` 和数据库网络，Nginx 只加入前者。不要给 MySQL 再挂普通 bridge 网络。[Docker internal 网络行为](https://docs.docker.com/reference/cli/docker/network/create/#network-internal-mode---internal)

#### 4. 编写 Compose

保存为 `/opt/docker/mysql/compose.yml`：

```yaml
name: usercenter-mysql

services:
  mysql:
    image: ${MYSQL_IMAGE:?请先在.env填写已核实的镜像digest}
    restart: unless-stopped
    stop_grace_period: 1m
    environment:
      MYSQL_ROOT_HOST: localhost
      MYSQL_ROOT_PASSWORD_FILE: /run/secrets/MYSQL_ROOT_PASSWORD
      MYSQL_DATABASE: usercenter_prod
      MYSQL_USER: usercenter_app
      MYSQL_PASSWORD_FILE: /run/secrets/DB_PASSWORD
    command:
      - --character-set-server=utf8mb4
      - --collation-server=utf8mb4_0900_ai_ci
      - --default-time-zone=+00:00
      - --require-secure-transport=ON
      - --binlog-expire-logs-seconds=604800
    volumes:
      - type: bind
        source: /srv/mysql/data
        target: /var/lib/mysql
        bind:
          create_host_path: false
    secrets:
      - source: mysql_root_password
        target: MYSQL_ROOT_PASSWORD
      - source: usercenter_db_password
        target: DB_PASSWORD
    networks:
      - usercenter-db-net
    healthcheck:
      test:
        - CMD-SHELL
        - >-
          MYSQL_PWD="$$(cat /run/secrets/DB_PASSWORD)"
          mysql --protocol=TCP --host=127.0.0.1 --port=3306
          --user=usercenter_app --database=usercenter_prod
          --ssl-mode=REQUIRED --connect-timeout=5
          --batch --skip-column-names --execute='SELECT 1' >/dev/null
      interval: 15s
      timeout: 8s
      retries: 10
      start_period: 90s
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

networks:
  usercenter-db-net:
    external: true
    name: usercenter-db-net

secrets:
  mysql_root_password:
    file: /opt/secrets/mysql/MYSQL_ROOT_PASSWORD
  usercenter_db_password:
    file: /opt/secrets/usercenter/DB_PASSWORD
```

关键点：

1. **只有数据目录持久化。** 官方入口会在默认 root 启动阶段整理目录属主，再切换到 mysql 用户。不要盲目固定 `user: 999:999`；不同镜像的 UID 未必相同。
2. **root 明确限制为 `localhost`。** 当前官方 8.4 入口源码的 `MYSQL_ROOT_HOST` 默认值为 `%`，因此这里显式覆盖。已有数据库不会因此自动删除远程 root，应先查询账号再处理。[官方 8.4 入口脚本](https://github.com/docker-library/mysql/blob/master/8.4/docker-entrypoint.sh)
3. **密码配置只包含文件路径。** `_FILE` 由官方入口读取；不要同时写 `MYSQL_PASSWORD` 和 `MYSQL_PASSWORD_FILE`。入口实现会把读到的值放入进程环境，因此这并不保证运行时进程环境里绝无密码；它避免把密码写进 Compose、镜像配置和命令行参数。
4. **`$$` 留给容器里的 shell。** 单个 `$` 可能被 Compose 提前解析。健康检查临时设置 `MYSQL_PWD`，使这一条客户端命令真正认证并查询；该进程存活时，具备权限的进程仍可能查看它的环境。不要打开 `set -x` 或输出秘密文件。
5. **健康检查走 TCP 并执行 `SELECT 1`。** 初始化阶段的临时 mysqld 禁用 TCP，不能过早误报就绪；单独使用 `mysqladmin ping` 即使遇到拒绝认证也可能返回成功。[mysqladmin ping 的退出状态](https://dev.mysql.com/doc/refman/8.4/en/mysqladmin.html)
6. **连接要求加密。** `require_secure_transport=ON` 允许本机 Unix socket 管理，TCP 客户端必须使用 TLS。7 天 binlog 保留只是一项容量示例，需结合备份间隔、复制和恢复目标调整；Docker 日志轮转不会清理 binlog。[MySQL 加密连接配置](https://dev.mysql.com/doc/refman/8.4/en/using-encrypted-connections.html)

#### 5. 启动与首次初始化验收

**1）先检查配置，再启动。**

```bash
cd /opt/docker/mysql
docker compose config --quiet
docker compose up -d --wait --wait-timeout 300
docker compose ps
docker compose logs --tail=100 mysql
```

等待超时就检查日志，不要继续启动后端。`--wait` 检查健康状态；服务器磁盘很慢时，查明原因后再调整等待时间。

官方镜像只会对全新数据目录自动建立库、账号，以及运行 `/docker-entrypoint-initdb.d` 中的初始化脚本；**修改环境变量或 secret 文件，不会修改已有数据库的账号密码、库名或表结构**。初始化中断可能留下部分数据，下次也不一定自动重跑完整流程，应先保留现场、查看失败步骤。[官方镜像初始化约定](https://hub.docker.com/_/mysql#initializing-a-fresh-instance)

**2）确认端口、网络和 SQL 连接。**

```bash
mysql_container_id=$(docker compose ps -q mysql)
test -n "$mysql_container_id"
docker port "$mysql_container_id"
docker inspect "$mysql_container_id" --format '{{json .NetworkSettings.Networks}}'
docker inspect "$mysql_container_id" --format '{{.State.Health.Status}}'

docker compose exec -T mysql sh -ec '
  MYSQL_PWD="$(cat /run/secrets/DB_PASSWORD)" \
  mysql --protocol=TCP -h127.0.0.1 -P3306 \
    -uusercenter_app --ssl-mode=REQUIRED usercenter_prod \
    --execute="SELECT DATABASE(), CURRENT_USER(), VERSION(); SHOW SESSION STATUS LIKE '\''Ssl_cipher'\'';"
'
```

`docker port` 应没有输出；网络列表只有 `usercenter-db-net`；健康状态为 `healthy`；查询显示库名 `usercenter_prod`，`Ssl_cipher` 有非空值。`docker ps` 的 `3306/tcp` 只表示镜像声明的容器端口，`0.0.0.0:3306->3306/tcp` 才表示宿主机发布。

**3）进入管理员会话查看账号。**

```bash
docker compose exec -e MYSQL_HISTFILE=/dev/null mysql mysql --protocol=SOCKET -uroot -p
```

在密码提示处输入密码管理器中保存的 root 密码；若使用上面的随机生成方式，管理员可通过受控方式读取密码文件。不要使用 `-p明文密码`。进入后执行：

```sql
SELECT User, Host, plugin FROM mysql.user ORDER BY User, Host;
SHOW GRANTS FOR 'usercenter_app'@'%';
SHOW VARIABLES LIKE 'require_secure_transport';
SHOW VARIABLES LIKE 'character_set_server';
SHOW VARIABLES LIKE 'collation_server';
EXIT;
```

新实例应只有本地 root。应用账号默认使用 `caching_sha2_password`；MySQL 8.4 的 `mysql_native_password` 默认禁用，不要照搬旧教程加 `--default-authentication-plugin=mysql_native_password` 或切换旧插件。[MySQL 8.4 认证插件说明](https://dev.mysql.com/doc/refman/8.4/en/native-pluggable-authentication.html)

#### 6. 导入表结构，并把应用账号权限收窄

**1）准备项目真实 SQL。** 从后端仓库复制经过检查的建表脚本到 `/opt/docker/mysql/schema.sql`。确认使用 `usercenter_prod`、`utf8mb4`、InnoDB，确认没有误带开发密码、`DROP DATABASE`、其他库的 `USE` 或开发测试数据。本文没有假造用户表结构。

用本地管理账号导入；不把建表权限留给业务连接池：

```bash
cd /opt/docker/mysql
test -s schema.sql
chmod 0600 schema.sql

docker compose exec -T mysql sh -ec '
  MYSQL_PWD="$(cat /run/secrets/MYSQL_ROOT_PASSWORD)" \
  mysql --protocol=SOCKET --user=root \
    --default-character-set=utf8mb4 --database=usercenter_prod
' < schema.sql
```

命令以非零状态退出时先定位 SQL 错误，不要加 `--force` 跳过。DDL 可能已经部分生效，不能假设整份 SQL 会自动回滚。

**2）在上节的管理员 SQL 会话执行以下授权。** 镜像自动创建的应用账号起初拥有本库 `ALL`，其中包含建表、删表等权限；完成初始化后再开放后端访问。

```sql
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'usercenter_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE
  ON `usercenter\_prod`.* TO 'usercenter_app'@'%';
SHOW GRANTS FOR 'usercenter_app'@'%';
```

这是常规读写账号；若应用只读，把上面的 `GRANT` 改为只授予 `SELECT`，两种方案按实际业务选一。不要继续执行一个更宽的 `GRANT ALL`。对本例默认的 `partial_revokes=OFF`，数据库级授权中的 `_` 有通配含义，因此用 `\_` 精确匹配下划线；实际数据库仍叫 `usercenter_prod`，JDBC URL 和 `USE` 不加反斜杠。若接管实例启用了 `partial_revokes`，先按该配置核对授权语义。[GRANT 数据库级权限](https://dev.mysql.com/doc/refman/8.4/en/grant.html)、[REVOKE 语法](https://dev.mysql.com/doc/refman/8.4/en/revoke.html)

`REVOKE/GRANT` 会直接生效，不需要另跑 `FLUSH PRIVILEGES`。`@'%'` 允许匹配来源主机，但不等于已开放公网；其边界还依靠无端口发布、私有网络和数据库权限。迁移工具如 Flyway/Liquibase 应在独立管理流程运行；不要为了让应用启动成功恢复业务账号的 DDL 权限。JPA 也不要在生产设置 `ddl-auto=create/update`。

#### 7. 与 Spring Boot 对接及 TLS 说明

| 后端项 | 本套笔记的值 |
| --- | --- |
| 数据源主机/端口 | `mysql:3306` |
| 数据库 | `usercenter_prod` |
| 用户名 | `usercenter_app` |
| 容器内密码文件 | `/run/secrets/DB_PASSWORD` |
| 密码来源 | 与 MySQL 相同的 `/opt/secrets/usercenter/DB_PASSWORD` |
| 网络 | 后端加入外部网络 `usercenter-db-net` |

后端通过 `configtree:/run/secrets/` 读取密码，完整配置见 [Spring Boot 部署](springboot.md)。先检查项目使用的 Connector/J 版本是否支持选定 MySQL 版本。

同机受控内部网络的入门配置可以使用 `sslMode=REQUIRED` 保证加密；它**不验证服务端身份**。严格生产配置应使用 `sslMode=VERIFY_IDENTITY`，为 MySQL 配置受信任 CA 签发且 SAN 包含连接名 `mysql` 的服务端证书，并把 CA 导入 Java 信任库。MySQL 自动生成的证书不一定符合该主机名校验要求，不能直接把 URL 改成 `VERIFY_IDENTITY` 就宣称配置完成。[Connector/J TLS 模式](https://dev.mysql.com/doc/connector-j/en/connector-j-connp-props-security.html)、[Java 信任库配置](https://dev.mysql.com/doc/connector-j/en/connector-j-server-authentication.html)

出现 `Public Key Retrieval is not allowed` 时，核对驱动版本、是否建立 TLS、服务端认证插件和证书信任；不要把 `useSSL=false&allowPublicKeyRetrieval=true` 当成通用修复。本教程要求的 TLS 连接不需要靠关闭 TLS 解决 RSA 认证问题。

#### 8. 备份：先保证失败可发现，再谈定时执行

**1）明确备份范围。** 下面备份 `usercenter_prod` 的表结构、数据、触发器、存储过程和事件，不包含 MySQL 系统用户及授权。secret、Compose、授权记录与镜像版本另行受控保存。演练前先确认表引擎：

```sql
SELECT TABLE_NAME, ENGINE
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'usercenter_prod' AND TABLE_TYPE = 'BASE TABLE';
```

`--single-transaction` 对 InnoDB 提供一致性快照；备份期间不要做 `ALTER/CREATE/DROP/RENAME/TRUNCATE TABLE`。若有 MyISAM 等非事务表，需要停写或设计另外的锁定策略。定期完整备份只能恢复到备份时刻；要求更小的数据丢失窗口时，还要安排 binlog 归档及时间点恢复。[mysqldump 事务与权限说明](https://dev.mysql.com/doc/refman/8.4/en/mysqldump.html)、[备份与恢复策略](https://dev.mysql.com/doc/refman/8.4/en/backup-and-recovery.html)

**2）保存为 `/opt/docker/mysql/backup.sh`。**

```bash
#!/usr/bin/env bash
set -euo pipefail
umask 077

cd /opt/docker/mysql
exec 9>/srv/mysql/backups/.backup.lock
flock -n 9 || { echo '已有备份任务运行，停止本次执行。' >&2; exit 1; }

backup_file="/srv/mysql/backups/usercenter_prod-$(date -u +%Y%m%dT%H%M%SZ)-$$.sql.gz"
partial_file="${backup_file}.part"
trap 'rm -f -- "$partial_file"' EXIT

# pipefail 会让 mysqldump、docker exec、gzip 任意一个失败都导致脚本失败。
# stderr 不写入 SQL，因此认证错误不会伪装成一份“成功备份”。
docker compose exec -T mysql sh -ec '
  MYSQL_PWD="$(cat /run/secrets/MYSQL_ROOT_PASSWORD)" \
  mysqldump --protocol=SOCKET --user=root \
    --single-transaction --quick --no-tablespaces \
    --routines --events --triggers --hex-blob \
    --set-gtid-purged=OFF --default-character-set=utf8mb4 \
    --databases usercenter_prod
' | gzip -c > "$partial_file"

test -s "$partial_file"
gzip -t "$partial_file"

# gzip 文件本身非空仍可能只压缩了空输入；检查实际 SQL 非空。
# wc 读取完整数据，避免 grep -q 提前退出导致 pipefail 误判 SIGPIPE。
sql_bytes=$(gzip -dc "$partial_file" | wc -c)
test "$sql_bytes" -gt 0

mv -- "$partial_file" "$backup_file"
(
  cd /srv/mysql/backups
  sha256sum "$(basename "$backup_file")" > "$(basename "$backup_file").sha256"
)
printf '备份已生成，仍需恢复演练：%s\n' "$backup_file"
```

执行并检查：

```bash
chmod 0700 /opt/docker/mysql/backup.sh
bash -n /opt/docker/mysql/backup.sh
bash /opt/docker/mysql/backup.sh
ls -lh /srv/mysql/backups
```

`set -euo pipefail`、临时后缀和完整管道状态避免把失败输出发布成正式备份；`gzip -t` 和 SHA-256 只能确认压缩与传输完整，不能证明 SQL 能恢复。`--set-gtid-purged=OFF` 适用于本篇单库逻辑恢复示例，不用于直接配置复制位点。大库的恢复耗时可能超出窗口，应评估并行逻辑备份或适合版本的物理备份方案。

首次手工备份和下一节恢复演练通过后，再用服务器的 cron/systemd timer 定时执行该脚本，并让监控检查退出状态、最近一次成功时间和文件大小。明确每日/每周保留策略，将备份加密复制到其他机器或对象存储并限制访问；不要一开始就写自动删除历史备份的命令。

#### 9. 恢复演练：把 SQL 真正导入隔离容器

不要拿生产库尝试恢复命令。下面建立独立临时容器、临时 volume 和独立 root 密码；使用 `--network none`，不发布端口，也不挂载 `/srv/mysql/data`。备份内含 `CREATE DATABASE/USE usercenter_prod`，因此通过**隔离实例**规避误导入生产库和跨库定义的问题。

**1）保存为 `/opt/docker/mysql/restore-check.sh`。** 该脚本只接受上一节生成的本地备份路径。

```bash
#!/usr/bin/env bash
set -euo pipefail
umask 077

backup_file=$(realpath -e -- "${1:?用法：bash restore-check.sh /srv/mysql/backups/具体文件.sql.gz}")
case "$backup_file" in
  /srv/mysql/backups/*.sql.gz) ;;
  *) echo '只接受 /srv/mysql/backups 下的 .sql.gz 备份。' >&2; exit 1 ;;
esac
test -s "$backup_file"
(
  cd "$(dirname "$backup_file")"
  sha256sum -c "$(basename "$backup_file").sha256"
)
gzip -t "$backup_file"

cd /opt/docker/mysql
# .env 是第 2 节生成并由 root 管理的纯 MYSQL_IMAGE 赋值文件。
source .env
case "$MYSQL_IMAGE" in
  mysql@sha256:*|docker.io/library/mysql@sha256:*) ;;
  *) echo '请使用已记录的官方镜像 digest。' >&2; exit 1 ;;
esac

restore_name="mysql-restore-check-$(date -u +%Y%m%dT%H%M%SZ)-$$"
restore_volume="${restore_name}-data"
restore_secret=$(mktemp /opt/secrets/mysql/restore-root.XXXXXX)
openssl rand -hex 32 > "$restore_secret"
chmod 0444 "$restore_secret"

# 名称包含时间和 PID，并且拒绝复用已存在的卷。
if docker volume inspect "$restore_volume" >/dev/null 2>&1; then
  echo '临时卷已存在，停止，避免误复用数据。' >&2
  exit 1
fi
docker volume create --label purpose=mysql-restore-check "$restore_volume" >/dev/null
printf '恢复容器=%s\n恢复卷=%s\n临时密码文件=%s\n' \
  "$restore_name" "$restore_volume" "$restore_secret"

docker run -d --name "$restore_name" --network none \
  --label purpose=mysql-restore-check \
  --mount "type=volume,source=$restore_volume,target=/var/lib/mysql" \
  --mount "type=bind,source=$restore_secret,target=/run/secrets/RESTORE_ROOT,readonly" \
  --env MYSQL_ROOT_HOST=localhost \
  --env MYSQL_ROOT_PASSWORD_FILE=/run/secrets/RESTORE_ROOT \
  "$MYSQL_IMAGE" --event-scheduler=OFF >/dev/null

# TCP 就绪检测排除入口脚本的临时初始化服务器。
restore_ready=0
for attempt in $(seq 1 120); do
  if docker exec "$restore_name" sh -ec '
    MYSQL_PWD="$(cat /run/secrets/RESTORE_ROOT)" \
    mysql --protocol=TCP -h127.0.0.1 -uroot --ssl-mode=REQUIRED \
      --connect-timeout=3 --execute="SELECT 1" >/dev/null
  ' 2>/dev/null; then
    restore_ready=1
    break
  fi
  sleep 2
done
if [ "$restore_ready" -ne 1 ]; then
  docker logs --tail=100 "$restore_name"
  echo '隔离实例未就绪，保留现场。' >&2
  exit 1
fi

# 不使用 --force；gzip 或 SQL 导入失败都会导致非零退出。
gzip -dc "$backup_file" | docker exec -i "$restore_name" sh -ec '
  MYSQL_PWD="$(cat /run/secrets/RESTORE_ROOT)" \
  mysql --protocol=SOCKET -uroot --default-character-set=utf8mb4
'

docker exec "$restore_name" sh -ec '
  MYSQL_PWD="$(cat /run/secrets/RESTORE_ROOT)" \
  mysqlcheck --protocol=SOCKET -uroot --check usercenter_prod
'

docker exec "$restore_name" sh -ec '
  MYSQL_PWD="$(cat /run/secrets/RESTORE_ROOT)" \
  mysql --protocol=SOCKET -uroot --database=usercenter_prod \
    --execute="SHOW TABLES; SELECT VERSION();"
'
printf '导入与表检查通过。请继续核对业务数据；容器保留供检查：%s\n' "$restore_name"
```

**2）选择一份具体备份运行。** 把示例文件名替换成 `ls` 实际列出的文件，不能原样照抄日期占位符。

```bash
chmod 0700 /opt/docker/mysql/restore-check.sh
bash -n /opt/docker/mysql/restore-check.sh
bash /opt/docker/mysql/restore-check.sh \
  /srv/mysql/backups/usercenter_prod-实际时间-实际PID.sql.gz
```

**3）做业务校验并记录结果。** 脚本通过代表 SQL 能导入、表能检查，还应在打印出的隔离容器上执行真实业务表的 `COUNT(*)`、已知账号/角色等只读查询，核对备份时间、关键记录、索引和视图。若要比较精确行数，需有备份对应时刻的基线；生产库持续写入时，不能把当前行数差异直接判成备份损坏。需要验证登录业务时，使用隔离测试应用和测试网络，避免发送真实邮件或触发外部任务。

本例关闭事件调度，导入的事件不会被自动执行。若项目有 `DEFINER` 对象，库备份不包含其账号定义，须先在隔离实例恢复相应账号/授权，再验证视图或存储过程能实际执行；仅 `SHOW TABLES` 不足以验收这些对象。

**4）检查完成后清理演练资源。** 用脚本打印的精确名称设置以下变量，先看标签和挂载，确认卷不是生产数据后逐条执行：

```bash
restore_name='替换为脚本打印的恢复容器名'
restore_volume='替换为脚本打印的恢复卷名'
restore_secret='替换为脚本打印的临时密码文件路径'

docker inspect "$restore_name" --format '{{json .Config.Labels}} {{json .Mounts}}'
docker volume inspect "$restore_volume"

# 只允许清理本教程生成的演练资源。
case "$restore_name" in mysql-restore-check-*) ;; *) exit 1 ;; esac
case "$restore_volume" in "${restore_name}-data") ;; *) exit 1 ;; esac
case "$restore_secret" in /opt/secrets/mysql/restore-root.*) ;; *) exit 1 ;; esac

docker stop --time 60 "$restore_name"
docker rm "$restore_name"
docker volume rm "$restore_volume"
rm -f -- "$restore_secret"
```

真正灾难恢复时也应先恢复到干净实例，验证后再让后端连接，并按第 6 节重建/核验应用账号和权限。不要把运行中的 `data` 目录直接复制一份就称为可靠备份，也不要把 `docker compose down -v` 当成恢复步骤。[使用 SQL 备份恢复](https://dev.mysql.com/doc/refman/8.4/en/reloading-sql-format-dumps.html)

#### 10. 更新、密码轮换与日常维护

**1）密码轮换必须同步数据库和文件。** 更改 `DB_PASSWORD` 文件再重启，并不会执行 `ALTER USER`，反而会让健康检查和后端认证失败。

对于本篇单机方案，先安排维护窗口，停止后端写入；在管理员会话中执行应用账号的 `ALTER USER`，把同一个新密码写入 secret，再重建 MySQL 与后端容器并校验连接。SQL 形式如下，字符串是占位符，不能直接使用：

```sql
ALTER USER 'usercenter_app'@'%' IDENTIFIED BY '替换成安全生成的新密码';
```

使用关闭客户端历史的管理员会话，不在 shell 命令行中拼明文密码；自动化轮换应通过权限受限的输入文件或专用秘密管理流程处理。secret 文件建议先写新文件、设 `root:root/0444`，再原子替换，避免读到半份内容；单文件 bind mount 可能仍引用旧 inode，所以要重建使用者，单纯 `docker compose restart` 也不会重新加载 Compose 配置。root 密码单独轮换并验证备份脚本，不能与应用密码混用。需要无停机轮换时再设计双密码过渡和失败回退流程。[ALTER USER 与双密码](https://dev.mysql.com/doc/refman/8.4/en/alter-user.html)

**2）数据库升级按变更执行。** 记录当前 digest、补丁版本、表结构版本；备份并在隔离实例恢复；拉取候选版本，核查官方升级路径和后端兼容；在维护窗口停止后端写入，更新 `.env` 的 digest，执行 `docker compose up -d --wait --wait-timeout 300`，检查日志、版本和业务读写。镜像固定后，单独 `docker compose pull` 不会自动替换成新补丁。

**3）回滚不能直接照搬前端“切回旧镜像”。** 新版 MySQL 可能已变更数据格式或业务表结构。官方当前允许同一 LTS 系列部分原地降级路径，但跨系列和具体版本有条件限制；必须核对确切源/目标版本及发布说明。保守恢复方案是在干净实例上用升级前备份恢复，并评估维护窗口后新增数据如何处理；不可把较旧版本直接挂上生产数据目录试运气。[MySQL 升级](https://dev.mysql.com/doc/refman/8.4/en/upgrading.html)、[MySQL 降级支持路径](https://dev.mysql.com/doc/refman/8.4/en/downgrading.html)

**4）定期查看容量和日志。**

```bash
cd /opt/docker/mysql
df -h /srv/mysql /var/lib/docker
df -i /srv/mysql /var/lib/docker
du -sh /srv/mysql/data /srv/mysql/backups
docker stats --no-stream
docker compose logs --tail=200 mysql
```

根据磁盘、内存和实际连接数调整 buffer pool 与连接池，不照抄“给数据库全部内存”的参数。开启慢查询日志后要单独规划轮转与敏感 SQL 保留；`logging.max-size` 仅限制容器输出日志。binlog 应按恢复策略通过 MySQL 管理，不能在 `data` 内手工删除正在使用的日志文件。

#### 11. 常见问题定位

| 现象 | 先检查什么 | 处理方向 |
| --- | --- | --- |
| `Access denied` | 连接的库/账号/Host、已有数据目录、secret 是否与数据库一致 | 用已知管理凭据查询账号并受控改密，不清空目录 |
| 容器不断重启 | `docker compose logs`、磁盘、权限、无效参数、OOM | 按第一条明确错误修复；不要反复重启掩盖问题 |
| 健康检查失败，日志已 ready | secret 可读性、应用账号权限、TLS、实际 `SELECT 1` | 用第 5 节相同连接方式复现认证问题 |
| `Unknown MySQL server host 'mysql'` | 后端是否加入 `usercenter-db-net` | 两个 Compose 引用同一个 external 网络，避免拼写/别名冲突 |
| `Connection refused` | MySQL 是否完成启动、后端是否错连 `localhost` | 使用 `mysql:3306`，先等数据库健康 |
| `Public Key Retrieval is not allowed` | 驱动、TLS 协商、信任库与证书 | 修复 TLS/驱动配置，不通用关闭 TLS |
| `Plugin 'mysql_native_password' is not loaded` | 旧账号认证插件、旧初始化 SQL | 验证客户端支持后迁移到 `caching_sha2_password` |
| 改了 `.env` 或 secret 但库没变 | 是否是已经初始化的数据目录 | 环境变量仅控制首次初始化；通过 SQL 做迁移/改密 |
| 备份文件存在但恢复失败 | 备份退出状态、压缩校验、SQL 首个错误、DEFINER | 保留失败现场，解决缺少权限/对象/版本差异后重新演练 |

验收时至少记录：镜像 digest 与版本、未发布端口、网络 `internal=true`、真实认证查询成功、应用账号权限、后端读写结果、备份文件与一次隔离恢复演练结果。完成后继续 [Spring Boot 部署与规范](springboot.md)。
