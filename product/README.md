# Can Rent Lah Product MVP

This is the first product scaffold for turning `can-rent-lah` into:

- a Chrome extension sidebar on PropertyGuru
- a web dashboard for login, chat, saved listings, and contract review
- a small Node backend for auth, activation-code placeholders, AI chat, and saved listings

## Run locally

```bash
cd can-rent-lah/product
npm run dev
```

Open:

```text
http://localhost:8787
```

If port `8787` is already in use:

```bash
PORT=8790 npm run dev
```

Open:

```text
http://localhost:8790
```

## Load the Chrome extension

1. Open `chrome://extensions`
2. Enable Developer mode
3. Load unpacked
4. Select `can-rent-lah/product/extension`
5. Log in at `http://localhost:8787`
6. Open a PropertyGuru page

## Environment

Optional:

```bash
OPENAI_API_KEY=...
ACTIVATION_CODES=DEMO-PRO-2026,RENTLAH-TEST
PORT=8787
```

Without `OPENAI_API_KEY`, the backend returns a local demo answer.
