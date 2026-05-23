# can-rent-lah-search

Search Singapore properties on PropertyGuru via opencli browser bridge.

## Before you start

Make sure setup is complete (`/can-rent-lah-setup`). Verify the bridge is alive:

```bash
opencli doctor
```

## Command reference

```bash
opencli propertyguru search <location> [options]
```

### Arguments

| Flag | Type | Description |
|------|------|-------------|
| `<location>` | positional (required) | Area, district, MRT station, or address. e.g. "clementi", "jurong west", "paya lebar" |
| `--max <n>` | int | Maximum monthly rent in SGD |
| `--min <n>` | int | Minimum monthly rent in SGD |
| `--bedrooms <n>` | int | Number of bedrooms |
| `--type <type>` | string | Property type: hdb, condo, apartment, landed, semi-d, terraced, detached, bungalow, executive-condo, walk-up, studio |
| `--listing <type>` | string | `rent` (default) or `sale` |
| `--limit <n>` | int | Max results (default 20) |

### Output format

Always use `-f json` for machine-readable output. Columns:

`id`, `title`, `price`, `bedrooms`, `bathrooms`, `floorArea`, `propertyType`, `address`, `mrt`, `availability`, `postedDate`, `url`

## Understanding the user's needs

When a user asks about finding a place, clarify the following. Ask only what's missing — don't interrogate.

### Key filters to pin down

| Filter | What to ask |
|--------|-------------|
| Location | "Which area? Clementi, Jurong, Paya Lebar, Woodlands..." |
| Budget | "What's your monthly budget cap?" |
| Bedrooms | "How many bedrooms?" |
| Property type | "HDB? Condo? Don't mind?" |

### Location tips for Singapore students

| School | Good areas |
|--------|------------|
| **NTU** | Clementi, Jurong West, Boon Lay, Pioneer |
| **NUS** | Clementi, Dover, Buona Vista, Pasir Panjang, Kent Ridge |
| **SMU / Kaplan / NAFA / LASALLE** | Bencoolen, Rochor, Little India, Farrer Park, Bugis |
| **SUTD** | Changi, Tampines, Simei, Bedok |
| **SIT@Punggol** | Punggol, Sengkang |

## Running the search

Once location is confirmed, run the search:

```bash
opencli propertyguru search "<location>" --max <budget> --bedrooms <n> --limit 10 -f json
```

### Example searches

```bash
# NTU student: 2br HDB near Clementi under $3000
opencli propertyguru search "clementi" --max 3000 --bedrooms 2 --type hdb -f json

# SMU student: 1br condo near Bencoolen under $3500
opencli propertyguru search "bencoolen" --max 3500 --bedrooms 1 --type condo -f json

# NUS student: any type near Dover under $2500
opencli propertyguru search "dover" --max 2500 --limit 10 -f json
```

## Interpreting results

Present results clearly. For each listing highlight:

1. **Price** — monthly rent
2. **Location + MRT** — the `mrt` field shows walking distance to nearest station. This is the #1 question every student asks.
3. **Property type** — HDB vs Condo vs Landed
4. **Floor area** — in sqft
5. **Availability** — "Ready to Move" vs specific date
6. **URL** — link to full listing with photos and agent contact

Format as a readable table or list. Always call out MRT proximity first.

## Follow-ups

After showing results, common next steps:

- "Only HDBs" → re-run with `--type hdb`
- "Under $2000 can?" → tighten `--max`
- "Near NTU got what?" → switch location to "clementi" or "jurong west"
- "Show me this one" → open the `url` in browser
- "Any cheaper ones?" → sort manually by price from results, or lower `--max`

If results are sparse (0-3), suggest broadening: remove `--type`, raise `--max`, or try a nearby area.

## Notes

- PropertyGuru shows 20 results per page (SSR). The adapter extracts from `__NEXT_DATA__` — no API key needed.
- The site does NOT require login for browsing, but being logged in avoids occasional Cloudflare challenges.
- If results seem unfiltered (wrong price/location), verify the parameter names: `freetext` for location, `maxprice`/`minprice` for price filters.
