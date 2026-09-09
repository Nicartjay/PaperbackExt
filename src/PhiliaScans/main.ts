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

const BASE_URL = "https://philiascans.org";
const API_URL = `${BASE_URL}/api`;
const PER_PAGE = 20;

// Page paths ending in `_s.<ext>` carry an encryption/scramble payload.
const SCRAMBLED_PATH = /.*_s\.[^.]+$/;

const GENRES: [string, string][] = [
  ["Action", "action"],
  ["Adventure", "adventure"],
  ["Comedy", "comedy"],
  ["Drama", "drama"],
  ["Ecchi", "ecchi"],
  ["Fantasy", "fantasy"],
  ["Gourmet", "gourmet"],
  ["Harem", "harem"],
  ["Historical", "historical"],
  ["Isekai", "isekai"],
  ["Josei", "josei"],
  ["Magic", "magic"],
  ["Martial Arts", "martial-arts"],
  ["Monsters", "monsters"],
  ["Music", "music"],
  ["Mystery", "mystery"],
  ["Psychological", "psychological"],
  ["Regression", "regression"],
  ["Romance", "romance"],
  ["School Life", "school-life"],
  ["Sci-Fi", "sci-fi"],
  ["Seinen", "seinen"],
  ["Shoujo", "shoujo"],
  ["Shounen", "shounen"],
  ["Slice of Life", "slice-of-life"],
  ["Supernatural", "supernatural"],
  ["Survival", "survival"],
  ["Tragedy", "tragedy"],
  ["Villainess", "villainess"],
  ["War", "war"],
];

type PhiliaScansMetadata = {
  page?: number;
};

type SeriesItem = {
  slug?: string;
  title?: string;
  coverImageUrl?: string | null;
};

type SeriesResponse = {
  items?: SeriesItem[];
  page?: number;
  totalPages?: number;
};

type InfoEntry = {
  name?: string;
};

type DetailsResponse = {
  title?: string;
  alternativeTitles?: string[] | null;
  synopsis?: string | null;
  coverImageUrl?: string | null;
  status?: string | null;
  genres?: InfoEntry[] | null;
  authors?: InfoEntry[] | null;
  artists?: InfoEntry[] | null;
};

type ChapterItem = {
  number?: string;
  title?: string | null;
  slug?: string;
  publishedAt?: string | null;
  coinPrice?: number | null;
  purchased?: boolean | null;
};

type ChapterResponse = {
  items?: ChapterItem[];
};

type ViewerPage = {
  position?: number;
  url?: string;
  mime?: string;
};

type ViewerChapter = {
  id?: number;
  scrambled?: boolean;
  pages?: ViewerPage[];
};

type ViewerResponse = {
  chapter?: ViewerChapter;
  hasAccess?: boolean;
};

type TokenResponse = {
  token?: string;
  /** Unix seconds. Used to cache the token until shortly before it expires. */
  expiresAt?: number;
};

type PageKeysResponse = {
  chapterKeyB64?: string;
  gridSize?: number;
  sessionDefault?: boolean;
};

type OpenResponse = {
  sessionId?: string;
  payloadA?: string | null;
};

type DrmResponse = {
  payloadB?: string | null;
};

class PhiliaScansInterceptor extends PaperbackInterceptor {
  override async interceptRequest(request: Request): Promise<Request> {
    request.headers = {
      ...request.headers,
      referer: `${BASE_URL}/`,
      origin: BASE_URL,
      "user-agent": await Application.getDefaultUserAgent(),
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.5",
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

    // Encrypted/scrambled pages carry their DRM payload in the URL fragment.
    const hashIdx = request.url.indexOf("#");
    if (hashIdx < 0) return data;
    const fragment = request.url.slice(hashIdx + 1);
    if (!fragment) return data;

    // Only the final path segment matching `*_s.<ext>` is protected.
    const lastSegment = lastPathSegment(request.url.slice(0, hashIdx));
    if (!SCRAMBLED_PATH.test(lastSegment)) return data;

    try {
      return await decodePage(fragment, data);
    } catch {
      // Never throw out of interceptResponse; fall back to original bytes.
      return data;
    }
  }
}

type PhiliaScansImplementation = Extension &
  SearchResultsProviding &
  MangaProviding &
  ChapterProviding &
  CloudflareBypassRequestProviding &
  DiscoverSectionProviding;

export class PhiliaScansExtension implements PhiliaScansImplementation {
  /** Refresh the reader token this long before it expires (upstream #18895). */
  static readonly TOKEN_SKEW_MS = 60_000;

  requestManager = new PhiliaScansInterceptor("main");
  cookieStorageInterceptor = new CookieStorageInterceptor({
    storage: "stateManager",
  });
  globalRateLimiter = new BasicRateLimiter("rateLimiter", {
    numberOfRequests: 2,
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
        title: "Trending",
        type: DiscoverSectionType.featured,
      },
      {
        id: "latest",
        title: "Latest Updates",
        type: DiscoverSectionType.simpleCarousel,
      },
      {
        id: "genres",
        title: "Genres",
        type: DiscoverSectionType.genres,
      },
    ];
  }

  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata: Metadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    if (section.id === "genres") {
      const items: DiscoverSectionItem[] = GENRES.map(([name, slug]) => ({
        type: "genresCarouselItem",
        name,
        searchQuery: {
          title: "",
          metadata: { genre: slug },
        },
        metadata: undefined,
      }));
      return { items, metadata: undefined };
    }

    const meta = metadata as PhiliaScansMetadata | undefined;
    const page = meta?.page ?? 1;

    // popular => orderby=trending, latest => recently updated (empty orderby)
    const params: string[] = [`page=${page}`, `perPage=${PER_PAGE}`];
    if (section.id === "popular") {
      params.push("orderby=trending");
    }
    params.push("order=desc");

    const url = `${API_URL}/manga?${params.join("&")}`;
    const result = await this.fetchJson<SeriesResponse>({ url, method: "GET" });

    const items: DiscoverSectionItem[] = [];
    const seen = new Set<string>();
    for (const it of result.items ?? []) {
      const parsed = this.itemToResult(it);
      if (!parsed) continue;
      if (seen.has(parsed.mangaId)) continue;
      seen.add(parsed.mangaId);
      items.push({
        type:
          section.id === "popular"
            ? "featuredCarouselItem"
            : "simpleCarouselItem",
        mangaId: parsed.mangaId,
        imageUrl: parsed.imageUrl,
        title: parsed.title,
        metadata: undefined,
      });
    }

    const hasNext = this.hasNextPage(result);
    return { items, metadata: hasNext ? { page: page + 1 } : undefined };
  }

  // ----------------------------------------------------------------
  // Search
  // ----------------------------------------------------------------

  async getSearchResults(
    query: SearchQuery<Metadata>,
    metadata: Metadata | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const meta = metadata as PhiliaScansMetadata | undefined;
    const page = meta?.page ?? 1;
    const titleQuery = (query.title || "").trim();

    const queryMeta = query.metadata as { genre?: string } | undefined;

    const params: string[] = [`page=${page}`, `perPage=${PER_PAGE}`];
    if (titleQuery) params.push(`q=${encodeURIComponent(titleQuery)}`);
    if (queryMeta?.genre) {
      params.push(`genres=${encodeURIComponent(queryMeta.genre)}`);
    }
    params.push("order=desc");

    const url = `${API_URL}/manga?${params.join("&")}`;
    const result = await this.fetchJson<SeriesResponse>({ url, method: "GET" });

    const results: SearchResultItem[] = [];
    for (const it of result.items ?? []) {
      const parsed = this.itemToResult(it);
      if (!parsed) continue;
      results.push({
        mangaId: parsed.mangaId,
        imageUrl: parsed.imageUrl,
        title: parsed.title,
        subtitle: undefined,
        metadata: undefined,
      });
    }

    const hasNext = this.hasNextPage(result);
    return {
      items: results,
      metadata: hasNext ? { page: page + 1 } : undefined,
    };
  }

  private itemToResult(
    it: SeriesItem,
  ): { mangaId: string; imageUrl: string; title: string } | undefined {
    const slug = (it.slug || "").trim();
    if (!slug) return undefined;
    const title = (it.title || slug).trim();
    return {
      mangaId: this.toSafeId(slug),
      imageUrl: this.absoluteUrl(it.coverImageUrl || ""),
      title,
    };
  }

  // ----------------------------------------------------------------
  // Manga details
  // ----------------------------------------------------------------

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const slug = this.safeDecode(mangaId);
    const url = `${API_URL}/manga/${slug}`;
    const result = await this.fetchJson<DetailsResponse>({
      url,
      method: "GET",
    });

    const title = (result.title || slug).trim();

    const altTitles = (result.alternativeTitles ?? []).filter(
      (t) => !!t && t.trim().length > 0,
    );

    let synopsis = (result.synopsis || "").trim();
    if (altTitles.length > 0) {
      synopsis +=
        "\n\nAlternative Titles:\n" +
        altTitles.map((t) => `- ${t}`).join("\n");
    }

    const author = (result.authors ?? [])
      .map((a) => a.name || "")
      .filter((n) => n.length > 0)
      .join(", ");
    const artist = (result.artists ?? [])
      .map((a) => a.name || "")
      .filter((n) => n.length > 0)
      .join(", ");

    const genres = (result.genres ?? [])
      .map((g) => g.name || "")
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

    return {
      mangaId,
      mangaInfo: {
        primaryTitle: title,
        secondaryTitles: altTitles,
        thumbnailUrl: this.absoluteUrl(result.coverImageUrl || ""),
        author: author || undefined,
        artist: artist || undefined,
        synopsis,
        contentRating: ContentRating.EVERYONE,
        status: this.parseStatus(result.status || ""),
        tagGroups,
        shareUrl: this.mangaUrl(mangaId),
      },
    };
  }

  // ----------------------------------------------------------------
  // Chapters
  // ----------------------------------------------------------------

  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    const slug = this.safeDecode(sourceManga.mangaId);
    const url = `${API_URL}/manga/${slug}/chapters`;
    const result = await this.fetchJson<ChapterResponse>({
      url,
      method: "GET",
    });

    const chapters: Chapter[] = [];
    const seen = new Set<string>();
    for (const item of result.items ?? []) {
      const chapSlug = (item.slug || "").trim();
      if (!chapSlug) continue;
      const chapterId = this.toSafeId(`${slug}/${chapSlug}`);
      if (seen.has(chapterId)) continue;
      seen.add(chapterId);

      const number = (item.number || "").trim();
      const isLocked =
        item.purchased === false && (item.coinPrice ?? 0) !== 0;
      const lock = isLocked ? "🔒 " : "";
      const rawTitle = (item.title || "").trim();
      const validTitle =
        rawTitle && rawTitle !== "null" && rawTitle !== number
          ? rawTitle
          : "";
      const name =
        lock +
        (validTitle
          ? `Chapter ${number} - ${validTitle}`
          : `Chapter ${number}`);

      chapters.push({
        chapterId,
        sourceManga,
        title: name,
        volume: 0,
        chapNum: this.parseChapterNumber(number),
        publishDate: this.parseDate(item.publishedAt),
        langCode: "🇬🇧",
      });
    }

    return chapters;
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    // chapterId is "<mangaSlug>/<chapterSlug>"
    const decoded = this.safeDecode(chapter.chapterId);
    const parts = decoded.replace(/^\/+/, "").split("/");
    const mangaSlug = parts[0] ?? "";
    const chapterSlug = parts[parts.length - 1] ?? "";
    const url = `${API_URL}/manga/${mangaSlug}/chapters/${chapterSlug}`;
    const result = await this.fetchJson<ViewerResponse>({
      url,
      method: "GET",
    });

    if (result.hasAccess === false) {
      throw new Error(
        "Log in via WebView and purchase this chapter to read it.",
      );
    }

    const rawPages = result.chapter?.pages ?? [];
    const sorted = [...rawPages].sort(
      (a, b) => (a.position ?? 0) - (b.position ?? 0),
    );

    const chapterId = result.chapter?.id;
    const isScrambled = result.chapter?.scrambled ? "1" : "0";

    // Fetch the DRM material needed to decrypt the page bytes. The keys are
    // baked into each page URL's fragment so interceptResponse can decode.
    let chapterKeyB64 = "";
    let gridSize = 0;
    let payloadA: string | null = null;
    let payloadB: string | null = null;

    if (chapterId !== undefined && chapterId !== null) {
      try {
        const token = await this.fetchAccessToken();
        const readerHeaders: Record<string, string> = {
          accept: "application/json",
          "accept-language":
            "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7,ja;q=0.6",
          "sec-fetch-mode": "cors",
          "x-requested-with": "XMLHttpRequest",
        };
        if (token) readerHeaders["x-reader-access-token"] = token;

        const pageKeys = await this.fetchJson<PageKeysResponse>({
          url: `${API_URL}/chapters/${chapterId}/page-keys`,
          method: "GET",
          headers: readerHeaders,
        });
        chapterKeyB64 = (pageKeys.chapterKeyB64 || "").trim();
        gridSize = pageKeys.gridSize ?? 0;

        if (pageKeys.sessionDefault === true) {
          const open = await this.fetchJson<OpenResponse>({
            url: `${API_URL}/chapters/${chapterId}/open`,
            method: "POST",
            headers: readerHeaders,
          });
          payloadA = open.payloadA ?? null;
          const sessionId = open.sessionId ?? "";
          if (sessionId) {
            try {
              const drm = await this.fetchJson<DrmResponse>({
                url: `${API_URL}/chapters/${chapterId}/get-drm?session=${encodeURIComponent(sessionId)}`,
                method: "GET",
                headers: readerHeaders,
              });
              payloadB = drm.payloadB ?? null;
            } catch {
              payloadB = null;
            }
          }
        }
      } catch {
        // If the DRM handshake fails, fall through with empty key material.
        // interceptResponse will then return the raw (encrypted) bytes.
      }
    }

    const pages: string[] = [];
    sorted.forEach((page, i) => {
      const src = (page.url || "").trim();
      if (!src) return;
      const mime = (page.mime || "image/jpeg").trim();
      const base = this.absoluteUrl(src);
      // Fragment: isScrambled;mime;chapterKeyB64;gridSize;payloadA;payloadB;pageIndex
      const fragment = [
        isScrambled,
        mime,
        chapterKeyB64,
        String(gridSize),
        payloadA === null ? "null" : payloadA,
        payloadB === null ? "null" : payloadB,
        String(i),
      ].join(";");
      pages.push(`${base}#${fragment}`);
    });

    return {
      id: chapter.chapterId,
      mangaId: chapter.sourceManga.mangaId,
      pages,
    };
  }

  /**
   * Upstream #18895: the reader access token is valid for a while, so cache it
   * instead of POSTing for a new one on every chapter open (the endpoint is
   * rate-limited and was returning 429s). Refreshed once it is within
   * TOKEN_SKEW_MS of expiring.
   */
  private cachedToken?: string;
  private cachedTokenExpiresAtMs = 0;

  private async fetchAccessToken(forceRefresh = false): Promise<string> {
    const now = Date.now();
    if (
      !forceRefresh &&
      this.cachedToken &&
      this.cachedTokenExpiresAtMs - now > PhiliaScansExtension.TOKEN_SKEW_MS
    ) {
      return this.cachedToken;
    }

    try {
      const result = await this.fetchJson<TokenResponse>({
        url: `${API_URL}/reader/access-token`,
        method: "POST",
        headers: {
          accept: "application/json",
          "x-requested-with": "XMLHttpRequest",
        },
      });
      const token = (result.token || "").trim();
      if (token) {
        this.cachedToken = token;
        // `expiresAt` is Unix seconds; treat a missing value as immediately
        // stale so the next call re-fetches rather than caching forever.
        this.cachedTokenExpiresAtMs =
          typeof result.expiresAt === "number" ? result.expiresAt * 1000 : 0;
      }
      return token;
    } catch {
      this.cachedToken = undefined;
      this.cachedTokenExpiresAtMs = 0;
      return "";
    }
  }

  getMangaShareUrl(mangaId: string): string {
    return this.mangaUrl(mangaId);
  }

  // ----------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------

  private hasNextPage(result: SeriesResponse): boolean {
    const page = result.page ?? 1;
    const totalPages = result.totalPages ?? page;
    return page < totalPages;
  }

  private mangaUrl(mangaId: string): string {
    const slug = this.safeDecode(mangaId);
    if (slug.startsWith("http")) return slug;
    return `${BASE_URL}/series/${slug.replace(/^\/+/, "")}`;
  }

  private parseChapterNumber(name: string): number {
    const m = name.match(/(\d+(?:\.\d+)?)/);
    return m ? parseFloat(m[1]) : 0;
  }

  private parseDate(value: string | null | undefined): Date {
    if (!value) return new Date(0);
    const t = Date.parse(value);
    return Number.isNaN(t) ? new Date(0) : new Date(t);
  }

  private parseStatus(status: string): string {
    switch (status) {
      case "ON_GOING":
        return "Ongoing";
      case "COMPLETED":
        return "Completed";
      default:
        return "Unknown";
    }
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

  private absoluteUrl(src: string): string {
    const s = (src || "").trim();
    if (!s) return "";
    if (s.startsWith("http")) return s;
    if (s.startsWith("//")) return `https:${s}`;
    return s.startsWith("/") ? `${BASE_URL}${s}` : `${BASE_URL}/${s}`;
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
}

// --------------------------------------------------------------------
// Page decryption + descramble (module-level)
// --------------------------------------------------------------------

// Decode a single protected page. Mirrors ImageInterceptor.intercept:
//   fragment = isScrambled;mime;chapterKeyB64;gridSize;payloadA;payloadB;pageIndex
// All crypto (HMAC-SHA256 key derivation, AES-CTR, ChaCha20, XOR keystream)
// plus the optional tile unscramble runs inside a single webview where
// window.crypto.subtle and a 2D canvas are available.
async function decodePage(
  fragment: string,
  data: ArrayBuffer,
): Promise<ArrayBuffer> {
  const parts = splitLimit(fragment, ";", 7);
  if (parts.length < 7) return data;

  const isScrambled = parts[0];
  const mimeType = parts[1] || "image/jpeg";
  const chapterKeyB64 = parts[2];
  const gridSize = parseInt(parts[3], 10) || 0;
  const payloadA = parts[4];
  const payloadB = parts[5];
  const pageIndex = parseInt(parts[6], 10);
  if (Number.isNaN(pageIndex)) return data;

  // Resolve the 32-byte chapter key: XOR(payloadA, payloadB) when both are
  // present, otherwise the base64-decoded chapterKeyB64.
  const usePayload =
    payloadA !== "null" &&
    payloadA.length > 0 &&
    payloadB !== "null" &&
    payloadB.length > 0;
  const chapterKeyB64ForInject = usePayload ? "" : chapterKeyB64;

  if (!usePayload && !chapterKeyB64) return data;

  const imgB64 = toBase64String(Application.base64Encode(data));

  const inject = buildInject({
    imgB64,
    mimeType,
    isScrambled,
    gridSize,
    pageIndex,
    usePayload,
    payloadA: usePayload ? payloadA : "",
    payloadB: usePayload ? payloadB : "",
    chapterKeyB64: chapterKeyB64ForInject,
  });

  const result = await Application.executeInWebView({
    source: {
      html: "<html><head></head><body></body></html>",
      baseUrl: BASE_URL,
      loadCSS: false,
      loadImages: true,
    },
    inject,
    storage: { cookies: [] },
  });

  const resultStr = String(result.result || "");
  if (!resultStr) return data;
  // The injected script returns a base64 payload (no data: prefix).
  const decoded = Application.base64Decode(resultStr);
  return toArrayBuffer(decoded);
}

type InjectParams = {
  imgB64: string;
  mimeType: string;
  isScrambled: string;
  gridSize: number;
  pageIndex: number;
  usePayload: boolean;
  payloadA: string;
  payloadB: string;
  chapterKeyB64: string;
};

function buildInject(p: InjectParams): string {
  // Everything below runs inside the webview. It returns a Promise<string>
  // resolving to a base64-encoded image (or "" on any failure).
  return `
(function(){
  return (async function(){
    var IMG_B64 = ${JSON.stringify(p.imgB64)};
    var MIME = ${JSON.stringify(p.mimeType)};
    var IS_SCRAMBLED = ${JSON.stringify(p.isScrambled)};
    var GRID = ${JSON.stringify(p.gridSize)};
    var PAGE_INDEX = ${JSON.stringify(p.pageIndex)};
    var USE_PAYLOAD = ${JSON.stringify(p.usePayload)};
    var PAYLOAD_A = ${JSON.stringify(p.payloadA)};
    var PAYLOAD_B = ${JSON.stringify(p.payloadB)};
    var CHAPTER_KEY_B64 = ${JSON.stringify(p.chapterKeyB64)};

    function b64ToBytes(b64){
      var bin = atob(b64);
      var out = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xFF;
      return out;
    }
    function bytesToB64(bytes){
      var bin = "";
      var chunk = 0x8000;
      for (var i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      }
      return btoa(bin);
    }
    function strToBytes(s){
      var out = new Uint8Array(s.length);
      for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xFF;
      return out;
    }

    // HMAC-SHA256 helpers via WebCrypto.
    async function importHmacKey(keyBytes){
      return await crypto.subtle.importKey(
        "raw", keyBytes.buffer.slice(keyBytes.byteOffset, keyBytes.byteOffset + keyBytes.byteLength),
        { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    }
    async function hmac(keyObj, msgBytes){
      var sig = await crypto.subtle.sign("HMAC", keyObj,
        msgBytes.buffer.slice(msgBytes.byteOffset, msgBytes.byteOffset + msgBytes.byteLength));
      return new Uint8Array(sig);
    }

    function readU32LE(bytes, off){
      return ((bytes[off] | (bytes[off+1] << 8) | (bytes[off+2] << 16) | (bytes[off+3] << 24)) >>> 0);
    }
    function writeU32LE(bytes, off, val){
      bytes[off] = val & 0xFF;
      bytes[off+1] = (val >>> 8) & 0xFF;
      bytes[off+2] = (val >>> 16) & 0xFF;
      bytes[off+3] = (val >>> 24) & 0xFF;
    }
    function rotl(x, n){ return ((x << n) | (x >>> (32 - n))) >>> 0; }

    // --- ChaCha20 (RFC 8439 style, 12-byte nonce, 32-bit counter) ---
    function chachaBlock(keyBytes, nonceBytes, counter){
      var state = new Uint32Array(16);
      state[0]=0x61707865; state[1]=0x3320646e; state[2]=0x79622d32; state[3]=0x6b206574;
      for (var i = 0; i < 8; i++) state[4+i] = readU32LE(keyBytes, i*4);
      state[12] = counter >>> 0;
      state[13] = readU32LE(nonceBytes, 0);
      state[14] = readU32LE(nonceBytes, 4);
      state[15] = readU32LE(nonceBytes, 8);
      var w = state.slice(0);
      function qr(a,b,c,d){
        w[a]=(w[a]+w[b])>>>0; w[d]=rotl(w[d]^w[a],16);
        w[c]=(w[c]+w[d])>>>0; w[b]=rotl(w[b]^w[c],12);
        w[a]=(w[a]+w[b])>>>0; w[d]=rotl(w[d]^w[a],8);
        w[c]=(w[c]+w[d])>>>0; w[b]=rotl(w[b]^w[c],7);
      }
      for (var r = 0; r < 10; r++){
        qr(0,4,8,12); qr(1,5,9,13); qr(2,6,10,14); qr(3,7,11,15);
        qr(0,5,10,15); qr(1,6,11,12); qr(2,7,8,13); qr(3,4,9,14);
      }
      var block = new Uint8Array(64);
      for (var j = 0; j < 16; j++) writeU32LE(block, j*4, (w[j] + state[j]) >>> 0);
      return block;
    }

    try {
      // 1. Resolve the 32-byte chapter key.
      var chapterKey;
      if (USE_PAYLOAD) {
        var a = b64ToBytes(PAYLOAD_A);
        var b = b64ToBytes(PAYLOAD_B);
        chapterKey = new Uint8Array(32);
        for (var k = 0; k < 32; k++) chapterKey[k] = (a[k] ^ b[k]) & 0xFF;
      } else {
        chapterKey = b64ToBytes(CHAPTER_KEY_B64);
      }

      var raw = b64ToBytes(IMG_B64);
      if (raw.length < 4) return "";

      // 2. Detect scheme magic (ff02 AES-CTR, ff03 ChaCha20, ff04 AES-CTR v4).
      var isAes = raw[0] === 0xff && raw[1] === 0x02;
      var isChacha = raw[0] === 0xff && raw[1] === 0x03;
      var isAes4 = raw[0] === 0xff && raw[1] === 0x04;
      var hasMagic = isAes || isChacha || isAes4;
      var offset = hasMagic ? 2 : 0;
      if (raw.length < offset + 4) return "";

      // 3. 4-byte big-endian header: originalWidth, originalHeight.
      var originalWidth = ((raw[offset] << 8) | raw[offset+1]) & 0xFFFF;
      var originalHeight = ((raw[offset+2] << 8) | raw[offset+3]) & 0xFFFF;
      offset += 4;

      var body = raw.subarray(offset);
      var plain;
      var ckKey = await importHmacKey(chapterKey);

      if (isAes4 || isAes) {
        // AES-CTR with HMAC-derived per-page key, zero 16-byte counter.
        var prefix = isAes4 ? "aesctr4:" : "aesctr:";
        var derived = await hmac(ckKey, strToBytes(prefix + PAGE_INDEX));
        var aesKey = await crypto.subtle.importKey(
          "raw", derived.buffer.slice(0, derived.byteLength),
          { name: "AES-CTR" }, false, ["decrypt"]);
        var counter = new Uint8Array(16);
        var dec = await crypto.subtle.decrypt(
          { name: "AES-CTR", counter: counter.buffer, length: 128 },
          aesKey,
          body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength));
        plain = new Uint8Array(dec);
      } else if (isChacha) {
        var ccKeyBytes = await hmac(ckKey, strToBytes("cc:" + PAGE_INDEX));
        var nonce = new Uint8Array(12);
        plain = new Uint8Array(body.length);
        plain.set(body);
        var ctr = 0, off2 = 0;
        while (off2 < plain.length) {
          var blk = chachaBlock(ccKeyBytes, nonce, ctr++);
          var lim = Math.min(blk.length, plain.length - off2);
          for (var z = 0; z < lim; z++) plain[off2 + z] ^= blk[z];
          off2 += blk.length;
        }
      } else {
        // XOR keystream: HMAC-SHA256(chapterKey, "page:idx:block") per 32 bytes.
        plain = new Uint8Array(body.length);
        plain.set(body);
        var numBlocks = Math.ceil(plain.length / 32);
        for (var bi = 0; bi < numBlocks; bi++) {
          var h = await hmac(ckKey, strToBytes("page:" + PAGE_INDEX + ":" + bi));
          var base = bi * 32;
          var lim2 = Math.min(32, plain.length - base);
          for (var jj = 0; jj < lim2; jj++) plain[base + jj] ^= h[jj];
        }
      }

      // 4. Only ff02 / no-magic scrambled pages get tile unscramble.
      var doUnscramble = (IS_SCRAMBLED === "1") && !isChacha && !isAes4;
      if (!doUnscramble) {
        return bytesToB64(plain);
      }

      // Load the decrypted image into a canvas.
      var plainUrl = "data:" + MIME + ";base64," + bytesToB64(plain);
      var img = await new Promise(function(resolve, reject){
        var im = new Image();
        im.onload = function(){ resolve(im); };
        im.onerror = function(){ reject(new Error("img load")); };
        im.src = plainUrl;
      });

      var gridSize = GRID;
      var gridSq = gridSize * gridSize;
      var srcCanvas = document.createElement('canvas');
      srcCanvas.width = img.naturalWidth;
      srcCanvas.height = img.naturalHeight;
      var srcCtx = srcCanvas.getContext('2d');
      srcCtx.drawImage(img, 0, 0);

      var tileW = Math.floor(img.naturalWidth / gridSize);
      var tileH = Math.floor(img.naturalHeight / gridSize);

      // Reconstruct the permutation: identity, then Fisher-Yates driven by
      // HMAC(tilesSig, "perm:N") little-endian 32-bit randoms, where
      // tilesSig = HMAC(chapterKey, "tiles:idx").
      var c = new Array(gridSq);
      for (var ci = 0; ci < gridSq; ci++) c[ci] = ci;

      if (gridSq >= 2) {
        var tilesSig = await hmac(ckKey, strToBytes("tiles:" + PAGE_INDEX));
        var macKey = await importHmacKey(tilesSig);
        var nCounter = 0;
        var rBuf = new Uint8Array(0);
        var aIndex = 8;
        async function nextRandom(){
          if (aIndex >= 8) {
            rBuf = await hmac(macKey, strToBytes("perm:" + (nCounter++)));
            aIndex = 0;
          }
          var v = readU32LE(rBuf, aIndex * 4);
          aIndex++;
          return v >>> 0;
        }
        for (var idx = gridSq - 1; idx >= 1; idx--) {
          var r = await nextRandom();
          var swapIdx = r % (idx + 1);
          var tmp = c[idx]; c[idx] = c[swapIdx]; c[swapIdx] = tmp;
        }
      }

      // Inverse permutation: w[c[i]] = i.
      var wArr = new Array(gridSq);
      for (var wi = 0; wi < gridSq; wi++) wArr[c[wi]] = wi;

      var outCanvas = document.createElement('canvas');
      outCanvas.width = originalWidth || img.naturalWidth;
      outCanvas.height = originalHeight || img.naturalHeight;
      var outCtx = outCanvas.getContext('2d');

      for (var t = 0; t < gridSq; t++) {
        var srcIdx = wArr[t];
        var sx = (srcIdx % gridSize) * tileW;
        var sy = Math.floor(srcIdx / gridSize) * tileH;
        var dx = (t % gridSize) * tileW;
        var dy = Math.floor(t / gridSize) * tileH;
        outCtx.drawImage(srcCanvas, sx, sy, tileW, tileH, dx, dy, tileW, tileH);
      }

      var outMime = (MIME === "image/png") ? "image/png" : (MIME === "image/webp" ? "image/webp" : "image/jpeg");
      var quality = (outMime === "image/jpeg") ? 0.9 : 1.0;
      var outUrl = outCanvas.toDataURL(outMime, quality);
      var commaIdx = outUrl.indexOf(",");
      return commaIdx >= 0 ? outUrl.slice(commaIdx + 1) : "";
    } catch (e) {
      return "";
    }
  })();
})()
`;
}

function splitLimit(s: string, sep: string, limit: number): string[] {
  const out: string[] = [];
  let rest = s;
  while (out.length < limit - 1) {
    const idx = rest.indexOf(sep);
    if (idx < 0) break;
    out.push(rest.slice(0, idx));
    rest = rest.slice(idx + sep.length);
  }
  out.push(rest);
  return out;
}

function lastPathSegment(url: string): string {
  let path = url;
  const protoIdx = path.indexOf("://");
  if (protoIdx >= 0) path = path.slice(protoIdx + 3);
  const slashIdx = path.indexOf("/");
  path = slashIdx >= 0 ? path.slice(slashIdx + 1) : "";
  const qIdx = path.indexOf("?");
  if (qIdx >= 0) path = path.slice(0, qIdx);
  const segments = path.split("/").filter((p) => p.length > 0);
  return segments.length > 0 ? segments[segments.length - 1] : "";
}

function toBase64String(value: string | ArrayBuffer): string {
  if (typeof value === "string") return value;
  return Application.arrayBufferToUTF8String(value);
}

function toArrayBuffer(value: string | ArrayBuffer): ArrayBuffer {
  if (typeof value === "string") {
    const out = new Uint8Array(value.length);
    for (let i = 0; i < value.length; i++) out[i] = value.charCodeAt(i) & 0xff;
    return out.buffer;
  }
  return value;
}

export const PhiliaScans = new PhiliaScansExtension();
