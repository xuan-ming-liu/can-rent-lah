/* ==========================================================================
   Can Rent Lah — Chrome Extension Content Script
   GSAP-powered sidebar + listing extraction + task execution
   ========================================================================== */

// Ensure GSAP is loaded (injected via manifest content_scripts before this file)
if (typeof gsap === 'undefined') {
  console.warn('[CanRentLah] GSAP not loaded — animations disabled');
}

// ==========================================================================
// Text Dictionary
// ==========================================================================

const TEXT = {
  requestFailed: '请求失败',
  notLoggedIn: '请先在 Can Rent Lah 工作台登录，插件会自动同步账号。',
  loading: '正在读取当前页面...',
  refresh: '刷新',
  refreshTitle: '重新读取当前页房源',
  placeholder: '直接说需求，Agent 会创建搜索任务',
  ask: '发送',
  empty: '当前页面还没有识别到房源。可以滚动页面后刷新，或等待页面加载完成。',
  save: '收藏',
  saved: '已收藏',
  saveFailed: '收藏失败',
  detected: '识别到',
  listings: '个房源',
  aiFailed: 'AI 调用失败',
  genericListing: 'PropertyGuru 房源',
  listing: '房源',
  taskPending: '待执行任务',
  collecting: '正在采集',
  collected: '已采集',
  taskComplete: '任务完成',
  taskFailed: '任务执行失败',
  backToSite: '回工作台看结果',
  creatingTask: '正在创建任务...',
  needClarify: '需要补充信息',
  checkSite: '请回工作台查看 AI 推荐',
};

// ==========================================================================
// Storage Helpers
// ==========================================================================

function getStorage(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function setStorage(values) {
  return new Promise((resolve) => chrome.storage.local.set(values, resolve));
}

// ==========================================================================
// API Wrapper
// ==========================================================================

function callApi(method, path, body) {
  return new Promise(async (resolve, reject) => {
    const stored = await getStorage(['canRentLahToken', 'apiBase']);
    if (!stored.canRentLahToken) {
      reject(new Error(TEXT.notLoggedIn));
      return;
    }
    const apiBase = stored.apiBase;
    if (!apiBase) {
      reject(new Error('请先在 Can Rent Lah 工作台登录，插件会自动同步连接信息'));
      return;
    }
    chrome.runtime.sendMessage(
      {
        type: 'api-request',
        url: `${apiBase}${path}`,
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${stored.canRentLahToken}`,
        },
        body: body || undefined,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response?.ok) {
          reject(new Error(response?.data?.error || TEXT.requestFailed));
          return;
        }
        resolve(response.data);
      }
    );
  });
}

const apiGet = (path) => callApi('GET', path);
const apiPost = (path, body) => callApi('POST', path, body);

// ==========================================================================
// GSAP Animation Presets (safe wrapper for GSAP absence)
// ==========================================================================

const animate = {
  fadeUp(el, opts = {}) {
    if (typeof gsap === 'undefined') { el.style.opacity = '1'; return; }
    return gsap.fromTo(el, { opacity: 0, y: opts.y || 10 }, { opacity: 1, y: 0, duration: opts.duration || 0.35, delay: opts.delay || 0, ease: 'power3.out' });
  },

  fadeIn(el, opts = {}) {
    if (typeof gsap === 'undefined') { el.style.opacity = '1'; return; }
    return gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: opts.duration || 0.3, delay: opts.delay || 0, ease: 'power2.out' });
  },

  slideRight(el, opts = {}) {
    if (typeof gsap === 'undefined') { el.style.opacity = '1'; return; }
    return gsap.fromTo(el, { opacity: 0, x: opts.x || 16 }, { opacity: 1, x: 0, duration: opts.duration || 0.35, delay: opts.delay || 0, ease: 'power3.out' });
  },

  staggerChildren(parent, selector, opts = {}) {
    if (typeof gsap === 'undefined') {
      if (parent) parent.querySelectorAll(selector).forEach((el) => { el.style.opacity = '1'; });
      return;
    }
    return gsap.fromTo(parent.querySelectorAll(selector),
      { opacity: 0, y: opts.y || 10 },
      { opacity: 1, y: 0, stagger: opts.stagger || 0.05, duration: opts.duration || 0.35, ease: 'power3.out', clearProps: 'transform' }
    );
  },

  shake(el) {
    if (typeof gsap === 'undefined') return;
    return gsap.fromTo(el, { x: -6 }, { x: 6, duration: 0.06, repeat: 3, yoyo: true, ease: 'power2.inOut', clearProps: 'x' });
  },

  pulse(el) {
    if (typeof gsap === 'undefined') return;
    return gsap.fromTo(el, { scale: 1 }, { scale: 1.04, duration: 0.15, yoyo: true, repeat: 1, ease: 'power2.inOut', clearProps: 'scale' });
  },

  sidebarEntrance(el) {
    if (typeof gsap === 'undefined') { el.style.opacity = '1'; return; }
    return gsap.fromTo(el,
      { opacity: 0, x: 40, scale: 0.96 },
      { opacity: 1, x: 0, scale: 1, duration: 0.5, ease: 'power3.out' }
    );
  },

  itemExit(el, callback) {
    if (typeof gsap === 'undefined') { el.remove(); if (callback) callback(); return; }
    return gsap.to(el, { opacity: 0, x: 30, height: 0, paddingTop: 0, paddingBottom: 0, marginTop: 0, marginBottom: 0, duration: 0.25, ease: 'power2.in', onComplete: () => { el.remove(); if (callback) callback(); } });
  },
};

// ==========================================================================
// Data Extraction
// ==========================================================================

function valueToText(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    return String(value.pretty || value.text || value.value || value.label || value.name || '');
  }
  return '';
}

function parseNextData() {
  const script = document.querySelector('script#__NEXT_DATA__');
  if (!script?.textContent) return [];
  try {
    const data = JSON.parse(script.textContent);
    const direct = parseOpenCliListingsData(data);
    if (direct.length) return direct;
    return findListingObjects(data);
  } catch {
    return [];
  }
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
    const unitType = features.find((feature) => feature?.dataAutomationId === 'listing-card-v2-unit-type');
    results.push({
      id: valueToText(ld.id || ld.listingId || ld.url),
      title: valueToText(ld.localizedTitle || ld.title || ld.fullAddress),
      price: valueToText(ld.price),
      bedrooms: valueToText(ld.bedrooms),
      bathrooms: valueToText(ld.bathrooms),
      floorArea: valueToText(ld.floorArea),
      propertyType: valueToText(unitType?.text),
      address: valueToText(ld.fullAddress || ld.localizedTitle || ld.address),
      mrt: valueToText(ld.mrt?.nearbyText),
      availability: valueToText(ld.availabilityInfo),
      postedDate: valueToText(ld.postedOn?.text),
      url: valueToText(ld.url) || (ld.id ? `https://www.propertyguru.com.sg/listing/${ld.id}` : location.href),
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
    if (['price', 'priceText', 'rentalPrice', 'displayPrice', 'formattedPrice'].some((key) => keys.has(key))) score += 2;
    if (['title', 'name', 'address', 'headline'].some((key) => keys.has(key))) score += 2;
    if (['url', 'prettyUrl', 'id', 'listingId'].some((key) => keys.has(key))) score += 1;
    if (['bedrooms', 'beds', 'bathrooms', 'floorArea', 'floorSize'].some((key) => keys.has(key))) score += 1;
    return score;
  }
  function walk(value, depth) {
    if (!value || depth > 12 || found.length > 80 || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, depth + 1));
      return;
    }
    const listing = value.listing && typeof value.listing === 'object' ? value.listing : value;
    if (scoreObject(listing) >= 4) {
      const normalized = normalizeListing(listing);
      if (normalized) found.push(normalized);
    }
    Object.values(value).forEach((child) => walk(child, depth + 1));
  }
  walk(root, 0);
  return dedupe(found);
}

function normalizeListing(item) {
  const rawUrl = valueToText(item.url || item.prettyUrl || item.href);
  const title = valueToText(item.title || item.name || item.address || item.headline);
  const price = valueToText(item.price || item.priceText || item.rentalPrice || item.displayPrice || item.formattedPrice || item.monthlyRent);
  const address = valueToText(item.address || item.location || item.streetName || item.district || item.region);
  if (!title && !price && !address) return null;
  return {
    id: valueToText(item.id || item.listingId || rawUrl || title),
    title: title || address || TEXT.genericListing,
    price,
    address,
    bedrooms: valueToText(item.bedrooms || item.beds || item.roomType),
    bathrooms: valueToText(item.bathrooms || item.baths),
    floorArea: valueToText(item.floorArea || item.floorSize || item.area),
    mrt: valueToText(item.mrt?.nearbyText || item.mrt),
    url: rawUrl ? new URL(rawUrl, location.origin).href : location.href,
    source: 'propertyguru',
    capturedAt: new Date().toISOString(),
  };
}

function parseDomCards() {
  const selectors = ['[data-testid*="listing"]', '.listing-card-root', '[class*="listing-card"]', 'article'].join(',');
  const cards = [...document.querySelectorAll(selectors)].slice(0, 40);
  return dedupe(cards.map((card, index) => {
    const link = card.querySelector('a[href*="/property-for-"], a[href*="/listing/"]');
    const title = String(link?.textContent || card.querySelector('h1, h2, h3, [class*="title"]')?.textContent || '').trim();
    const price = String(card.querySelector('[da-id="lc-price"], [class*="price"]')?.textContent || '').trim();
    if (!link && !price) return null;
    return {
      id: link?.href || `${location.href}#dom-${index}`,
      title: title || `${TEXT.listing} ${index + 1}`,
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
  for (const listing of listings) {
    const key = listing.url || listing.id || `${listing.title}-${listing.price}-${listing.address}`;
    if (!map.has(key)) map.set(key, listing);
  }
  return [...map.values()];
}

function extractListings() {
  const fromNext = parseNextData();
  return fromNext.length ? fromNext : parseDomCards();
}

// ==========================================================================
// Sidebar DOM
// ==========================================================================

let currentListings = [];
let executingTask = false;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function createSidebar() {
  if (document.querySelector('#can-rent-lah-sidebar')) return;
  const root = document.createElement('aside');
  root.id = 'can-rent-lah-sidebar';
  root.style.opacity = '0';
  root.innerHTML = `
    <div class="crl-header">
      <div>
        <strong>Can Rent Lah</strong>
        <span id="crl-status">${TEXT.loading}</span>
      </div>
      <button id="crl-refresh" type="button" title="${TEXT.refreshTitle}">${TEXT.refresh}</button>
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

  // Animate sidebar entrance
  animate.sidebarEntrance(root);

  root.querySelector('#crl-refresh').addEventListener('click', refreshAll);
  root.querySelector('#crl-form').addEventListener('submit', onChatSubmit);
}

// ==========================================================================
// Render Functions
// ==========================================================================

function renderStatus(text) {
  const el = document.querySelector('#crl-status');
  if (el) {
    if (typeof gsap !== 'undefined') {
      gsap.to(el, { opacity: 0, duration: 0.12, onComplete: () => {
        el.textContent = text;
        gsap.to(el, { opacity: 1, duration: 0.15 });
      } });
    } else {
      el.textContent = text;
    }
  }
}

function formatInline(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

function renderMarkdown(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  const html = [];
  let inList = false;
  const closeList = () => { if (inList) { html.push('</ul>'); inList = false; } };
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) { closeList(); continue; }
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

function addChat(role, text) {
  const chat = document.querySelector('#crl-chat');
  if (!chat) return;
  const item = document.createElement('div');
  item.className = `crl-msg ${role}`;
  item.innerHTML = role === 'assistant' ? renderMarkdown(text) : escapeHtml(text);
  item.style.opacity = '0';
  chat.append(item);

  // Animate in
  const fromX = role === 'user' ? 20 : -16;
  if (typeof gsap !== 'undefined') {
    gsap.fromTo(item, { opacity: 0, x: fromX, y: 8 }, { opacity: 1, x: 0, y: 0, duration: 0.3, ease: 'power3.out' });
  } else {
    item.style.opacity = '1';
  }

  chat.scrollTop = chat.scrollHeight;
}

function renderListings() {
  const box = document.querySelector('#crl-listings');
  if (!box) return;
  box.innerHTML = '';
  if (!currentListings.length) {
    const emptyEl = document.createElement('div');
    emptyEl.textContent = TEXT.empty;
    emptyEl.style.padding = '12px';
    emptyEl.style.textAlign = 'center';
    box.append(emptyEl);
    return;
  }

  for (const listing of currentListings.slice(0, 10)) {
    const row = document.createElement('div');
    row.className = 'crl-listing';
    row.style.opacity = '0';
    row.innerHTML = `
      <strong>${escapeHtml(listing.title)}</strong>
      <span>${escapeHtml([listing.price, listing.address].filter(Boolean).join(' · '))}</span>
      <button type="button">${TEXT.save}</button>
    `;
    row.querySelector('button').addEventListener('click', async () => {
      try {
        await apiPost('/api/listings/save', { listing });
        addChat('assistant', `${TEXT.saved}: **${listing.title}**`);
      } catch (error) {
        addChat('assistant', `${TEXT.saveFailed}: ${error.message}`);
      }
    });
    box.append(row);
  }

  // Staggered entrance
  animate.staggerChildren(box, '.crl-listing', { stagger: 0.04, y: 8 });
}

function renderTaskBar(tasks) {
  const bar = document.querySelector('#crl-tasks');
  if (!bar) return;
  if (!tasks?.length) {
    if (!bar.classList.contains('hidden')) {
      if (typeof gsap !== 'undefined') {
        gsap.to(bar, { opacity: 0, y: -8, duration: 0.2, ease: 'power2.in', onComplete: () => {
          bar.classList.add('hidden');
          bar.innerHTML = '';
          bar.style.opacity = '';
          bar.style.transform = '';
        } });
      } else {
        bar.classList.add('hidden');
        bar.innerHTML = '';
      }
    }
    return;
  }

  bar.innerHTML = `
    <div class="crl-tasks-head">
      <strong>${TEXT.taskPending}</strong>
      <span>${tasks.length} 个</span>
    </div>
    ${tasks.slice(0, 3).map((task) => {
      const reason = task.intent?.reason || '';
      const strategy = task.rounds?.[task.currentRound || 0]?.strategy || '';
      return `
      <div class="crl-task-item" style="opacity:0">
        <div class="crl-task-question">${escapeHtml(task.question.slice(0, 86))}${task.question.length > 86 ? '...' : ''}</div>
        ${reason ? `<div class="crl-task-reason">💭 ${escapeHtml(reason)}</div>` : ''}
        <div class="crl-task-actions">
          ${strategy ? `<span class="crl-task-strategy">${escapeHtml(strategy)}</span>` : ''}
          <button class="crl-task-open-btn" data-url="${escapeHtml(buildSearchUrl(task))}" type="button">打开搜索页</button>
        </div>
        <div class="crl-task-meta">
          <span>${task.status === 'searching' ? '执行中' : '等待执行'}</span>
          <span>${task.totalCollected || 0} 个房源</span>
          <span>第 ${(task.currentRound || 0) + 1} 轮</span>
        </div>
      </div>
    `}).join('')}
  `;

  if (bar.classList.contains('hidden')) {
    bar.classList.remove('hidden');
    if (typeof gsap !== 'undefined') {
      gsap.fromTo(bar, { opacity: 0, y: -6 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power3.out' });
    }
  }

  // Bind open-page buttons
  bar.querySelectorAll('.crl-task-open-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.open(btn.dataset.url, '_blank', 'noreferrer');
    });
  });

  // Animate task items in
  animate.staggerChildren(bar, '.crl-task-item', { stagger: 0.06, y: 6 });
}

function buildSearchUrl(task) {
  if (!task) return 'https://www.propertyguru.com.sg/property-for-rent';
  const intent = task.intent || {};
  const location = intent.location || '';
  const maxPrice = intent.maxPrice ? `&maxprice=${intent.maxPrice}` : '';
  return location
    ? `https://www.propertyguru.com.sg/property-for-rent?freetext=${encodeURIComponent(location)}${maxPrice}`
    : 'https://www.propertyguru.com.sg/property-for-rent';
}

// ==========================================================================
// Task Execution
// ==========================================================================

async function fetchAndShowTasks() {
  try {
    const waiting = await apiGet('/api/tasks?status=waiting_search');
    const searching = await apiGet('/api/tasks?status=searching');
    const active = [...(waiting.tasks || []), ...(searching.tasks || [])];
    renderTaskBar(active);
    if (active.length && !executingTask) await executeTaskInstructions(active[0]);
    return active;
  } catch {
    return [];
  }
}

function isCaptchaPage() {
  const body = document.body?.textContent?.toLowerCase() || '';
  const title = document.title?.toLowerCase() || '';
  return body.includes('captcha') ||
    body.includes('verify you are human') ||
    body.includes('are you a robot') ||
    title.includes('captcha') ||
    title.includes('access denied') ||
    title.includes('please verify') ||
    title.includes('just a moment');
}

function isCompatiblePage() {
  try {
    const current = new URL(location.href);
    return current.hostname.includes('propertyguru.com.sg') &&
      (current.pathname.includes('/property-for-rent') || current.pathname.includes('/rent'));
  } catch {
    return false;
  }
}

async function executeTaskInstructions(task) {
  if (executingTask) return;
  executingTask = true;
  try {
    const data = await apiGet(`/api/tasks/${task.id}/instructions`);
    const instructions = Array.isArray(data.instructions) ? data.instructions : [];
    if (!instructions.length) {
      renderStatus(TEXT.taskComplete);
      executingTask = false;
      return;
    }

    if (isCaptchaPage()) {
      addChat('assistant', 'PropertyGuru 正在要求人机验证。请手动完成验证，然后点击侧边栏"刷新"。');
      renderStatus('等待人机验证');
      executingTask = false;
      return;
    }

    const stored = await getStorage(['canRentLahTaskExec', 'canRentLahRedirectCount', 'canRentLahLastUrl']);
    const exec = stored.canRentLahTaskExec || {};
    const currentIndex = exec.taskId === task.id ? (exec.instIndex || 0) : 0;
    const target = instructions[currentIndex];
    const redirectCount = stored.canRentLahRedirectCount || 0;

    if (!isCompatiblePage() || (target?.url && !sameSearchPage(target.url))) {
      if (redirectCount > 8) {
        addChat('assistant', '跳转次数过多，已暂停。请手动打开 PropertyGuru 或完成验证后再刷新。');
        await setStorage({ canRentLahTaskExec: null, canRentLahRedirectCount: 0, canRentLahLastUrl: '' });
        executingTask = false;
        return;
      }
      await setStorage({
        canRentLahTaskExec: { taskId: task.id, roundIndex: data.currentRound || 0, instIndex: currentIndex, collected: exec.collected || [] },
        canRentLahRedirectCount: redirectCount + 1,
        canRentLahLastUrl: target?.url || '',
      });
      renderStatus(`跳转到 ${target?.area || '搜索页'} 第 ${target?.page || 1} 页`);
      window.setTimeout(() => { window.location.href = target.url; }, 450);
      executingTask = false;
      return;
    }

    await setStorage({ canRentLahRedirectCount: 0 });
    const collected = Array.isArray(exec.collected) ? exec.collected : [];
    const pageListings = extractListings();
    for (const listing of pageListings) {
      if (!collected.find((item) => item.id === listing.id || item.url === listing.url)) collected.push(listing);
    }
    renderStatus(`${TEXT.collecting}: ${collected.length} 个 · ${target?.area || ''} p${target?.page || 1}`);

    const nextIndex = currentIndex + 1;
    if (nextIndex < instructions.length) {
      await setStorage({
        canRentLahTaskExec: { taskId: task.id, roundIndex: data.currentRound || 0, instIndex: nextIndex, collected },
        canRentLahRedirectCount: 0,
      });
      window.setTimeout(() => { window.location.href = instructions[nextIndex].url; }, 750);
      executingTask = false;
      return;
    }

    await sendCollectedToServer(task.id, collected, data.currentRound || 0);
    executingTask = false;
  } catch (error) {
    addChat('assistant', `${TEXT.taskFailed}: ${error.message}`);
    renderStatus(TEXT.taskFailed);
    await setStorage({ canRentLahTaskExec: null, canRentLahRedirectCount: 0, canRentLahLastUrl: '' });
    executingTask = false;
  }
}

function sameSearchPage(targetUrl) {
  try {
    const target = new URL(targetUrl);
    return location.hostname === target.hostname && location.pathname === target.pathname;
  } catch {
    return true;
  }
}

async function sendCollectedToServer(taskId, collected, roundIndex) {
  renderStatus(`${TEXT.collected} ${collected.length} 个房源，正在回传...`);
  const result = await apiPost(`/api/tasks/${taskId}/collect`, { listings: collected, roundIndex });
  await setStorage({ canRentLahTaskExec: null, canRentLahRedirectCount: 0, canRentLahLastUrl: '' });

  if (result.done) {
    renderStatus(`${TEXT.taskComplete} · ${result.task?.totalCollected || collected.length} 个房源`);
    addChat('assistant', `搜索完成，找到 ${result.task?.totalCollected || collected.length} 个房源。请回 Can Rent Lah 工作台查看 AI 推荐。`);
  } else {
    addChat('assistant', `Agent 会继续扩大搜索：${result.nextRound?.strategy || '下一轮搜索'}`);
    await fetchAndShowTasks();
  }
}

// ==========================================================================
// Chat Form
// ==========================================================================

async function onChatSubmit(event) {
  event.preventDefault();
  const input = document.querySelector('#crl-input');
  const message = input.value.trim();
  if (!message || executingTask) return;
  input.value = '';
  addChat('user', message);

  try {
    addChat('assistant', TEXT.creatingTask);
    const data = await apiPost('/api/tasks', { question: message });

    // Remove "creating task..." message
    const chat = document.querySelector('#crl-chat');
    const msgs = chat.querySelectorAll('.crl-msg.assistant');
    msgs.forEach((node) => {
      if (node.textContent === TEXT.creatingTask) {
        if (typeof gsap !== 'undefined') {
          gsap.to(node, { opacity: 0, duration: 0.2, onComplete: () => node.remove() });
        } else {
          node.remove();
        }
      }
    });

    if (data.needsClarify) {
      addChat('assistant', data.question || TEXT.needClarify);
      return;
    }
    if (data.answer) {
      addChat('assistant', data.answer);
      return;
    }
    if (data.task) {
      const round = data.task.rounds?.[0] || {};
      const intent = data.task.intent || {};
      const searchUrl = intent.location
        ? `https://www.propertyguru.com.sg/property-for-rent?freetext=${encodeURIComponent(intent.location)}${intent.maxPrice ? `&maxprice=${intent.maxPrice}` : ''}`
        : 'https://www.propertyguru.com.sg/property-for-rent';
      addChat('assistant', `任务已创建：**${data.task.question.slice(0, 70)}**\n\n搜索策略：${round.strategy || '自动搜索'}\n搜索页面：${round.instructionCount || round.instructions?.length || 0} 个\n\n<a href="${searchUrl}" target="_blank" style="display:inline-block;padding:5px 10px;background:#0b6f63;color:white;border-radius:6px;text-decoration:none;font-weight:600">打开 PropertyGuru</a>`);
      await fetchAndShowTasks();
    }
  } catch (error) {
    addChat('assistant', `${TEXT.aiFailed}: ${error.message}`);
  }
}

// ==========================================================================
// Resume + Refresh
// ==========================================================================

async function resumeTaskExecution() {
  const stored = await getStorage(['canRentLahTaskExec']);
  if (!stored.canRentLahTaskExec?.taskId) return;
  renderStatus('继续执行上次任务...');
  await fetchAndShowTasks();
}

async function refreshAll() {
  currentListings = extractListings();
  renderListings();
  try {
    await getStorage(['canRentLahToken']).then((stored) => {
      if (!stored.canRentLahToken) throw new Error(TEXT.notLoggedIn);
    });
    renderStatus(`${TEXT.detected} ${currentListings.length} ${TEXT.listings} · 已连接`);
    await fetchAndShowTasks();
  } catch (error) {
    renderStatus(`${TEXT.detected} ${currentListings.length} ${TEXT.listings} · ${error.message}`);
  }
}

// ==========================================================================
// Boot
// ==========================================================================

createSidebar();
refreshAll();
resumeTaskExecution();

// Delayed re-scans for late-loading content
window.setTimeout(refreshAll, 1200);
window.setTimeout(refreshAll, 3000);
window.setTimeout(refreshAll, 6500);
