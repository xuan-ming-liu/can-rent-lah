import Anthropic from '@anthropic-ai/sdk';
import { readProfile, readLog, appendLog } from './profile.mjs';

// ---------------------------------------------------------------------------
// 多 Provider 支持：Anthropic SDK + DeepSeek/OpenAI (OpenAI 兼容 API)
// ---------------------------------------------------------------------------

function getProvider() {
  const provider = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();

  if (provider === 'deepseek') {
    return {
      type: 'deepseek',
      apiKey: process.env.DEEPSEEK_API_KEY || process.env.AI_API_KEY,
      model: process.env.AI_MODEL || 'deepseek-chat',
      url: process.env.AI_BASE_URL || 'https://api.deepseek.com/chat/completions',
    };
  }

  if (provider === 'openai') {
    return {
      type: 'openai',
      apiKey: process.env.OPENAI_API_KEY || process.env.AI_API_KEY,
      model: process.env.AI_MODEL || 'gpt-4.1-mini',
      url: process.env.AI_BASE_URL || 'https://api.openai.com/v1/chat/completions',
    };
  }

  // Anthropic (default)
  return {
    type: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY || process.env.AI_API_KEY,
    model: process.env.AI_MODEL || 'claude-sonnet-4-6',
  };
}

function hasProvider() {
  const p = getProvider();
  return Boolean(p.apiKey);
}

async function chat({ system, messages, maxTokens = 2048 }) {
  const p = getProvider();
  if (!p.apiKey) return null;

  // Anthropic SDK
  if (p.type === 'anthropic') {
    const client = new Anthropic({ apiKey: p.apiKey });
    const response = await client.messages.create({
      model: p.model,
      max_tokens: maxTokens,
      system,
      messages,
    });
    return response.content?.[0]?.text || '';
  }

  // DeepSeek / OpenAI (OpenAI 兼容 API)
  const openAiMessages = [
    { role: 'system', content: system },
    ...messages.map((m) => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : m.content.map((c) => c.text || '').join('\n'),
    })),
  ];

  const response = await fetch(p.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${p.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: p.model,
      messages: openAiMessages,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI request failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

const MODEL = process.env.AI_MODEL || 'claude-sonnet-4-6';

// ---------------------------------------------------------------------------
// School → area mapping
// ---------------------------------------------------------------------------

export const SCHOOL_AREA_MAP = {
  nus: ['clementi', 'dover', 'west coast', 'buona vista', 'kent ridge'],
  ntu: ['jurong west', 'boon lay', 'pioneer', 'lakeside'],
  smu: ['dhoby ghaut', 'bugis', 'city hall', 'rochor', 'bencoolen'],
  sutd: ['tampines', 'upper changi', 'expo', 'simei'],
  sim: ['clementi', 'bukit timah', 'king albert park', 'beauty world'],
  kaplan: ['dhoby ghaut', 'bugis', 'city hall', 'rochor'],
  nafa: ['bugis', 'rochor', 'little india', 'bencoolen'],
  psb: ['dhoby ghaut', 'bugis', 'city hall'],
};

// ---------------------------------------------------------------------------
// Phase 1: 从用户自然语言中提取/补全需求
// ---------------------------------------------------------------------------

export async function understandIntent({ message, profile, logSnippet, currentListings = [] }) {
  const profileText = profile?.exists
    ? `\n用户已有画像:\n${profile.raw.slice(0, 2000)}`
    : '\n用户尚未创建画像。';

  const logText = logSnippet
    ? `\n最近学习日志（最近几轮交互）:\n${logSnippet.slice(0, 1500)}`
    : '';

  const listingContext = currentListings.length
    ? `\n当前 PropertyGuru 页面上已展示 ${currentListings.length} 个房源。用户可能想直接分析这些房源。`
    : '';

  const system = [
    '你是 Can Rent Lah，一个为新加坡留学生服务的租房 AI 助手。',
    '你要像一个熟悉新加坡租房的朋友一样，自然地和用户对话。',
    '',
    '## 核心规则（必须遵守）',
    '1. 预算数字默认就是新币 SGD。绝对不要问"是新币还是人民币"，除非用户自己说了"人民币"。',
    '2. 不要重复问已经回答过的问题。如果对话记录里用户已经说过学校/预算/房型，直接用。',
    '3. 只问真正缺失的关键信息。缺学校就问学校，缺预算就问预算，一次只问一个。',
    '4. 信息齐全（学校+预算+区域）就直接 action=search，不要再确认。',
    '5. 对话要自然，不要像填表。用简洁的口语中文。',
    '6. 预算明显不合理时温和提醒，比如"NUS附近800整租基本不可能"。',
    '',
    '## 学校 → 搜索区域',
    ...Object.entries(SCHOOL_AREA_MAP).map(([school, areas]) =>
      `- ${school.toUpperCase()}: ${areas.join(', ')}`
    ),
    '',
    '## 意图类型',
    '- search: 信息齐全，开始搜索',
    '- clarify: 缺关键信息，追问（一次只问一个）',
    '- chat: 闲聊或咨询',
    '- analyze_current: 分析当前页面房源',
    '',
    '输出严格 JSON，不要 Markdown。',
  ].join('\n');

  const userContent = [
    profileText,
    logText,
    listingContext,
    '',
    message,
    '',
    '重要：请只看「用户最新消息」判断当前意图。',
    '- 最新消息是闲聊（你好/谢谢/在吗）→ action=chat',
    '- 最新消息是找房请求（帮我搜/找/有没有/NUS附近）→ action=search，用历史中的偏好信息补全参数',
    '- 最新消息是对追问的回答（简短回复如"NUS""1700""condo"）→ 结合上文理解，信息齐了就直接 search',
    '- 默认币种 SGD，绝不追问币种',
    '',
    '输出 JSON:',
    '{',
    '  "action": "search | clarify | chat | analyze_current",',
    '  "school": "NUS/NTU/SMU... or null",',
    '  "location": "search area or null",',
    '  "maxPrice": number or null,',
    '  "currency": "SGD",',
    '  "bedrooms": number or null,',
    '  "propertyType": "hdb/condo/hdb-room/studio or null",',
    '  "listing": "rent",',
    '  "question": "追问（action=clarify时，一句话，自然口语）",',
    '  "answer": "回复（action=chat时）",',
    '  "reason": "简短说明"',
    '}',
  ].join('\n');

  const text = await chat({ system, messages: [{ role: 'user', content: userContent }], maxTokens: 1024 });
  if (!text) return fallbackIntent(message);

  const parsed = extractJson(text);
  if (!parsed || typeof parsed !== 'object') return fallbackIntent(message);

  return normalizeIntent(parsed, profile, message);
}

function normaliseIntent(parsed, profile, rawMessage) {
  const intent = {
    action: parsed.action || 'chat',
    school: parsed.school || null,
    location: parsed.location || null,
    maxPrice: typeof parsed.maxPrice === 'number' ? parsed.maxPrice : null,
    minPrice: typeof parsed.minPrice === 'number' ? parsed.minPrice : null,
    currency: parsed.currency || 'SGD',
    bedrooms: typeof parsed.bedrooms === 'number' ? parsed.bedrooms : null,
    propertyType: parsed.propertyType || null,
    listing: parsed.listing || 'rent',
    question: parsed.question || '',
    answer: parsed.answer || '',
    reason: parsed.reason || '',
  };

  // 如果 profile 有学校但 Claude 没解析出来，用 profile 的
  if (!intent.school && profile?.sections) {
    const basics = profile.sections['基础信息'] || [];
    const schoolLine = basics.find((l) => l.includes('学校:') && !l.includes('未填写'));
    if (schoolLine) {
      const match = schoolLine.match(/学校:\s*(\w+)/i);
      if (match) intent.school = match[1].toUpperCase();
    }
  }

  // 强制检测币种
  const raw = String(rawMessage || '').toLowerCase();
  if (/新币|新加坡币|sgd|s\$/i.test(raw)) intent.currency = 'SGD';
  if (/人民币|rmb|cny|¥|￥/i.test(raw)) intent.currency = 'CNY';

  // 从原始消息提取数字预算（灵活匹配）
  const budgetMatch =
    raw.match(/(\d{3,5})\s*(?:新币|新加坡币|sgd|人民币|rmb|cny)/i) ||
    raw.match(/(?:新币|新加坡币|sgd|人民币|rmb|cny)\s*(\d{3,5})/i) ||
    raw.match(/(\d{3,5})\s*(?:以内|以下|不超过|最多|以下|under|below|max|预算)/i) ||
    raw.match(/(?:预算|budget|under|以内|不超过|低于|最多|max)[^\d]{0,12}(\d{3,5})/i) ||
    raw.match(/s?\$\s*(\d{3,5})/i);
  if (budgetMatch && !intent.maxPrice) {
    intent.maxPrice = Number(budgetMatch[1]);
  }

  return intent;
}

// ---------------------------------------------------------------------------
// Phase 2: 规划搜索策略
// ---------------------------------------------------------------------------

export async function planSearchStrategy({ intent, profile, previousRounds = [] }) {
  const areas = expandAreas(intent);
  const pagesPerArea = previousRounds.length > 0 ? 2 : 2;

  const previousSummary = previousRounds.length
    ? `\n前 ${previousRounds.length} 轮搜索结果:\n${previousRounds.map((r, i) =>
        `第${i + 1}轮: 搜了 ${r.strategy || ''}，收集 ${r.collected?.length || 0} 个`
      ).join('\n')}`
    : '';

  const system = [
    '你是 Can Rent Lah 的搜索策略规划器。',
    '根据用户意图和历史搜索结果，规划下一轮搜索。',
    '',
    '## 策略原则',
    '- 首轮从最匹配的区域开始，每个区域翻2页',
    '- 如果首轮结果太少（< 8个），自动扩大搜索区域',
    '- 如果结果太多（> 40个），下一轮收紧条件',
    '- 最多搜3轮，超过3轮用已有数据出结果',
    '- 优先搜离学校最近的区域',
    '',
    '## URL 格式（非常重要）',
    'PropertyGuru 的搜索 URL 格式必须是：',
    'https://www.propertyguru.com.sg/property-for-rent?freetext=<area>&market=residential',
    '可附加参数: &maxprice=<n>&bedrooms=<n>&page=<n>',
    '示例: https://www.propertyguru.com.sg/property-for-rent?freetext=clementi&market=residential&maxprice=1500',
    '不要编造 /singapore/xxx-rooms-for-rent 这种路径。',
    '',
    '## 输出格式',
    '严格输出 JSON，不要 Markdown。',
  ].join('\n');

  const userContent = [
    `用户意图: ${JSON.stringify(intent)}`,
    previousSummary,
    '',
    `已有搜索区域: ${areas.join(', ')}`,
    `每区域翻页: ${pagesPerArea}页`,
    `当前轮次: ${previousRounds.length + 1}`,
    '',
    '输出 JSON:',
    '{',
    '  "strategy": "本轮策略说明（中文一句话）",',
    '  "instructions": [',
    '    {"area": "clementi", "page": 1, "url": "https://www.propertyguru.com.sg/property-for-rent?freetext=clementi&market=residential&maxprice=1500"},',
    '    ...',
    '  ],',
    '  "expectedCount": "预计收集XX个",',
    '  "shouldContinue": true/false',
    '}',
  ].join('\n');

  const text = await chat({ system, messages: [{ role: 'user', content: userContent }], maxTokens: 2048 });
  const parsed = extractJson(text || '');
  if (parsed && parsed.instructions) return parsed;

  return fallbackPlan(intent);
}

function expandAreas(intent) {
  const school = String(intent.school || '').toLowerCase();
  const schoolAreas = SCHOOL_AREA_MAP[school] || [];
  const areas = [intent.location, ...schoolAreas].filter(Boolean);
  return [...new Set(areas)].slice(0, 5);
}

function fallbackPlan(intent) {
  const areas = expandAreas(intent);
  const instructions = areas.flatMap((area) =>
    Array.from({ length: 2 }, (_, i) => {
      const params = new URLSearchParams();
      params.set('market', 'residential');
      params.set('freetext', area);
      if (intent.maxPrice) params.set('maxprice', String(intent.maxPrice));
      if (intent.bedrooms) params.set('bedrooms', String(intent.bedrooms));
      if (intent.propertyType) params.set('property_type_code', intent.propertyType);
      if (i > 0) params.set('page', String(i + 1));
      return {
        area,
        page: i + 1,
        url: `https://www.propertyguru.com.sg/property-for-rent?${params.toString()}`,
      };
    })
  );

  return {
    strategy: `搜索 ${areas.join('、')}，每区2页`,
    instructions,
    expectedCount: '预计收集20-40个',
    shouldContinue: true,
  };
}

// ---------------------------------------------------------------------------
// Phase 3: 评估本轮结果，决定下一步
// ---------------------------------------------------------------------------

export async function evaluateResults({ intent, profile, rounds, allCollected }) {
  const totalRounds = rounds.length;
  const totalCollected = allCollected.length;
  const lastRound = rounds[rounds.length - 1];
  const lastCollected = lastRound?.collected?.length || 0;
  const priceStats = calculatePriceStats(allCollected);

  const system = [
    '你是 Can Rent Lah 的搜索结果评估器。',
    '根据收集到的房源数据，决定下一步行动。',
    '',
    '## 决策规则',
    '- total < 5 且轮次 < 3: expand（扩大区域或放宽条件）',
    '- total 5-15: done（够用了）',
    '- total > 40 且第1轮: tighten（收条件）',
    '- total >= 3 轮: done（已尽力）',
    '- 大部分超预算: 提醒预算偏低 + expand 或 done',
    '',
    '## 输出格式',
    '严格 JSON。',
  ].join('\n');

  const userContent = [
    `用户意图: ${JSON.stringify(intent)}`,
    `已搜轮数: ${totalRounds}`,
    `总共有效房源: ${totalCollected}`,
    `本轮新增: ${lastCollected}`,
    `价格分布: ${JSON.stringify(priceStats)}`,
    '',
    '输出 JSON:',
    '{',
    '  "decision": "expand | tighten | done",',
    '  "reason": "中文解释决策理由",',
    '  "suggestion": "如果expand/tighten，一句话中文建议；如果done，null"',
    '}',
  ].join('\n');

  const text = await chat({ system, messages: [{ role: 'user', content: userContent }], maxTokens: 1024 });
  const parsed = extractJson(text || '');
  if (parsed && parsed.decision) return parsed;

  return fallbackEvaluate(allCollected);
}

function calculatePriceStats(listings) {
  const prices = listings
    .map((l) => {
      const match = String(l.price || '').match(/[\d,]+/);
      return match ? Number(match[0].replace(/,/g, '')) : null;
    })
    .filter(Boolean)
    .sort((a, b) => a - b);

  if (!prices.length) return { min: 0, max: 0, median: 0, count: 0 };

  return {
    min: prices[0],
    max: prices[prices.length - 1],
    median: prices[Math.floor(prices.length / 2)],
    count: prices.length,
  };
}

function fallbackEvaluate(collected) {
  const total = collected.length;
  if (total < 5) return { decision: 'expand', reason: '房源太少', suggestion: '扩大搜索区域或放宽条件' };
  if (total < 15) return { decision: 'done', reason: '房源数量合适', suggestion: null };
  return { decision: 'done', reason: '已有足够房源', suggestion: null };
}

// ---------------------------------------------------------------------------
// Phase 4: 生成最终推荐（🥇🥈🥉）
// ---------------------------------------------------------------------------

export async function generateRecommendations({ intent, profile, logSnippet, collectedListings }) {
  const profileContext = profile?.exists
    ? profile.raw.slice(0, 1500)
    : '无画像。根据预算和学校判断即可。';

  const system = [
    '你是 Can Rent Lah，一个为中国留学生服务的新加坡租房 AI。',
    '你的任务是从收集到的房源中筛选出最值得看的 5 个，用中文排名推荐。',
    '',
    '## 评分标准',
    '- MRT 距离最重要（留学生最看重通勤）',
    '- 预算匹配度',
    '- 房源类型匹配',
    '- 面积合理性',
    '- 挂牌时长（刚上的优先）',
    '- red flag 检测: 没空调、一楼、西晒、"cozy"=很小、无厨房照片、挂太久不租',
    '',
    '## 输出格式',
    '用 Markdown 输出。结构如下：',
    '',
    '## 搜索概况',
    '一句话总结搜索范围、找到多少房源。',
    '',
    '## 🥇 最推荐',
    '（3个最佳选择）每个包括：',
    '- 标题、价格、地址、MRT距离',
    '- **为什么选它**: 2-3句话',
    '- **要注意**: 风险点',
    '- 🔗 链接',
    '',
    '## 🥈 值得考虑',
    '（2个）同上格式',
    '',
    '## 💡 补充建议',
    '1-2句。如果没满意的，建议怎么调整。',
    '',
    '## 规则',
    '- 最多推荐5个',
    '- 不要编造数据',
    '- 中文输出，不要英文',
    '- 不要用复杂表格',
    '- 结尾提示：不满意随时告诉我，我继续帮你搜',
  ].join('\n');

  const userContent = [
    `用户需求: ${JSON.stringify(intent)}`,
    `用户画像:\n${profileContext}`,
    '',
    `收集到的房源 (共${collectedListings.length}个):`,
    JSON.stringify(collectedListings.slice(0, 60), null, 2),
  ].join('\n');

  const text = await chat({ system, messages: [{ role: 'user', content: userContent }], maxTokens: 4096 });
  return text || fallbackRecommend(collectedListings);
}

function fallbackRecommend(listings) {
  if (!listings.length) return '暂未找到符合你条件的房源。试试扩大搜索区域或放宽预算条件？';

  const top = listings.slice(0, 5);
  const lines = [
    `## 搜索结果`,
    '',
    `共找到 ${listings.length} 个房源。以下是最值得看的：`,
    '',
  ];

  top.forEach((l, i) => {
    const emoji = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][i];
    lines.push(`### ${emoji} ${l.title}`);
    lines.push(`- **价格**: ${l.price || '未知'}`);
    lines.push(`- **地址**: ${l.address || '未知'}`);
    if (l.mrt) lines.push(`- **MRT**: ${l.mrt}`);
    if (l.url) lines.push(`- 🔗 [查看房源](${l.url})`);
    lines.push('');
  });

  lines.push('---');
  lines.push('💡 不满意的话告诉我，我继续帮你扩大范围搜。');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Phase 5: 直接将当前页面房源分析给用户（analyze_current）
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Contract review (对应 /check)
// ---------------------------------------------------------------------------

export async function reviewContract({ contractText, profile, listingContext }) {
  const system = [
    '你是 Can Rent Lah 的合同审查专家。',
    '审查新加坡租房合同（TA/LOI），逐条对比新加坡标准实践。',
    '',
    '## 审查重点',
    '🔴 Critical: 缺失外交条款、押金条款不合理、房东可随意终止合同',
    '🟡 Warning: 押金退还周期过长、维修责任不清、访客限制过严',
    '🟢 Pass: 标准条款',
    '',
    '## HDB 专项',
    '- MOP 是否满足、外国人配额、HDB 分租审批',
    '',
    '## Condo 专项',
    '- MCST 规则、设施使用权、维护费',
    '',
    '## 留学生必查',
    '- 外交条款: 必须有，否则 student pass 取消后仍要付租金',
    '- 押金: 1年租约1个月押金，2年2个月，7-14天内退还',
    '- 空调: 日常维护租客付，大修房东付',
    '',
    '## 输出格式',
    '用 Markdown，结构：',
    '## 风险总结',
    '🔴 X个  🟡 X个  🟢 X个',
    '',
    '## 🔴 必须修改',
    '每条款：条款内容、为什么有问题、怎么改',
    '',
    '## 🟡 建议协商',
    '每条款：同上',
    '',
    '## 🟢 标准条款',
    '已通过审查的内容',
    '',
    '## 缺失条款',
    '合同里应该有但没有的',
    '',
    '## 总结',
    '一两句话。不要给法律建议，说「偏离新加坡标准实践」而非「违法」。',
    '中文输出。',
  ].join('\n');

  const userContent = [
    `用户画像: ${profile?.raw?.slice(0, 500) || '无'}`,
    `关联房源: ${listingContext || '无'}`,
    '',
    `合同文本:`,
    contractText.slice(0, 8000),
  ].join('\n');

  const text = await chat({ system, messages: [{ role: 'user', content: userContent }], maxTokens: 4096 });
  return text || '合同审查暂时不可用，请稍后重试。';
}

// ---------------------------------------------------------------------------
// Contact agent (对应 /contact)
// ---------------------------------------------------------------------------

export async function generateContactMessage({ listing }) {
  const system = [
    '你是 Can Rent Lah。生成联系新加坡房产中介的 WhatsApp 消息。',
    '用英文写，简洁直接。包含：自我介绍、感兴趣的房源、询问是否可看房。',
    '输出纯文本，不要引号，不要多余解释。',
  ].join('\n');

  const userContent = [
    '房源信息:',
    `标题: ${listing.title || '未提供'}`,
    `价格: ${listing.price || '未提供'}`,
    `地址: ${listing.address || '未提供'}`,
    listing.mrt ? `MRT: ${listing.mrt}` : '',
    listing.url ? `链接: ${listing.url}` : '',
    '',
    '生成 WhatsApp 联系消息：',
  ].filter(Boolean).join('\n');

  const text = await chat({ system, messages: [{ role: 'user', content: userContent }], maxTokens: 512 });
  if (text) return text;

  // Fallback
  return `Hi, I'm interested in ${listing.title || 'this unit'}${listing.price ? ` (${listing.price})` : ''}${listing.address ? ` at ${listing.address}` : ''}. Is it still available? When can I view? Thanks!`;
}

export async function analyzeCurrentListings({ message, profile, listings }) {
  const system = [
    '你是 Can Rent Lah。用户正在看 PropertyGuru 的房源列表，请你分析这些房源。',
    '根据用户的需求和画像，筛选出最值得看的，指出问题。',
    '规则和推荐格式与搜索推荐一致。',
    '中文输出。',
  ].join('\n');

  const userContent = [
    `用户说: "${message}"`,
    profile?.exists ? `用户画像:\n${profile.raw.slice(0, 1000)}` : '',
    `当前页面房源 (${listings.length}个):`,
    JSON.stringify(listings.slice(0, 30), null, 2),
  ].join('\n');

  const text = await chat({ system, messages: [{ role: 'user', content: userContent }], maxTokens: 4096 });
  return text || fallbackRecommend(listings);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fallbackIntent(message) {
  // 纯规则回退（和现有逻辑一致）
  const text = String(message || '').toLowerCase();
  const school = Object.keys(SCHOOL_AREA_MAP).find((s) => text.includes(s));
  // 匹配预算数字：灵活处理各种表达方式
  // "1500新币以内", "1500 SGD", "预算1500", "1500以下", etc.
  const budgetMatch =
    text.match(/(\d{3,5})\s*(?:新币|新加坡币|sgd|人民币|rmb|cny)/i) ||
    text.match(/(?:新币|新加坡币|sgd|人民币|rmb|cny)\s*(\d{3,5})/i) ||
    text.match(/(\d{3,5})\s*(?:以内|以下|不超过|最多|以下|under|below|max|预算)/i) ||
    text.match(/(?:预算|budget|under|以内|不超过|低于|最多|max)[^\d]{0,12}(\d{3,5})/i) ||
    text.match(/(?:budget|budget is|budget:)\s*(\d{3,5})/i) ||
    text.match(/\$\s*(\d{3,5})/) ||
    text.match(/s\$\s*(\d{3,5})/i);
  const bedroomMatch = text.match(/(\d+)\s*(?:bed|房|卧)/);

  const location = school ? SCHOOL_AREA_MAP[school][0] : '';

  const missing = [];
  if (!location && !school) missing.push('学校或区域');
  if (!budgetMatch) missing.push('预算');
  // Currency defaults to SGD — never ask about it unless user says CNY

  return {
    action: missing.length === 0 ? 'search' : 'clarify',
    school: school ? school.toUpperCase() : null,
    location,
    maxPrice: budgetMatch ? Number(budgetMatch[1]) : null,
    currency: 'SGD',
    bedrooms: bedroomMatch ? Number(bedroomMatch[1]) : null,
    propertyType: null,
    listing: 'rent',
    question: missing.length
      ? `我想确认一下：你的${missing.join('和')}？`
      : '',
    answer: '',
    reason: '规则引擎回退解析',
  };
}

function normalizeIntent(parsed, profile, rawMessage) {
  return normaliseIntent(parsed, profile, rawMessage);
}

function extractJson(text) {
  const raw = String(text || '').trim();
  try { return JSON.parse(raw); } catch {}
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch {}
  return null;
}
