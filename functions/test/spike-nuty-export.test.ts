import { describe, expect, it } from 'vitest';
import { CSV_COLUMNS, csvCell, toCsv } from '../src/spike-nuty/export.js';
import { expireAtFor } from '../src/spike-nuty/repository.js';
import type { AttemptDoc } from '../src/spike-nuty/stats.js';
import type { AttemptRecord } from '../src/spike-nuty/types.js';
import { ATTEMPT_ID, DEVICE_ID, sampleAttempt } from './spike-nuty-fakes.js';

const AT = new Date('2026-11-15T10:00:00Z');

function doc(extra: Partial<AttemptDoc> = {}): AttemptDoc {
  return {
    ...(sampleAttempt() as unknown as AttemptRecord),
    id: ATTEMPT_ID,
    receivedAt: AT,
    expireAt: expireAtFor(AT),
    ...extra,
  };
}

/** Minimal RFC 4180 reader for the assertions. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\r' && text[i + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i += 1;
    } else {
      cell += ch;
    }
  }
  return rows;
}

describe('csvCell', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell('cr\rlf')).toBe('"cr\rlf"');
  });

  it('prefixes text that starts like a formula with an apostrophe', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-x')).toBe("'-x");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
  });

  it('keeps numbers and booleans as they are and leaves empty values blank', () => {
    expect(csvCell(-10)).toBe('-10');
    expect(csvCell(4.5)).toBe('4.5');
    expect(csvCell(true)).toBe('true');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });
});

describe('toCsv', () => {
  it('writes a header and one CRLF-terminated row per attempt', () => {
    const csv = toCsv([doc(), doc({ id: 'second' })]);
    expect(csv.endsWith('\r\n')).toBe(true);
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual(CSV_COLUMNS);
    expect(rows.every((r) => r.length === CSV_COLUMNS.length)).toBe(true);
    expect(rows[2][0]).toBe('second');
  });

  it('fills the scalar columns and the JSON columns of an attempt', () => {
    const rows = parseCsv(
      toCsv([
        doc({
          feedback: { agrees: false, regraded: true, misjudged: [{ refIndex: 1, playedIndex: 1 }], comment: '=źle, "bardzo"' },
          feedbackAt: AT,
        }),
      ]),
    );
    const row = Object.fromEntries(CSV_COLUMNS.map((name, i) => [name, rows[1][i]]));
    expect(row).toMatchObject({
      id: ATTEMPT_ID,
      receivedAt: '2026-11-15T10:00:00.000Z',
      deviceId: DEVICE_ID,
      build: 'abc1234',
      deviceClass: 'ios',
      standalone: 'true',
      platform: 'iOS',
      mobile: 'true',
      melodyId: 'wlazl-kotek',
      instrument: 'clarinet-bb',
      bpm: '80',
      scorePercent: '75',
      wrongPitch: '1',
      outputLatencyMs: '45.2',
      correctionMs: '-10',
      ended: 'complete',
      feedbackAgrees: 'false',
      feedbackRegraded: 'true',
      feedbackComment: '\'=źle, "bardzo"',
      feedbackAt: '2026-11-15T10:00:00.000Z',
      misjudged: '[{"refIndex":1,"playedIndex":1}]',
    });
    expect(JSON.parse(row.notes)).toEqual(sampleAttempt().notes);
    expect(JSON.parse(row.events)).toEqual(sampleAttempt().events);
  });

  it('leaves the feedback columns blank for an attempt without feedback', () => {
    const rows = parseCsv(toCsv([doc()]));
    const row = Object.fromEntries(CSV_COLUMNS.map((name, i) => [name, rows[1][i]]));
    expect(row.feedbackAgrees).toBe('');
    expect(row.feedbackComment).toBe('');
    expect(row.misjudged).toBe('');
  });

  it('writes only the header for no attempts', () => {
    expect(toCsv([])).toBe(`${CSV_COLUMNS.join(',')}\r\n`);
  });
});
