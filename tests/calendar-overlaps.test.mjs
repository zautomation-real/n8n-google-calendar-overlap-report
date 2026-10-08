import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const workflow = JSON.parse(await readFile(new URL('../google-calendar-overlap-report.json', import.meta.url), 'utf8'));
const code = workflow.nodes.find(node => node.name === 'Find timed appointment overlaps')?.parameters.jsCode;
assert.equal(typeof code, 'string', 'The published workflow must contain its overlap analyser');
const defaultConfig = { demo_mode: true, report_timezone: 'Europe/Madrid', max_report_pairs: 25 };
const run = (events, override = {}) => {
  const context = { $input: { all: () => events.map(json => ({ json })) },
    $: name => { assert.equal(name, 'Configure calendar and report'); return { first: () => ({ json: { ...defaultConfig, ...override } }) }; },
    Intl, Date, Set, Number, String, Object, Error,
  };
  return vm.runInNewContext(`(() => { ${code}\n })()`, context, { timeout: 1000 })[0].json;
};
const event = (id, start, end, extra = {}) => ({ id, summary: id, start: { dateTime: start }, end: { dateTime: end }, ...extra });
const a = event('A', '2026-10-04T10:00:00+02:00', '2026-10-04T11:00:00+02:00');
const b = event('B', '2026-10-04T10:30:00+02:00', '2026-10-04T11:30:00+02:00');
const cases = [];
const check = (name, fn) => { fn(); cases.push({ name, passed: true }); };
check('empty calendar produces a clear report without an email alert', () => {
  const result = run([{}]); assert.equal(result.checkedEvents, 0); assert.equal(result.needsAttention, false);
});
check('partial overlap has the correct intersection', () => {
  const result = run([a, b]); assert.equal(result.conflictCount, 1);
  assert.equal(result.pairs[0].overlapStart, '2026-10-04T08:30:00.000Z');
  assert.equal(result.pairs[0].overlapEnd, '2026-10-04T09:00:00.000Z');
});
check('an appointment starting exactly when another ends is compatible', () => {
  assert.equal(run([a, event('Adjacent', '2026-10-04T11:00:00+02:00', '2026-10-04T12:00:00+02:00')]).conflictCount, 0);
});
check('contained appointments and unsorted input are detected', () => {
  assert.equal(run([b, event('Long', '2026-10-04T09:00:00+02:00', '2026-10-04T13:00:00+02:00'), a]).conflictCount, 3);
});
check('different UTC offsets describing the same instant overlap', () => {
  assert.equal(run([a, event('UTC', '2026-10-04T08:00:00Z', '2026-10-04T09:00:00Z')]).conflictCount, 1);
});
check('the repeated hour during the Madrid autumn clock change uses instants', () => {
  const before = event('Before change', '2026-10-25T02:15:00+02:00', '2026-10-25T02:45:00+02:00');
  const after = event('After change', '2026-10-25T02:15:00+01:00', '2026-10-25T02:45:00+01:00');
  assert.equal(run([before, after]).conflictCount, 0);
});
check('cancelled, free and self-declined events do not block time', () => {
  const result = run([a, { ...b, status: 'cancelled' }, { ...b, transparency: 'transparent' },
    { ...b, attendees: [{ self: true, responseStatus: 'declined' }] }]);
  assert.equal(result.conflictCount, 0); assert.equal(result.checkedEvents, 1);
});
check('another attendee declining does not remove a busy appointment', () => {
  assert.equal(run([a, { ...b, attendees: [{ self: false, responseStatus: 'declined' }] }]).conflictCount, 1);
});
check('all-day events are explicitly excluded and counted', () => {
  const result = run([a, { id: 'Day', start: { date: '2026-10-04' }, end: { date: '2026-10-05' } }]);
  assert.equal(result.skipped.allDay, 1); assert.equal(result.checkedEvents, 1);
});
check('bad dates and missing offsets raise an attention report', () => {
  const result = run([event('No offset', '2026-10-04T10:00:00', '2026-10-04T11:00:00'),
    event('Backwards', '2026-10-04T11:00:00Z', '2026-10-04T10:00:00Z')]);
  assert.equal(result.invalidEvents, 2); assert.equal(result.needsAttention, true);
});
check('duplicate copies are removed but recurring instances stay separate', () => {
  const result = run([a, a, { ...a, start: { dateTime: '2026-10-05T10:00:00+02:00' }, end: { dateTime: '2026-10-05T11:00:00+02:00' } }, b]);
  assert.equal(result.skipped.duplicate, 1); assert.equal(result.checkedEvents, 3); assert.equal(result.conflictCount, 1);
});
check('a display limit does not change the total conflict count', () => {
  const result = run([a, b, event('Third', '2026-10-04T10:15:00+02:00', '2026-10-04T10:45:00+02:00')], { max_report_pairs: 1 });
  assert.equal(result.conflictCount, 3); assert.equal(result.pairs.length, 1); assert.match(result.reportText, /Showing 1 of 3/);
});
check('line breaks in event titles cannot create forged report headings', () => {
  const result = run([a, { ...b, summary: 'B\nForged heading\r\n' }]);
  assert.equal(result.pairs[0].second, 'B Forged heading');
});
check('a live configuration requires a single recipient', () => {
  assert.throws(() => run([a], { demo_mode: false }), /recipient/);
  assert.throws(() => run([a], { demo_mode: false, recipient_email: 'one@example.test,two@example.test' }), /recipient/);
  assert.equal(run([a], { demo_mode: false, recipient_email: 'owner@example.test' }).demoMode, false);
});
check('invalid timezone, demo type and report size fail clearly', () => {
  assert.throws(() => run([a], { report_timezone: 'Invalid/Zone' }));
  assert.throws(() => run([a], { demo_mode: 'false' }), /boolean/);
  assert.throws(() => run([a], { max_report_pairs: 0 }), /max_report_pairs/);
});
const weeklyOccurrences = [
  {
    "id": "synthetic-A-2026-10-25",
    "summary": "Synthetic New York A 2026-10-25",
    "recurringEventId": "synthetic-weekly-A",
    "originalStartTime": {
      "dateTime": "2026-10-25T09:00:00-04:00",
      "timeZone": "America/New_York"
    },
    "start": {
      "dateTime": "2026-10-25T09:00:00-04:00",
      "timeZone": "America/New_York"
    },
    "end": {
      "dateTime": "2026-10-25T10:00:00-04:00",
      "timeZone": "America/New_York"
    }
  },
  {
    "id": "synthetic-B-2026-10-25",
    "summary": "Synthetic UTC B 2026-10-25",
    "recurringEventId": "synthetic-weekly-B",
    "originalStartTime": {
      "dateTime": "2026-10-25T14:00:00Z",
      "timeZone": "UTC"
    },
    "start": {
      "dateTime": "2026-10-25T14:00:00Z",
      "timeZone": "UTC"
    },
    "end": {
      "dateTime": "2026-10-25T15:00:00Z",
      "timeZone": "UTC"
    }
  },
  {
    "id": "synthetic-A-2026-11-01",
    "summary": "Synthetic New York A 2026-11-01",
    "recurringEventId": "synthetic-weekly-A",
    "originalStartTime": {
      "dateTime": "2026-11-01T09:00:00-05:00",
      "timeZone": "America/New_York"
    },
    "start": {
      "dateTime": "2026-11-01T09:00:00-05:00",
      "timeZone": "America/New_York"
    },
    "end": {
      "dateTime": "2026-11-01T10:00:00-05:00",
      "timeZone": "America/New_York"
    }
  },
  {
    "id": "synthetic-B-2026-11-01",
    "summary": "Synthetic UTC B 2026-11-01",
    "recurringEventId": "synthetic-weekly-B",
    "originalStartTime": {
      "dateTime": "2026-11-01T14:00:00Z",
      "timeZone": "UTC"
    },
    "start": {
      "dateTime": "2026-11-01T14:00:00Z",
      "timeZone": "UTC"
    },
    "end": {
      "dateTime": "2026-11-01T15:00:00Z",
      "timeZone": "UTC"
    }
  },
  {
    "id": "synthetic-A-2026-11-08",
    "summary": "Synthetic New York A 2026-11-08",
    "recurringEventId": "synthetic-weekly-A",
    "originalStartTime": {
      "dateTime": "2026-11-08T09:00:00-05:00",
      "timeZone": "America/New_York"
    },
    "start": {
      "dateTime": "2026-11-08T09:00:00-05:00",
      "timeZone": "America/New_York"
    },
    "end": {
      "dateTime": "2026-11-08T10:00:00-05:00",
      "timeZone": "America/New_York"
    }
  },
  {
    "id": "synthetic-B-2026-11-08",
    "summary": "Synthetic UTC B 2026-11-08",
    "recurringEventId": "synthetic-weekly-B",
    "originalStartTime": {
      "dateTime": "2026-11-08T14:00:00Z",
      "timeZone": "UTC"
    },
    "start": {
      "dateTime": "2026-11-08T14:00:00Z",
      "timeZone": "UTC"
    },
    "end": {
      "dateTime": "2026-11-08T15:00:00Z",
      "timeZone": "UTC"
    }
  }
];
check('New York weekly appointments cross UTC appointments after the autumn clock change', () => {
  const result = run(weeklyOccurrences);
  assert.equal(result.checkedEvents, 6);
  assert.equal(result.conflictCount, 2);
  assert.equal(result.invalidEvents, 0);
  assert.equal(result.skipped.duplicate, 0);
  assert.equal(result.pairs.length, 2);
  const intervals = result.pairs.map(pair => [pair.overlapStart, pair.overlapEnd,
    (Date.parse(pair.overlapEnd) - Date.parse(pair.overlapStart)) / 60000]);
  assert.deepEqual(JSON.parse(JSON.stringify(intervals)), [
    ['2026-11-01T14:00:00.000Z', '2026-11-01T15:00:00.000Z', 60],
    ['2026-11-08T14:00:00.000Z', '2026-11-08T15:00:00.000Z', 60],
  ]);
  const startGaps = prefix => {
    const starts = weeklyOccurrences.filter(event => event.id.startsWith(prefix)).map(event => Date.parse(event.start.dateTime));
    return starts.slice(1).map((start, index) => (start - starts[index]) / 3600000);
  };
  assert.deepEqual(startGaps('synthetic-A-'), [169, 168]);
  assert.deepEqual(startGaps('synthetic-B-'), [168, 168]);
  assert.match(result.reportText, /15:00/);
  assert.match(result.reportText, /16:00/);
});
console.log('PASS ' + cases.length + ' synthetic calendar-audit checks');
console.log('Scope: published Code node with n8n input mocks. Calendar API, Gmail delivery and full n8n execution are outside this test.');
