# Can Rent Lah 运维手册

> 适用环境：服务器 `101.47.73.151`（Ubuntu），服务端口 `8787`

---

## 目录

- [首次部署](#首次部署)
- [日常运维](#日常运维)
- [监控与健康检查](#监控与健康检查)
- [日志](#日志)
- [备份](#备份)
- [故障排查](#故障排查)
- [更新部署](#更新部署)
- [常用命令速查](#常用命令速查)

---

## 首次部署

```bash
# 1. 确保 Node.js >= 20
node -v

# 2. 安装 PM2
npm i -g pm2

# 3. 进入项目目录，安装依赖
cd ~/can-rent-lah/product
npm install

# 4. 创建 .env 文件（从模板复制，然后填真实 key）
cp .env.example .env
nano .env   # 填 ANTHROPIC_API_KEY 等

# 5. 创建日志目录
mkdir -p data/logs

# 6. 启动
pm2 start ecosystem.config.cjs

# 7. 验证
curl http://localhost:8787/api/health
# 预期: {"status":"ok","uptime":...,"db":"ok","aiProvider":"anthropic",...}

# 8. 设置 PM2 开机自启
pm2 save
pm2 startup
# 复制上面命令输出的那行 sudo 命令，回车执行
```

---

## 日常运维

### 查看状态

```bash
pm2 status              # 进程列表
pm2 show can-rent-lah   # 详细信息（CPU、内存、重启次数）
pm2 monit               # 实时监控面板（CPU/内存/请求）
```

### 重启 / 停止 / 启动

```bash
pm2 restart can-rent-lah   # 重启（优雅 → 强制，12s 超时）
pm2 stop can-rent-lah      # 停止
pm2 start can-rent-lah     # 启动
pm2 reload can-rent-lah    # 零停机重载（fork 模式等效 restart）
```

### 查看日志

```bash
pm2 logs can-rent-lah            # 实时滚动
pm2 logs can-rent-lah --lines 50 # 最近 50 行
pm2 logs can-rent-lah --nostream # 打印后退出
pm2 flush                        # 清空所有日志
```

### 系统资源

```bash
# PM2 自带
pm2 monit

# 系统级
htop -p $(pm2 pid can-rent-lah)   # 只看这个进程
df -h                              # 磁盘
free -h                            # 内存
```

---

## 监控与健康检查

### 健康检查端点

```bash
# 本地
curl http://localhost:8787/api/health

# 远程
curl http://101.47.73.151:8787/api/health
```

正常响应：
```json
{
  "status": "ok",
  "uptime": 86400,
  "db": "ok",
  "aiProvider": "anthropic",
  "nodeEnv": "production"
}
```

- `status: "ok"` — 一切正常
- `status: "degraded"` — 数据库连不上，但进程还活着
- HTTP 503 — 需要排查数据库

### 快速诊断命令

```bash
# 进程是否在跑
pm2 status | grep can-rent-lah

# 端口是否监听
ss -tlnp | grep 8787

# 健康检查 + 格式化输出
curl -s http://localhost:8787/api/health | python3 -m json.tool

# 最近是否有异常重启
pm2 show can-rent-lah | grep -E "restarts|unstable"

# 磁盘剩余空间（数据库所在）
df -h ~/can-rent-lah/product/data
```

---

## 日志

### 日志文件位置

| 日志 | 路径 |
|------|------|
| 标准输出 | `product/data/logs/pm2-out.log` |
| 标准错误 | `product/data/logs/pm2-error.log` |
| 请求日志 | 混合在上面（console.log 打到 stdout） |
| SQLite 数据库 | `product/data/can-rent-lah.db` |
| WAL 日志 | `product/data/can-rent-lah.db-wal` |

### 请求日志格式

```
2026-06-09T14:32:15.123Z INFO 101.47.73.151 POST /api/chat 200 1245ms
2026-06-09T14:32:18.456Z ERROR 192.168.1.1 POST /api/tasks 500 3201ms
```

每行：`时间 级别 客户端IP 方法 路径 状态码 耗时ms`

### 查询统计

```bash
# 最近 100 条请求
tail -100 ~/can-rent-lah/product/data/logs/pm2-out.log

# 只看错误（5xx）
grep " ERROR " ~/can-rent-lah/product/data/logs/pm2-out.log

# 统计各 API 调用次数
grep -oP ' (GET|POST) /api/\S+' ~/can-rent-lah/product/data/logs/pm2-out.log | sort | uniq -c | sort -rn

# 慢请求（>2000ms）
grep -P '\d{4,}ms$' ~/can-rent-lah/product/data/logs/pm2-out.log

# AI 调用失败
grep "AI request failed" ~/can-rent-lah/product/data/logs/pm2-error.log
```

---

## 备份

### 数据库备份

```bash
# 手动备份（SQLite 简单复制即可）
cp ~/can-rent-lah/product/data/can-rent-lah.db ~/backups/can-rent-lah-$(date +%Y%m%d).db

# crontab 每日自动备份（凌晨 3:00）
crontab -e
# 添加:
# 0 3 * * * cp ~/can-rent-lah/product/data/can-rent-lah.db ~/backups/can-rent-lah-$(date +\%Y\%m\%d).db
```

### 恢复

```bash
pm2 stop can-rent-lah
cp ~/backups/can-rent-lah-20260609.db ~/can-rent-lah/product/data/can-rent-lah.db
pm2 start can-rent-lah
```

### 需要备份的文件

| 文件 | 重要性 | 说明 |
|------|--------|------|
| `data/can-rent-lah.db` | 🔴 核心 | 用户、房源、任务、session |
| `.env` | 🔴 关键 | API Key，丢失后 AI 功能全挂 |
| `data/logs/` | 🟢 可选 | 排查问题用 |

---

## 故障排查

### 服务挂了 / 502 / 连不上

```bash
# 1. PM2 状态
pm2 status
# 如果 status 是 "errored" 或 "stopped"：
pm2 restart can-rent-lah
pm2 logs can-rent-lah --lines 30  # 看出事前的日志

# 2. 如果 PM2 都没了
pm2 resurrect     # 恢复之前 pm2 save 的状态
pm2 list          # 确认

# 3. 如果端口被占用
ss -tlnp | grep 8787
kill -9 <PID>    # 杀掉占用进程
pm2 restart can-rent-lah

# 4. 磁盘满了
df -h
# 清理旧日志: pm2 flush
# 清理 node_modules 缓存
```

### AI 不工作（返回 fallback 或空结果）

```bash
# 检查 API Key 是否还在
cat ~/can-rent-lah/product/.env | grep API_KEY

# 测试 AI 连通性
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-sonnet-4-6","max_tokens":10,"messages":[{"role":"user","content":"ping"}]}'
```

### 数据库锁 / 损坏

```bash
# 检查 SQLite 是否正常
sqlite3 ~/can-rent-lah/product/data/can-rent-lah.db "SELECT count(*) FROM users;"

# WAL 文件积压（正常应 < 5MB）
ls -lh ~/can-rent-lah/product/data/can-rent-lah.db-wal

# 修复：重启服务（触发 WAL checkpoint）
pm2 restart can-rent-lah

# 严重损坏：从备份恢复
```

### 插件搜索卡住 / 不工作

```bash
# 清理过期任务
sqlite3 ~/can-rent-lah/product/data/can-rent-lah.db \
  "UPDATE tasks SET status='expired' WHERE status IN ('waiting_search','searching') AND updated_at < datetime('now','-30 minutes');"

# 查看卡住的任务
sqlite3 ~/can-rent-lah/product/data/can-rent-lah.db \
  "SELECT id, user_email, status, question, updated_at FROM tasks WHERE status IN ('waiting_search','searching');"
```

---

## 更新部署

```bash
# 1. 拉代码
cd ~/can-rent-lah
git pull

# 2. 安装新依赖（如有）
cd product && npm install

# 3. 重启
pm2 restart can-rent-lah

# 4. 验证
curl http://localhost:8787/api/health
pm2 logs can-rent-lah --lines 10
```

---

## 常用命令速查

```bash
# ===== PM2 =====
pm2 status                          # 看所有进程
pm2 show can-rent-lah               # 单进程详情
pm2 logs can-rent-lah               # 实时日志
pm2 logs can-rent-lah --lines 20    # 最近 20 行
pm2 restart can-rent-lah            # 重启
pm2 stop can-rent-lah               # 停止
pm2 flush                           # 清空日志
pm2 save                            # 保存当前进程列表
pm2 resurrect                       # 恢复进程列表

# ===== 健康检查 =====
curl http://localhost:8787/api/health
curl -s localhost:8787/api/health | python3 -m json.tool

# ===== 数据库 =====
sqlite3 ~/can-rent-lah/product/data/can-rent-lah.db ".tables"          # 所有表
sqlite3 ~/can-rent-lah/product/data/can-rent-lah.db "SELECT count(*) FROM users;"    # 用户数
sqlite3 ~/can-rent-lah/product/data/can-rent-lah.db "SELECT count(*) FROM tasks;"    # 任务数
sqlite3 ~/can-rent-lah/product/data/can-rent-lah.db "SELECT count(*) FROM listings;" # 收藏数

# ===== 系统 =====
ss -tlnp | grep 8787                # 端口是否监听
df -h                               # 磁盘
free -h                             # 内存
uptime                              # 系统运行时间
```
