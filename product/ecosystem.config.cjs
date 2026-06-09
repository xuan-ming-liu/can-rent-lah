// PM2 ecosystem config for Can Rent Lah
//
// 首次部署：
//   npm i -g pm2
//   cd can-rent-lah/product && npm install
//   pm2 start ecosystem.config.cjs
//   pm2 save && pm2 startup
//
// 日常运维见 OPERATIONS.md

const MB = 1024 * 1024;

module.exports = {
  apps: [
    {
      // -------------------------------------------------------------------
      // 基础
      // -------------------------------------------------------------------
      name: 'can-rent-lah',
      script: 'server/index.mjs',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      watch: false,

      // -------------------------------------------------------------------
      // 自动重启
      // -------------------------------------------------------------------
      autorestart: true,
      max_restarts: 20,            // 1 小时内最多重启 20 次
      restart_delay: 3000,         // 两次重启间等 3s
      min_uptime: '10s',           // 运行不足 10s 算异常启动
      max_memory_restart: '384M',  // 超过 384MB 自动重启

      // -------------------------------------------------------------------
      // 日志 — 带轮转
      // -------------------------------------------------------------------
      out_file: './data/logs/pm2-out.log',
      error_file: './data/logs/pm2-error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // 日志轮转：单文件最大 5MB，保留 5 个历史文件
      max_size: 5 * MB,

      // -------------------------------------------------------------------
      // 环境变量（API Key 等敏感信息通过 .env 文件注入，不写在这里）
      // -------------------------------------------------------------------
      env: {
        NODE_ENV: 'production',
        PORT: 8787,
      },

      // -------------------------------------------------------------------
      // 优雅关闭
      // -------------------------------------------------------------------
      kill_timeout: 12000,         // 给 12s 让进程优雅退出
      listen_timeout: 8000,
    },
  ],
};
