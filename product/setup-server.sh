#!/usr/bin/env bash
# Can Rent Lah — 服务器一键部署脚本
# 用法: bash setup-server.sh
set -euo pipefail

echo "============================================"
echo " Can Rent Lah — 服务器部署"
echo "============================================"
echo ""

# ---- 环境检查 ----
echo "[1/6] 检查环境..."

if ! command -v node &> /dev/null; then
  echo "❌ 需要 Node.js >= 20，请先安装: https://nodejs.org"
  exit 1
fi

NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VER" -lt 20 ]; then
  echo "❌ Node.js >= 20 才能跑 (当前: $(node -v))"
  exit 1
fi
echo "  ✅ Node $(node -v)"

# ---- PM2 ----
echo "[2/6] 安装 PM2..."
if ! command -v pm2 &> /dev/null; then
  npm i -g pm2
  echo "  ✅ PM2 已安装"
else
  echo "  ✅ PM2 已存在"
fi

# ---- 依赖 ----
echo "[3/6] 安装项目依赖..."
cd "$(dirname "$0")"
npm install
echo "  ✅ npm install 完成"

# ---- .env ----
echo "[4/6] 配置环境变量..."
if [ ! -f .env ]; then
  cp .env.example .env
  echo "  ⚠️  .env 已从模板创建，请编辑填入 API Key:"
  echo "     nano $(pwd)/.env"
  echo ""
  read -rp "  是否现在编辑？(y/n) " EDIT_NOW
  if [ "$EDIT_NOW" = "y" ] || [ "$EDIT_NOW" = "Y" ]; then
    nano .env
  fi
else
  echo "  ✅ .env 已存在"
fi

# ---- 日志目录 ----
echo "[5/6] 创建日志目录..."
mkdir -p data/logs
echo "  ✅ data/logs/"

# ---- 启动 ----
echo "[6/6] 启动服务..."
# 如果之前有同名进程，先停
pm2 stop can-rent-lah 2>/dev/null || true
pm2 delete can-rent-lah 2>/dev/null || true

pm2 start ecosystem.config.cjs
pm2 save

echo ""
echo "============================================"
echo " ✅ 部署完成！"
echo "============================================"
echo ""
echo "健康检查:"
curl -s http://localhost:8787/api/health | python3 -m json.tool 2>/dev/null || curl -s http://localhost:8787/api/health
echo ""
echo ""
echo "设置开机自启:"
echo "  pm2 startup"
echo "  (复制上面命令输出的 sudo 命令执行)"
echo ""
echo "运维文档:"
echo "  cat $(pwd)/OPERATIONS.md"
echo ""
echo "常用命令:"
echo "  pm2 status              查看状态"
echo "  pm2 logs can-rent-lah    查看日志"
echo "  pm2 restart can-rent-lah 重启服务"
