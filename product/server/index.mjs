import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import {
  understandIntent,
  planSearchStrategy,
  evaluateResults,
  generateRecommendations,
  analyzeCurrentListings,
  reviewContract,
  generateContactMessage,
} from './agent.mjs';
import {
  getUser, createUser, verifyUser, publicUser, changePassword, incrementChatCount,
  createSession, getSessionEmail,
  redeemCode,
  saveListing, getUserListings, deleteListing,
  createTask, getTask, getUserTasks, updateTaskFull,
  getProfile, saveProfile, getLog, appendLog,
} from './db.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const webDir = path.join(rootDir, 'web');
const port = Number(process.env.PORT || 8787);

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function getToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice('Bearer '.length);
  return null;
}

async function requireUser(req, res) {
  const token = getToken(req);
  if (!token) { sendJson(res, 401, { error: '请先登录' }); return null; }
  const email = getSessionEmail(token);
  if (!email) { sendJson(res, 401, { error: '登录已过期，请重新登录' }); return null; }
  const user = getUser(email);
  if (!user) { sendJson(res, 401, { error: '用户不存在' }); return null; }
  return user;
}

function matchPath(pathname, pattern) {
  const parts = pathname.split('/');
  const patternParts = pattern.split('/');
  if (parts.length !== patternParts.length) return null;
  const params = {};
  for (let i = 0; i < parts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = parts[i];
    } else if (patternParts[i] !== parts[i]) {
      return null;
    }
  }
  return params;
}

function normalizeListing(item = {}) {
  return {
    id: String(item.id || item.url || crypto.randomUUID()),
    title: item.title || item.name || '',
    price: item.price || '',
    address: item.address || '',
    bedrooms: String(item.bedrooms || ''),
    bathrooms: String(item.bathrooms || ''),
    floorArea: String(item.floorArea || item.floor_area || ''),
    propertyType: String(item.propertyType || item.property_type || ''),
    mrt: String(item.mrt || ''),
    availability: String(item.availability || ''),
    postedDate: String(item.postedDate || item.posted_date || ''),
    url: item.url || '',
    source: item.source || 'propertyguru',
    capturedAt: item.capturedAt || item.captured_at || new Date().toISOString(),
    _pros: item._pros || item.pros || '',
    _cons: item._cons || item.cons || '',
  };
}

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------

async function handleApi(req, res, pathname) {
  if (req.method === 'OPTIONS') { sendJson(res, 204, {}); return; }

  // --- Auth ---

  if (pathname === '/api/auth/register' && req.method === 'POST') {
    const { email, password } = await readJson(req);
    if (!email || !email.includes('@')) { sendJson(res, 400, { error: '请输入有效邮箱' }); return; }
    if (!password || password.length < 6) { sendJson(res, 400, { error: '密码至少6位' }); return; }

    const user = createUser(email.trim().toLowerCase(), password);
    if (!user) { sendJson(res, 400, { error: '账号已存在，请直接登录' }); return; }

    const token = createSession(user.email);
    sendJson(res, 201, { token, user: publicUser(user) });
    return;
  }

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    const { email, password } = await readJson(req);
    if (!email) { sendJson(res, 400, { error: '请输入邮箱' }); return; }

    const user = verifyUser(email.trim().toLowerCase(), password || '');
    if (!user) { sendJson(res, 401, { error: '邮箱或密码错误' }); return; }

    const token = createSession(user.email);
    sendJson(res, 200, { token, user });
    return;
  }

  if (pathname === '/api/auth/me' && req.method === 'GET') {
    const user = await requireUser(req, res);
    if (!user) return;
    sendJson(res, 200, { user: publicUser(user) });
    return;
  }

  if (pathname === '/api/auth/password' && req.method === 'PUT') {
    const user = await requireUser(req, res);
    if (!user) return;
    const { oldPassword, newPassword } = await readJson(req);
    if (!newPassword || newPassword.length < 6) { sendJson(res, 400, { error: '新密码至少6位' }); return; }
    const result = changePassword(user.email, oldPassword || '', newPassword);
    if (result.error) { sendJson(res, 400, result); return; }
    sendJson(res, 200, { success: true });
    return;
  }

  // --- Activation ---

  if (pathname === '/api/activation/redeem' && req.method === 'POST') {
    const user = await requireUser(req, res);
    if (!user) return;
    const { code } = await readJson(req);
    const result = redeemCode(user.email, String(code || '').trim());
    if (result.error) { sendJson(res, 400, result); return; }
    sendJson(res, 200, { user: result.user });
    return;
  }

  // --- Profile ---

  if (pathname === '/api/profile' && req.method === 'GET') {
    const user = await requireUser(req, res);
    if (!user) return;
    const profile = getProfile(user.email);
    const logSnippet = getLog(user.email, 100);
    sendJson(res, 200, { profile, log: logSnippet });
    return;
  }

  if (pathname === '/api/profile' && req.method === 'POST') {
    const user = await requireUser(req, res);
    if (!user) return;
    const body = await readJson(req);
    const content = generateProfileMarkdown(body);
    saveProfile(user.email, content);
    appendLog(user.email, `## 更新租房画像\n\n${JSON.stringify(body)}`);
    sendJson(res, 200, { profile: content });
    return;
  }

  // --- Chat ---

  if (pathname === '/api/chat' && req.method === 'POST') {
    const user = await requireUser(req, res);
    if (!user) return;
    const { message, listings } = await readJson(req);
    const profile = getProfile(user.email);
    const answer = await analyzeCurrentListings({
      message: String(message || ''),
      profile,
      listings: Array.isArray(listings) ? listings.map(normalizeListing) : [],
    });
    incrementChatCount(user.email);
    sendJson(res, 200, { answer, user: publicUser(getUser(user.email)) });
    return;
  }

  // --- Intent ---

  if (pathname === '/api/intent' && req.method === 'POST') {
    const user = await requireUser(req, res);
    if (!user) return;
    const { message, listings } = await readJson(req);
    const profile = getProfile(user.email);
    const logSnippet = getLog(user.email, 80);
    const intent = await understandIntent({
      message: String(message || ''),
      profile,
      logSnippet,
      currentListings: Array.isArray(listings) ? listings : [],
    });
    sendJson(res, 200, { intent });
    return;
  }

  // --- Task API ---

  // POST /api/tasks — 创建任务
  if (pathname === '/api/tasks' && req.method === 'POST') {
    const user = await requireUser(req, res);
    if (!user) return;
    const { question } = await readJson(req);
    if (!question || !String(question).trim()) {
      sendJson(res, 400, { error: '请输入问题' }); return;
    }

    // Check for existing active task
    const activeTasks = getUserTasks(user.email, 'waiting_search').concat(getUserTasks(user.email, 'searching'));
    if (activeTasks.length > 0) {
      sendJson(res, 200, {
        task: null,
        needsClarify: false,
        answer: `你有一个正在执行的搜索任务「${activeTasks[0].question.slice(0, 50)}」。等它完成后再发新需求，或者刷新页面查看结果。`,
      });
      return;
    }

    const profile = getProfile(user.email);
    const logSnippet = getLog(user.email, 80);

    // Phase 1: 理解意图
    const intent = await understandIntent({
      message: String(question).trim(),
      profile,
      logSnippet,
    });

    if (intent.action === 'clarify') {
      sendJson(res, 200, { task: null, needsClarify: true, question: intent.question });
      return;
    }
    if (intent.action === 'chat') {
      sendJson(res, 200, { task: null, needsClarify: false, answer: intent.answer });
      return;
    }

    // Phase 2: 规划搜索
    const plan = await planSearchStrategy({ intent, profile, previousRounds: [] });
    const instructions = Array.isArray(plan.instructions) ? plan.instructions : [];

    const task = createTask({
      email: user.email,
      question: String(question).trim(),
      intent,
      rounds: [{
        strategy: plan.strategy || '初始搜索',
        instructions,
        collected: [],
        collectedCount: 0,
        evaluation: null,
      }],
    });

    appendLog(user.email, `## 创建任务: ${String(question).slice(0, 60)}\n\n意图: ${JSON.stringify(intent)}\n计划: ${plan.strategy}, ${instructions.length} 个搜索指令`);

    sendJson(res, 201, { task: toPublicTask(task), needsClarify: false });
    return;
  }

  // GET /api/tasks
  if (pathname === '/api/tasks' && req.method === 'GET') {
    const user = await requireUser(req, res);
    if (!user) return;
    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    // Expire stale waiting_search tasks (> 30 min)
    const staleTasks = getUserTasks(user.email, 'waiting_search');
    for (const t of staleTasks) {
      const age = Date.now() - new Date(t.createdAt).getTime();
      if (age > 30 * 60 * 1000) {
        updateTaskFull(t.id, { status: 'expired' });
      }
    }
    // Also expire stale searching tasks (> 5 min)
    const staleSearching = getUserTasks(user.email, 'searching');
    for (const t of staleSearching) {
      const age = Date.now() - new Date(t.updatedAt || t.createdAt).getTime();
      if (age > 5 * 60 * 1000) {
        updateTaskFull(t.id, { status: 'expired' });
      }
    }

    const tasks = getUserTasks(user.email, url.searchParams.get('status') || null);
    sendJson(res, 200, { tasks });
    return;
  }

  // GET /api/tasks/:id
  {
    const params = matchPath(pathname, '/api/tasks/:id');
    if (params && req.method === 'GET') {
      const user = await requireUser(req, res);
      if (!user) return;
      const task = getTask(params.id);
      if (!task || task.user_email !== user.email) { sendJson(res, 404, {}); return; }
      sendJson(res, 200, { task: toPublicTask(task) });
      return;
    }
  }

  // DELETE /api/tasks/:id — cancel task
  {
    const params = matchPath(pathname, '/api/tasks/:id');
    if (params && req.method === 'DELETE') {
      const user = await requireUser(req, res);
      if (!user) return;
      const task = getTask(params.id);
      if (!task || task.user_email !== user.email) { sendJson(res, 404, {}); return; }
      if (task.status === 'completed') { sendJson(res, 400, { error: '已完成的不能删除' }); return; }
      updateTaskFull(task.id, { status: 'cancelled' });
      sendJson(res, 200, { cancelled: true });
      return;
    }
  }

  // GET /api/tasks/:id/instructions — 插件轮询
  {
    const params = matchPath(pathname, '/api/tasks/:id/instructions');
    if (params && req.method === 'GET') {
      const user = await requireUser(req, res);
      if (!user) return;
      const task = getTask(params.id);
      if (!task || task.user_email !== user.email) { sendJson(res, 404, {}); return; }
      if (task.status !== 'waiting_search' && task.status !== 'searching') {
        sendJson(res, 200, { instructions: [], status: task.status }); return;
      }

      if (task.status === 'waiting_search') {
        updateTaskFull(task.id, { status: 'searching' });
      }

      const rounds = safeJson(task.rounds_json, []);
      const round = rounds[task.current_round] || {};
      sendJson(res, 200, {
        taskId: task.id,
        status: 'searching',
        currentRound: task.current_round,
        strategy: round.strategy || '',
        instructions: round.instructions || [],
        totalCollected: task.total_collected,
      });
      return;
    }
  }

  // POST /api/tasks/:id/collect — 插件回传
  {
    const params = matchPath(pathname, '/api/tasks/:id/collect');
    if (params && req.method === 'POST') {
      const user = await requireUser(req, res);
      if (!user) return;
      const task = getTask(params.id);
      if (!task || task.user_email !== user.email) { sendJson(res, 404, {}); return; }

      const body = await readJson(req);
      const newListings = (Array.isArray(body.listings) ? body.listings : []).map(normalizeListing);
      const roundIndex = typeof body.roundIndex === 'number' ? body.roundIndex : task.current_round;

      // Merge into rounds
      let rounds = safeJson(task.rounds_json, []);
      if (!rounds[roundIndex]) {
        rounds[roundIndex] = { strategy: '', instructions: [], collected: [], collectedCount: 0, evaluation: null };
      }

      const existingIds = new Set((rounds[roundIndex].collected || []).map((l) => l.id));
      const unique = newListings.filter((l) => !existingIds.has(l.id));
      rounds[roundIndex].collected = [...(rounds[roundIndex].collected || []), ...unique];
      rounds[roundIndex].collectedCount = rounds[roundIndex].collected.length;

      const allCollected = rounds.flatMap((r) => r.collected || []);
      const totalCollected = allCollected.length;

      updateTaskFull(task.id, {
        rounds,
        totalCollected,
        currentRound: roundIndex,
      });

      // Phase 3: 评估
      const profile = getProfile(user.email);
      const evaluation = await evaluateResults({
        intent: safeJson(task.intent_json, {}),
        profile,
        rounds,
        allCollected,
      });
      rounds[roundIndex].evaluation = evaluation;

      if (evaluation.decision === 'done' || rounds.length >= 3) {
        // Phase 4: 生成推荐
        const logSnippet = getLog(user.email, 80);
        const report = await generateRecommendations({
          intent: safeJson(task.intent_json, {}),
          profile,
          logSnippet,
          collectedListings: allCollected,
        });

        const rankedListings = allCollected.slice(0, 5);

        updateTaskFull(task.id, {
          status: 'completed',
          rounds,
          result: {
            report,
            rankedListings,
            totalSearched: allCollected.length,
            totalRounds: rounds.length,
            completedAt: new Date().toISOString(),
          },
        });

        appendLog(user.email, `## 任务完成: ${task.question.slice(0, 60)}\n\n搜了 ${rounds.length} 轮，共 ${allCollected.length} 个房源`);

        sendJson(res, 200, { task: toPublicTask(getTask(task.id)), done: true, evaluation });
        return;
      }

      // 需要继续搜索
      const newPlan = await planSearchStrategy({
        intent: safeJson(task.intent_json, {}),
        profile,
        previousRounds: rounds,
      });

      rounds.push({
        strategy: newPlan.strategy || evaluation.suggestion || '扩大搜索',
        instructions: newPlan.instructions || [],
        collected: [],
        collectedCount: 0,
        evaluation: null,
      });

      updateTaskFull(task.id, {
        status: 'waiting_search',
        rounds,
        currentRound: rounds.length - 1,
        totalCollected,
      });

      sendJson(res, 200, {
        task: toPublicTask(getTask(task.id)),
        done: false,
        evaluation,
        nextRound: { strategy: newPlan.strategy, instructionCount: (newPlan.instructions || []).length },
      });
      return;
    }
  }

  // --- Listings ---

  if (pathname === '/api/listings' && req.method === 'GET') {
    const user = await requireUser(req, res);
    if (!user) return;
    sendJson(res, 200, { listings: getUserListings(user.email) });
    return;
  }

  if (pathname === '/api/listings/save' && req.method === 'POST') {
    const user = await requireUser(req, res);
    if (!user) return;
    const body = await readJson(req);
    const listing = saveListing(user.email, normalizeListing(body.listing || body));
    sendJson(res, 200, { listing });
    return;
  }

  // DELETE /api/listings/:id
  {
    const params = matchPath(pathname, '/api/listings/:id');
    if (params && req.method === 'DELETE') {
      const user = await requireUser(req, res);
      if (!user) return;
      const result = deleteListing(user.email, params.id);
      if (result.error) { sendJson(res, 404, result); return; }
      sendJson(res, 200, result);
      return;
    }
  }

  // --- Contract Review ---
  if (pathname === '/api/contract/review' && req.method === 'POST') {
    const user = await requireUser(req, res);
    if (!user) return;
    const { contractText, listingContext } = await readJson(req);
    if (!contractText || !String(contractText).trim()) {
      sendJson(res, 400, { error: '请提供合同文本' }); return;
    }
    const profile = getProfile(user.email);
    const report = await reviewContract({
      contractText: String(contractText).trim(),
      profile,
      listingContext: listingContext || '',
    });
    incrementChatCount(user.email);
    sendJson(res, 200, { report });
    return;
  }

  // --- Contact agent (generate WhatsApp message) ---
  if (pathname === '/api/contact/message' && req.method === 'POST') {
    const user = await requireUser(req, res);
    if (!user) return;
    const { listing } = await readJson(req);
    if (!listing || !listing.title) {
      sendJson(res, 400, { error: '请提供房源信息' }); return;
    }
    const message = await generateContactMessage({ listing });
    sendJson(res, 200, { message });
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
}

// ---------------------------------------------------------------------------
// Static file server
// ---------------------------------------------------------------------------

async function serveStatic(req, res, pathname) {
  const filePath = pathname === '/' ? '/index.html' : pathname;
  const resolved = path.normalize(path.join(webDir, filePath));
  if (!resolved.startsWith(webDir)) { res.writeHead(403); res.end(); return; }
  try {
    const data = await readFile(resolved);
    const ext = path.extname(resolved);
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    try {
      const index = await readFile(path.join(webDir, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(index);
    } catch { res.writeHead(404); res.end('Not found'); }
  }
}

// ---------------------------------------------------------------------------
// Profile markdown generator
// ---------------------------------------------------------------------------

function generateProfileMarkdown(p) {
  return [
    `# ${p.email || '用户'} 的租房画像`,
    `> 更新: ${new Date().toISOString()}`,
    '',
    '## 基础信息',
    `- 学校: ${p.school || '未填写'}`,
    `- 预算: ${p.budget ? `S$${p.budget}/月` : '未填写'}（${p.budgetType || 'rent-only'}）`,
    `- 入住时间: ${p.moveInTimeline || '未填写'}`,
    `- 室友: ${p.flatmates || '无'}`,
    '',
    '## 偏好',
    `- 房源类型: ${p.propertyType || '未限制'}`,
    `- 首选区域: ${(p.preferredAreas || []).join('、') || '未填写'}`,
    `- 家具: ${p.furnished || '未限制'}`,
    `- 做饭: ${p.cooking || '未限制'}`,
    '',
    '## 雷区',
    ...(p.dealbreakers && p.dealbreakers.length ? p.dealbreakers.map((d) => `- ${d}`) : ['- 无']),
    '',
    '## 补充',
    p.notes || '无',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeJson(str, fallback = null) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

function toPublicTask(row) {
  if (!row) return null;
  const rounds = safeJson(row.rounds_json, []);
  return {
    id: row.id,
    email: row.user_email,
    status: row.status,
    question: row.question,
    intent: safeJson(row.intent_json),
    rounds: rounds.map((r) => ({
      strategy: r.strategy || '',
      instructionCount: (r.instructions || []).length,
      collectedCount: r.collectedCount || r.collected?.length || 0,
      evaluation: r.evaluation || null,
    })),
    currentRound: row.current_round,
    totalCollected: row.total_collected,
    result: safeJson(row.result_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) {
    await handleApi(req, res, url.pathname);
    return;
  }
  await serveStatic(req, res, url.pathname);
});

server.listen(port, () => {
  console.log(`Can Rent Lah running at http://localhost:${port}`);
});
