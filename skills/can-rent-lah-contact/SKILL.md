# /contact

Manage communication with agents for target properties. Help the user track what questions to ask, extract agent contact info, draft WhatsApp messages, and record responses. Everything stored locally per listing so nothing gets lost.

## When to activate

- User finished `/rough-screening` and picked properties they like
- User says "I want to contact this agent" / "帮我联系中介" / "what should I ask?"
- User wants to check status of properties they're pursuing

## The target list

Every property the user is serious about gets a file at `targets/<id>.md`. This is the single source of truth for that listing.

### Creating a target

When the user picks a listing from rough-screening results, create `targets/<id>.md`:

```markdown
# <title> — S$<price>/mo

- **URL**: <url>
- **Status**: new
- **Saved**: <YYYY-MM-DD>

## Listing Snapshot

(from the search/detail data)

| Field | Value |
|-------|-------|
| Price | S$2,500 /mo |
| Type | HDB Flat, 2br, 722 sqft |
| MRT | 9 min to Clementi |
| Address | 308 Clementi Avenue 4 |
| Availability | Ready to move |

## Agent Contact

| Field | Value |
|-------|-------|
| Name | Robin Phua |
| Mobile | +6584874492 |
| CEA | R022517J / L3008899K |
| WhatsApp | yes |
| Phone | yes |

## Communication Log

(entries appended below — newest first)
```

### Status states

| Status | Meaning |
|--------|---------|
| `new` | Just saved, not contacted yet |
| `contacted` | First message sent |
| `replied` | Agent responded |
| `viewing_scheduled` | Viewing date confirmed |
| `viewed` | Seen the unit |
| `negotiating` | Discussing price/terms |
| `offer_made` | LOI submitted or about to |
| `secured` | Deposit paid / TA signed |
| `rejected` | Not moving forward |
| `gone` | Already rented to someone else |

Update the status at the top of the file whenever it changes.

## Phase 1: Extract agent contact info

For each target listing, run:

```bash
opencli propertyguru contact <id> -f json
```

This returns agent name, mobile number, CEA license, WhatsApp availability, and phone availability. Write this into the target file's Agent Contact section.

If `hasWhatsapp: true`, the agent can be reached on WhatsApp. This is the preferred channel in Singapore — agents expect it.

## Phase 2: Identify information gaps

For each listing, work with the user to figure out what they NEED to know before viewing. Common gaps:

### Always ask

- [ ] Still available? (many listings are stale)
- [ ] When can view?
- [ ] Minimum lease period?
- [ ] Agent fee for tenant? (should be NO for HDB)

### If not clear from listing

- [ ] Aircon in every room?
- [ ] Furnished or unfurnished? What's included?
- [ ] Can cook? (light cooking vs full cooking)
- [ ] Landlord staying or whole unit?
- [ ] Utilities included or separate?
- [ ] West sun? (afternoon heat)
- [ ] Any renovation planned?
- [ ] Why is previous tenant leaving?
- [ ] Negotiable on price?

### HDB-specific

- [ ] Foreigner quota available for this block?
- [ ] MOP fulfilled? (Minimum Occupation Period)
- [ ] Any restrictions on visitors/stay-over?

### Condo-specific

- [ ] Facilities fully accessible? (some condos restrict certain facilities)
- [ ] Maintenance fee included in rent?

Add these as a checklist to the target file:

```markdown
## Questions to Ask

- [ ] Still available?
- [ ] Agent fee for tenant?
- [ ] Aircon in all rooms?
- [ ] Can cook?
- [ ] ...
```

Check them off as answers come in.

## Phase 3: Draft the first message

Generate a WhatsApp message for the agent. Use the contact info extracted earlier.

### Message template (English)

```
Hi <agent name>,

I'm interested in the <property type> at <address> (listed at S$<price>/mo).

Is it still available? When can I view?

A few quick questions:
- <question 1>
- <question 2>

Thanks!

- <user name>
```

### Message template (Chinese, if the agent is Chinese-speaking)

```
Hi <agent name>，

我对 <address> 的 <property type> 感兴趣（S$<price>/mo）。

还available吗？什么时候可以看房？

几个问题：
- <question 1>
- <question 2>

谢谢！

- <user name>
```

### Sending the message

Once the user approves the draft, construct the WhatsApp URL:

```
https://wa.me/<mobile>?text=<url-encoded message>
```

Open it with `open` (macOS) or tell the user to click the link. The message opens in WhatsApp Web or the desktop app.

For multiple listings, draft one message per agent. If the same agent handles multiple listings the user is interested in, mention all of them in one message.

## Phase 4: Track responses

After the user sends a message, update the target file:

```markdown
### <YYYY-MM-DD HH:MM> — Initial enquiry sent

**Message**:
Hi Robin Phua, I'm interested in the HDB at 308 Clementi Avenue 4...

**Response**: (pending)
```

When the agent replies, update:

```markdown
**Response** (<YYYY-MM-DD HH:MM>):
> Still available. Viewing this Saturday 2pm. No agent fee. Aircon in living room only, not bedrooms.
```

Update the status at top of file (new → contacted → replied).

Check off answers in the Questions to Ask checklist.

## Phase 5: Follow-up management

If agent doesn't reply in 24-48 hours:

```markdown
### <YYYY-MM-DD HH:MM> — Follow-up

**Message**:
Hi, just following up — is the unit still available? Thanks!
```

If the user viewed the unit, add viewing notes:

```markdown
### <YYYY-MM-DD HH:MM> — Viewing

**Impressions**:
- Unit is older than photos suggest
- Actual walk to MRT is more like 12 min, not 9
- Kitchen is smaller than expected
- Aircon only in master bedroom, not second bedroom
- Neighbor is renovating (noise)

**Decision**: Leaning yes but want to see 2 more units first.
```

## Phase 6: Compare and decide

When the user has multiple targets at similar stages, offer to compare them side by side. Pull the target files and present a comparison table:

| | #1 Clementi | #2 Jurong | #3 Dover |
|---|---|---|---|
| Price | $2,500 | $2,200 | $2,800 |
| MRT | 9 min | 15 min | 5 min |
| Aircon | Partial | All rooms | All rooms |
| Agent replied | Yes ✓ | No (2 days) | Yes ✓ |
| Viewing | Sat 2pm | TBD | Sun 11am |

Don't decide for the user — but make the trade-offs visible.

## Important rules

- **One target file per listing.** Never merge listings into one file.
- **The log inside each target file is append-only.** Don't rewrite history.
- **Don't send messages without user approval.** Draft first, ask, then send.
- **MRT distance is always relevant.** Remind the user if the agent's claimed distance differs from the listing data.
- **CEA license is public info.** You can verify agents on CEA's public register if something feels off.
- **If agent asks for money before viewing, flag it.** This is a common scam.
