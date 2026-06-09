const API_BASE = window.location.origin;
const tokenKey = 'canRentLahToken';

const state = {
  token: localStorage.getItem(tokenKey),
  user: null,
  listings: [],
  activeTaskId: null,
  lastTaskResult: null, // store last task listing data for save buttons
};

// DOM
const authScreen = document.querySelector('#authScreen');
const mainScreen = document.querySelector('#mainScreen');
const accountBadge = document.querySelector('#accountBadge');
const loginForm = document.querySelector('#loginForm');
const emailInput = document.querySelector('#emailInput');
const passwordInput = document.querySelector('#passwordInput');
const loginError = document.querySelector('#loginError');
const chatLog = document.querySelector('#chatLog');
const chatForm = document.querySelector('#chatForm');
const chatInput = document.querySelector('#chatInput');
const listingGrid = document.querySelector('#listingGrid');
const logoutBtn = document.querySelector('#logoutBtn');
const settingsBtn = document.querySelector('#settingsBtn');
const settingsModal = document.querySelector('#settingsModal');
const closeSettingsBtn = document.querySelector('#closeSettingsBtn');
const settingsInfo = document.querySelector('#settingsInfo');
const passwordForm = document.querySelector('#passwordForm');
const passwordMsg = document.querySelector('#passwordMsg');
const profileForm = document.querySelector('#profileForm');
const profileMsg = document.querySelector('#profileMsg');
const profileSchool = document.querySelector('#profileSchool');
const profileBudget = document.querySelector('#profileBudget');
const profileType = document.querySelector('#profileType');
const profileAreas = document.querySelector('#profileAreas');
const profileDealbreakers = document.querySelector('#profileDealbreakers');

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

function headers() {
  return {
    'Content-Type': 'application/json',
    Authorization: state.token ? `Bearer ${state.token}` : '',
  };
}

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...headers(), ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

function setToken(token) {
  state.token = token;
  localStorage.setItem(tokenKey, token);
  window.postMessage({ source: 'can-rent-lah-web', token }, window.location.origin);
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

function showLoginError(msg) {
  if (!msg) { loginError.classList.add('hidden'); loginError.textContent = ''; return; }
  loginError.textContent = msg;
  loginError.classList.remove('hidden');
}

function showScreen(loggedIn) {
  authScreen.classList.toggle('hidden', loggedIn);
  mainScreen.classList.toggle('hidden', !loggedIn);
}

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

function addMessage(role, text) {
  const el = document.createElement('div');
  el.className = `message ${role}`;
  if (role === 'assistant') {
    el.innerHTML = renderMarkdown(text);
    // Add save buttons with listing data + AI analysis extracted from report
    const ranked = state.lastTaskResult?.rankedListings || [];
    const reportText = state.lastTaskResult?.report || '';

    el.querySelectorAll('a[href*="propertyguru.com.sg/listing"]').forEach((a, idx) => {
      let listing = ranked[idx];
      if (!listing) listing = ranked.find((l) => l.url && a.href.includes(String(l.id)));
      if (!listing) return;

      // Find this listing's section in the report markdown by URL
      const listingId = String(listing.id || '');
      const urlSlug = listing.url ? listing.url.split('/').pop() : '';
      const reportLines = reportText.split('\n');
      let sectionStart = -1;
      let sectionEnd = reportLines.length;

      // Find the section that contains this listing's URL or ID
      for (let i = 0; i < reportLines.length; i++) {
        if (reportLines[i].includes(urlSlug) || reportLines[i].includes(listingId)) {
          // Go back to find the heading that starts this section
          for (let j = i; j >= 0; j--) {
            if (reportLines[j].match(/^#{2,4}\s/)) { sectionStart = j; break; }
          }
          // Go forward to find the next heading (start of next section)
          for (let j = i + 1; j < reportLines.length; j++) {
            if (reportLines[j].match(/^#{2,4}\s/)) { sectionEnd = j; break; }
          }
          break;
        }
      }

      if (sectionStart >= 0) {
        const section = reportLines.slice(sectionStart, sectionEnd).join('\n');
        const pros = section.match(/为什么选它\**\s*[：:]\s*(.+?)(?=\n[-*]\s*\*\*要注意|\n[-*]\s*\*\*|\n\n|$)/s);
        const cons = section.match(/要注意\**\s*[：:]\s*(.+?)(?=\n[-*]\s*\*\*|🔗|\n\n|$)/s);
        if (pros) listing = { ...listing, _pros: pros[1].trim().slice(0, 100) };
        if (cons) listing = { ...listing, _cons: cons[1].trim().slice(0, 100) };
      }

      const btn = document.createElement('button');
      btn.className = 'save-btn';
      btn.textContent = '收藏';
      btn.dataset.listing = JSON.stringify(listing);
      a.after(btn);
    });
  } else if (role === 'system') {
    el.innerHTML = text;
  } else {
    el.textContent = text;
  }
  chatLog.append(el);
  chatLog.scrollTop = chatLog.scrollHeight;
  return el;
}

function renderMarkdown(md) {
  const lines = String(md || '').split(/\r?\n/);
  const html = [];
  let inList = false;
  function closeList() { if (inList) { html.push('</ul>'); inList = false; } }
  for (let line of lines) {
    line = line.trimEnd();
    if (!line.trim()) { closeList(); continue; }
    const h = line.match(/^(#{1,3})\s+(.+)$/);
    if (h) { closeList(); html.push(`<h${h[1].length + 2}>${formatInline(h[2])}</h${h[1].length + 2}>`); continue; }
    const bullet = line.match(/^[-*]\s+(.+)$/) || line.match(/^\d+[.)]\s+(.+)$/);
    if (bullet) { if (!inList) { html.push('<ul>'); inList = true; } html.push(`<li>${formatInline(bullet[1])}</li>`); continue; }
    closeList(); html.push(`<p>${formatInline(line)}</p>`);
  }
  closeList();
  return html.join('');
}

function formatInline(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

// ---------------------------------------------------------------------------
// Listings
// ---------------------------------------------------------------------------

function renderListings() {
  if (state.listings.length === 0) {
    listingGrid.innerHTML = '<div class="subtle" style="padding:20px;text-align:center">还没有收藏房源。<br>Agent 推荐后可以收藏到这里。</div>';
    return;
  }
  listingGrid.innerHTML = state.listings.map((l) => `
    <article class="listing-card">
      <div class="listing-card-head">
        <strong>${escapeHtml(l.title || '无标题')}</strong>
        <button class="delete-btn" data-id="${escapeHtml(l.id)}" title="删除">✕</button>
      </div>
      <div class="listing-card-info">
        ${l.price ? `<span class="listing-price">${escapeHtml(l.price)}</span>` : ''}
        ${l.address ? `<span>📍 ${escapeHtml(l.address)}</span>` : ''}
        ${l.mrt ? `<span>🚇 ${escapeHtml(l.mrt)}</span>` : ''}
        ${l.floor_area ? `<span>📐 ${escapeHtml(l.floor_area)}</span>` : ''}
        ${l.property_type ? `<span>🏠 ${escapeHtml(l.property_type)}</span>` : ''}
        ${l.pros ? `<span class="listing-pros">👍 ${escapeHtml(l.pros)}</span>` : ''}
        ${l.cons ? `<span class="listing-cons">⚠️ ${escapeHtml(l.cons)}</span>` : ''}
      </div>
      <div class="listing-card-actions">
        ${l.url ? `<a href="${escapeHtml(l.url)}" target="_blank" rel="noreferrer" class="listing-link">🔗 查看</a>` : ''}
        <button class="contact-btn" data-title="${escapeHtml(l.title || '')}" data-price="${escapeHtml(l.price || '')}" data-address="${escapeHtml(l.address || '')}" data-mrt="${escapeHtml(l.mrt || '')}" data-url="${escapeHtml(l.url || '')}">📞 联系中介</button>
      </div>
    </article>
  `).join('');

  // Delete handlers
  listingGrid.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      try {
        await api(`/api/listings/${id}`, { method: 'DELETE' });
        state.listings = state.listings.filter((l) => l.id !== id);
        renderListings();
      } catch { /* ignore */ }
    });
  });

  // Contact agent handlers
  listingGrid.querySelectorAll('.contact-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const listing = {
        title: btn.dataset.title,
        price: btn.dataset.price,
        address: btn.dataset.address,
        mrt: btn.dataset.mrt,
        url: btn.dataset.url,
      };
      btn.textContent = '生成中...';
      btn.disabled = true;
      try {
        const data = await api('/api/contact/message', { method: 'POST', body: JSON.stringify({ listing }) });
        addMessage('assistant', `**联系中介话术**\n\n\`\`\`\n${data.message}\n\`\`\`\n\n💡 复制上面的消息，WhatsApp 发给中介。`);
      } catch {
        addMessage('system', '生成话术失败');
      } finally {
        btn.textContent = '📞 联系中介';
        btn.disabled = false;
      }
    });
  });
}

async function refreshListings(retries = 2) {
  if (!state.token) return;
  for (let i = 0; i <= retries; i++) {
    try {
      const data = await api('/api/listings');
      state.listings = data.listings || [];
      renderListings();
      return;
    } catch {
      if (i < retries) await new Promise((r) => setTimeout(r, 1000));
    }
  }
  // All retries failed — keep existing state.listings
}

// ---------------------------------------------------------------------------
// Agent task flow
// ---------------------------------------------------------------------------

function pollTaskStatus(taskId) {
  let polls = 0;
  const maxPolls = 40;
  const interval = setInterval(async () => {
    try {
      polls++;
      const data = await api(`/api/tasks/${taskId}`);
      const task = data.task;
      if (!task) return;

      if (task.status === 'completed' && task.result?.report) {
        clearInterval(interval);
        state.activeTaskId = null;
        state.lastTaskResult = task.result;
        // Clear context on complete
        addMessage('assistant', task.result.report);
        refreshListings();
        addMessage('system', '✅ 搜索完成。<br><button class="save-btn" onclick="document.querySelector(\'#chatInput\').value=\'重新搜：' + escapeHtml(task.question.slice(0, 40)) + '\';document.querySelector(\'#chatForm\').requestSubmit()">🔄 重新搜索</button> · <button class="save-btn" onclick="document.querySelector(\'#chatInput\').value=\'扩大区域再搜\';document.querySelector(\'#chatForm\').requestSubmit()">📡 扩大区域</button>');
      } else if (task.status === 'cancelled') {
        clearInterval(interval);
        state.activeTaskId = null;
        pendingContext = '';
        addMessage('system', '❌ 任务已取消。可以重新输入需求。');
      } else if (polls >= maxPolls) {
        clearInterval(interval);
        state.activeTaskId = null;
        addMessage('system', '⏰ 搜索超时。<br><button class="save-btn" style="background:#e74c3c;color:white" onclick="cancelTask(\'' + taskId + '\')">取消任务</button> · <button class="msg-action" onclick="window.open(\'https://www.propertyguru.com.sg/property-for-rent\',\'_blank\')">打开 PropertyGuru</button>');
      }
    } catch { /* ignore */ }
  }, 5000);
}

async function cancelTask(taskId) {
  try {
    await api(`/api/tasks/${taskId}`, { method: 'DELETE' });
    state.activeTaskId = null;
    addMessage('system', '❌ 已取消。可以重新输入需求。');
  } catch { addMessage('system', '取消失败，请刷新页面重试。'); }
}

async function loadCompletedTasks() {
  try {
    const data = await api('/api/tasks?status=completed');
    const tasks = (data.tasks || []).slice(0, 3);
    for (const task of tasks) {
      if (task.result?.report) {
        state.lastTaskResult = task.result;
        addMessage('system', `📋 历史任务：${task.question.slice(0, 60)}`);
        addMessage('assistant', task.result.report);
        break;
      }
    }
  } catch { /* ignore */ }
}

async function checkStuckTasks() {
  // Check for stuck active tasks and offer to cancel
  try {
    const waiting = await api('/api/tasks?status=waiting_search');
    const searching = await api('/api/tasks?status=searching');
    const stuck = [...(waiting.tasks || []), ...(searching.tasks || [])];
    if (stuck.length > 0) {
      const task = stuck[0];
      const statusText = task.status === 'waiting_search' ? '等待插件执行' : '插件执行中';
      addMessage('system', `⚠️ 发现一个未完成的任务（${statusText}）：<br>「${task.question.slice(0, 60)}」<br><button class="save-btn" style="background:#e74c3c;color:white" onclick="cancelTask('${task.id}')">取消此任务</button> · <button class="msg-action" onclick="window.open('https://www.propertyguru.com.sg/property-for-rent','_blank')">打开 PropertyGuru 继续</button>`);
    }
  } catch { /* ignore */ }
}

// Full conversation log for Agent context
let conversationLog = [];
const MAX_LOG = 20;

async function handleChatMessage(message) {
  if (!message.trim()) return;

  addMessage('user', message);
  chatInput.value = '';

  // Build context: full conversation + mark latest message
  const history = conversationLog.map((m) => `${m.role}: ${m.text}`).join('\n');
  const prompt = `${history ? '对话历史（仅供参考用户偏好，不要基于历史关键词触发搜索）：\n' + history + '\n---\n' : ''}用户最新消息：${message.trim()}\n\n请只根据「最新消息」判断意图。如果最新消息是闲聊（如"你好"），用 action=chat。如果最新消息明确是找房请求，再看历史里的偏好信息来补充搜索参数。`;

  conversationLog.push({ role: '用户', text: message.trim() });
  if (conversationLog.length > MAX_LOG) conversationLog = conversationLog.slice(-MAX_LOG);

  try {
    const data = await api('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ question: prompt }),
    });

    if (data.needsClarify) {
      conversationLog.push({ role: 'Agent', text: data.question });
      addMessage('assistant', `🤔 ${data.question}`);
      return;
    }

    if (data.answer) {
      conversationLog.push({ role: 'Agent', text: data.answer });
      addMessage('assistant', data.answer);
      return;
    }

    if (data.task) {
      const task = data.task;
      state.activeTaskId = task.id;

      const rounds = task.rounds || [];
      const round = rounds[0] || {};
      addMessage('system', `📋 Agent 已规划：${round.strategy || '自动搜索'}（${round.instructionCount || 0} 个搜索页面）`);

      // Auto-open PropertyGuru
      const insts = round.instructions || round.instructionCount;
      if (task.intent?.location) {
        const searchUrl = `https://www.propertyguru.com.sg/property-for-rent?freetext=${encodeURIComponent(task.intent.location)}${task.intent.maxPrice ? '&maxprice=' + task.intent.maxPrice : ''}`;
        addMessage('system', `<span>🔍 正在打开 PropertyGuru 搜索页面…</span><br><a class="msg-action" href="${searchUrl}" target="_blank" rel="noreferrer">打开 PropertyGuru 开始搜索 →</a>`);
        window.open(searchUrl, '_blank', 'noreferrer');
      } else {
        addMessage('system', '<a class="msg-action" href="https://www.propertyguru.com.sg/property-for-rent" target="_blank" rel="noreferrer">打开 PropertyGuru 开始搜索 →</a>');
        window.open('https://www.propertyguru.com.sg/property-for-rent', '_blank', 'noreferrer');
      }

      addMessage('system', '插件会自动在 PropertyGuru 页面执行搜索。搜完后结果会出现在这里。');
      pollTaskStatus(task.id);
    }
  } catch (err) {
    addMessage('system', `出错了：${err.message}`);
  }
}

// Global click delegation for save buttons (avoids DOM rebinding issues)
chatLog.addEventListener('click', async (event) => {
  const btn = event.target.closest('.save-btn');
  if (!btn || btn.classList.contains('saved')) return;

  // Use pre-stored listing data from data attribute
  let listing = null;
  if (btn.dataset.listing) {
    try { listing = JSON.parse(btn.dataset.listing); } catch {}
  }

  if (!listing) { btn.textContent = '无数据'; return; }

  try {
    await api('/api/listings/save', { method: 'POST', body: JSON.stringify({ listing }) });
    btn.textContent = '已收藏';
    btn.classList.add('saved');
    refreshListings();
  } catch { btn.textContent = '失败'; }
});

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = emailInput.value.trim();
  const password = passwordInput.value || '';

  if (!email || !email.includes('@')) { showLoginError('请输入有效邮箱'); return; }
  if (!password || password.length < 6) { showLoginError('密码至少6位'); return; }
  showLoginError('');

  try {
    try {
      const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      setToken(data.token);
      state.user = data.user;
    } catch {
      // Register new account
      const data = await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) });
      setToken(data.token);
      state.user = data.user;
    }

    showScreen(true);
    accountBadge.textContent = `${state.user.email} · ${state.user.plan}`;
    await refreshListings();
    addMessage('assistant', `你好！我是你的新加坡租房 Agent。\n\n直接告诉我你的需求，比如「**NUS附近 1500新币以内 单间**」，我会自动帮你搜 PropertyGuru、筛选排名。`);
    await loadCompletedTasks();
    await checkStuckTasks();
  } catch (err) {
    showLoginError(err.message || '登录失败');
  }
});

chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await handleChatMessage(chatInput.value);
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function openSettings() {
  settingsModal.classList.remove('hidden');
  // Fill account info
  if (state.user) {
    settingsInfo.innerHTML = `
      邮箱：${escapeHtml(state.user.email)}<br>
      套餐：${escapeHtml(state.user.plan)} · 已聊 ${state.user.chatCount || 0} 次<br>
      ${state.user.activated ? '已激活' : '未激活'}
    `;
  }
  // Load profile
  loadProfile();
}

function closeSettings() {
  settingsModal.classList.add('hidden');
  passwordMsg.classList.add('hidden');
  profileMsg.classList.add('hidden');
}

async function loadProfile() {
  try {
    const data = await api('/api/profile');
    const profile = data.profile;
    if (profile?.sections) {
      const basics = profile.sections['基础信息'] || [];
      const prefs = profile.sections['偏好'] || [];
      const deals = (profile.sections['雷区'] || []).filter((l) => l.startsWith('- '));

      for (const line of basics) {
        const school = line.match(/学校:\s*(.+)/);
        if (school && school[1] !== '未填写') profileSchool.value = school[1];
        const budget = line.match(/预算:\s*S\$\s*(\d+)/);
        if (budget) profileBudget.value = budget[1];
      }
      for (const line of prefs) {
        const type = line.match(/房源类型:\s*(.+)/);
        if (type && type[1] !== '未限制') profileType.value = type[1];
        const areas = line.match(/首选区域:\s*(.+)/);
        if (areas && areas[1] !== '未填写') profileAreas.value = areas[1];
      }
      if (deals.length) {
        profileDealbreakers.value = deals.map((d) => d.replace('- ', '')).join(', ');
      }
    }
  } catch { /* ignore */ }
}

settingsBtn.addEventListener('click', openSettings);
closeSettingsBtn.addEventListener('click', closeSettings);
settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) closeSettings(); });

passwordForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  passwordMsg.classList.add('hidden');
  try {
    await api('/api/auth/password', {
      method: 'PUT',
      body: JSON.stringify({
        oldPassword: document.querySelector('#oldPasswordInput').value,
        newPassword: document.querySelector('#newPasswordInput').value,
      }),
    });
    passwordMsg.textContent = '密码已更新';
    passwordMsg.className = 'settings-msg success';
    passwordMsg.classList.remove('hidden');
    document.querySelector('#oldPasswordInput').value = '';
    document.querySelector('#newPasswordInput').value = '';
  } catch (err) {
    passwordMsg.textContent = err.message;
    passwordMsg.className = 'settings-msg error';
    passwordMsg.classList.remove('hidden');
  }
});

profileForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  profileMsg.classList.add('hidden');
  try {
    await api('/api/profile', {
      method: 'POST',
      body: JSON.stringify({
        email: state.user?.email,
        school: profileSchool.value,
        budget: profileBudget.value ? Number(profileBudget.value) : null,
        propertyType: profileType.value || null,
        preferredAreas: profileAreas.value ? profileAreas.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean) : [],
        dealbreakers: profileDealbreakers.value ? profileDealbreakers.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean) : [],
      }),
    });
    profileMsg.textContent = '偏好已保存';
    profileMsg.className = 'settings-msg success';
    profileMsg.classList.remove('hidden');
  } catch (err) {
    profileMsg.textContent = err.message;
    profileMsg.className = 'settings-msg error';
    profileMsg.classList.remove('hidden');
  }
});

logoutBtn.addEventListener('click', () => {
  state.token = null;
  state.user = null;
  state.listings = [];
  state.activeTaskId = null;
  localStorage.removeItem(tokenKey);
  chatLog.innerHTML = '';
  showScreen(false);
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

if (state.token) {
  try {
    const data = await api('/api/auth/me');
    state.user = data.user;
    showScreen(true);
    accountBadge.textContent = `${state.user.email} · ${state.user.plan}`;
    await refreshListings();
    addMessage('assistant', '欢迎回来！直接告诉我你的找房需求。');
    await loadCompletedTasks();
    await checkStuckTasks();
  } catch {
    state.token = null;
    localStorage.removeItem(tokenKey);
    showScreen(false);
  }
} else {
  showScreen(false);
}
