function splitLine(raw: string): string[] {
  const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
  if (!line.includes('"')) return line.split(",");
  const cells: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { cells.push(cur); cur = ""; }
    else cur += c;
  }
  cells.push(cur);
  return cells;
}

export function parseCSV(text: string): Record<string, string>[] {
  // fast path (the seed catalogue is parsed once per server instance): a line without a quote is split on commas; a line with balanced quotes goes through the state machine alone.
  // Text where a quoted field spans lines (an odd quote count on some line) uses the full parser below.
  const lines = text.split("\n");
  if (lines.every((line) => (line.split('"').length - 1) % 2 === 0)) {
    const header = splitLine(lines[0]);
    const out: Record<string, string>[] = [];
    for (let n = 1; n < lines.length; n++) {
      const cells = splitLine(lines[n]);
      if (cells.length <= 1) continue;
      const record: Record<string, string> = {};
      for (let i = 0; i < header.length; i++) record[header[i]] = cells[i] ?? "";
      out.push(record);
    }
    return out;
  }
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n") {
      row.push(cur.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cur = "";
    } else {
      cur += c;
    }
  }
  if (cur || row.length) {
    row.push(cur.replace(/\r$/, ""));
    rows.push(row);
  }

  const header = rows.shift() ?? [];
  return rows
    .filter((r) => r.length > 1)
    .map((r) => Object.fromEntries(header.map((key, i) => [key, r[i] ?? ""])));
}
