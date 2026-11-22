// Fast CSV reader: a faster drop-in for csv-reader 1.0.0 (make.fun's own reference
// program). Written from scratch from the written broken-row policy in the
// competition rules; it returns exactly csv-reader 1.0.0's {columns, rows, errors}
// for every input {text, header}.
//
// Speed strategy (the reference walks one character at a time, building every
// field with `value += c`):
//  - Records with no quote and no stray CR in the line are parsed whole: one
//    slice + String.split(',') instead of a per-character loop.
//  - Every other field is located with native indexOf scans and taken as a
//    slice; a quoted field is one slice when it holds no doubled quote and no
//    line break, and only the rare broken shapes do segment-by-segment work.
//  - An unquoted field ends at the first comma or LF at or after its start;
//    a CR inside it can only be a stray CR (dropped, one error each) or the
//    CR of a CRLF ending, so no per-character loop is ever needed for it.
//  - No per-field closures on the hot path beyond two small helpers, no
//    per-character string building.
//
// Semantics (csv-reader 1.0.0, per the rules):
//  - U+FEFF at the very start is dropped.
//  - A record ends at LF or CRLF; a line left with no characters is no record.
//  - Outside quotes a CR not followed by LF is dropped (error stray_cr).
//  - A field opening with a quote runs to the next quote that is not doubled;
//    "" inside it is one quote and each CRLF or lone CR inside it is read as LF;
//    what follows its closing quote up to the next comma or line break is
//    appended as it stands (quote_junk, when the field ends); a quote that never
//    closes is a literal character and the text after it is read again as
//    unquoted (unterminated_quote).
//  - A quote inside an unquoted field is a literal character. Fields stay
//    strings, never trimmed or converted.
//  - columns is the first record when header is true, else null; rows holds the
//    records after it, each padded (short_row, with fields: its field count) or
//    cut (long_row, with extra: the cut fields) to the first record's width.
//  - Each error is {code, line, row}, in the order met; line is the 1-based line
//    its record starts on, row its record's index in rows (null for the header).

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;

  // Error context for the record now being read (its start line / its index
  // in rows).
  let recordLine = 1;
  let recordRow = null;

  // Field results, written by readUnquoted/readQuoted into these run-scoped
  // slots instead of a fresh array per field (a million fields would be a
  // million small arrays for the collector).
  let fVal = '';
  let fEnded = END;
  let fAdded = 0;

  // ---- shared record finalisation ---------------------------------------
  // Returns false when the record is dropped (a line left with no characters),
  // true when it was kept (as columns or a row).
  function finishRecord(fields, lastQuoted) {
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) return false;
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      return true;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
    return true;
  }

  // ---- unquoted field ----------------------------------------------------
  // Reads from `pos` up to the next comma or line break, starting from
  // `prefix` ('' for a plain field, the quoted value for quote junk, '"' for
  // an unterminated quote re-read). Writes the field to fVal, how it ended to
  // fEnded, and the characters this call kept to fAdded (the prefix is not
  // counted). A CR inside the field is a stray CR (dropped, one error each),
  // except a CR that ends the field's slice just before its LF, which is the
  // CRLF ending. This crosses at most one line break.
  function readUnquoted(prefix) {
    const ci = text.indexOf(',', pos);
    const ni = text.indexOf('\n', pos);
    let m = -1;
    let kind = COMMA;
    if (ci !== -1) { m = ci; kind = COMMA; }
    if (ni !== -1 && (m === -1 || ni < m)) { m = ni; kind = LINE_BREAK; }
    let seg;
    if (m === -1) {
      seg = pos < n ? text.slice(pos) : '';
      pos = n;
      kind = END;
    } else {
      seg = text.slice(pos, m);
      pos = m + 1;
      if (kind === LINE_BREAK) line += 1;
    }
    const r = seg.indexOf('\r');
    if (r === -1) {
      fVal = prefix === '' ? seg : prefix + seg;
      fAdded = seg.length;
      fEnded = kind;
      return;
    }
    // Rare: CR(s) inside the field. Drop them all; each is a stray_cr error,
    // except a trailing CR when the field ends at an LF, which is the CRLF
    // ending and no error.
    const cleaned = seg.replaceAll('\r', '');
    let crs = seg.length - cleaned.length;
    if (kind === LINE_BREAK && seg.charCodeAt(seg.length - 1) === 13) crs -= 1;
    for (let i = 0; i < crs; i++) errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
    fVal = prefix === '' ? cleaned : prefix + cleaned;
    fAdded = cleaned.length;
    fEnded = kind;
  }

  // ---- quoted field ------------------------------------------------------
  // The quote at `pos` opens the field. Writes the field to fVal and how it
  // ended to fEnded.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    pos += 1;
    let value = '';
    let addLines = 0;
    for (;;) {
      const qi = text.indexOf('"', pos);
      if (qi === -1) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as unquoted.
        pos = open + 1;
        line = openLine;
        errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
        readUnquoted('"');
        return;
      }
      // One slice of the quoted field: CRLF and lone CR each become one LF.
      let seg = text.slice(pos, qi);
      if (seg.indexOf('\n') !== -1 || seg.indexOf('\r') !== -1) {
        const breaks = seg.match(/\r\n|\r|\n/g);
        if (breaks !== null) addLines += breaks.length;
        seg = seg.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
      }
      if (text.charCodeAt(qi + 1) === 34) {
        // Doubled quote: one literal quote, and the field goes on.
        value += seg;
        value += '"';
        pos = qi + 2;
        continue;
      }
      // Closing quote.
      value += seg;
      line += addLines;
      pos = qi + 1;
      if (pos >= n) {
        fVal = value;
        fEnded = END;
        return;
      }
      const c = text.charCodeAt(pos);
      if (c === 44) {
        pos += 1;
        fVal = value;
        fEnded = COMMA;
        return;
      }
      if (c === 10) {
        pos += 1;
        line += 1;
        fVal = value;
        fEnded = LINE_BREAK;
        return;
      }
      if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
        fVal = value;
        fEnded = LINE_BREAK;
        return;
      }
      // What follows the closing quote is appended as it stands, up to the
      // next comma or line break.
      readUnquoted(value);
      if (fAdded > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
      return;
    }
  }

  // ---- main loop ---------------------------------------------------------
  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Fast path: the record holds no quote on its line, so it is exactly one
    // physical line. Split it whole instead of walking its fields.
    const lf = text.indexOf('\n', pos);
    const lineEnd = lf === -1 ? n : lf;
    const q = text.indexOf('"', pos);
    if (q === -1 || q >= lineEnd) {
      const seg = text.slice(pos, lineEnd);
      const r = seg.indexOf('\r');
      if (r === -1) {
        const fields = seg.split(',');
        if (lf === -1) pos = n;
        else {
          pos = lf + 1;
          line += 1;
        }
        finishRecord(fields, false);
        continue;
      }
      if (lf !== -1 && r === seg.length - 1) {
        // The line ends CRLF: strip the CR and split.
        const fields = seg.slice(0, -1).split(',');
        pos = lf + 1;
        line += 1;
        finishRecord(fields, false);
        continue;
      }
      // A stray CR inside the line: fall through to the general path.
    }

    // General path (v3): walk the record's fields one by one.
    const fields = [];
    let lastQuoted = false;
    let ended;
    do {
      lastQuoted = text.charCodeAt(pos) === 34;
      if (lastQuoted) readQuoted();
      else readUnquoted('');
      fields.push(fVal);
      ended = fEnded;
    } while (ended === COMMA);
    finishRecord(fields, lastQuoted);
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}
