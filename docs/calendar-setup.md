# Google Calendar setup (Phase 1)

The homepage's **Next Game** card can read real game dates from a Google
Calendar instead of the fixed text in `data/about.json`. This is the setup for
that. It's free — no billing account, no server.

Until the two values in [`js/calendar.js`](../js/calendar.js) are filled in,
the site behaves exactly as it did before: the card shows the static
`nextGame` values from `data/about.json`. Nothing breaks while this is
half-done.

## How it works

The page asks Google for the calendar's upcoming events and uses the first one
for "When", listing the next few dates underneath. It re-reads on every page
load, so the site is never stale.

Only the **When** line comes from the calendar. Where, Cost, and the note stay
in `data/about.json` and remain CMS-editable — the venue rarely changes and
keeping it there preserves the Google Maps link.

## One-time setup

### 1. Make the calendar public

Use an existing Vermont Dodgeball calendar or create one at
[calendar.google.com](https://calendar.google.com).

In **Settings → (your calendar) → Access permissions**, tick **Make available
to public**. Leave the dropdown on *See only free/busy* → change it to **See
all event details**, or the page can read that something exists but not when.

This also lets members subscribe to the calendar directly, which is worth
having regardless.

### 2. Copy the calendar ID

Same settings page, under **Integrate calendar**. It looks like:

```
abc123def456@group.calendar.google.com
```

(For a personal calendar it's just the Gmail address. A dedicated calendar for
the league is tidier than using a personal one.)

### 3. Create an API key

You want an **API key** here — not a service account, and not an OAuth client.

An API key identifies the project rather than a person, and only reaches data
that is already public, which is why it is safe to ship in a page. A service
account is a robot identity with a private key that can be granted *write*
access; putting one in `js/calendar.js` would publish a credential capable of
changing the calendar. Service accounts belong to Phase 2, stored as a secret
on the server side.

1. Go to the [Google Cloud Console](https://console.cloud.google.com) and
   create a project (e.g. `vermont-dodgeball-site`).
2. **APIs & Services → Library** → search **Google Calendar API** → **Enable**.
3. Go to [APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)
   → **+ Create credentials** → **API key**.

   If **API key** isn't in that menu, you're most likely on the adjacent
   **Google Auth Platform** page (formerly "OAuth consent screen"), which only
   creates OAuth clients — use the direct link above. Also check a project is
   selected in the top bar. If you end up in the "Help me choose" wizard,
   answering *Google Calendar API* and *Public data* arrives at an API key.
4. Restrict it — an unrestricted key is the one thing here worth being careful
   about:
   - **Application restrictions → Websites**, add `https://vtdodgeball.com/*`
     (and `https://www.vtdodgeball.com/*` if that resolves).
   - **API restrictions → Restrict key** → select **Google Calendar API**.

The key ends up visible in the page source. That's expected and fine: it grants
read-only access to a calendar that is already public, and the referrer
restriction stops other sites from burning your quota with it.

### 4. Fill in the config

In [`js/calendar.js`](../js/calendar.js), replace the two placeholders:

```js
const CALENDAR_CONFIG = {
    calendarId: 'abc123def456@group.calendar.google.com',
    apiKey: 'AIza...',
    timeZone: 'America/New_York',
    upcomingCount: 3,
};
```

Commit and push. GitHub Pages republishes within about a minute.

### 5. Add some games

Create events on the calendar. A weekly recurring event works — the page
expands recurrences and reads individual dates, so "every Monday until
December" shows up as the correct next date rather than as a single repeating
entry.

Only events **starting in the future** appear; a game in progress or just
finished drops off automatically.

## Cancelling a game, or skipping a week

**Don't delete the event.** Deleting is silent: the site quietly rolls to the
next date, and anyone subscribed to the calendar just sees the entry disappear
with no notice and no explanation. Someone who knows games are weekly can
easily miss that this week's is gone — and end up at a locked gym.

Instead, rename the event. Two prefixes:

| Title | Use for |
| --- | --- |
| `CANCELLED: burst pipe in the gym` | Something unforeseen — snow, a closed gym |
| `NO DODGEBALL: holiday break` | A week you're skipping on purpose |

The reason after the colon is optional (`CANCELLED` on its own works) but it's
the useful part — it tells people whether this is a one-off or the start of a
break. Either spelling of *cancelled* is accepted.

For a **planned** gap, create an event rather than leaving the date empty. An
absent event is invisible; a `NO DODGEBALL` entry actively tells people the
week is off, both on the site and in their own calendar app.

What the site does with them:

- If the **next** date is off, a notice leads the card and the "When" line
  skips to the next date that *is* happening. Cancellations are shown in the
  accent colour; planned skips are muted, since one is news and the other
  isn't.
- A date further out shows in "Also coming up" struck through, labelled
  *Cancelled* or *No dodgeball* with the reason.
- A cancelled game stays on the page until **8:00 PM** that night, so someone
  checking around game time still sees why nothing is happening.

**One rule to keep in mind:** the match is on how the title *starts*. Don't
begin a real game's title with these words — an event called
"No Dodgeball Club social" would be read as a skipped week.

## Troubleshooting

Open the browser console on the homepage — failures are logged there rather
than shown to visitors.

**Card still shows the old static text, nothing in the console.** The config
still has its `REPLACE_WITH_` placeholders, so the fetch is skipped
deliberately. Check step 4 actually got committed and pushed.

**`403` in the console.** Either the calendar isn't public (step 1 — and note
that *free/busy only* is not enough), or the API key's restrictions don't match
the page's origin. If you're testing from a local `python3 -m http.server`, the
referrer restriction will reject it — add `http://localhost:*` to the allowed
websites while testing, and take it back out afterwards.

**`404` in the console.** The calendar ID is wrong. Re-copy it from **Integrate
calendar** — it is not the calendar's display name.

**Loads fine but no dates appear.** There are no upcoming events on the
calendar, or they're all in the past. Add a future event and reload.

**Right date, wrong time.** Events are formatted in `America/New_York`
regardless of where the visitor is. If the calendar's own timezone is set to
something else, the underlying event times are what's off — fix it in Google
Calendar's settings rather than in the site config.

## What this doesn't do yet

Creating calendar events from an uploaded venue rental receipt is Phase 2 —
see [calendar-integration-plan.md](calendar-integration-plan.md). For now,
events are added to the calendar by hand.
