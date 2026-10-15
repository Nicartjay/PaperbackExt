import {
  AdvancedSearchForm,
  BasicRateLimiter,
  Chapter,
  ChapterDetails,
  ChapterProviding,
  CloudflareBypassRequestProviding,
  CloudflareError,
  ContentRating,
  Cookie,
  CookieStorageInterceptor,
  DiscoverSection,
  DiscoverSectionItem,
  DiscoverSectionProviding,
  DiscoverSectionType,
  Extension,
  MangaProviding,
  Metadata,
  PagedResults,
  PaperbackInterceptor,
  Request,
  Response,
  SearchQuery,
  SearchResultItem,
  SearchResultsProviding,
  SourceManga,
  TagSection,
} from "@paperback/types";
import * as cheerio from "cheerio";
import { TempleScanSearchForm, TempleScanSearchMeta } from "./forms";

const BASE_URL = "https://templetoons.com";
const PAGE_SIZE = 20;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*-?$/;

interface TempleScanMetadata {
  page?: number;
}

interface BrowseSeries {
  badge?: string | null;
  series_slug: string;
  title: string;
  alternative_names?: string | null;
  thumbnail?: string | null;
  status?: string | null;
  update_chapter?: string | null;
  created_at?: string | null;
  total_views?: number;
}

// ----------------------------------------------------------------
// Next.js RSC (React Flight) payload parsing
//
// templetoons.com is a Next.js App Router site. Requesting a route with the
// `rsc: 1` header yields a raw `text/x-component` flight stream instead of
// HTML. We port the keiyoushi `extractNextJs`/`extractNextJsRsc` helper: the
// stream is a sequence of `<hexId>:<chunk>` rows where a chunk is either
//   - `T<hexLen>,<content>`  (a binary text chunk, cached for `$<id>` refs), or
//   - a JSON value           (an outlined model row, cached for `$Q`/`$W`/`$id`)
// After collecting rows we resolve the `$`-reference markers and search the
// resulting trees for the first value matching a target shape. (Same parser
// used by our JNovel port.)
// ----------------------------------------------------------------

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

function isObj(v: JsonValue): v is { [key: string]: JsonValue } {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

interface RscPayloads {
  payloads: JsonValue[];
  chunkCache: Map<string, string>;
  modelCache: Map<string, JsonValue>;
}

function isHexId(id: string): boolean {
  if (id.length === 0) return false;
  for (const c of id) {
    if (!/[0-9a-fA-F]/.test(c)) return false;
  }
  return true;
}

function parseJsonAt(body: string, start: number): [JsonValue | null, number] {
  if (start >= body.length) return [null, start];

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
      if (--depth === 0) {
        try {
          return [JSON.parse(body.substring(start, i)) as JsonValue, i];
        } catch {
          return [null, i];
        }
      }
    }
    if (depth === 0 && /\s/.test(c)) {
      try {
        return [JSON.parse(body.substring(start, i - 1)) as JsonValue, i];
      } catch {
        return [null, i];
      }
    }
  }
  return [null, i];
}

function utf8ByteLen(ch: string): number {
  const code = ch.charCodeAt(0);
  if (code < 0x80) return 1;
  if (code < 0x800) return 2;
  return 3;
}

function extractRscPayloads(body: string): RscPayloads {
  const payloads: JsonValue[] = [];
  const chunkCache = new Map<string, string>();
  const modelCache = new Map<string, JsonValue>();
  let pos = 0;

  while (pos < body.length) {
    const colonIdx = body.indexOf(":", pos);
    if (colonIdx === -1) break;

    const id = body.substring(pos, colonIdx);
    if (!isHexId(id)) {
      pos++;
      continue;
    }

    pos = colonIdx + 1;
    if (pos >= body.length) break;

    if (body[pos] === "T") {
      // Binary chunk: T<hexLen>,<content> where hexLen is UTF-8 byte length.
      pos++;
      const commaIdx = body.indexOf(",", pos);
      if (commaIdx === -1) break;
      const byteLen = parseInt(body.substring(pos, commaIdx), 16);
      if (Number.isNaN(byteLen)) break;
      pos = commaIdx + 1;
      let bytes = 0;
      const start = pos;
      while (pos < body.length && bytes < byteLen) {
        const c = body[pos];
        const code = c.charCodeAt(0);
        if (code >= 0xd800 && code <= 0xdbff) {
          // high surrogate -> supplementary character is 4 UTF-8 bytes
          bytes += 4;
          pos++; // consume the high surrogate; loop increment handles the low
        } else {
          bytes += utf8ByteLen(c);
        }
        pos++;
      }
      const chunkContent = body.substring(start, pos);
      chunkCache.set(id, chunkContent);
      try {
        payloads.push(JSON.parse(chunkContent) as JsonValue);
      } catch {
        // not JSON, only useful as a string chunk reference
      }
    } else {
      const [element, end] = parseJsonAt(body, pos);
      if (element !== null) {
        payloads.push(element);
        modelCache.set(id, element);
      }
      pos = end;
    }
  }

  return { payloads, chunkCache, modelCache };
}

function resolveRefs(
  element: JsonValue,
  chunkCache: Map<string, string>,
  modelCache: Map<string, JsonValue>,
  resolving: Set<string> = new Set(),
): JsonValue {
  if (Array.isArray(element)) {
    return element.map((e) => resolveRefs(e, chunkCache, modelCache, resolving));
  }
  if (element !== null && typeof element === "object") {
    const out: { [key: string]: JsonValue } = {};
    for (const key of Object.keys(element)) {
      out[key] = resolveRefs(element[key], chunkCache, modelCache, resolving);
    }
    return out;
  }
  if (
    typeof element === "string" &&
    element.startsWith("$") &&
    element.length >= 2
  ) {
    const str = element;
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
    if (marker === "n") return str.substring(2); // BigInt digit string
    if (marker === "Q") {
      return (
        resolveMapRef(str.substring(2), chunkCache, modelCache, resolving) ??
        element
      );
    }
    if (marker === "W") {
      return (
        resolveSetRef(str.substring(2), chunkCache, modelCache, resolving) ??
        element
      );
    }
    return (
      resolveModelRef(str.substring(1), chunkCache, modelCache, resolving) ??
      element
    );
  }
  return element;
}

function walkRefSegment(value: JsonValue, segment: string): JsonValue | null {
  if (Array.isArray(value)) {
    if (value.length >= 4 && value[0] === "$") {
      if (segment === "type") return value[1];
      if (segment === "key") return value[2];
      if (segment === "props") return value[3];
    }
    const idx = Number.parseInt(segment, 10);
    if (!Number.isNaN(idx) && idx >= 0 && idx < value.length) return value[idx];
    return null;
  }
  if (value !== null && typeof value === "object") {
    return segment in value ? value[segment] : null;
  }
  return null;
}

function resolveModelRef(
  reference: string,
  chunkCache: Map<string, string>,
  modelCache: Map<string, JsonValue>,
  resolving: Set<string>,
): JsonValue | null {
  const segments = reference.split(":");
  const id = segments[0];
  if (segments.length === 1) {
    const chunk = chunkCache.get(id);
    if (chunk !== undefined) return chunk;
  }
  if (resolving.has(id)) return null;
  const guard = new Set(resolving);
  guard.add(id);
  let value = modelCache.get(id);
  if (value === undefined) return null;
  for (let i = 1; i < segments.length; i++) {
    if (typeof value === "string" && value.startsWith("$")) {
      value = resolveRefs(value, chunkCache, modelCache, guard);
    }
    const next = walkRefSegment(value, segments[i]);
    if (next === null) return null;
    value = next;
  }
  return resolveRefs(value, chunkCache, modelCache, guard);
}

function resolveMapRef(
  id: string,
  chunkCache: Map<string, string>,
  modelCache: Map<string, JsonValue>,
  resolving: Set<string>,
): JsonValue | null {
  if (resolving.has(id)) return null;
  const entries = modelCache.get(id);
  if (!Array.isArray(entries)) return null;
  const guard = new Set(resolving);
  guard.add(id);
  const resolved = resolveRefs(entries, chunkCache, modelCache, guard);
  if (!Array.isArray(resolved)) return null;
  const out: { [key: string]: JsonValue } = {};
  for (const pair of resolved) {
    if (Array.isArray(pair) && pair.length === 2) {
      const key = typeof pair[0] === "string" ? pair[0] : String(pair[0]);
      out[key] = pair[1];
    }
  }
  return out;
}

function resolveSetRef(
  id: string,
  chunkCache: Map<string, string>,
  modelCache: Map<string, JsonValue>,
  resolving: Set<string>,
): JsonValue | null {
  if (resolving.has(id)) return null;
  const values = modelCache.get(id);
  if (!Array.isArray(values)) return null;
  const guard = new Set(resolving);
  guard.add(id);
  return resolveRefs(values, chunkCache, modelCache, guard);
}

// Depth-first search for the first value (object OR array) matching `predicate`.
function findFirst(
  element: JsonValue,
  predicate: (e: JsonValue) => boolean,
): JsonValue | null {
  if (predicate(element)) return element;
  if (Array.isArray(element)) {
    for (const child of element) {
      const r = findFirst(child, predicate);
      if (r !== null) return r;
    }
    return null;
  }
  if (element !== null && typeof element === "object") {
    for (const key of Object.keys(element)) {
      const r = findFirst(element[key], predicate);
      if (r !== null) return r;
    }
  }
  return null;
}

function extractNextJs(
  body: string,
  predicate: (e: JsonValue) => boolean,
): JsonValue | null {
  const { payloads, chunkCache, modelCache } = extractRscPayloads(body);
  for (const payload of payloads) {
    const resolved = resolveRefs(payload, chunkCache, modelCache);
    const result = findFirst(resolved, predicate);
    if (result !== null) return result;
  }
  return null;
}

class TempleScanInterceptor extends PaperbackInterceptor {
  override async interceptRequest(request: Request): Promise<Request> {
    // Upstream #19430/#19824: Cloudflare rejects partial header sets and the
    // `rsc: 1` endpoint, and the Origin header breaks image loads. Send a full
    // top-level-navigation fingerprint for pages and an image fingerprint for
    // the media CDN.
    const isImage = /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(request.url);
    const headers: Record<string, string> = {
      ...request.headers,
      referer: `${BASE_URL}/`,
      "user-agent": await Application.getDefaultUserAgent(),
      "accept-language": "en-US,en;q=0.9",
    };
    delete headers["origin"];
    delete headers["rsc"];
    if (isImage) {
      headers["accept"] = "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8";
      headers["sec-fetch-site"] = "same-site";
      headers["sec-fetch-mode"] = "no-cors";
      headers["sec-fetch-dest"] = "image";
    } else {
      headers["accept"] =
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8";
      headers["sec-fetch-site"] = "none";
      headers["sec-fetch-mode"] = "navigate";
      headers["sec-fetch-dest"] = "document";
      headers["upgrade-insecure-requests"] = "1";
    }
    request.headers = headers;
    return request;
  }

  override async interceptResponse(
    request: Request,
    response: Response,
    data: ArrayBuffer,
  ): Promise<ArrayBuffer> {
    if (response.headers?.["cf-mitigated"] === "challenge") {
      throw new CloudflareError({
        url: request.url,
        method: request.method ?? "GET",
        headers: {
          "user-agent": await Application.getDefaultUserAgent(),
        },
      });
    }
    return data;
  }
}

type TempleScanImplementation = Extension &
  SearchResultsProviding &
  MangaProviding &
  ChapterProviding &
  CloudflareBypassRequestProviding &
  DiscoverSectionProviding;

export class TempleScanExtension implements TempleScanImplementation {
  requestManager = new TempleScanInterceptor("main");
  cookieStorageInterceptor = new CookieStorageInterceptor({
    storage: "stateManager",
  });
  globalRateLimiter = new BasicRateLimiter("rateLimiter", {
    numberOfRequests: 1,
    bufferInterval: 1,
    ignoreImages: true,
  });

  private seriesCache: BrowseSeries[] | undefined;

  async initialise(): Promise<void> {
    this.requestManager.registerInterceptor();
    this.cookieStorageInterceptor.registerInterceptor();
    this.globalRateLimiter.registerInterceptor();
  }

  // ----------------------------------------------------------------
  // Discover sections
  // ----------------------------------------------------------------

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    return [
      {
        id: "popular",
        title: "Popular",
        type: DiscoverSectionType.featured,
      },
      {
        id: "latest",
        title: "Latest Updates",
        type: DiscoverSectionType.simpleCarousel,
      },
    ];
  }

  async getAdvancedSearchForm(
    query: SearchQuery<Metadata>,
  ): Promise<AdvancedSearchForm> {
    const meta = query.metadata as
      | { searchMeta?: TempleScanSearchMeta }
      | undefined;
    return new TempleScanSearchForm(meta?.searchMeta);
  }

  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata: Metadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const meta = metadata as TempleScanMetadata | undefined;
    const page = meta?.page ?? 1;

    const order = section.id === "latest" ? "updated" : "views";
    const { series, hasNextPage } = await this.queryDirectory(
      "",
      undefined,
      order,
      page,
    );

    const items: DiscoverSectionItem[] = series.map((s) => ({
      type:
        section.id === "latest" ? "simpleCarouselItem" : "featuredCarouselItem",
      mangaId: this.parsePath(`/comic/${s.series_slug}`),
      imageUrl: this.absoluteUrl(s.thumbnail ?? ""),
      title: s.title,
      metadata: undefined,
    }));

    return { items, metadata: hasNextPage ? { page: page + 1 } : undefined };
  }

  // ----------------------------------------------------------------
  // Search
  // ----------------------------------------------------------------

  async getSearchResults(
    query: SearchQuery<Metadata>,
    metadata: Metadata | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const meta = metadata as TempleScanMetadata | undefined;
    const page = meta?.page ?? 1;

    const titleQuery = (query.title || "").trim();
    const searchMeta = (
      query.metadata as { searchMeta?: TempleScanSearchMeta } | undefined
    )?.searchMeta;

    const status = searchMeta?.status?.[0];
    const order = searchMeta?.order?.[0];

    const { series, hasNextPage } = await this.queryDirectory(
      titleQuery,
      status,
      order,
      page,
    );

    const results: SearchResultItem[] = series.map((s) => ({
      mangaId: this.parsePath(`/comic/${s.series_slug}`),
      imageUrl: this.absoluteUrl(s.thumbnail ?? ""),
      title: s.title,
      subtitle: undefined,
      metadata: undefined,
    }));

    return {
      items: results,
      metadata: hasNextPage ? { page: page + 1 } : undefined,
    };
  }

  private async queryDirectory(
    query: string,
    status: string | undefined,
    order: string | undefined,
    page: number,
  ): Promise<{ series: BrowseSeries[]; hasNextPage: boolean }> {
    if (page === 1 || !this.seriesCache) {
      await this.loadDirectory();
    }
    const all = this.seriesCache ?? [];

    const q = query.toLowerCase();
    let filtered = all.filter((series) => {
      const queryFilter =
        q.length === 0 ||
        series.title.toLowerCase().includes(q) ||
        (series.alternative_names ?? "").toLowerCase().includes(q);
      const statusFilter = !status || series.status === status;
      return queryFilter && statusFilter;
    });

    if (order === "updated") {
      filtered = filtered
        .slice()
        .sort(
          (a, b) =>
            this.parseTime(b.update_chapter) - this.parseTime(a.update_chapter),
        );
    } else if (order === "created") {
      filtered = filtered
        .slice()
        .sort(
          (a, b) => this.parseTime(b.created_at) - this.parseTime(a.created_at),
        );
    } else if (order === "views") {
      filtered = filtered
        .slice()
        .sort((a, b) => (b.total_views ?? 0) - (a.total_views ?? 0));
    }

    const start = (page - 1) * PAGE_SIZE;
    const end = Math.min(page * PAGE_SIZE, filtered.length);
    return {
      series: filtered.slice(start, end),
      hasNextPage: page * PAGE_SIZE < filtered.length,
    };
  }

  private async loadDirectory(): Promise<void> {
    const body = this.flightOf(await this.fetchString({ url: `${BASE_URL}/comics`, method: "GET" }));
    // Upstream #19430..#19892: the site renames `title` and `series_slug` to
    // short keys that rotate on every rebuild. The unrenamed siblings
    // (`total_views`, `thumbnail`, `update_chapter`, ...) still identify the
    // catalog array, and within each entry the two remaining string fields are
    // told apart by shape: the slug is lowercase-kebab, the title is not.
    // Verified live: 296 of 297 entries split cleanly; the other is skipped.
    const found = extractNextJs(
      body,
      (e) =>
        Array.isArray(e) &&
        e.length > 0 &&
        isObj(e[0]) &&
        "total_views" in e[0] &&
        "thumbnail" in e[0],
    );
    const list = Array.isArray(found) ? found.filter(isObj) : [];
    this.seriesCache = list
      .map((e) => this.normaliseSeries(e))
      .filter((s): s is BrowseSeries => s !== undefined);
  }

  private normaliseSeries(e: { [key: string]: JsonValue }): BrowseSeries | undefined {
    const KNOWN = new Set([
      "thumbnail", "badge", "status", "created_at", "alternative_names",
      "update_chapter", "total_views", "title", "series_slug",
    ]);
    let slug = typeof e.series_slug === "string" ? e.series_slug : undefined;
    let title = typeof e.title === "string" ? e.title : undefined;
    if (!slug || !title) {
      const extra = Object.keys(e).filter((k) => !KNOWN.has(k) && typeof e[k] === "string");
      const slugs = extra.filter((k) => SLUG_RE.test(e[k] as string));
      const titles = extra.filter((k) => !SLUG_RE.test(e[k] as string));
      if (!slug && slugs.length === 1) slug = e[slugs[0]] as string;
      if (!title && titles.length === 1) title = (e[titles[0]] as string).trim();
    }
    if (!slug || !title) return undefined;
    const str = (v: JsonValue | undefined) => (typeof v === "string" ? v : null);
    return {
      series_slug: slug,
      title,
      alternative_names: str(e.alternative_names),
      thumbnail: str(e.thumbnail),
      status: str(e.status),
      update_chapter: str(e.update_chapter),
      created_at: str(e.created_at),
      total_views: typeof e.total_views === "number" ? e.total_views : 0,
      badge: str(e.badge),
    } as BrowseSeries;
  }

  /** Concatenate the `self.__next_f.push([1, "..."])` flight rows of an HTML page. */
  private flightOf(html: string): string {
    let body = "";
    const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      try {
        body += JSON.parse(`"${m[1]}"`) as string;
      } catch {
        // skip malformed row
      }
    }
    return body;
  }

  // ----------------------------------------------------------------
  // Manga details
  // ----------------------------------------------------------------

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const url = this.mangaUrl(mangaId);
    const html = await this.fetchString({ url, method: "GET" });
    const $ = cheerio.load(html);
    const slug = this.safeDecode(mangaId).replace(/\/+$/, "").split("/").pop() ?? "";

    // Upstream #19892: details come from the schema.org ComicSeries JSON-LD
    // block and the rendered synopsis; status/badge only live in the catalog.
    let ld: { [key: string]: JsonValue } = {};
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const v = JSON.parse($(el).text()) as JsonValue;
        if (isObj(v) && v["@type"] === "ComicSeries") ld = v;
      } catch {
        // ignore
      }
    });
    if (!this.seriesCache) {
      try {
        await this.loadDirectory();
      } catch {
        // the catalog is optional for details
      }
    }
    const entry = this.seriesCache?.find((s) => s.series_slug === slug);

    const str = (v: JsonValue | undefined) => (typeof v === "string" ? v.trim() : "");
    const title = str(ld.name) || entry?.title || slug;
    const alternativeNames = str(ld.alternateName) || entry?.alternative_names?.trim() || "";
    const thumbnail = str(ld.image) || entry?.thumbnail || "";
    const author = isObj(ld.author) ? str(ld.author.name) || undefined : undefined;
    const genres = Array.isArray(ld.genre)
      ? ld.genre.filter((g): g is string => typeof g === "string")
      : [];

    const synopsisEl = $("#series-synopsis-text").first();
    synopsisEl.find("br").replaceWith("\n");
    const paragraphs = synopsisEl.find("p").map((_, el) => $(el).text().trim()).get().filter(Boolean);
    const synopsis = paragraphs.length > 0 ? paragraphs.join("\n\n") : synopsisEl.text().trim() || str(ld.description);
    const synopsisParts = [synopsis];
    if (alternativeNames) synopsisParts.push(`Alternative Name: ${alternativeNames}`);

    const adult = genres.some((g) => g.toLowerCase() === "+18");
    const tags: string[] = [];
    if (entry?.badge) tags.push(entry.badge);
    if (adult) tags.push("Adult");
    tags.push(...genres.filter((g) => g.toLowerCase() !== "+18"));

    const tagGroups: TagSection[] = [];
    if (tags.length > 0) {
      tagGroups.push({
        id: "genres",
        title: "Genres",
        tags: [...new Set(tags)].map((g) => ({
          id: g.toLowerCase().replace(/\s+/g, "-"),
          title: g,
        })),
      });
    }

    return {
      mangaId,
      mangaInfo: {
        primaryTitle: title,
        secondaryTitles: alternativeNames ? [alternativeNames] : [],
        thumbnailUrl: this.absoluteUrl(thumbnail),
        author,
        synopsis: synopsisParts.filter(Boolean).join("\n\n"),
        contentRating: ContentRating.MATURE,
        status: this.parseStatus(entry?.status ?? ""),
        tagGroups,
        shareUrl: url,
      },
    };
  }

  // ----------------------------------------------------------------
  // Chapters
  // ----------------------------------------------------------------

  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    const url = this.mangaUrl(sourceManga.mangaId);
    const body = this.flightOf(await this.fetchString({ url, method: "GET" }));
    const isChapterRow = (v: JsonValue): boolean =>
      isObj(v) &&
      "created_at" in v &&
      Object.values(v).some((s) => typeof s === "string" && /^chapter-/.test(s));
    // The chapter list is the longest array of chapter rows; key names are
    // obfuscated, so each field is identified by shape (verified live).
    let best: JsonValue[] = [];
    const { payloads, modelCache, chunkCache } = extractRscPayloads(body);
    const seen = new Set<JsonValue>();
    const walk = (v: JsonValue, depth: number) => {
      if (v === null || typeof v !== "object" || seen.has(v) || depth > 40) return;
      seen.add(v);
      if (Array.isArray(v) && v.length > best.length && v.length > 0 && isChapterRow(v[0])) best = v;
      for (const child of Object.values(v)) walk(child, depth + 1);
    };
    for (const c of payloads) walk(resolveRefs(c, chunkCache, modelCache), 0);

    const mangaSlug = this.safeDecode(sourceManga.mangaId).replace(/\/+$/, "").split("/").pop();
    const KNOWN = new Set(["index", "chapter_title", "chapter_thumbnail", "created_at"]);
    const chapters: Chapter[] = [];
    for (const row of best) {
      if (!isObj(row)) continue;
      const extra = Object.keys(row).filter((k) => !KNOWN.has(k));
      const chapterSlug = extra.map((k) => row[k]).find((v) => typeof v === "string" && /^chapter-/.test(v)) as string | undefined;
      if (!chapterSlug) continue;
      const label = (extra.map((k) => row[k]).find(
        (v) => typeof v === "string" && v !== chapterSlug && !/^https?:/.test(v),
      ) as string | undefined) ?? chapterSlug.replace(/-/g, " ");
      // A non-zero numeric field is the coin price of an early-access chapter.
      const locked = extra.some((k) => typeof row[k] === "number" && (row[k] as number) > 0) || row.premium === true;
      if (locked) continue;
      const chapterTitle = typeof row.chapter_title === "string" ? row.chapter_title.trim() : "";
      chapters.push({
        chapterId: this.parsePath(`/comic/${mangaSlug}/${chapterSlug}`),
        sourceManga,
        title: label + (chapterTitle ? `: ${chapterTitle}` : ""),
        volume: 0,
        chapNum: this.parseChapterNumber(label),
        publishDate: this.parseDate(typeof row.created_at === "string" ? row.created_at : null),
        langCode: "🇬🇧",
      });
    }
    return chapters;
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const url = this.chapterUrl(chapter.chapterId);
    const body = this.flightOf(await this.fetchString({ url, method: "GET" }));
    const found = extractNextJs(
      body,
      (e) => Array.isArray(e) && e.length > 0 && typeof e[0] === "string" && e[0].includes("/uploads/"),
    );
    const images = Array.isArray(found)
      ? found.filter((p): p is string => typeof p === "string")
      : [];
    return {
      id: chapter.chapterId,
      mangaId: chapter.sourceManga.mangaId,
      pages: images.map((img) => this.absoluteUrl(img)),
    };
  }

  getMangaShareUrl(mangaId: string): string {
    return this.mangaUrl(mangaId);
  }

  // ----------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------

  // Strip HTML tags and decode a few common entities (upstream uses
  // Jsoup.clean(..., Safelist.none()) which yields plain text).
  private stripHtml(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .trim();
  }

  private mangaUrl(mangaId: string): string {
    const slug = this.safeDecode(mangaId);
    if (slug.startsWith("http")) return slug;
    return `${BASE_URL}/${slug.replace(/^\/+/, "")}`;
  }

  private chapterUrl(chapterId: string): string {
    const slug = this.safeDecode(chapterId);
    if (slug.startsWith("http")) return slug;
    return `${BASE_URL}/${slug.replace(/^\/+/, "")}`;
  }

  private parsePath(href: string): string {
    const decoded = this.safeDecode(href);
    let cleaned = decoded.replace(/#.*$/, "").replace(/\/+$/, "");
    cleaned = cleaned.replace(/^https?:\/\/[^/]+/, "");
    if (!cleaned.startsWith("/")) cleaned = `/${cleaned}`;
    return this.toSafeId(cleaned);
  }

  private toSafeId(slug: string): string {
    return slug.replace(/[^A-Za-z0-9._\-@()[\]%?#+=/&:]/g, (c) => {
      const enc = encodeURIComponent(c);
      if (enc !== c) return enc;
      return "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0");
    });
  }

  private safeDecode(id: string): string {
    try {
      return decodeURIComponent(id);
    } catch {
      return id;
    }
  }

  private parseChapterNumber(name: string): number {
    const match = name.match(/(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : -1;
  }

  private absoluteUrl(src: string): string {
    const s = (src || "").trim();
    if (!s) return "";
    if (s.startsWith("http")) return s;
    if (s.startsWith("//")) return `https:${s}`;
    return s.startsWith("/") ? `${BASE_URL}${s}` : `${BASE_URL}/${s}`;
  }

  private parseStatus(status: string): string {
    switch (status) {
      case "Ongoing":
        return "Ongoing";
      case "Hiatus":
        return "Hiatus";
      case "Completed":
        return "Completed";
      case "Canceled":
      case "Dropped":
        return "Cancelled";
      default:
        return "Unknown";
    }
  }

  private parseTime(date: string | null | undefined): number {
    if (!date) return 0;
    const t = new Date(date).getTime();
    return isNaN(t) ? 0 : t;
  }

  private parseDate(date: string | null | undefined): Date {
    if (!date) return new Date(0);
    const d = new Date(date);
    return isNaN(d.getTime()) ? new Date(0) : d;
  }

  // ----------------------------------------------------------------
  // Cloudflare + fetch
  // ----------------------------------------------------------------

  async cloudflareBypassCompleted(
    _request: Request,
    cookies: Cookie[],
    _localStorage: Record<string, string>,
  ): Promise<void> {
    for (const cookie of this.cookieStorageInterceptor.cookies) {
      this.cookieStorageInterceptor.deleteCookie(cookie);
    }
    for (const cookie of cookies) {
      if (cookie.expires && cookie.expires.getTime() <= Date.now()) continue;
      this.cookieStorageInterceptor.setCookie(cookie);
    }
  }

  async fetchString(request: Request): Promise<string> {
    const [response, data] = await Application.scheduleRequest(request);
    if (response.status === 404) {
      throw new Error("Content not found");
    }
    return Application.arrayBufferToUTF8String(data);
  }
}

export const TempleScan = new TempleScanExtension();
