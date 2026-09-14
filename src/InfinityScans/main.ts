import {
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

const BASE_URL = "https://infinityscans.org";
const CDN_HOST = "cv.infinityscans.org";
const PAGE_CDN_HOST = "ch.infinityscans.org";

// The site appends a build-specific hash to every `/comic/<id>/<slug>` URL. It
// rotates on each deploy; when it goes stale the server answers the details
// request with a Next.js redirect payload that carries the new one, which we
// then persist. Mirrors upstream DEFAULT_SLUG_HASH / PREF_SLUG_HASH.
const DEFAULT_SLUG_HASH = "d806990541c8";
const SLUG_HASH_KEY = "pref_slug_hash";
const HASH_REGEX = /NEXT_REDIRECT.*https.+?-(\w+);/s;

// Server-action id for the chapter page-list action. Mirrors upstream.
// Upstream #19010: the site redeployed and the Next.js server-action id for the
// page list changed. Our runtime re-derivation caches the working id, but the
// seed value must be current or the first fetch fails.
const PAGES_NEXT_ACTION = "603b9ae64dc53c5457f77cf6a4ea08b361e2e36b2f";

// The API only returns data when a valid session cookie is present. The
// cookie is established by the site's client JS POSTing to /api/validate.
// Mirrors upstream WebviewInterceptor.SESSION_COOKIE.
const SESSION_COOKIE = "__Secure-infinityscans.data";

// Sort values mirrored from the upstream SortType enum.
const SORT_LATEST = "1";
const SORT_POPULARITY = "2";

interface InfinityScansMetadata {
  page?: number;
}

// --- JSON DTO shapes (mirrored from the upstream Kotlin Dto.kt) -------------

interface SearchEntryDto {
  id: string;
  name: string;
  uri: string;
  cover: string;
  authors?: string | null;
  genres?: string | null;
  status?: string | null;
}

interface SearchResultDto {
  titles: SearchEntryDto[];
}

interface ResponseDto<T> {
  result: T;
}

interface ChapterEntryDto {
  groups?: { id: string; name: string }[] | null;
  id: string;
  name: string;
  sequence: string;
  uploaded: string;
}

interface ChapterListDto {
  chapters: ChapterEntryDto[];
  total: number;
}

interface PageEntryDto {
  path: string;
}

interface MangaDetailsDto {
  name: string;
  uri: string;
  altNames?: string[] | null;
  description?: {
    content?: { content?: { text?: string }[] | null }[] | null;
  } | null;
  genres?: { name: string }[] | null;
  authors?: { name: string }[] | null;
  status?: string | null;
  cover?: string | null;
}

// ----------------------------------------------------------------
// Next.js RSC (React Flight) payload parsing
//
// The details request sends an `rsc: 1` header and the server replies with a
// raw `text/x-component` flight stream; the page-list server action replies in
// the same format. The stream is a sequence of `<hexId>:<chunk>` rows where a
// chunk is either `T<hexLen>,<content>` (a binary text chunk, cached for
// `$<id>` refs) or a JSON value (an outlined model row, cached for
// `$Q`/`$W`/`$<id>` refs). After collecting rows we resolve the `$`-reference
// markers and search the resulting trees for the first value matching a target
// shape. Ported from the keiyoushi NextJs helper.
// ----------------------------------------------------------------

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

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

function utf8ByteLen(ch: string): number {
  const code = ch.charCodeAt(0);
  if (code < 0x80) return 1;
  if (code < 0x800) return 2;
  return 3;
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
      // Binary chunk: T<hexLen>,<content> where hexLen is a UTF-8 byte length.
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

function walkRefSegment(value: JsonValue, segment: string): JsonValue | null {
  if (Array.isArray(value)) {
    if (value.length >= 4 && value[0] === "$") {
      // React element tuple ["$", type, key, props].
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

function findFirst(
  element: JsonValue,
  predicate: (e: JsonValue) => boolean,
): JsonValue | null {
  if (Array.isArray(element)) {
    if (predicate(element)) return element;
    for (const child of element) {
      const r = findFirst(child, predicate);
      if (r !== null) return r;
    }
    return null;
  }
  if (element !== null && typeof element === "object") {
    if (predicate(element)) return element;
    for (const key of Object.keys(element)) {
      const r = findFirst(element[key], predicate);
      if (r !== null) return r;
    }
  }
  return null;
}

// Parses a raw RSC flight body and returns the first value matching `predicate`.
function extractNextJsRsc(
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

// Mirrors the upstream inferred predicate for MangaDetailsDto: an object that
// carries every non-optional field of the DTO.
function isMangaDetailsDto(e: JsonValue): boolean {
  return (
    e !== null &&
    typeof e === "object" &&
    !Array.isArray(e) &&
    "name" in e &&
    "uri" in e &&
    "description" in e &&
    "genres" in e &&
    "authors" in e &&
    "status" in e
  );
}

// Mirrors the upstream inferred predicate for List<PageEntryDto>: a non-empty
// array whose first element is an object carrying `path`.
function isPageEntryList(e: JsonValue): boolean {
  if (!Array.isArray(e) || e.length === 0) return false;
  const first = e[0];
  return (
    first !== null &&
    typeof first === "object" &&
    !Array.isArray(first) &&
    "path" in first
  );
}

class InfinityScansInterceptor extends PaperbackInterceptor {
  override async interceptRequest(request: Request): Promise<Request> {
    request.headers = {
      ...request.headers,
      referer: `${BASE_URL}/`,
      origin: BASE_URL,
      "user-agent": await Application.getDefaultUserAgent(),
      accept:
        "application/json, text/javascript, text/html,application/xhtml+xml,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.5",
      "x-requested-with": "XMLHttpRequest",
    };
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

    // The API only returns real data when a valid session cookie is present.
    // When the session is missing/invalid, the server responds with a
    // Set-Cookie that clears `__Secure-infinityscans.data` (empty value /
    // expired). Mirrors upstream WebviewInterceptor.hasSessionCookie(): treat
    // that as "session invalid" and open a WebView at the homepage so the
    // site's JS POSTs /api/validate and establishes the real session cookie.
    if (this.responseClearsSession(response)) {
      throw new CloudflareError({
        url: `${BASE_URL}/`,
        method: "GET",
        headers: {
          "user-agent": await Application.getDefaultUserAgent(),
        },
      });
    }
    return data;
  }

  // Returns true when the response carries a Set-Cookie that clears the
  // session cookie (empty value or already-expired), signalling no valid
  // session is established.
  private responseClearsSession(response: Response): boolean {
    const sessionCookie = (response.cookies ?? []).find(
      (c) => c.name === SESSION_COOKIE,
    );
    if (!sessionCookie) return false;

    // An empty value means the server is clearing the cookie.
    const value = (sessionCookie.value ?? "").trim();
    if (value === "" || value.toLowerCase() === "deleted") return true;

    // A past expiry date also indicates the cookie is being cleared.
    if (
      sessionCookie.expires &&
      sessionCookie.expires.getTime() <= Date.now()
    ) {
      return true;
    }
    return false;
  }
}

type InfinityScansImplementation = Extension &
  SearchResultsProviding &
  MangaProviding &
  ChapterProviding &
  CloudflareBypassRequestProviding &
  DiscoverSectionProviding;

export class InfinityScansExtension implements InfinityScansImplementation {
  requestManager = new InfinityScansInterceptor("main");
  cookieStorageInterceptor = new CookieStorageInterceptor({
    storage: "stateManager",
  });
  globalRateLimiter = new BasicRateLimiter("rateLimiter", {
    numberOfRequests: 5,
    bufferInterval: 1,
    ignoreImages: true,
  });

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

  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata: Metadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const meta = metadata as InfinityScansMetadata | undefined;
    const page = meta?.page ?? 1;
    const sort = section.id === "popular" ? SORT_POPULARITY : SORT_LATEST;

    const url = this.comicsUrl(page, sort);
    const dto = await this.fetchJson<SearchResultDto>({ url, method: "GET" });
    const entries = dto.titles ?? [];

    const items: DiscoverSectionItem[] = entries.map((entry) => {
      const mangaId = this.mangaIdFromEntry(entry);
      return {
        type:
          section.id === "popular"
            ? "featuredCarouselItem"
            : "simpleCarouselItem",
        mangaId,
        imageUrl: this.coverUrl(entry.cover),
        title: entry.name,
        metadata: undefined,
      };
    });

    return {
      items,
      metadata: entries.length > 0 ? { page: page + 1 } : undefined,
    };
  }

  // ----------------------------------------------------------------
  // Search
  // ----------------------------------------------------------------

  async getSearchResults(
    query: SearchQuery<Metadata>,
    metadata: Metadata | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const meta = metadata as InfinityScansMetadata | undefined;
    const page = meta?.page ?? 1;
    const titleQuery = (query.title || "").trim();

    let entries: SearchEntryDto[];
    let hasNextPage: boolean;

    if (titleQuery === "") {
      // Browse: GET api/comics?page=... (default sort)
      const url = this.comicsUrl(page, "");
      const dto = await this.fetchJson<SearchResultDto>({
        url,
        method: "GET",
      });
      entries = dto.titles ?? [];
      hasNextPage = entries.length > 0;
    } else {
      // Text search: POST api/search { search }. Single (un-paged) result set.
      const dto = await this.fetchJson<ResponseDto<SearchEntryDto[]>>({
        url: `${BASE_URL}/api/search`,
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ search: titleQuery }),
      });
      entries = dto.result ?? [];
      hasNextPage = false;
    }

    const items: SearchResultItem[] = entries.map((entry) => ({
      mangaId: this.mangaIdFromEntry(entry),
      imageUrl: this.coverUrl(entry.cover),
      title: entry.name,
      subtitle: undefined,
      metadata: undefined,
    }));

    return {
      items,
      metadata: hasNextPage ? { page: page + 1 } : undefined,
    };
  }

  // ----------------------------------------------------------------
  // Manga details
  // ----------------------------------------------------------------

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const slug = this.slugFromMangaId(mangaId);
    const dto = await this.fetchMangaDetails(slug);

    const genres = (dto.genres ?? [])
      .map((g) => (g.name ?? "").trim())
      .filter((g) => g.length > 0);

    const tagGroups: TagSection[] = [];
    if (genres.length > 0) {
      tagGroups.push({
        id: "genres",
        title: "Genres",
        tags: genres.map((g) => ({
          id: g.toLowerCase().replace(/\s+/g, "-"),
          title: g,
        })),
      });
    }

    const author = (dto.authors ?? [])
      .map((a) => (a.name ?? "").trim())
      .filter((a) => a.length > 0)
      .join(", ");

    // Description: the first block's inline text runs, plus the alt titles.
    let synopsis = ((dto.description?.content ?? [])[0]?.content ?? [])
      .map((t) => t.text ?? "")
      .join(" ")
      .trim();
    const altNames = (dto.altNames ?? []).filter((n) => n.trim().length > 0);
    if (altNames.length > 0) {
      synopsis += `\n\nAlternative Title: ${altNames.join(" · ")}`;
    }

    return {
      mangaId,
      mangaInfo: {
        primaryTitle: dto.name || this.safeDecode(slug),
        secondaryTitles: altNames,
        thumbnailUrl: this.coverUrl(dto.cover ?? ""),
        author: author || undefined,
        artist: author || undefined,
        synopsis,
        contentRating: ContentRating.MATURE,
        status: this.parseStatus(dto.status ?? null),
        tagGroups,
        shareUrl: this.mangaUrl(mangaId),
      },
    };
  }

  // Fetches and parses the RSC details payload, retrying once with a refreshed
  // slug hash when the stale hash makes the server answer with a redirect.
  private async fetchMangaDetails(slug: string): Promise<MangaDetailsDto> {
    const html = await this.fetchRsc(
      `${BASE_URL}/comic/${slug}-${await this.slugHash()}`,
    );
    const dto = this.parseMangaDetails(html);
    if (dto) return dto;

    const newHash = HASH_REGEX.exec(html)?.[1];
    if (!newHash) throw new Error("Failed to find slug hash");
    await this.setSlugHash(newHash);

    const retryHtml = await this.fetchRsc(
      `${BASE_URL}/comic/${slug}-${newHash}`,
    );
    const retryDto = this.parseMangaDetails(retryHtml);
    if (!retryDto) throw new Error("Could not parse manga details");
    return retryDto;
  }

  private parseMangaDetails(body: string): MangaDetailsDto | undefined {
    const found = extractNextJsRsc(body, isMangaDetailsDto);
    return found === null ? undefined : (found as unknown as MangaDetailsDto);
  }

  // ----------------------------------------------------------------
  // Chapters
  // ----------------------------------------------------------------

  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    const mangaId = this.idFromMangaId(sourceManga.mangaId);

    const first = await this.fetchJson<ChapterListDto>({
      url: `${BASE_URL}/api/comic/${mangaId}/chapters?page=0`,
      method: "GET",
    });
    const all: ChapterEntryDto[] = [...(first.chapters ?? [])];
    const total = first.total ?? 0;
    const chunkSize = all.length;

    // Fetch the remaining pages concurrently (mirrors the upstream awaitAll).
    if (chunkSize > 0 && total > chunkSize) {
      const totalPages = Math.ceil(total / chunkSize);
      const requests: Promise<ChapterListDto>[] = [];
      for (let page = 1; page < totalPages; page++) {
        requests.push(
          this.fetchJson<ChapterListDto>({
            url: `${BASE_URL}/api/comic/${mangaId}/chapters?page=${page}`,
            method: "GET",
          }),
        );
      }
      for (const dto of await Promise.all(requests)) {
        all.push(...(dto.chapters ?? []));
      }
    }

    return all.map((entry) => ({
      chapterId: this.toSafeId(`comic/${mangaId}/chapter/${entry.id}`),
      sourceManga,
      title: entry.name,
      volume: 0,
      chapNum: this.parseChapterNumber(entry.name, entry.sequence),
      publishDate: this.parseDate(entry.uploaded),
      scanlator: (entry.groups ?? []).map((g) => g.name).join(", ") || undefined,
      langCode: "🇬🇧",
    }));
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    // chapterId is `comic/<mangaId>/chapter/<chapterId>`.
    const path = this.safeDecode(chapter.chapterId).replace(/^\/+/, "");
    const segments = path.split("/");
    const mangaId = segments[1] ?? "";
    const chapterNumId = segments[segments.length - 1] ?? "";

    // The page list is only exposed through a Next.js server action. The dummy
    // slug makes the server emit an empty Set-Cookie when the session expired;
    // baseUrl alone does not. Mirrors upstream getPageList.
    const body = await this.fetchRsc(
      `${BASE_URL}/comic/${mangaId}/dummy-slug/chapter/${chapterNumId}`,
      {
        method: "POST",
        headers: {
          "next-action": PAGES_NEXT_ACTION,
          "content-type": "text/plain;charset=UTF-8",
        },
        body: JSON.stringify([mangaId, chapterNumId]),
      },
    );

    const found = extractNextJsRsc(body, isPageEntryList);
    const entries = (found ?? []) as unknown as PageEntryDto[];

    const pages: string[] = entries
      .map((p) => `https://${PAGE_CDN_HOST}/${(p.path ?? "").replace(/^\/+/, "")}`)
      .filter((p) => !p.endsWith("/"));

    return {
      id: chapter.chapterId,
      mangaId: chapter.sourceManga.mangaId,
      pages,
    };
  }

  getMangaShareUrl(mangaId: string): string {
    return this.mangaUrl(mangaId);
  }

  // ----------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------

  private comicsUrl(page: number, sort: string): string {
    const params: string[] = [`page=${page}`];
    if (sort) params.push(`sort=${sort}`);
    return `${BASE_URL}/api/comics?${params.join("&")}`;
  }

  // The build-specific slug hash is persisted so a refresh survives restarts.
  private async slugHash(): Promise<string> {
    const stored = await Application.getState(SLUG_HASH_KEY);
    return typeof stored === "string" && stored.length > 0
      ? stored
      : DEFAULT_SLUG_HASH;
  }

  private async setSlugHash(hash: string): Promise<void> {
    await Application.setState(hash, SLUG_HASH_KEY);
  }

  // mangaId stored in Paperback is `id/slug` (uri after the leading segment).
  private mangaIdFromEntry(entry: SearchEntryDto): string {
    const slug = entry.uri.replace(/^\/+/, "").replace(/^[^/]*\//, "");
    return this.toSafeId(slug);
  }

  private idFromMangaId(mangaId: string): string {
    return this.safeDecode(mangaId).split("/")[0] ?? "";
  }

  // The stored mangaId is `<id>/<slug>`, which is exactly the path suffix the
  // `/comic/<id>/<slug>-<hash>` details URL expects.
  private slugFromMangaId(mangaId: string): string {
    return this.safeDecode(mangaId).replace(/^\/+/, "");
  }

  private coverUrl(cover: string): string {
    const c = (cover || "").trim();
    if (!c) return "";
    if (c.startsWith("http")) return c;
    return `https://${CDN_HOST}/${c.replace(/^\/+/, "")}`;
  }

  private mangaUrl(mangaId: string): string {
    // Note: intentionally synchronous, so it uses the default hash. The details
    // flow refreshes the persisted hash; share URLs tolerate a redirect.
    return `${BASE_URL}/comic/${this.slugFromMangaId(mangaId)}-${DEFAULT_SLUG_HASH}`;
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

  private parseChapterNumber(name: string, sequence: string): number {
    // Things like prologues mess up the sequence number; prefer "Chapter N".
    const m = (name ?? "").match(/hapter\s+(\d+(?:\.\d+)?)/i);
    if (m) return parseFloat(m[1]);
    const seq = parseFloat(sequence);
    return Number.isNaN(seq) ? 0 : seq;
  }

  private parseDate(value: string): Date {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? new Date(0) : d;
  }

  private parseStatus(status: string | null): string {
    if (!status) return "Unknown";
    const s = status.toLowerCase();
    if (s.includes("ongoing") || s.includes("publishing")) return "Ongoing";
    if (s.includes("hiatus")) return "Hiatus";
    if (s.includes("completed")) return "Completed";
    if (s.includes("dropped") || s.includes("cancelled")) return "Cancelled";
    return "Unknown";
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

  async fetchJson<T>(request: Request): Promise<T> {
    const [response, data] = await Application.scheduleRequest(request);
    if (response.status === 404) {
      throw new Error("Content not found");
    }
    const str = Application.arrayBufferToUTF8String(data);
    return JSON.parse(str) as T;
  }

  // Fetches a raw Next.js flight response body. The `rsc: 1` header makes the
  // server answer with `text/x-component` instead of a full HTML document.
  private async fetchRsc(
    url: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string },
  ): Promise<string> {
    const [, data] = await Application.scheduleRequest({
      url,
      method: init?.method ?? "GET",
      headers: { rsc: "1", ...(init?.headers ?? {}) },
      ...(init?.body === undefined ? {} : { body: init.body }),
    });
    return Application.arrayBufferToUTF8String(data);
  }
}

export const InfinityScans = new InfinityScansExtension();
