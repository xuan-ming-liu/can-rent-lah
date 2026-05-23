# can-rent-lah-search

Search Singapore properties on PropertyGuru via opencli browser bridge.

## Before you start

Make sure the user has completed the setup flow (`/can-rent-lah-setup`). Run `opencli doctor` to confirm the browser bridge is still connected.

## Understanding the user's needs

When a user asks about finding a place, clarify the following filters before running the search. Ask only what's missing — don't interrogate.

### Key filters to pin down

| Filter | Flag | What to ask |
|--------|------|-------------|
| Location | (positional) | "Which area? Clementi, Jurong, Paya Lebar..." |
| Budget | `--max` | "What's your monthly budget cap?" |
| Bedrooms | `--bedrooms` | "How many bedrooms?" |
| Property type | `--type` | HDB / Condo / Landed / whole unit / room |
| Listing type | `--listing` | Rent (default) or buy |

### Location tips for Singapore students

- **NTU**: Clementi, Jurong West, Boon Lay, Pioneer
- **NUS**: Clementi, Dover, Buona Vista, Pasir Panjang
- **SMU / Kaplan / NAFA**: Bencoolen, Rochor, Little India, Farrer Park
- **SUTD**: Changi, Tampines, Simei

## Running the search

Once you've confirmed at least the location, run:

```bash
opencli propertyguru search "<location>" --max <budget> [--bedrooms N] [--type <type>]
```

## Interpreting results

Present results as a table with the most important columns:

- **Name / Title** → what the listing says
- **Price** → monthly (rent) or total (buy)
- **Location** → district / MRT proximity
- **Bedrooms / Size** → relevant specs
- **URL** → link to full listing

Highlight MRT stations within walking distance — that's the #1 question every student asks. If the listing mentions "walk to MRT" or gives a distance in meters/minutes, call it out.

## Follow-ups

After showing results, the user may want to:

- "Show me only HDB" → re-run with `--type hdb`
- "Under $2000 can?" → re-run with tighter `--max`
- "Any lobang near NTU?" → switch location
- "Open this listing" → the URL is already in the results, open in browser

If results are sparse, suggest broadening the area or increasing the budget slightly.
