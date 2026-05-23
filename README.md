# can-rent-lah 🏠🇸🇬

> Can rent lah, don't worry.

AI-powered Singapore property search CLI. Built on [opencli](https://github.com/jackwener/opencli). For international students and anyone hunting for a roof in the Little Red Dot.

```
$ opencli propertyguru search "clementi" --max 3000 --bedrooms 2 -f json
```

## What?

opencli makes any website a CLI. `can-rent-lah` adds a PropertyGuru adapter so your AI agent can search Singapore properties — MRT proximity, HDB vs Condo, budget filters, the works.

Chope your dream home from the terminal. Can or not? **Can.**

## Quick start

```bash
# 1. Install opencli
npm install -g @jackwener/opencli

# 2. Verify browser bridge
opencli doctor

# 3. Install the PropertyGuru adapter
mkdir -p ~/.opencli/clis/propertyguru
cp cli/propertyguru/search.js ~/.opencli/clis/propertyguru/search.js

# 4. Search!
opencli propertyguru search "clementi" --max 3000 --bedrooms 2 --type hdb -f json
```

## Commands

### `propertyguru search <location> [options]`

| Flag | Description |
|------|-------------|
| `<location>` | Area, district, or MRT station (required) |
| `--max <n>` | Max monthly rent (SGD) |
| `--min <n>` | Min monthly rent (SGD) |
| `--bedrooms <n>` | Number of bedrooms |
| `--type <type>` | hdb, condo, apartment, landed, semi-d, terraced, detached, bungalow, executive-condo, walk-up, studio |
| `--listing <type>` | `rent` (default) or `sale` |
| `--limit <n>` | Max results (default 20) |

### Example

```bash
# NTU student: 2br HDB near Clementi under $3000
opencli propertyguru search "clementi" --max 3000 --bedrooms 2 --type hdb -f json

# SMU student: 1br condo near Bencoolen under $3500
opencli propertyguru search "bencoolen" --max 3500 --bedrooms 1 --type condo -f json
```

## Agent Skills

| Skill | What |
|-------|------|
| `/can-rent-lah-setup` | Walk through opencli install + adapter setup |
| `/can-rent-lah-search` | Guide agent to search properties, interpret results, handle follow-ups |

## How it works

PropertyGuru is a Next.js SSR site. The adapter navigates to the search URL with query parameters, then extracts listing data from `window.__NEXT_DATA__` — no API key, no scraping fragile DOM selectors.

## Why "can-rent-lah"?

"Can" is Singlish for "yes/possible". "Lah" is the quintessential Singapore sentence particle. Say them together and you've already chope'd your dream rental.

---

Can or not? Can.
