// ---------------------------------------------------------------------------
// Can Rent Lah — Centralized configuration
// Load .env if present, then export every setting from one place.
// Add new env vars here instead of reading process.env directly.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Load .env (optional — won't fail if missing)
// ---------------------------------------------------------------------------

function loadDotEnv(filePath) {
  try {
    const raw = readFileSync(filePath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      // Strip surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env is optional — we still check at startup and warn if API keys missing
  }
}

// Try .env in product/ and project root
loadDotEnv(resolve(rootDir, '.env'));
loadDotEnv(resolve(rootDir, '..', '.env'));

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const config = {
  // Server
  port: Number(process.env.PORT) || 8787,
  nodeEnv: process.env.NODE_ENV || 'development',

  // Directories
  rootDir,
  webDir: resolve(rootDir, 'web'),
  dataDir: resolve(rootDir, 'data'),

  // AI
  aiProvider: (process.env.AI_PROVIDER || 'anthropic').toLowerCase(),
  aiModel: process.env.AI_MODEL || 'claude-sonnet-4-6',
  aiApiKey: process.env.ANTHROPIC_API_KEY || process.env.AI_API_KEY || '',
  aiBaseUrl: process.env.AI_BASE_URL || '',

  // Provider-specific keys
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || process.env.AI_API_KEY || '',
  deepseekApiKey: process.env.DEEPSEEK_API_KEY || process.env.AI_API_KEY || '',
  openaiApiKey: process.env.OPENAI_API_KEY || process.env.AI_API_KEY || '',

  // Activation
  activationCodes: process.env.ACTIVATION_CODES || '',

  // Database
  dbPath: resolve(rootDir, 'data', 'can-rent-lah.db'),
};

// ---------------------------------------------------------------------------
// Startup checks
// ---------------------------------------------------------------------------

export function checkConfig() {
  const warnings = [];
  const { aiProvider, aiApiKey, anthropicApiKey, deepseekApiKey, openaiApiKey } = config;

  if (aiProvider === 'anthropic' && !anthropicApiKey) {
    warnings.push('⚠ ANTHROPIC_API_KEY not set — AI features will use fallback responses');
  } else if (aiProvider === 'deepseek' && !deepseekApiKey) {
    warnings.push('⚠ DEEPSEEK_API_KEY not set — AI features will use fallback responses');
  } else if (aiProvider === 'openai' && !openaiApiKey) {
    warnings.push('⚠ OPENAI_API_KEY not set — AI features will use fallback responses');
  } else if (!aiApiKey) {
    warnings.push('⚠ No AI API key configured — AI features will use fallback responses');
  }

  return { ok: warnings.length === 0, warnings };
}
