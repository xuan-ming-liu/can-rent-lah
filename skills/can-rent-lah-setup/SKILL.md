# can-rent-lah-setup

Guide the user through setting up opencli and registering the PropertyGuru CLI adapter.

## Prerequisites check

Before anything else, verify the user has the foundational pieces in place.

### 1. opencli installed

Check if `opencli` is in PATH. If not, guide the user:

```bash
npm install -g @jackwener/opencli
```

### 2. opencli doctor — all green

Run `opencli doctor` and confirm:

- Daemon: running
- Extension: connected
- At least one Chrome profile connected

If the extension is not connected, tell the user to install the opencli Browser Bridge Chrome extension and link it.

### 3. Chrome logged into PropertyGuru

Ask the user to open Chrome, navigate to https://www.propertyguru.com.sg, and log in (or confirm they are already logged in).

### 4. Register the can-rent-lah CLI

The PropertyGuru CLI adapter lives in `<repo>/cli/propertyguru/`. Register it with opencli:

```bash
opencli external install <path-to-can-rent-lah>/cli/propertyguru
```

After registration, verify with:

```bash
opencli help | grep propertyguru
```

## Once everything is green

Confirm to the user: "Can already! You're ready to search. Try `/can-rent-lah-search` to start hunting."
