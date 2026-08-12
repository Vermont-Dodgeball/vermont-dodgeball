/* ---------------------------------------------------------------
   Next Game card, sourced from Google Calendar

   Reads upcoming events from a public Google Calendar and fills in the
   "When" line of the Next Game card, plus a short list of the dates after
   it. If the calendar is unconfigured or unreachable, the card keeps the
   static values from data/about.json, so the page degrades to what it
   showed before this file existed.

   Setup (calendar ID, API key): see docs/calendar-setup.md
   --------------------------------------------------------------- */

const CALENDAR_CONFIG = {
    // The calendar's ID, e.g. "abc123@group.calendar.google.com".
    calendarId: 'ee18b76dc98c4c425806765d127b9a71a3f376616ffc758710d55be684a66225@group.calendar.google.com',

    // A Google Cloud API key restricted to the Calendar API and to the
    // vtdodgeball.com referrer. This ships in the page and is meant to be
    // public — it only grants read access to an already-public calendar.
    apiKey: 'AIzaSyDxcKzA_xw8pxHQpk1h5ZRBOm-77-4RuFg',

    // Games are scheduled in local Vermont time. Formatting explicitly in
    // this zone keeps the date correct for visitors in other timezones.
    timeZone: 'America/New_York',

    // How many dates to list after the next one.
    upcomingCount: 2,

    // Hour (local, 24h) at which a game stops being shown on its own day.
    // Google filters on an event's end time, so without this a game would
    // vanish the moment it finished; holding it until 20:00 keeps a
    // cancellation notice up for anyone checking around game time.
    hideAfterHour: 20,
};

const CALENDAR_PLACEHOLDER = 'REPLACE_WITH_';

// index.html holds the card back until every source has reported in, so it
// appears once rather than filling in piecemeal. The fallback keeps this file
// usable on a page that has no such coordinator.
const cardGate = window.nextGameCard || { populated() {}, settled() {} };

// Event titles starting with one of these mark a night with no dodgeball;
// whatever follows the prefix is shown as the reason. "CANCELLED" is for the
// unforeseen (snow, a closed gym), "NO DODGEBALL" for a planned skip.
// "no game" is tolerated as well: if the wrong habit phrase gets typed, a
// missed match would advertise the night as a normal game, which is the more
// damaging way to be wrong.
const NOT_HAPPENING_PATTERNS = [
    { kind: 'cancelled', label: 'Cancelled', pattern: /^\s*(cancelled|canceled)\b[\s:—–-]*/i },
    { kind: 'skipped', label: 'No dodgeball', pattern: /^\s*(no dodgeball|no game)\b[\s:—–-]*/i },
];

/**
 * All-day events carry a bare "YYYY-MM-DD". Parsing that as UTC and
 * formatting it back in UTC keeps the calendar date intact; treating it as
 * local time would shift it a day for anyone west of Greenwich.
 */
function parseEventStart(event) {
    if (event.start && event.start.dateTime) {
        return { date: new Date(event.start.dateTime), allDay: false };
    }
    return { date: new Date(`${event.start.date}T00:00:00Z`), allDay: true };
}

function formatDay(event, options) {
    const { date, allDay } = parseEventStart(event);
    return new Intl.DateTimeFormat('en-US', {
        ...options,
        timeZone: allDay ? 'UTC' : CALENDAR_CONFIG.timeZone,
    }).format(date);
}

function formatTimeRange(event) {
    if (!event.start || !event.start.dateTime) {
        return '';
    }

    const formatter = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: CALENDAR_CONFIG.timeZone,
    });

    const start = formatter.format(new Date(event.start.dateTime));
    if (!event.end || !event.end.dateTime) {
        return start;
    }

    const end = formatter.format(new Date(event.end.dateTime));

    // "7:00 PM–8:15 PM" reads better as "7:00–8:15 PM".
    const meridiem = end.slice(-3);
    if (start.endsWith(meridiem)) {
        return `${start.slice(0, -3).trim()}–${end}`;
    }
    return `${start}–${end}`;
}

function describeEvent(event) {
    const day = formatDay(event, { weekday: 'long', month: 'long', day: 'numeric' });
    const time = formatTimeRange(event);
    return time ? `${day} · ${time}` : day;
}

/* ---------------------------------------------------------------
   Timezone helpers

   Working out when 8pm falls in Vermont needs the zone's offset at that
   moment, which JavaScript will not give directly. Formatting an instant
   into the zone and reading it back as if it were UTC recovers the offset.
   --------------------------------------------------------------- */

function timeZoneOffsetMs(instant, timeZone) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(instant).reduce((accumulator, part) => {
        accumulator[part.type] = part.value;
        return accumulator;
    }, {});

    const asUtc = Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        Number(parts.hour) % 24,   // some engines render midnight as "24"
        Number(parts.minute),
        Number(parts.second),
    );

    return asUtc - instant.getTime();
}

/** The calendar date an instant falls on, in the given zone. */
function localDateParts(instant, timeZone) {
    const [year, month, day] = new Intl.DateTimeFormat('en-CA', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(instant).split('-');

    return { year: Number(year), month: Number(month), day: Number(day) };
}

/** The instant at which `hour` o'clock arrives on a given local date. */
function zonedInstant({ year, month, day }, hour, timeZone) {
    const naive = Date.UTC(year, month - 1, day, hour);
    // The offset is sampled an hour or so either side of the target, which
    // only matters on a DST boundary — those land at 2am on a Sunday, never
    // on a game night.
    return new Date(naive - timeZoneOffsetMs(new Date(naive), timeZone));
}

/** When this event should stop being shown: `hideAfterHour` on its own day. */
function visibleUntil(event) {
    const { date, allDay } = parseEventStart(event);
    const parts = localDateParts(date, allDay ? 'UTC' : CALENDAR_CONFIG.timeZone);
    return zonedInstant(parts, CALENDAR_CONFIG.hideAfterHour, CALENDAR_CONFIG.timeZone);
}

/**
 * Returns { kind, label, reason } when an event is titled as not happening,
 * otherwise null. The reason may be empty if the editor gave no explanation.
 */
function readCancellation(event) {
    const summary = event.summary || '';

    for (const { kind, label, pattern } of NOT_HAPPENING_PATTERNS) {
        const marker = summary.match(pattern);
        if (marker) {
            return { kind, label, reason: summary.slice(marker[0].length).trim() };
        }
    }

    return null;
}

/** "Cancelled Monday, August 17 — snow" */
function describeCancellation(event) {
    const { label, reason } = readCancellation(event);
    // The start time is noise for a night that isn't happening — day only.
    const day = formatDay(event, { weekday: 'long', month: 'long', day: 'numeric' });
    return reason ? `${label} ${day} — ${reason}` : `${label} ${day}`;
}

/**
 * "Add these dates to your calendar: Google Calendar · Apple or Outlook"
 *
 * Both links are derived from the configured calendar ID so there is one
 * source of truth. The Apple/Outlook link uses the webcal: scheme on purpose:
 * the same URL over https downloads a one-off snapshot, so the subscriber
 * would never see a game added or cancelled afterwards.
 */
function renderSubscribeLinks() {
    const calendarId = encodeURIComponent(CALENDAR_CONFIG.calendarId);
    const container = document.getElementById('next-game-subscribe');

    const google = document.createElement('a');
    google.href = `https://calendar.google.com/calendar/render?cid=${calendarId}`;
    google.textContent = 'Google Calendar';
    google.target = '_blank';
    google.rel = 'noopener noreferrer';

    const subscribe = document.createElement('a');
    subscribe.href = `webcal://calendar.google.com/calendar/ical/${calendarId}/public/basic.ics`;
    subscribe.textContent = 'Apple or Outlook';

    container.replaceChildren('Get these dates in your own calendar: ', google, ' · ', subscribe);
    container.hidden = false;
}

/**
 * Publishes the upcoming games as schema.org SportsEvent data, which lets
 * search engines list them with their date, venue and price rather than just
 * linking the page.
 *
 * Written from the calendar rather than kept in the markup because the dates
 * change. The trade-off is that a crawler only sees it after running the page's
 * JavaScript; the league and venue details in index.html are static for that
 * reason. Emitting these statically would need a build step (see Phase 2 in
 * docs/calendar-integration-plan.md).
 */
function renderEventSchema(events) {
    const previous = document.getElementById('game-schema');
    if (previous) {
        previous.remove();
    }
    if (events.length === 0) {
        return;
    }

    const venue = {
        '@type': 'Place',
        name: 'Robert Miller Community & Recreation Center',
        address: {
            '@type': 'PostalAddress',
            streetAddress: '130 Gosse Court',
            addressLocality: 'Burlington',
            addressRegion: 'VT',
            postalCode: '05408',
            addressCountry: 'US',
        },
    };

    const games = events.map(event => {
        const cancellation = readCancellation(event);
        const start = event.start.dateTime || event.start.date;
        const end = event.end && (event.end.dateTime || event.end.date);

        return {
            '@context': 'https://schema.org',
            '@type': 'SportsEvent',
            name: 'Vermont Dodgeball — Pickup Night',
            description: 'Pickup dodgeball in Burlington. Teams are picked before the game, so no team is needed.',
            startDate: start,
            ...(end ? { endDate: end } : {}),
            // Google shows a cancelled game as cancelled rather than dropping
            // it, which is the same reasoning as keeping it on the page.
            eventStatus: cancellation
                ? 'https://schema.org/EventCancelled'
                : 'https://schema.org/EventScheduled',
            eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
            location: venue,
            organizer: {
                '@type': 'SportsOrganization',
                '@id': 'https://vtdodgeball.com/#club',
                name: 'Vermont Dodgeball',
                url: 'https://vtdodgeball.com/',
            },
            image: 'https://vtdodgeball.com/assets/images/centerpiece.jpg',
            offers: {
                '@type': 'Offer',
                price: '5',
                priceCurrency: 'USD',
                availability: 'https://schema.org/InStock',
                url: 'https://vtdodgeball.com/',
                validFrom: new Date().toISOString().slice(0, 10),
            },
        };
    });

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'game-schema';
    script.textContent = JSON.stringify(games, null, 2);
    document.head.appendChild(script);
}

function renderUpcoming(events) {
    const container = document.getElementById('next-game-upcoming');
    const list = document.getElementById('next-game-upcoming-list');

    list.replaceChildren();

    events.forEach(event => {
        const item = document.createElement('li');
        const cancellation = readCancellation(event);

        if (!cancellation) {
            item.textContent = describeEvent(event);
        } else {
            // Struck-through text alone would not survive a screen reader or
            // a colourblind reader, so the word carries the meaning and the
            // styling only reinforces it.
            const struck = document.createElement('s');
            struck.textContent = describeEvent(event);

            const tag = document.createElement('span');
            tag.className = 'next-game-cancelled-tag';
            tag.textContent = cancellation.reason
                ? `${cancellation.label} — ${cancellation.reason}`
                : cancellation.label;

            item.append(struck, ' ', tag);
        }

        list.appendChild(item);
    });

    container.hidden = events.length === 0;
}

function renderAlerts(cancelledEvents) {
    const container = document.getElementById('next-game-alerts');
    container.replaceChildren();

    cancelledEvents.forEach(event => {
        const alert = document.createElement('p');
        alert.className = 'next-game-alert';
        alert.dataset.kind = readCancellation(event).kind;
        alert.textContent = describeCancellation(event);
        container.appendChild(alert);
    });

    container.hidden = cancelledEvents.length === 0;
}

function renderNextGame(events) {
    if (events.length === 0) {
        return;
    }

    const firstPlayable = events.findIndex(event => !readCancellation(event));

    // Cancellations before the next playable game are the urgent bit — they
    // are what stops someone driving to a locked gym — so they lead.
    renderAlerts(firstPlayable === -1 ? events : events.slice(0, firstPlayable));

    if (firstPlayable === -1) {
        // Everything in range is cancelled. The alerts say so; leave the
        // "When" line on its static fallback rather than inventing a date.
        renderUpcoming([]);
        cardGate.populated();
        return;
    }

    const whenElement = document.getElementById('next-game-when');
    whenElement.textContent = describeEvent(events[firstPlayable]);

    // Tells the data/about.json handler not to overwrite this with the
    // static fallback, whichever of the two requests finishes first.
    whenElement.dataset.source = 'calendar';

    renderUpcoming(events.slice(firstPlayable + 1, firstPlayable + 1 + CALENDAR_CONFIG.upcomingCount));

    // Reports content even if data/about.json failed, so a working schedule
    // still shows on its own.
    cardGate.populated();
}

function loadCalendar() {
    const { calendarId, apiKey, upcomingCount } = CALENDAR_CONFIG;

    if (calendarId.startsWith(CALENDAR_PLACEHOLDER) || apiKey.startsWith(CALENDAR_PLACEHOLDER)) {
        // Not set up yet — leave the static values in place and stay quiet.
        cardGate.settled();
        return;
    }

    // Subscribing only needs the calendar to be public, not this request to
    // succeed, so offer it up front rather than inside the success path.
    renderSubscribeLinks();

    const now = new Date();

    // Ask from the start of today rather than "now", so a game still counts
    // as upcoming after it has finished; visibleUntil() applies the real
    // cutoff below. Cancelled entries and already-played games both eat into
    // the results, so fetch more than we intend to show.
    const params = new URLSearchParams({
        key: apiKey,
        timeMin: zonedInstant(localDateParts(now, CALENDAR_CONFIG.timeZone), 0, CALENDAR_CONFIG.timeZone).toISOString(),
        singleEvents: 'true',   // required for orderBy=startTime, and expands recurrences
        orderBy: 'startTime',
        maxResults: String(upcomingCount + 5),
    });

    const endpoint = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`;

    fetch(endpoint)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Request failed with status ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            const events = (data.items || [])
                .filter(event => event.start)
                .filter(event => now < visibleUntil(event));
            renderNextGame(events);
            renderEventSchema(events);
        })
        .catch(error => console.error('Could not load the game calendar:', error))
        .finally(() => cardGate.settled());
}

loadCalendar();
