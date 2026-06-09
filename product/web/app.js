const API_BASE = window.location.origin;
const tokenKey = 'canRentLahToken';

const state = {
  token: localStorage.getItem(tokenKey),
  user: null,
  listings: [],
  activeTaskId: null,
  lastTaskResult: null,
  conversationLog: [],
};

const $ = (selector) => document.querySelector(selector);
const authScreen = $('#authScreen');
const mainScreen = $('#mainScreen');
const accountBadge = $('#accountBadge');
const loginForm = $('#loginForm');
const emailInput = $('#emailInput');
const passwordInput = $('#passwordInput');
const loginError = $('#loginError');
const chatLog = $('#chatLog');
const chatForm = $('#chatForm');
const chatInput = $('#chatInput');
const listingGrid = $('#listingGrid');
const logoutBtn = $('#logoutBtn');
const settingsBtn = $('#settingsBtn');
const settingsModal = $('#settingsModal');
const closeSettingsBtn = $('#closeSettingsBtn');
const settingsInfo = $('#settingsInfo');
const passwordForm = $('#passwordForm');
const passwordMsg = $('#passwordMsg');
const profileForm = $('#profileForm');
const profileMsg = $('#profileMsg');
const profileSchool = $('#profileSchool');
const profileBudget = $('#profileBudget');
const profileType = $('#profileType');
const profileAreas = $('#profileAreas');
const profileDealbreakers = $('#profileDealbreakers');

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: state.token ? `Bearer ${state.token}` : '',
  };
}

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) },
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

function showScreen(loggedIn) {
  authScreen.classList.toggle('hidden', loggedIn);
  mainScreen.classList.toggle('hidden', !loggedIn);
}

function showError(text) {
  loginError.textContent = text || '';
  loginError.classList.toggle('hidden', !text);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatInline(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function renderMarkdown(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  const html = [];
  let inList = false;
  const closeList = () => { if (inList) { html.push('</ul>'); inList = false; } };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { closeList(); continue; }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = Math.min(heading[1].length + 2, 4);
      html.push(`<h${level}>${formatInline(heading[2])}</h${level}>`);
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.+)$/) || line.match(/^\d+[.)]\s+(.+)$/);
    if (bullet) {
      if (!inList) { html.push('<ul>'); inList = true; }
      html.push(`<li>${formatInline(bullet[1])}</li>`);
      continue;
    }
    closeList();
    html.push(`<p>${formatInline(line)}</p>`);
  }
  closeList();
  return html.join('');
}

function addMessage(role, text) {
  const item = document.createElement('div');
  item.className = `message ${role}`;
  if (role === 'assistant') {
    item.innerHTML = renderMarkdown(text);
    attachSaveButtons(item);
  } else if (role === 'system') {
    item.innerHTML = text;
  } else {
    item.textContent = text;
  }
  chatLog.append(item);
  chatLog.scrollTop = chatLog.scrollHeight;
  return item;
}

function attachSaveButtons(container) {
  const ranked = state.lastTaskResult?.rankedListings || [];
  container.querySelectorAll('a[href*="propertyguru.com.sg"]').forEach((link, index) => {
    const listing = ranked[index] || ranked.find((item) => item.url && link.href.includes(String(item.id || '')));
    if (!listing) return;
    const button = document.createElement('button');
    button.className = 'save-btn';
    button.type = 'button';
    button.textContent = '收藏这个房源';
    button.dataset.listing = JSON.stringify(listing);
    link.after(document.createTextNode(' '), button);
  });
}

function emptyListingsHtml() {
  return '<div class="empty-state">还没有收藏房源。<br>搜索完成后，在推荐结果里点“收藏这个房源”。</div>';
}

function renderListings() {
  if (!state.listings.length) {
    listingGrid.innerHTML = emptyListingsHtml();
    return;
  }

  listingGrid.innerHTML = state.listings.map((listing) => `
    <article class="listing-card">
      <div class="listing-card-head">
        <strong>${escapeHtml(listing.title || '未命名房源')}</strong>
        <button class="delete-btn" data-id="${escapeHtml(listing.id)}" type="button" title="删除">×</button>
      </div>
      <div class="listing-card-info">
        ${listing.price ? `<span class="listing-price">${escapeHtml(listing.price)}</span>` : ''}
        ${listing.address ? `<span>${escapeHtml(listing.address)}</span>` : ''}
        ${listing.mrt ? `<span>${escapeHtml(listing.mrt)}</span>` : ''}
        ${listing.floor_area || listing.floorArea ? `<span>${escapeHtml(listing.floor_area || listing.floorArea)}</span>` : ''}
        ${listing.property_type || listing.propertyType ? `<span>${escapeHtml(listing.property_type || listing.propertyType)}</span>` : ''}
      </div>
      ${listing.pros ? `<div class="listing-pros">推荐理由：${escapeHtml(listing.pros)}</div>` : ''}
      ${listing.cons ? `<div class="listing-cons">注意事项：${escapeHtml(listing.cons)}</div>` : ''}
      <div class="listing-card-actions">
        ${listing.url ? `<a class="listing-link" href="${escapeHtml(listing.url)}" target="_blank" rel="noreferrer">查看原房源</a>` : ''}
        <button class="contact-btn" type="button"
          data-title="${escapeHtml(listing.title || '')}"
          data-price="${escapeHtml(listing.price || '')}"
          data-address="${escapeHtml(listing.address || '')}"
          data-mrt="${escapeHtml(listing.mrt || '')}"
          data-url="${escapeHtml(listing.url || '')}">生成联系话术</button>
      </div>
    </article>
  `).join('');
}

async function refreshListings() {
  if (!state.token) return;
  try {
    const data = await api('/api/listings');
    state.listings = data.listings || [];
    renderListings();
  } catch {
    renderListings();
  }
}

async function pollTaskStatus(taskId) {
  let polls = 0;
  const timer = setInterval(async () => {
    polls += 1;
    try {
      const data = await api(`/api/tasks/${taskId}`);
      const task = data.task;
      if (!task) return;

      if (task.status === 'completed' && task.result?.report) {
        clearInterval(timer);
        state.activeTaskId = null;
        state.lastTaskResult = task.result;
        addMessage('assistant', task.result.report);
        addMessage('system', '搜索完成。结果已经保存到当前任务，你可以继续扩大区域或调整预算再搜。');
        await refreshListings();
      } else if (task.status === 'cancelled' || task.status === 'expired') {
        clearInterval(timer);
        state.activeTaskId = null;
        addMessage('system', task.status === 'expired' ? '任务已超时，可以重新发起搜索。' : '任务已取消。');
      } else if (polls >= 60) {
        clearInterval(timer);
        state.activeTaskId = null;
        addMessage('system', '等待时间较长。请确认 PropertyGuru 页面和插件是否仍在打开。');
      }
    } catch {
      if (polls >= 8) {
        clearInterval(timer);
        state.activeTaskId = null;
      }
    }
  }, 4000);
}

function buildTaskPrompt(message) {
  const history = state.conversationLog
    .slice(-8)
    .map((entry) => `${entry.role}: ${entry.text}`)
    .join('\n');
  return `${history ? `对话历史仅用于理解偏好，不要因为历史关键词自动触发搜索：\n${history}\n---\n` : ''}用户最新消息：${message}\n\n只根据最新消息判断意图。若预算、币种、学校、区域等关键信息不明确，先追问。`;
}

async function handleChatMessage(message) {
  const text = message.trim();
  if (!text) return;
  addMessage('user', text);
  chatInput.value = '';
  state.conversationLog.push({ role: '用户', text });

  try {
    const pending = addMessage('system', '正在理解需求并创建任务...');
    const data = await api('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ question: buildTaskPrompt(text) }),
    });
    pending.remove();

    if (data.needsClarify) {
      state.conversationLog.push({ role: 'Agent', text: data.question });
      addMessage('assistant', data.question || '还需要补充一点信息。');
      return;
    }

    if (data.answer) {
      state.conversationLog.push({ role: 'Agent', text: data.answer });
      addMessage('assistant', data.answer);
      return;
    }

    if (data.task) {
      const task = data.task;
      state.activeTaskId = task.id;
      const round = task.rounds?.[0] || {};
      addMessage('assistant', `任务已创建。\n\n- 搜索策略：${round.strategy || '自动搜索'}\n- 搜索页面：${round.instructionCount || round.instructions?.length || 0} 个\n\n我会打开 PropertyGuru，插件会在浏览器里继续执行。`);
      const target = task.intent?.location
        ? `https://www.propertyguru.com.sg/property-for-rent?freetext=${encodeURIComponent(task.intent.location)}${task.intent.maxPrice ? `&maxprice=${task.intent.maxPrice}` : ''}`
        : 'https://www.propertyguru.com.sg/property-for-rent';
      window.open(target, '_blank', 'noreferrer');
      pollTaskStatus(task.id);
    }
  } catch (error) {
    addMessage('system', `出错了：${error.message}`);
  }
}

async function loadCompletedTasks() {
  try {
    const data = await api('/api/tasks?status=completed');
    const task = (data.tasks || [])[0];
    if (task?.result?.report) {
      state.lastTaskResult = task.result;
      addMessage('system', `最近一次搜索：${escapeHtml(task.question.slice(0, 80))}`);
      addMessage('assistant', task.result.report);
    }
  } catch {}
}

async function checkActiveTasks() {
  try {
    const waiting = await api('/api/tasks?status=waiting_search');
    const searching = await api('/api/tasks?status=searching');
    const active = [...(waiting.tasks || []), ...(searching.tasks || [])];
    if (!active.length) return;
    const task = active[0];
    state.activeTaskId = task.id;
    addMessage('system', `检测到未完成任务：${escapeHtml(task.question.slice(0, 80))}<br><a class="msg-action" href="https://www.propertyguru.com.sg/property-for-rent" target="_blank" rel="noreferrer">打开 PropertyGuru 继续</a>`);
    pollTaskStatus(task.id);
  } catch {}
}

function fillAccountInfo() {
  if (!state.user) return;
  accountBadge.textContent = `${state.user.email} · ${state.user.plan || 'free'}`;
  settingsInfo.innerHTML = `
    邮箱：${escapeHtml(state.user.email)}<br>
    套餐：${escapeHtml(state.user.plan || 'free')}<br>
    对话次数：${Number(state.user.chatCount || 0)}
  `;
}

function showMsg(el, text, type) {
  el.textContent = text;
  el.className = `settings-msg ${type}`;
  el.classList.remove('hidden');
}

async function loadProfile() {
  try {
    const data = await api('/api/profile');
    const raw = typeof data.profile === 'string' ? data.profile : '';
    const school = raw.match(/学校:\s*(.+)/);
    const budget = raw.match(/预算:\s*S\$(\d+)/);
    if (school && !school[1].includes('未')) profileSchool.value = school[1].trim();
    if (budget) profileBudget.value = budget[1];
  } catch {}
}

async function bootLoggedIn() {
  const data = await api('/api/auth/me');
  state.user = data.user;
  showScreen(true);
  fillAccountInfo();
  await refreshListings();
  addMessage('assistant', '欢迎回来。直接告诉我你的租房需求；如果信息不够，我会先追问再搜索。');
  await loadCompletedTasks();
  await checkActiveTasks();
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email.includes('@')) { showError('请输入有效邮箱。'); return; }
  if (!password || password.length < 6) { showError('密码至少 6 位。'); return; }
  showError('');
  try {
    let data;
    try {
      data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    } catch {
      data = await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) });
    }
    setToken(data.token);
    state.user = data.user;
    showScreen(true);
    fillAccountInfo();
    await refreshListings();
    addMessage('assistant', '登录成功。你可以直接发起找房任务，例如：NUS 附近 1500 新币以内单间。');
  } catch (error) {
    showError(error.message || '登录失败。');
  }
});

chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await handleChatMessage(chatInput.value);
});

chatLog.addEventListener('click', async (event) => {
  const button = event.target.closest('.save-btn');
  if (!button || button.classList.contains('saved')) return;
  let listing = null;
  try { listing = JSON.parse(button.dataset.listing || 'null'); } catch {}
  if (!listing) return;
  try {
    await api('/api/listings/save', { method: 'POST', body: JSON.stringify({ listing }) });
    button.textContent = '已收藏';
    button.classList.add('saved');
    await refreshListings();
  } catch {
    button.textContent = '收藏失败';
  }
});

listingGrid.addEventListener('click', async (event) => {
  const deleteButton = event.target.closest('.delete-btn');
  if (deleteButton) {
    try {
      await api(`/api/listings/${deleteButton.dataset.id}`, { method: 'DELETE' });
      state.listings = state.listings.filter((item) => item.id !== deleteButton.dataset.id);
      renderListings();
    } catch {}
    return;
  }

  const contactButton = event.target.closest('.contact-btn');
  if (!contactButton) return;
  contactButton.disabled = true;
  contactButton.textContent = '生成中...';
  try {
    const listing = {
      title: contactButton.dataset.title,
      price: contactButton.dataset.price,
      address: contactButton.dataset.address,
      mrt: contactButton.dataset.mrt,
      url: contactButton.dataset.url,
    };
    const data = await api('/api/contact/message', { method: 'POST', body: JSON.stringify({ listing }) });
    addMessage('assistant', `**联系中介话术**\n\n\`${data.message}\``);
  } catch (error) {
    addMessage('system', `生成失败：${error.message}`);
  } finally {
    contactButton.disabled = false;
    contactButton.textContent = '生成联系话术';
  }
});

settingsBtn.addEventListener('click', async () => {
  fillAccountInfo();
  settingsModal.classList.remove('hidden');
  await loadProfile();
});
closeSettingsBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));
settingsModal.addEventListener('click', (event) => {
  if (event.target === settingsModal) settingsModal.classList.add('hidden');
});

passwordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api('/api/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ oldPassword: $('#oldPasswordInput').value, newPassword: $('#newPasswordInput').value }),
    });
    showMsg(passwordMsg, '密码已更新。', 'success');
    passwordForm.reset();
  } catch (error) {
    showMsg(passwordMsg, error.message, 'error');
  }
});

profileForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const splitList = (value) => value.split(/[,，]/).map((item) => item.trim()).filter(Boolean);
  try {
    await api('/api/profile', {
      method: 'POST',
      body: JSON.stringify({
        email: state.user?.email,
        school: profileSchool.value,
        budget: profileBudget.value ? Number(profileBudget.value) : null,
        propertyType: profileType.value || null,
        preferredAreas: splitList(profileAreas.value),
        dealbreakers: splitList(profileDealbreakers.value),
      }),
    });
    showMsg(profileMsg, '偏好已保存。', 'success');
  } catch (error) {
    showMsg(profileMsg, error.message, 'error');
  }
});

logoutBtn.addEventListener('click', () => {
  state.token = null;
  state.user = null;
  state.listings = [];
  localStorage.removeItem(tokenKey);
  chatLog.innerHTML = '';
  showScreen(false);
});

renderListings();
if (state.token) {
  try {
    await bootLoggedIn();
  } catch {
    localStorage.removeItem(tokenKey);
    state.token = null;
    showScreen(false);
  }
} else {
  showScreen(false);
}
