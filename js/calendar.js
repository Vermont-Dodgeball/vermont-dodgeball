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
    calendarId: 'vermontdodgeball@gmail.com',

    // A Google Cloud API key restricted to the Calendar API and to the
    // vtdodgeball.com referrer. This ships in the page and is meant to be
    // public — it only grants read access to an already-public calendar.
    apiKey: 'AIzaSyDxcKzA_xw8pxHQpk1h5ZRBOm-77-4RuFg',

    // Games are scheduled in local Vermont time. Formatting explicitly in
    // this zone keeps the date correct for visitors in other timezones.
    timeZone: 'America/New_York',

    // How many dates to list after the next one.
    upcomingCount: 3,
};

const CALENDAR_PLACEHOLDER = 'REPLACE_WITH_';

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

function renderUpcoming(events) {
    const container = document.getElementById('next-game-upcoming');
    const list = document.getElementById('next-game-upcoming-list');

    list.replaceChildren();

    events.forEach(event => {
        const item = document.createElement('li');
        item.textContent = describeEvent(event);
        list.appendChild(item);
    });

    container.hidden = events.length === 0;
}

function renderNextGame(events) {
    if (events.length === 0) {
        return;
    }

    const whenElement = document.getElementById('next-game-when');
    whenElement.textContent = describeEvent(events[0]);

    // Tells the data/about.json handler not to overwrite this with the
    // static fallback, whichever of the two requests finishes first.
    whenElement.dataset.source = 'calendar';

    renderUpcoming(events.slice(1));

    // The card is normally revealed by the about.json handler; do it here
    // too so real schedule data still shows if that request failed.
    document.getElementById('next-game').hidden = false;
}

function loadCalendar() {
    const { calendarId, apiKey, upcomingCount } = CALENDAR_CONFIG;

    if (calendarId.startsWith(CALENDAR_PLACEHOLDER) || apiKey.startsWith(CALENDAR_PLACEHOLDER)) {
        // Not set up yet — leave the static values in place and stay quiet.
        return;
    }

    const params = new URLSearchParams({
        key: apiKey,
        timeMin: new Date().toISOString(),
        singleEvents: 'true',   // required for orderBy=startTime, and expands recurrences
        orderBy: 'startTime',
        maxResults: String(upcomingCount + 1),
    });

    const endpoint = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`;

    fetch(endpoint)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Request failed with status ${response.status}`);
            }
            return response.json();
        })
        .then(data => renderNextGame(data.items || []))
        .catch(error => console.error('Could not load the game calendar:', error));
}

loadCalendar();
