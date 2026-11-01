const calendarTimeZone = 'America/Toronto';
const calendarWeekdays = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const calendarEncoder = new TextEncoder();

function getNextServiceDate(weekday, startTime) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: calendarTimeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    const today = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
    const currentWeekday = today.getUTCDay();
    const targetWeekday = calendarWeekdays.indexOf(weekday);
    const [startHour, startMinute] = startTime.split(':').map(Number);
    let daysUntilService = (targetWeekday - currentWeekday + 7) % 7;

    if (daysUntilService === 0
        && Number(values.hour) * 60 + Number(values.minute) >= startHour * 60 + startMinute) {
        daysUntilService = 7;
    }

    today.setUTCDate(today.getUTCDate() + daysUntilService);
    return today.toISOString().slice(0, 10).replaceAll('-', '');
}

function escapeCalendarText(value) {
    return value
        .replace(/\\/g, '\\\\')
        .replace(/\r?\n/g, '\\n')
        .replace(/,/g, '\\,')
        .replace(/;/g, '\\;');
}

function foldCalendarLine(line) {
    const segments = [];
    let segment = '';
    let byteLength = 0;

    for (const character of line) {
        const characterLength = calendarEncoder.encode(character).length;
        if (byteLength + characterLength > 75) {
            segments.push(segment);
            segment = ' ';
            byteLength = 1;
        }
        segment += character;
        byteLength += characterLength;
    }

    segments.push(segment);
    return segments.join('\r\n');
}

function createCalendarFile(link) {
    const { calendarDay, calendarStart, calendarEnd, calendarTitle, calendarDescription, calendarLocation } = link.dataset;
    const date = getNextServiceDate(calendarDay, calendarStart);
    const start = `${date}T${calendarStart.replace(':', '')}00`;
    const end = `${date}T${calendarEnd.replace(':', '')}00`;
    const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const uid = `${crypto.randomUUID()}@jcacbarrie.org`;
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//JCAC Barrie//Church Schedule//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VTIMEZONE',
        'TZID:America/Toronto',
        'X-LIC-LOCATION:America/Toronto',
        'BEGIN:DAYLIGHT',
        'TZOFFSETFROM:-0500',
        'TZOFFSETTO:-0400',
        'TZNAME:EDT',
        'DTSTART:19700308T020000',
        'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
        'END:DAYLIGHT',
        'BEGIN:STANDARD',
        'TZOFFSETFROM:-0400',
        'TZOFFSETTO:-0500',
        'TZNAME:EST',
        'DTSTART:19701101T020000',
        'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
        'END:STANDARD',
        'END:VTIMEZONE',
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${now}`,
        `DTSTART;TZID=${calendarTimeZone}:${start}`,
        `DTEND;TZID=${calendarTimeZone}:${end}`,
        `RRULE:FREQ=WEEKLY;BYDAY=${calendarDay}`,
        `SUMMARY:${escapeCalendarText(calendarTitle)}`,
        `DESCRIPTION:${escapeCalendarText(calendarDescription)}`,
        `LOCATION:${escapeCalendarText(calendarLocation)}`,
        'END:VEVENT',
        'END:VCALENDAR'
    ];

    return new Blob([`${lines.map(foldCalendarLine).join('\r\n')}\r\n`], { type: 'text/calendar;charset=utf-8' });
}

function createGoogleCalendarUrl(link) {
    const { calendarDay, calendarStart, calendarEnd, calendarTitle, calendarDescription, calendarLocation } = link.dataset;
    const date = getNextServiceDate(calendarDay, calendarStart);
    const dates = `${date}T${calendarStart.replace(':', '')}00/${date}T${calendarEnd.replace(':', '')}00`;
    const parameters = new URLSearchParams({
        action: 'TEMPLATE',
        text: calendarTitle,
        dates,
        ctz: calendarTimeZone,
        details: calendarDescription,
        location: calendarLocation,
        recur: `RRULE:FREQ=WEEKLY;BYDAY=${calendarDay}`
    });

    return `https://calendar.google.com/calendar/render?${parameters}`;
}

function isAppleDevice(device = navigator) {
    const userAgent = device.userAgent || '';
    const platform = device.platform || '';
    const isAppleMobile = /iPhone|iPad|iPod/i.test(userAgent);
    const isIPadDesktopMode = platform === 'MacIntel' && device.maxTouchPoints > 1;
    const isMac = /Mac/i.test(platform) || /Macintosh/i.test(userAgent);

    return isAppleMobile || isIPadDesktopMode || isMac;
}

document.querySelectorAll('.calendar-link').forEach(link => {
    try {
        if (isAppleDevice()) {
            link.addEventListener('click', event => {
                event.preventDefault();

                try {
                    const file = createCalendarFile(link);
                    const url = URL.createObjectURL(file);
                    const download = document.createElement('a');
                    const filename = link.dataset.calendarTitle
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, '-')
                        .replace(/^-|-$/g, '');

                    download.href = url;
                    download.download = `${filename}.ics`;
                    document.body.append(download);
                    download.click();
                    download.remove();
                    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
                } catch (error) {
                    console.error('Unable to create the Apple Calendar file.', error);
                    window.alert('The calendar file could not be created. Please try again or contact the church.');
                }
            });
        } else {
            link.href = createGoogleCalendarUrl(link);
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
        }
    } catch (error) {
        console.error('Unable to prepare the calendar link.', error);
        link.addEventListener('click', event => {
            event.preventDefault();
            window.alert('The calendar link could not be created. Please try again or contact the church.');
        });
    }
});
