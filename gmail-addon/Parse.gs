// Guess an item's title, date, time and place from an email.
// Plain JavaScript with no Apps Script calls, so it can be unit-tested (src/lib/gmailParse.test.ts).
// Dates are read day-first (Singapore style: 12/11/2026 = 12 Nov).

var MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
var MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
var DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function pad2_(n) { return (n < 10 ? '0' : '') + n; }
function ymd_(y, m, d) { return y + '-' + pad2_(m) + '-' + pad2_(d); }
function validDate_(y, m, d) {
  var dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
/** Reference day parts (local wall clock of the received date). */
function refParts_(ref) { return { y: ref.getFullYear(), m: ref.getMonth() + 1, d: ref.getDate(), dow: ref.getDay() }; }
function addDays_(p, n) {
  var dt = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
  return ymd_(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}
/** Without a year: this year, unless that is more than 60 days before the email (then next year). */
function inferYear_(m, d, r) {
  var y = r.y;
  var diff = (Date.UTC(y, m - 1, d) - Date.UTC(r.y, r.m - 1, r.d)) / 86400000;
  return diff < -60 ? y + 1 : y;
}
function fullYear_(y) { return y < 100 ? 2000 + y : y; }

/** Best date in text → { date: 'YYYY-MM-DD', index, end } or null. */
function findDate_(text, ref) {
  var r = refParts_(ref);
  var found = [];
  var m, re;

  re = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
  while ((m = re.exec(text))) if (validDate_(+m[1], +m[2], +m[3])) found.push({ date: ymd_(+m[1], +m[2], +m[3]), index: m.index, end: re.lastIndex });

  re = new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?' + MONTH_RE + '\\.?,?(?:\\s+(\\d{4}))?\\b', 'gi');
  while ((m = re.exec(text))) {
    var mo = MONTHS[m[2].slice(0, 3).toLowerCase()], d = +m[1];
    var y = m[3] ? +m[3] : inferYear_(mo, d, r);
    if (validDate_(y, mo, d)) found.push({ date: ymd_(y, mo, d), index: m.index, end: re.lastIndex });
  }

  re = new RegExp('\\b' + MONTH_RE + '\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4})\\b)?', 'gi');
  while ((m = re.exec(text))) {
    var mo2 = MONTHS[m[1].slice(0, 3).toLowerCase()], d2 = +m[2];
    var y2 = m[3] ? +m[3] : inferYear_(mo2, d2, r);
    if (validDate_(y2, mo2, d2)) found.push({ date: ymd_(y2, mo2, d2), index: m.index, end: re.lastIndex });
  }

  re = /\b(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\b/g;
  while ((m = re.exec(text))) {
    var y3 = fullYear_(+m[3]);
    if (validDate_(y3, +m[2], +m[1])) found.push({ date: ymd_(y3, +m[2], +m[1]), index: m.index, end: re.lastIndex });
  }

  re = /\b(today|tonight|tomorrow)\b/gi;
  while ((m = re.exec(text))) found.push({ date: addDays_(r, /tomorrow/i.test(m[1]) ? 1 : 0), index: m.index, end: re.lastIndex, relative: true });

  re = /\b(?:(next|this|on)\s+)(sun|mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?)(?:day)?\b/gi;
  while ((m = re.exec(text))) {
    var want = DAYS.indexOf(m[2].slice(0, 3).toLowerCase());
    var ahead = (want - r.dow + 7) % 7 || 7; // "next/this/on Friday" = the coming Friday
    found.push({ date: addDays_(r, ahead), index: m.index, end: re.lastIndex, relative: true });
  }

  // Prefer a written date ("5 December") over relative words ("on Saturday", "tomorrow").
  found.sort(function (a, b) { return (a.relative ? 1 : 0) - (b.relative ? 1 : 0) || a.index - b.index; });
  return found[0] || null;
}

function to24_(h, min, mer) {
  h = +h; min = +(min || 0);
  if (mer) {
    var pm = /p/i.test(mer);
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
  }
  if (h > 23 || min > 59) return null;
  return pad2_(h) + ':' + pad2_(min);
}

/** First time (or time range) in text → { time, endTime, index } or null. */
function findTime_(text) {
  var MER = '(a\\.?m\\.?|p\\.?m\\.?)';
  var T = '(\\d{1,2})(?:[:.](\\d{2}))?';
  var best = null, m;
  function take(c) { if (c && c.time && (!best || c.index < best.index)) best = c; }

  // "3-5pm", "3:30 PM – 5 PM", "15:00 - 17:00"
  m = new RegExp('\\b' + T + '\\s*' + MER + '?\\s*(?:-|–|—|to|until|till)\\s*' + T + '\\s*' + MER + '?(?![\\w])', 'i').exec(text);
  if (m && (m[3] || m[6] || (m[2] && m[5]))) {
    var endMer = m[6] || m[3], startMer = m[3] || m[6];
    // "11-1pm": start before noon if pm would put it after the end.
    var s = to24_(m[1], m[2], startMer), e = to24_(m[4], m[5], endMer);
    if (!m[3] && m[6] && s && e && s > e) s = to24_(m[1], m[2], 'am');
    take({ time: s, endTime: e, index: m.index });
  }
  m = new RegExp('\\b' + T + '\\s*' + MER + '(?![\\w])', 'i').exec(text);
  if (m) take({ time: to24_(m[1], m[2], m[3]), endTime: null, index: m.index });
  m = /\b([01]?\d|2[0-3]):([0-5]\d)\b/.exec(text);
  if (m) take({ time: to24_(m[1], m[2], null), endTime: null, index: m.index });
  if (!best) {
    m = /\b(noon|midday)\b/i.exec(text);
    if (m) take({ time: '12:00', endTime: null, index: m.index });
  }
  return best;
}

function cleanTitle_(subject) {
  var t = String(subject || '').replace(/^\s*(?:(?:re|fwd?|fw|aw)\s*:\s*)+/i, '');
  // Google / Outlook invitations: "Invitation: Title @ Thu 12 Nov 2026 3pm - 4pm (SGT) (me@x.com)"
  t = t.replace(/^(?:updated\s+)?invitation(?:\s+from\s+google\s+calendar)?:\s*/i, '');
  t = t.replace(/\s+@\s+.*$/, '');
  return t.trim() || '(no subject)';
}

/**
 * subject, body: email text. received: Date the email arrived (reference for "tomorrow", missing years).
 * Returns { title, date|null, time|null, endTime|null, location }.
 */
function parseEmail(subject, body, received) {
  subject = String(subject || '');
  body = String(body || '').slice(0, 8000);
  var ref = received || new Date();
  var out = { title: cleanTitle_(subject), date: null, time: null, endTime: null, location: '' };

  var d = findDate_(subject, ref), where = subject;
  if (!d) { d = findDate_(body, ref); where = body; }
  if (d) out.date = d.date;

  // Time: in the subject first, else close after the date, else anywhere in the body.
  var t = findTime_(subject);
  if (!t && d) t = findTime_(where.slice(d.index, d.end + 160));
  if (!t) t = findTime_(body);
  if (t) { out.time = t.time; out.endTime = t.endTime; }

  var loc = /(?:^|\n)\s*(?:location|venue|where|address|place)\s*[:\-–]\s*([^\n]{2,200})/i.exec(body);
  if (loc) out.location = loc[1].trim();
  return out;
}
