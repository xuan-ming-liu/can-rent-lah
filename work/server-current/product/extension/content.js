const DEFAULT_API_BASE = 'http://101.47.73.151:8787';

const TEXT = {
  creatingSession: '无法连接服务器',
  requestFailed: '请求失败',
  notLoggedIn: '请先在网站登录，插件会自动同步账号',
  loading: '正在启动...',
  refresh: '刷新',
  refreshTitle: '刷新房源',
  placeholder: '直接在这里说需求，Agent 帮你搜',
  ask: '发送',
  empty: '当前页面还没有识别到房源。可以滚动页面后点刷新。',
  save: '收藏',
  saved: '已收藏',
  saveFailed: '收藏失败',
  detected: '识别到',
  listings: '个房源',
  demo: '本地测试账号',
  aiUnavailable: 'AI 暂不可用',
  aiFailed: 'AI 调用失败',
  genericListing: 'PropertyGuru 房源',
  listing: '房源',
  // Agent task
  taskPending: '有待执行任务',
  executingTask: 'Agent 搜索中…',
  collecting: '正在采集',
  collected: '已采集',
  searchingArea: '正在搜',
  taskComplete: '任务完成',
  taskFailed: '任务执行失败',
  backToSite: '回网站看结果',
  noTask: '暂无任务。在下面输入需求创建新任务。',
  creatingTask: '正在创建任务…',
  needClarify: '请补充信息',
  taskInstructions: '搜索指令',
  checkSite: '请回网站查看任务结果',
};

let currentListings = [];
let activeTaskId = null;
let executingTask = false;

function getStorage(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}
function setStorage(values) {
  return new Promise((resolve) => chrome.storage.local.set(values, resolve));
}
function removeStorage(keys) {
  return new Promise((resolve) => chrome.storage.local.remove(keys, resolve));
}

// ---------------------------------------------------------------------------
// API proxy — routes through background service worker to bypass mixed content
// ---------------------------------------------------------------------------

function callApi(method, path, body) {
  return new Promise(async (resolve, reject) => {
    const stored = await getStorage(['canRentLahToken', 'apiBase']);
    if (!stored.canRentLahToken) {
      reject(new Error(TEXT.notLoggedIn));
      return;
    }
    const apiBase = stored.apiBase || DEFAULT_API_BASE;
    const url = `${apiBase}${path}`;
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${stored.canRentLahToken}`,
    };

    chrome.runtime.sendMessage(
      {
        type: 'api-request',
        url,
        method,
        headers,
        body: body || undefined,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response) {
          reject(new Error('No response from background'));
          return;
        }
        if (!response.ok) {
          const err = (response.data && response.data.error) || TEXT.requestFailed;
          reject(new Error(err));
          return;
        }
        resolve(response.data);
      }
    );
  });
}

async function ensureSession() {
  const stored = await getStorage(['canRentLahToken', 'apiBase']);
  if (stored.canRentLahToken) {
    return { token: stored.canRentLahToken, apiBase: stored.apiBase || DEFAULT_API_BASE };
  }
  throw new Error(TEXT.notLoggedIn);
}

async function apiGet(path) {
  return callApi('GET', path);
}

async function apiPost(path, body) {
  return callApi('POST', path, body);
}

// ---------------------------------------------------------------------------
// Data extraction (kept from original — reads __NEXT_DATA__ and DOM)
// ---------------------------------------------------------------------------

function parseNextData() {
  const script = document.querySelector('script#__NEXT_DATA__');
  if (!script?.textContent) return [];
  try {
    const data = JSON.parse(script.textContent);
    const openCliListings = parseOpenCliListingsData(data);
    if (openCliListings.length > 0) return openCliListings;
    return findListingObjects(data);
  } catch { return []; }
}

function parseOpenCliListingsData(nextData) {
  const listingsData =
    nextData?.props?.pageProps?.pageData?.data?.listingsData ||
    nextData?.props?.pageProps?.pageData?.listingsData;
  if (!listingsData || typeof listingsData !== 'object') return [];
  const results = [];
  for (const entry of Object.values(listingsData)) {
    const ld = entry?.listingData || entry?.listing || entry;
    if (!ld || typeof ld !== 'object') continue;
    const features = Array.isArray(ld.listingFeatures) ? ld.listingFeatures : [];
    results.push({
      id: String(ld.id || ld.listingId || ld.url || ''),
      title: String(ld.localizedTitle || ld.title || ld.fullAddress || ''),
      price: String(ld.price?.pretty || ld.price?.value || ld.price || ''),
      bedrooms: String(ld.bedrooms ?? ''),
      bathrooms: String(ld.bathrooms ?? ''),
      floorArea: String(ld.floorArea ?? ''),
      propertyType: String(
        features.find((f) => f?.dataAutomationId === 'listing-card-v2-unit-type')?.text || ''
      ),
      address: String(ld.fullAddress || ld.localizedTitle || ld.address || ''),
      mrt: String(ld.mrt?.nearbyText || ''),
      availability: String(ld.availabilityInfo || ''),
      postedDate: String(ld.postedOn?.text || ''),
      url: String(ld.url || (ld.id ? `https://www.propertyguru.com.sg/listing/${ld.id}` : location.href)),
      source: 'propertyguru',
      capturedAt: new Date().toISOString(),
    });
  }
  return dedupe(results.filter((item) => item.title || item.price || item.address));
}

function findListingObjects(root) {
  const found = [];
  const seen = new WeakSet();
  function scoreObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
    const keys = new Set(Object.keys(value));
    let score = 0;
    if (hasAny(keys, ['price', 'priceText', 'rentalPrice', 'displayPrice', 'formattedPrice'])) score += 2;
    if (hasAny(keys, ['title', 'name', 'address', 'headline'])) score += 2;
    if (hasAny(keys, ['url', 'prettyUrl', 'id', 'listingId'])) score += 1;
    if (hasAny(keys, ['bedrooms', 'beds', 'bathrooms', 'floorArea', 'floorSize'])) score += 1;
    return score;
  }
  function walk(value, depth) {
    if (!value || depth > 12 || found.length > 80) return;
    if (typeof value !== 'object') return;
    if (seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }
    const listing = value.listing && typeof value.listing === 'object' ? value.listing : value;
    if (scoreObject(listing) >= 4) {
      const normalized = normalizeListing(listing);
      if (normalized) found.push(normalized);
    }
    for (const child of Object.values(value)) walk(child, depth + 1);
  }
  walk(root);
  return dedupe(found);
}

function hasAny(keys, names) { return names.some((name) => keys.has(name)); }

function normalizeListing(item) {
  if (!item || typeof item !== 'object') return null;
  const rawUrl = String(item.url || item.prettyUrl || item.href || '');
  const title = String(item.title || item.name || item.address || item.headline || '');
  const price = String(
    item.price || item.priceText || item.rentalPrice || item.displayPrice || item.formattedPrice || item.monthlyRent || ''
  );
  const address = String(item.address || item.location || item.streetName || item.district || item.region || '');
  if (!title && !price && !address) return null;
  const id = String(item.id || item.listingId || rawUrl || title || '');
  return {
    id: id || `${location.href}#${title}-${price}-${address}`,
    title: title || address || TEXT.genericListing,
    price, address,
    bedrooms: String(item.bedrooms || item.beds || item.roomType || ''),
    bathrooms: String(item.bathrooms || item.baths || ''),
    floorArea: String(item.floorArea || item.floorSize || item.area || ''),
    mrt: String(item.mrt?.nearbyText || item.mrt || ''),
    url: rawUrl ? new URL(rawUrl, location.origin).href : location.href,
    source: 'propertyguru',
    capturedAt: new Date().toISOString(),
  };
}

function parseDomCards() {
  const selectors = ['[data-testid*="listing"]', '.listing-card-root', '[class*="listing-card"]', 'article'].join(',');
  const cards = [...document.querySelectorAll(selectors)].slice(0, 40);
  return dedupe(cards.map((card, i) => {
    const link = card.querySelector('a[href*="/property-for-"], a[href*="/listing/"]');
    const title = String(link?.textContent || card.querySelector('h1, h2, h3, [class*="title"]')?.textContent || '').trim();
    const price = String(card.querySelector('[da-id="lc-price"], [class*="price"]')?.textContent || '').trim();
    if (!link && !price) return null;
    return {
      id: link?.href || `${location.href}#dom-${i}`,
      title: title || `${TEXT.listing} ${i + 1}`,
      price,
      address: String(card.querySelector('[da-id="lc-address"], [class*="address"]')?.textContent || '').trim(),
      url: link?.href || location.href,
      source: 'propertyguru',
      capturedAt: new Date().toISOString(),
    };
  }).filter(Boolean));
}

function dedupe(listings) {
  const map = new Map();
  for (const l of listings) {
    const key = l.url || l.id || `${l.title}-${l.price}-${l.address}`;
    if (!map.has(key)) map.set(key, l);
  }
  return [...map.values()];
}

function extractListings() {
  const fromNext = parseNextData();
  if (fromNext.length > 0) return fromNext;
  return parseDomCards();
}

// ---------------------------------------------------------------------------
// Sidebar UI
// ---------------------------------------------------------------------------

function createSidebar() {
  if (document.querySelector('#can-rent-lah-sidebar')) return;
  const root = document.createElement('aside');
  root.id = 'can-rent-lah-sidebar';
  root.innerHTML = `
    <div class="crl-header">
      <div>
        <strong>Can Rent Lah</strong>
        <span id="crl-status">${TEXT.loading}</span>
      </div>
      <button id="crl-refresh" title="${TEXT.refreshTitle}">${TEXT.refresh}</button>
    </div>
    <div id="crl-tasks" class="crl-tasks hidden"></div>
    <div id="crl-listings" class="crl-listings"></div>
    <div id="crl-chat" class="crl-chat"></div>
    <form id="crl-form" class="crl-form">
      <textarea id="crl-input" rows="3" placeholder="${TEXT.placeholder}"></textarea>
      <button type="submit">${TEXT.ask}</button>
    </form>
  `;
  document.body.append(root);
  root.querySelector('#crl-refresh').addEventListener('click', refreshAll);
  root.querySelector('#crl-form').addEventListener('submit', onChatSubmit);
}

function renderStatus(text) {
  const el = document.querySelector('#crl-status');
  if (el) el.textContent = text;
}

function addChat(role, text) {
  const chat = document.querySelector('#crl-chat');
  const item = document.createElement('div');
  item.className = `crl-msg ${role}`;
  if (role === 'assistant') {
    item.innerHTML = renderMarkdown(text);
  } else {
    item.textContent = text;
  }
  chat.append(item);
  chat.scrollTop = chat.scrollHeight;
}

function renderListings() {
  const box = document.querySelector('#crl-listings');
  box.innerHTML = '';
  if (currentListings.length === 0) { box.textContent = TEXT.empty; return; }
  for (const listing of currentListings.slice(0, 10)) {
    const row = document.createElement('div');
    row.className = 'crl-listing';
    row.innerHTML = `
      <strong>${escapeHtml(listing.title)}</strong>
      <span>${escapeHtml([listing.price, listing.address].filter(Boolean).join(' · '))}</span>
      <button type="button">${TEXT.save}</button>
    `;
    row.querySelector('button').addEventListener('click', async () => {
      try {
        await apiPost('/api/listings/save', { listing });
        addChat('assistant', `${TEXT.saved}: **${listing.title}**`);
      } catch (error) { addChat('assistant', `${TEXT.saveFailed}: ${error.message}`); }
    });
    box.append(row);
  }
}

// ---------------------------------------------------------------------------
// Agent Task Flow
// ---------------------------------------------------------------------------

async function fetchAndShowTasks() {
  try {
    const data = await apiGet('/api/tasks?status=waiting_search');
    const tasks = Array.isArray(data.tasks) ? data.tasks : [];

    // Also get searching tasks
    const searchingData = await apiGet('/api/tasks?status=searching');
    const searchingTasks = Array.isArray(searchingData.tasks) ? searchingData.tasks : [];

    const allActive = [...tasks, ...searchingTasks];
    renderTaskBar(allActive);

    // If there's an active task, start or resume execution
    if (allActive.length > 0 && !executingTask) {
      const task = allActive[0];
      await executeTaskInstructions(task);
    }
    return allActive;
  } catch { return []; }
}

function renderTaskBar(tasks) {
  const bar = document.querySelector('#crl-tasks');
  if (!bar) return;
  if (!tasks || tasks.length === 0) {
    bar.classList.add('hidden');
    bar.innerHTML = '';
    return;
  }
  bar.classList.remove('hidden');
  bar.innerHTML = `
    <div class="crl-tasks-head">
      <strong>${TEXT.taskPending}</strong>
      <span>${tasks.length} 个</span>
    </div>
    ${tasks.slice(0, 3).map((task) => `
      <div class="crl-task-item">
        <div class="crl-task-question">${escapeHtml(task.question.slice(0, 80))}${task.question.length > 80 ? '...' : ''}</div>
        <div class="crl-task-meta">
          <span>${task.status === 'searching' ? '🔄 执行中' : '⏳ 等待执行'}</span>
          <span>${task.totalCollected || 0} 个房源</span>
          <span>第 ${(task.currentRound || 0) + 1} 轮</span>
        </div>
      </div>
    `).join('')}
  `;
}

async function executeTaskInstructions(task) {
  if (executingTask) return;
  executingTask = true;
  activeTaskId = task.id;

  try {
    const data = await apiGet(`/api/tasks/${task.id}/instructions`);
    const instructions = Array.isArray(data.instructions) ? data.instructions : [];

    if (instructions.length === 0) {
      addChat('assistant', `✅ ${TEXT.taskComplete}！${TEXT.checkSite}`);
      renderStatus(`${TEXT.taskComplete}`);
      executingTask = false;
      return;
    }

    const stored = await getStorage(['canRentLahTaskExec', 'canRentLahRedirectCount']);
    const exec = stored.canRentLahTaskExec || {};
    const isResume = exec.taskId === task.id;

    // Determine which instruction page we need to be on
    const targetIdx = isResume ? (exec.instIndex || 0) : 0;
    const targetUrl = instructions[targetIdx]?.url;

    // Detect CAPTCHA / human verification page
    if (isCaptchaPage()) {
      addChat('assistant', '⚠️ PropertyGuru 要求人机验证。请手动完成验证后点侧边栏刷新。');
      renderStatus('人机验证 - 请手动完成');
      await setStorage({ canRentLahRedirectCount: 0 });
      executingTask = false;
      return;
    }

    // Guard against infinite redirects
    const redirectCount = stored.canRentLahRedirectCount || 0;
    const lastUrl = stored.canRentLahLastUrl || '';
    if (redirectCount > 6 || (lastUrl === targetUrl && redirectCount > 1)) {
      addChat('assistant', '跳转次数过多或重复跳转，暂停搜索。请手动完成人机验证后刷新。');
      renderStatus('搜索暂停');
      await setStorage({ canRentLahTaskExec: null, canRentLahRedirectCount: 0, canRentLahLastUrl: '' });
      executingTask = false;
      return;
    }

    // If not on the right page, navigate there
    if (!isCompatiblePage(targetUrl)) {
      await setStorage({
        canRentLahTaskExec: { taskId: task.id, roundIndex: data.currentRound || 0, instIndex: targetIdx, collected: exec.collected || [] },
        canRentLahRedirectCount: redirectCount + 1,
        canRentLahLastUrl: targetUrl,
      });
      renderStatus(`跳转到 ${instructions[targetIdx]?.area || ''} 第${instructions[targetIdx]?.page || 1}页…`);
      window.setTimeout(() => { window.location.href = targetUrl; }, 500);
      executingTask = false;
      return;
    }

    // We're on the right page — collect listings
    await setStorage({ canRentLahRedirectCount: 0 });
    const collected = exec.collected || [];
    const newListings = extractListings();
    for (const l of newListings) {
      if (!collected.find((c) => c.id === l.id)) collected.push(l);
    }
    renderStatus(`${TEXT.collecting}: ${collected.length} · ${instructions[targetIdx]?.area || ''} p${instructions[targetIdx]?.page || 1}`);

    // Check if there are more pages in this round
    const nextIdx = targetIdx + 1;
    if (nextIdx < instructions.length) {
      // Navigate to next instruction
      await setStorage({
        canRentLahTaskExec: { taskId: task.id, roundIndex: data.currentRound || 0, instIndex: nextIdx, collected },
        canRentLahRedirectCount: 0,
      });
      window.setTimeout(() => { window.location.href = instructions[nextIdx].url; }, 800);
      executingTask = false;
      return;
    }

    // All pages in this round done — send to server
    await sendCollectedToServer(task.id, collected, data.currentRound || 0);
    executingTask = false;
  } catch (error) {
    addChat('assistant', `${TEXT.taskFailed}: ${error.message}`);
    renderStatus(`${TEXT.taskFailed}`);
    executingTask = false;
    activeTaskId = null;
    await setStorage({ canRentLahTaskExec: null, canRentLahRedirectCount: 0, canRentLahLastUrl: '' });
  }
}

async function sendCollectedToServer(taskId, collected, roundIndex) {
  renderStatus(`${TEXT.collected} ${collected.length} ${TEXT.listings} · 回传服务器…`);
  const result = await apiPost(`/api/tasks/${taskId}/collect`, { listings: collected, roundIndex });
  await setStorage({ canRentLahTaskExec: null, canRentLahRedirectCount: 0, canRentLahLastUrl: '' });

  if (result.done) {
    renderStatus(`${TEXT.taskComplete} · ${result.task?.totalCollected || collected.length} ${TEXT.listings}`);
    addChat('assistant', `✅ 搜索完成！找到 ${result.task?.totalCollected || collected.length} 个房源。回网站查看 AI 推荐。`);
    activeTaskId = null;
  } else {
    addChat('assistant', `🔍 Agent 要继续搜索：${result.nextRound?.strategy || ''}`);
    activeTaskId = null;
    await fetchAndShowTasks();
  }
}

function isCaptchaPage() {
  // Detect if PropertyGuru is showing a CAPTCHA/verification page
  const body = document.body?.textContent || '';
  const title = document.title || '';
  const hasCaptcha =
    body.includes('captcha') || body.includes('verify you are human') ||
    body.includes('are you a robot') || body.includes('人机验证') ||
    title.includes('captcha') || title.includes('Access Denied') ||
    title.includes('Please verify') ||
    !document.querySelector('script#__NEXT_DATA__') && currentListings.length === 0 && document.querySelectorAll('a[href*="/listing/"]').length === 0;
  return hasCaptcha;
}

function isCompatiblePage(targetUrl) {
  try {
    const current = new URL(location.href);
    return current.hostname.includes('propertyguru.com.sg') &&
           (current.pathname.includes('/property-for-rent') || current.pathname.includes('/rent'));
  } catch { return false; }
}

// ---------------------------------------------------------------------------
// Chat: user types in sidebar → create task on server → Agent handles it
// ---------------------------------------------------------------------------

async function onChatSubmit(event) {
  event.preventDefault();
  const input = document.querySelector('#crl-input');
  const message = input.value.trim();
  if (!message || executingTask) return;
  input.value = '';
  addChat('user', message);

  try {
    addChat('assistant', `⏳ ${TEXT.creatingTask}`);
    const data = await apiPost('/api/tasks', { question: message });

    if (data.needsClarify) {
      // Agent needs more info — show the question
      const chatMsgs = document.querySelectorAll('#crl-chat .crl-msg.assistant');
      if (chatMsgs.length) chatMsgs[chatMsgs.length - 1].remove();
      addChat('assistant', `❓ ${data.question || TEXT.needClarify}`);
      return;
    }

    if (data.answer) {
      // Chat response
      const chatMsgs = document.querySelectorAll('#crl-chat .crl-msg.assistant');
      if (chatMsgs.length) chatMsgs[chatMsgs.length - 1].remove();
      addChat('assistant', data.answer);
      return;
    }

    // Task created — show status and start execution
    const chatMsgs = document.querySelectorAll('#crl-chat .crl-msg.assistant');
    if (chatMsgs.length) chatMsgs[chatMsgs.length - 1].remove();

    const task = data.task;
    addChat('assistant', `📋 任务已创建：**${task.question.slice(0, 60)}**\nAgent 计划：${task.rounds?.[0]?.strategy || '自动搜索'} (${task.rounds?.[0]?.instructionCount || 0} 个搜索指令)`);

    // Start executing
    await fetchAndShowTasks();
  } catch (error) {
    addChat('assistant', `${TEXT.aiFailed}: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Resume: on page load, check if we're mid-execution
// ---------------------------------------------------------------------------

async function resumeTaskExecution() {
  const stored = await getStorage(['canRentLahTaskExec']);
  const exec = stored.canRentLahTaskExec;
  if (!exec || !exec.taskId) return;

  // We were mid-execution — resume from current instruction
  activeTaskId = exec.taskId;
  renderStatus(`继续执行任务…`);

  try {
    const data = await apiGet(`/api/tasks/${exec.taskId}/instructions`);
    const instructions = Array.isArray(data.instructions) ? data.instructions : [];

    if (instructions.length === 0) {
      await setStorage({ canRentLahTaskExec: null });
      renderStatus(`${TEXT.taskComplete}`);
      return;
    }

    // Continue from stored index
    const startIndex = exec.instIndex || 0;
    const collected = Array.isArray(exec.collected) ? exec.collected : [];

    // Collect current page listings
    const newListings = extractListings();
    for (const l of newListings) {
      if (!collected.find((c) => c.id === l.id)) collected.push(l);
    }

    // Remaining instructions
    const remaining = instructions.slice(startIndex + 1);

    if (remaining.length === 0) {
      // This was the last instruction — send results
      const result = await apiPost(`/api/tasks/${exec.taskId}/collect`, {
        listings: collected,
        roundIndex: exec.roundIndex || 0,
      });
      await setStorage({ canRentLahTaskExec: null });

      if (result.done) {
        renderStatus(`${TEXT.taskComplete} · ${result.task?.totalCollected || collected.length} ${TEXT.listings}`);
        addChat('assistant', `✅ Agent 搜索完成！${TEXT.backToSite} 查看 AI 推荐。`);
      } else {
        renderStatus(`Agent: ${result.evaluation?.decision || '继续'}`);
        executingTask = false;
        await fetchAndShowTasks();
      }
    } else {
      // Navigate to next instruction
      await setStorage({
        canRentLahTaskExec: { taskId: exec.taskId, roundIndex: exec.roundIndex || 0, instIndex: startIndex + 1, collected },
      });
      window.setTimeout(() => { window.location.href = remaining[0].url; }, 500);
    }
  } catch (error) {
    addChat('assistant', `${TEXT.taskFailed}: ${error.message}`);
    await setStorage({ canRentLahTaskExec: null });
    activeTaskId = null;
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function refreshAll() {
  currentListings = extractListings();
  renderListings();
  try {
    await ensureSession();
    renderStatus(`${TEXT.detected} ${currentListings.length} ${TEXT.listings} · 已连接`);
    await fetchAndShowTasks();
  } catch (err) {
    renderStatus(`${TEXT.detected} ${currentListings.length} ${TEXT.listings} · ${err.message}`);
    // Retry every 5 seconds until connected
    if (err.message === TEXT.notLoggedIn && !window._crlRetryTimer) {
      window._crlRetryTimer = setInterval(async () => {
        try {
          await ensureSession();
          clearInterval(window._crlRetryTimer);
          window._crlRetryTimer = null;
          await refreshAll();
        } catch { /* keep retrying */ }
      }, 5000);
    }
  }
}

// ---------------------------------------------------------------------------
// Markdown rendering (kept)
// ---------------------------------------------------------------------------

function renderMarkdown(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  const html = [];
  let inList = false;
  function closeList() { if (inList) { html.push('</ul>'); inList = false; } }
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) { closeList(); continue; }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) { closeList(); html.push(`<h${Math.min(heading[1].length + 2, 4)}>${formatInline(heading[2])}</h${Math.min(heading[1].length + 2, 4)}>`); continue; }
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
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

createSidebar();
refreshAll();
resumeTaskExecution();

// Retry a few times in case the page is still loading
window.setTimeout(refreshAll, 1200);
window.setTimeout(refreshAll, 3000);
window.setTimeout(refreshAll, 6500);
