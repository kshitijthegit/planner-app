// Planner — Gmail add-on. Shows an "Add to Planner" panel beside an open email (Gmail web + Android app).
// It reads only the email you have open, guesses title/date/time (Parse.gs), and sends what you confirm
// to your planner using the access key from Settings → Gmail add-on. Setup: see README.md in this folder.

var DEFAULT_URL = 'https://planner-app.plannerkj.workers.dev';
var GREEN = '#133B2D';

// ---------- settings ----------
function cfg_() {
  var p = PropertiesService.getUserProperties();
  return { url: (p.getProperty('url') || DEFAULT_URL).replace(/\/+$/, ''), key: p.getProperty('key') || '' };
}

function api_(method, path, body) {
  var c = cfg_();
  var opts = { method: method, muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + c.key } };
  if (body) { opts.contentType = 'application/json'; opts.payload = JSON.stringify(body); }
  var res = UrlFetchApp.fetch(c.url + path, opts);
  var data = {};
  try { data = JSON.parse(res.getContentText() || '{}'); } catch (e) { /* not JSON */ }
  if (res.getResponseCode() >= 300) throw new Error(data.error || 'Planner replied ' + res.getResponseCode());
  return data;
}

function settingsCard_(message) {
  var c = cfg_();
  var s = CardService.newCardSection()
    .addWidget(CardService.newTextParagraph().setText(
      message || 'Paste the access key from your planner: <b>Settings → Gmail add-on → Make access key</b>.'))
    .addWidget(CardService.newTextInput().setFieldName('key').setTitle('Access key').setHint(c.key ? 'Saved — paste a new one to replace it' : 'pk_…'))
    .addWidget(CardService.newTextInput().setFieldName('url').setTitle('Planner address').setValue(c.url))
    .addWidget(CardService.newTextButton().setText('Save').setTextButtonStyle(CardService.TextButtonStyle.FILLED)
      .setBackgroundColor(GREEN).setOnClickAction(CardService.newAction().setFunctionName('saveSettings')));
  return CardService.newCardBuilder().setHeader(CardService.newCardHeader().setTitle('Planner settings')).addSection(s).build();
}

function saveSettings(e) {
  var fi = (e.commonEventObject && e.commonEventObject.formInputs) || {};
  var p = PropertiesService.getUserProperties();
  var key = val_(fi, 'key'), url = val_(fi, 'url');
  if (key) p.setProperty('key', key.trim());
  if (url) p.setProperty('url', url.trim());
  var msg;
  try { api_('get', '/api/capture/meta'); msg = 'Connected ✓ Open an email to add it.'; }
  catch (err) { msg = 'Not connected: ' + err.message; }
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText(msg))
    .setNavigation(CardService.newNavigation().updateCard(settingsCard_(msg)))
    .build();
}

function onSettings() {
  return CardService.newUniversalActionResponseBuilder().displayAddOnCards([settingsCard_()]).build();
}

// ---------- home (no email open) ----------
function onHomepage() {
  if (!cfg_().key) return settingsCard_();
  var s = CardService.newCardSection()
    .addWidget(CardService.newTextParagraph().setText('Open an email to add it to your planner as an event or task.'))
    .addWidget(CardService.newTextButton().setText('Open Planner').setOpenLink(CardService.newOpenLink().setUrl(cfg_().url)));
  return CardService.newCardBuilder().setHeader(CardService.newCardHeader().setTitle('Planner')).addSection(s).build();
}

// ---------- email open ----------
function onGmailMessage(e) {
  if (!cfg_().key) return settingsCard_();
  GmailApp.setCurrentMessageAccessToken(e.gmail.accessToken);
  var msg = GmailApp.getMessageById(e.gmail.messageId);
  var guess = parseEmail(msg.getSubject(), msg.getPlainBody(), msg.getDate());
  var meta;
  try { meta = api_('get', '/api/capture/meta'); }
  catch (err) { return settingsCard_('Couldn’t reach your planner: ' + err.message); }
  return formCard_(guess, meta, e.gmail.threadId);
}

function formCard_(g, meta, threadId) {
  var kind = CardService.newSelectionInput().setType(CardService.SelectionInputType.RADIO_BUTTON).setFieldName('kind').setTitle('Add as')
    .addItem('Event', 'event', !!g.date).addItem('Task', 'task', !g.date);

  var area = CardService.newSelectionInput().setType(CardService.SelectionInputType.DROPDOWN).setFieldName('area').setTitle('Area');
  meta.areas.forEach(function (a, i) { area.addItem(a.name, a.id, i === 0); });

  var names = {};
  meta.areas.forEach(function (a) { names[a.id] = a.name; });
  var cat = CardService.newSelectionInput().setType(CardService.SelectionInputType.DROPDOWN).setFieldName('category').setTitle('Sub-category (optional)');
  cat.addItem('None', '', true);
  meta.categories.forEach(function (c) { cat.addItem((names[c.area_id] || '') + ' · ' + c.name, c.id, false); });

  var main = CardService.newCardSection()
    .addWidget(kind)
    .addWidget(CardService.newTextInput().setFieldName('title').setTitle('Title').setValue(g.title))
    .addWidget(area)
    .addWidget(cat);

  var when = CardService.newCardSection().setHeader(g.date ? 'When (found in the email — check it)' : 'When (no date found)');
  var datePicker = CardService.newDatePicker().setFieldName('date').setTitle('Date');
  if (g.date) datePicker.setValueInMsSinceEpoch(Date.parse(g.date + 'T00:00:00Z'));
  when.addWidget(datePicker);
  when.addWidget(CardService.newSelectionInput().setType(CardService.SelectionInputType.CHECK_BOX).setFieldName('notime')
    .addItem('All day / no time', 'yes', !g.time));
  var start = CardService.newTimePicker().setFieldName('start').setTitle('Start');
  if (g.time) start.setHours(+g.time.slice(0, 2)).setMinutes(+g.time.slice(3, 5));
  when.addWidget(start);
  var end = CardService.newTimePicker().setFieldName('end').setTitle('End (events)');
  if (g.endTime) end.setHours(+g.endTime.slice(0, 2)).setMinutes(+g.endTime.slice(3, 5));
  when.addWidget(end);
  when.addWidget(CardService.newTextInput().setFieldName('location').setTitle('Location').setValue(g.location || ''));
  when.addWidget(CardService.newTextInput().setFieldName('notes').setTitle('Notes').setMultiline(true));

  var go = CardService.newCardSection().addWidget(
    CardService.newTextButton().setText('Add to Planner').setTextButtonStyle(CardService.TextButtonStyle.FILLED).setBackgroundColor(GREEN)
      .setOnClickAction(CardService.newAction().setFunctionName('addItem').setParameters({ threadId: threadId || '' })));

  return CardService.newCardBuilder().setHeader(CardService.newCardHeader().setTitle('Add to Planner'))
    .addSection(main).addSection(when).addSection(go).build();
}

function val_(fi, name) {
  var f = fi[name];
  return f && f.stringInputs && f.stringInputs.value && f.stringInputs.value.length ? f.stringInputs.value[0] : '';
}
function hhmm_(t) { return (t.hours < 10 ? '0' : '') + t.hours + ':' + (t.minutes < 10 ? '0' : '') + t.minutes; }

function addItem(e) {
  var fi = e.commonEventObject.formInputs || {};
  var noTime = val_(fi, 'notime') === 'yes';
  var body = {
    kind: val_(fi, 'kind') || 'event',
    title: val_(fi, 'title'),
    area_id: val_(fi, 'area') || null,
    category_id: val_(fi, 'category') || null,
    location: val_(fi, 'location'),
    notes: val_(fi, 'notes'),
    all_day: noTime,
  };
  if (fi.date && fi.date.dateInput) body.date = new Date(fi.date.dateInput.msSinceEpoch).toISOString().slice(0, 10);
  if (!noTime && fi.start && fi.start.timeInput) body.time = hhmm_(fi.start.timeInput);
  if (!noTime && fi.end && fi.end.timeInput) body.end_time = hhmm_(fi.end.timeInput);
  var thread = e.commonEventObject.parameters && e.commonEventObject.parameters.threadId;
  if (thread) body.link = 'https://mail.google.com/mail/u/0/#all/' + thread;

  var text;
  try {
    if (!body.title) throw new Error('Add a title');
    if (body.kind === 'event' && !body.date) throw new Error('Pick a date for the event');
    api_('post', '/api/capture', body);
    text = (body.kind === 'task' ? 'Task' : 'Event') + ' added ✓';
  } catch (err) {
    return CardService.newActionResponseBuilder().setNotification(CardService.newNotification().setText(err.message)).build();
  }
  var done = CardService.newCardBuilder().setHeader(CardService.newCardHeader().setTitle(text))
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newTextParagraph().setText('<b>' + body.title + '</b>' + (body.date ? '<br>' + body.date + (body.time ? ' · ' + body.time : '') : '')))
      .addWidget(CardService.newTextButton().setText('Open Planner').setOpenLink(CardService.newOpenLink().setUrl(cfg_().url))))
    .build();
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText(text))
    .setNavigation(CardService.newNavigation().updateCard(done))
    .build();
}
