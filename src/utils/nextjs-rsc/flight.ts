/*
 * Shared Next.js React-Server-Component (RSC) "flight payload" parser.
 *
 * Several sources are Next.js apps that never render the data we need into the
 * DOM; instead the server streams a flight payload of `<hexId>:<value>` rows
 * which the client hydrates. Requesting a page with the `rsc: 1` header returns
 * that payload directly, and the models we want (series, chapters, pages) can be
 * read straight out of it.
 *
 * Rows come in a few shapes:
 *   - `<id>:<json>`            an outlined model, cached by id
 *   - `<id>:T<hexLen>,<text>`  a length-prefixed binary text row
 *   - `<id>:I[...]` / `H[...]` client-reference/hint rows we skip
 *
 * Values may reference other rows as `"$<id>"` (and `"$<id>:a:b"` for a path
 * into one), so resolution follows those references through the model cache
 * while guarding against cycles.
 *
 * This logic was originally written for and proven by ValirScans; it is shared
 * here so the other sites on the same platform (Diva Scans, WitchScans,
 * Drake Scans — upstream's `vinetheme`) reuse the exact same parser rather than
 * each carrying a copy.
 */

// by id (as outlined models) and binary `T<hexLen>,<content>` rows hold byte
// text. We then search the resolved chunks for the object matching the
// predicate, following `$<id>` references into the model cache as needed.
export function findRscObject(
  body: string,
  predicate: (obj: Record<string, unknown>) => boolean,
): Record<string, unknown> | undefined {
  const { chunks, modelCache, chunkCache } = extractRscChunks(body);
  for (const chunk of chunks) {
    const resolved = resolveRefs(chunk, chunkCache, modelCache, new Set());
    const found = searchJson(resolved, predicate);
    if (found) return found;
  }
  return undefined;
}

export function extractRscChunks(body: string): {
  chunks: unknown[];
  modelCache: Map<string, unknown>;
  chunkCache: Map<string, string>;
} {
  const chunks: unknown[] = [];
  const modelCache = new Map<string, unknown>();
  const chunkCache = new Map<string, string>();
  let pos = 0;

  while (pos < body.length) {
    // Rows are newline-separated. Skip any leading whitespace so the row id
    // parses cleanly — without this, the `\n` left over from the previous row
    // makes every following id invalid and the scan silently desyncs and finds
    // nothing. That only stayed hidden while payloads arrived HTML-wrapped
    // (`self.__next_f.push([1,"..."])`, which carries no raw newlines); a
    // direct `rsc: 1` response is newline-separated and hit the bug.
    while (pos < body.length && (body[pos] === "\n" || body[pos] === "\r")) {
      pos++;
    }
    if (pos >= body.length) break;

    const colonIdx = body.indexOf(":", pos);
    if (colonIdx === -1) break;

    const id = body.substring(pos, colonIdx);
    if (id.length === 0 || !/^[0-9a-fA-F]+$/.test(id)) {
      // Not a row header. Skip to the start of the next line rather than just
      // past this colon: a bare `indexOf(":")` can otherwise land *inside* a
      // JSON value and match a colon belonging to an object key, which
      // desynchronises the scan and hides every row after it.
      const nextLine = body.indexOf("\n", pos);
      if (nextLine === -1) break;
      pos = nextLine + 1;
      continue;
    }

    pos = colonIdx + 1;
    if (pos >= body.length) break;

    if (body[pos] === "T") {
      // Binary chunk: T<hexLen>,<content>. byteLen is UTF-8 byte length.
      pos++;
      const commaIdx = body.indexOf(",", pos);
      if (commaIdx === -1) break;
      const byteLen = parseInt(body.substring(pos, commaIdx), 16);
      pos = commaIdx + 1;
      if (Number.isNaN(byteLen)) break;
      let bytes = 0;
      const start = pos;
      while (pos < body.length && bytes < byteLen) {
        const code = body.charCodeAt(pos);
        if (code < 0x80) bytes += 1;
        else if (code < 0x800) bytes += 2;
        else if (code >= 0xd800 && code <= 0xdbff) {
          bytes += 4;
          pos++;
        } else bytes += 3;
        pos++;
      }
      chunkCache.set(id, body.substring(start, pos));
    } else {
      const end = scanJsonEnd(body, pos);
      if (end > pos) {
        const text = body.substring(pos, end);
        try {
          const parsed: unknown = JSON.parse(text);
          chunks.push(parsed);
          modelCache.set(id, parsed);
        } catch {
          // ignore non-JSON rows
        }
        pos = end;
      } else {
        pos++;
      }
    }
  }

  return { chunks, modelCache, chunkCache };
}

// Returns the index immediately after the JSON value that starts at `start`.
export function scanJsonEnd(body: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escape = false;
  let i = start;

  while (i < body.length) {
    const c = body[i++];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\" && inString) {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === "{" || c === "[") {
      depth++;
    } else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0) return i;
    } else if (depth === 0 && /\s/.test(c)) {
      return i - 1;
    }
  }
  return i;
}

// Resolves React Flight `$`-reference markers against the chunk/model caches.
export function resolveRefs(
  value: unknown,
  chunkCache: Map<string, string>,
  modelCache: Map<string, unknown>,
  resolving: Set<string>,
): unknown {
  if (Array.isArray(value)) {
    return value.map((v) =>
      resolveRefs(v, chunkCache, modelCache, resolving),
    );
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = resolveRefs(v, chunkCache, modelCache, resolving);
    }
    return out;
  }
  if (typeof value === "string" && value.length >= 2 && value[0] === "$") {
    return resolveStringRef(value, chunkCache, modelCache, resolving);
  }
  return value;
}

export function resolveStringRef(
  str: string,
  chunkCache: Map<string, string>,
  modelCache: Map<string, unknown>,
  resolving: Set<string>,
): unknown {
  if (str === "$undefined") return null;
  if (
    str === "$Infinity" ||
    str === "$-Infinity" ||
    str === "$NaN" ||
    str === "$-0"
  ) {
    return str.substring(1);
  }
  const marker = str[1];
  if (marker === "$") return str.substring(1); // escaped '$'
  if (marker === "D") return str.substring(2); // Date ISO string
  if (marker === "n") return str.substring(2); // BigInt digits
  // `$<id>` or `$<id>:<path>` outlined-model reference.
  return (
    resolveModelRef(
      str.substring(1),
      chunkCache,
      modelCache,
      resolving,
    ) ?? str
  );
}

export function resolveModelRef(
  reference: string,
  chunkCache: Map<string, string>,
  modelCache: Map<string, unknown>,
  resolving: Set<string>,
): unknown {
  const segments = reference.split(":");
  const id = segments[0];
  if (segments.length === 1 && chunkCache.has(id)) {
    return chunkCache.get(id);
  }
  if (resolving.has(id)) return undefined; // cycle guard
  if (!modelCache.has(id)) return undefined;
  const guard = new Set(resolving);
  guard.add(id);

  let value: unknown = modelCache.get(id);
  for (let i = 1; i < segments.length; i++) {
    if (
      typeof value === "string" &&
      value.length >= 2 &&
      value[0] === "$"
    ) {
      value = resolveRefs(value, chunkCache, modelCache, guard);
    }
    value = walkSegment(value, segments[i]);
    if (value === undefined) return undefined;
  }
  return resolveRefs(value, chunkCache, modelCache, guard);
}

export function walkSegment(value: unknown, segment: string): unknown {
  if (Array.isArray(value)) {
    if (value.length >= 4 && value[0] === "$") {
      if (segment === "type") return value[1];
      if (segment === "key") return value[2];
      if (segment === "props") return value[3];
    }
    const idx = parseInt(segment, 10);
    return Number.isNaN(idx) ? undefined : value[idx];
  }
  if (value !== null && typeof value === "object") {
    return (value as Record<string, unknown>)[segment];
  }
  return undefined;
}

export function searchJson(
  value: unknown,
  predicate: (obj: Record<string, unknown>) => boolean,
): Record<string, unknown> | undefined {
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = searchJson(child, predicate);
      if (found) return found;
    }
    return undefined;
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (predicate(obj)) return obj;
    for (const key of Object.keys(obj)) {
      const found = searchJson(obj[key], predicate);
      if (found) return found;
    }
  }
  return undefined;
}
