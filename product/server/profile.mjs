import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const profilesDir = path.join(rootDir, 'data', 'profiles');
const logsDir = path.join(rootDir, 'data', 'logs');

function toSlug(email) {
  return String(email || '').toLowerCase().trim().replace(/[^a-z0-9@._-]/g, '-');
}

// ---------------------------------------------------------------------------
// Profile (对应 /onboard)
// ---------------------------------------------------------------------------

export async function readProfile(email) {
  const file = path.join(profilesDir, `${toSlug(email)}.md`);
  if (!existsSync(file)) return { email, exists: false, sections: {} };
  return {
    email,
    exists: true,
    raw: await readFile(file, 'utf8'),
    sections: parseSections(await readFile(file, 'utf8')),
  };
}

export async function writeProfile(email, profileData) {
  await mkdir(profilesDir, { recursive: true });
  const file = path.join(profilesDir, `${toSlug(email)}.md`);

  const now = new Date().toISOString();
  const p = profileData || {};

  const content = [
    `# ${email} 的租房画像`,
    '',
    `> 生成: ${now}`,
    `> 更新: ${now}`,
    '',
    '## 基础信息',
    '',
    `- 学校: ${p.school || '未填写'}`,
    `- 预算: ${p.budget ? `S$${p.budget}/月` : '未填写'}（${p.budgetType || 'rent-only'}）`,
    `- 入住时间: ${p.moveInTimeline || '未填写'}`,
    `- 室友: ${p.flatmates || '无'}`,
    '',
    '## 偏好',
    '',
    `- 房源类型: ${p.propertyType || '未限制'}`,
    `- 首选区域: ${(p.preferredAreas || []).join('、') || '未填写'}`,
    `- 家具: ${p.furnished || '未限制'}`,
    `- 做饭: ${p.cooking || '未限制'}`,
    `- 访客: ${p.guests || '未限制'}`,
    `- 噪音: ${p.noiseTolerance || '未限制'}`,
    '',
    '## 雷区（绝对不能接受的）',
    '',
    ...(p.dealbreakers && p.dealbreakers.length
      ? p.dealbreakers.map((d) => `- ${d}`)
      : ['- 无']),
    '',
    '## 补充信息',
    '',
    p.notes || '无',
  ].join('\n');

  await writeFile(file, content);
  return content;
}

// ---------------------------------------------------------------------------
// Learning log (追加式)
// ---------------------------------------------------------------------------

export async function readLog(email, maxLines = 100) {
  const file = path.join(logsDir, `${toSlug(email)}.md`);
  if (!existsSync(file)) return '';
  const raw = await readFile(file, 'utf8');
  const lines = raw.split('\n');
  if (lines.length <= maxLines) return raw;
  return '...(earlier entries omitted)\n\n' + lines.slice(-maxLines).join('\n');
}

export async function appendLog(email, entry) {
  await mkdir(logsDir, { recursive: true });
  const file = path.join(logsDir, `${toSlug(email)}.md`);

  if (!existsSync(file)) {
    await writeFile(file, '# 学习日志\n\n> 每次 Agent 交互追加一条记录，不删除不修改。\n\n---\n');
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const entryText = [
    `## ${now} — ${entry.summary || '无标题'}`,
    '',
    entry.context ? `### 上下文\n${entry.context}\n` : '',
    entry.decisions ? `### 本次决策\n${entry.decisions}\n` : '',
    entry.feedback ? `### 用户反馈\n${entry.feedback}\n` : '',
    entry.learnings ? `### 新发现\n${entry.learnings}\n` : '',
    '---',
    '',
  ].filter(Boolean).join('\n');

  const existing = await readFile(file, 'utf8');
  await writeFile(file, existing + entryText);
  return entryText;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseSections(markdown) {
  const sections = {};
  let current = '';
  const lines = markdown.split('\n');
  for (const line of lines) {
    const h2 = line.match(/^## (.+)$/);
    if (h2) {
      current = h2[1].trim();
      sections[current] = [];
    } else if (current) {
      sections[current].push(line);
    }
  }
  return sections;
}
