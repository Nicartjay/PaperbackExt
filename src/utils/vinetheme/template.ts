/*
 * VineTheme — shared template for the Next.js RSC sites upstream groups under
 * `lib-multisrc/vinetheme` (Diva Scans, WitchScans, Drake Scans, Valir Scans).
 *
 * Browsing and search use a plain JSON API (`/api/series`, `/api/genres`), while
 * details, chapter lists and page lists are only available inside the Next.js
 * flight payload — fetched by sending the `rsc: 1` header and parsed with the
 * shared helper in `src/utils/nextjs-rsc/flight.ts`.
 *
 * Verified live against divascans.org while porting:
 *   - `/api/series?sort=popular&contentMode=comics&page=1&limit=24` -> JSON
 *   - `/series/comic/<slug>?sort=desc` + `rsc: 1` -> `{ series, chapters, totalPages }`
 *   - `/series/comic/<slug>/chapter/<n>` + `rsc: 1` -> `{ chapter: { pages: [...] } }`
 */

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
  Form,
  MangaProviding,
  Metadata,
  PagedResults,
  PaperbackInterceptor,
  Request,
  Response,
  SearchQuery,
  SearchResultItem,
  SearchResultsProviding,
  SettingsFormProviding,
  SourceManga,
  TagSection,
} from "@paperback/types";
import * as cheerio from "cheerio";
import * as htmlparser2 from "htmlparser2";
import { findRscObject } from "../nextjs-rsc/flight";
import { VineThemeSearchForm, VineThemeSearchMeta } from "./forms";
import {
  getBaseUrlOverride,
  getHideLockedChapters,
  VineThemeSettingsForm,
} from "./settings";

const PER_PAGE = 24;

export interface VineThemeConfig {
  name: string;
  baseUrl: string;
  contentRating?: ContentRating;
  langCode?: string;
}

interface VineThemeMetadata {
  page?: number;
}

// ---- Payload shapes (upstream Dto.kt) ----

interface ApiGenre {
  name?: string;
  slug?: string;
  genre?: { slug?: string };
}

interface ApiManga {
  id: string;
  title: string;
  coverImage?: string | null;
  slug?: string;
  status?: string;
  type?: string;
  origin?: string;
  rating?: number;
  isHot?: boolean;
  isMature?: boolean;
  salePercent?: number | null;
  originalTitle?: string | null;
  aliases?: string[];
  description?: string | null;
  genres?: ApiGenre[];
  team?: { name?: string | null } | null;
}

interface ApiSeriesResponse {
  data?: ApiManga[];
  meta?: { hasMore?: boolean } | null;
}

interface ApiChapter {
  id: string;
  number: number;
  title?: string | null;
  publishedAt?: string | null;
  isLocked?: boolean;
}

class VineThemeInterceptor extends PaperbackInterceptor {
  constructor(
    id: string,
    private readonly getBaseUrl: () => string,
  ) {
    super(id);
  }

  override async interceptRequest(request: Request): Promise<Request> {
    const baseUrl = this.getBaseUrl();
    request.headers = {
      ...request.headers,
      referer: `${baseUrl}/`,
      origin: baseUrl,
      "user-agent": await Application.getDefaultUserAgent(),
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
        headers: { "user-agent": await Application.getDefaultUserAgent() },
      });
    }
    return data;
  }
}

type VineThemeImplementation = Extension &
  SearchResultsProviding &
  MangaProviding &
  ChapterProviding &
  CloudflareBypassRequestProviding &
  SettingsFormProviding &
  DiscoverSectionProviding;

export class VineThemeExtension implements VineThemeImplementation {
  readonly sourceName: string;
  readonly defaultBaseUrl: string;
  readonly contentRating: ContentRating;
  readonly langCode: string;

  requestManager: VineThemeInterceptor;
  cookieStorageInterceptor = new CookieStorageInterceptor({
    storage: "stateManager",
  });
  globalRateLimiter = new BasicRateLimiter("rateLimiter", {
    numberOfRequests: 3,
    bufferInterval: 1,
    ignoreImages: true,
  });

  constructor(config: VineThemeConfig) {
    this.sourceName = config.name;
    this.defaultBaseUrl = config.baseUrl.replace(/\/+$/, "");
    this.contentRating = config.contentRating ?? ContentRating.EVERYONE;
    this.langCode = config.langCode ?? "🇬🇧";
    this.requestManager = new VineThemeInterceptor("main", () => this.baseUrl);
  }

  get baseUrl(): string {
    return getBaseUrlOverride(this.sourceName) ?? this.defaultBaseUrl;
  }

  async initialise(): Promise<void> {
    this.requestManager.registerInterceptor();
    this.cookieStorageInterceptor.registerInterceptor();
    this.globalRateLimiter.registerInterceptor();
  }

  async getSettingsForm(): Promise<Form> {
    return new VineThemeSettingsForm(this.sourceName, this.defaultBaseUrl);
  }

  // ----------------------------------------------------------------
  // Discover
  // ----------------------------------------------------------------

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    return [
      { id: "popular", title: "Popular", type: DiscoverSectionType.featured },
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
    const page = (metadata as VineThemeMetadata | undefined)?.page ?? 1;
    const sort = section.id === "popular" ? "popular" : "updated";
    const { entries, hasNextPage } = await this.fetchSeries({ page, sort });

    const items: DiscoverSectionItem[] = entries.map((m) => ({
      type:
        section.id === "popular" ? "featuredCarouselItem" : "simpleCarouselItem",
      mangaId: this.toMangaId(m),
      imageUrl: this.absoluteUrl(m.coverImage ?? ""),
      title: m.title,
      metadata: undefined,
    }));

    return { items, metadata: hasNextPage ? { page: page + 1 } : undefined };
  }

  // ----------------------------------------------------------------
  // Search
  // ----------------------------------------------------------------

  async getAdvancedSearchForm(
    query: SearchQuery<Metadata>,
  ): Promise<AdvancedSearchForm> {
    const meta = query.metadata as
      | { searchMeta?: VineThemeSearchMeta }
      | undefined;
    return new VineThemeSearchForm(meta?.searchMeta);
  }

  async getSearchResults(
    query: SearchQuery<Metadata>,
    metadata: Metadata | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const page = (metadata as VineThemeMetadata | undefined)?.page ?? 1;
    const searchMeta = (
      query.metadata as { searchMeta?: VineThemeSearchMeta } | undefined
    )?.searchMeta;

    const { entries, hasNextPage } = await this.fetchSeries({
      page,
      q: (query.title || "").trim(),
      sort: searchMeta?.sort?.[0],
      status: searchMeta?.status?.[0],
      type: searchMeta?.type?.[0],
      origin: searchMeta?.origin?.[0],
      genre: searchMeta?.genre?.[0],
    });

    const items: SearchResultItem[] = entries.map((m) => ({
      mangaId: this.toMangaId(m),
      imageUrl: this.absoluteUrl(m.coverImage ?? ""),
      title: m.title,
      subtitle: undefined,
      metadata: undefined,
    }));

    return { items, metadata: hasNextPage ? { page: page + 1 } : undefined };
  }

  // ----------------------------------------------------------------
  // Details / chapters
  // ----------------------------------------------------------------

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const slug = this.slugFromId(mangaId);
    const detail = await this.fetchDetail(slug, 1);
    const series = detail?.series;
    if (!series) throw new Error("Content not found");

    const genres = (series.genres ?? [])
      .map((g) => this.stripEmoji(g.name || g.genre?.slug || ""))
      .filter((g) => g.length > 0);
    const extras: string[] = [];
    if (series.type) extras.push(series.type);
    if (series.origin) extras.push(series.origin);
    if (series.isMature) extras.push("Mature");
    const allTags = [...new Set([...extras, ...genres])];

    const tagGroups: TagSection[] =
      allTags.length > 0
        ? [
            {
              id: "genres",
              title: "Genres",
              tags: allTags.map((g) => ({
                id: g.toLowerCase().replace(/\s+/g, "-"),
                title: g,
              })),
            },
          ]
        : [];

    const altTitles = [
      ...(series.originalTitle ? [series.originalTitle] : []),
      ...(series.aliases ?? []),
    ]
      .map((s) => s.trim())
      .filter(
        (s) => s.length > 0 && s.toLowerCase() !== series.title.toLowerCase(),
      );

    const info: string[] = [];
    if (typeof series.rating === "number" && series.rating > 0) {
      info.push(`Rating: ${series.rating}`);
    }
    if (series.type) info.push(`Type: ${series.type}`);
    if (series.origin) info.push(`Origin: ${series.origin}`);
    if (series.isHot) info.push("Featured");
    if (series.isMature) info.push("Mature");
    if (series.salePercent && series.salePercent > 0) {
      info.push(`Sale: ${series.salePercent}%`);
    }

    let synopsis = this.htmlToText(series.description ?? "");
    if (info.length > 0) {
      synopsis += (synopsis ? "\n\n" : "") + info.join("\n");
    }

    return {
      mangaId,
      mangaInfo: {
        primaryTitle: series.title,
        secondaryTitles: [...new Set(altTitles)],
        thumbnailUrl: this.absoluteUrl(series.coverImage ?? ""),
        author: series.team?.name ?? undefined,
        artist: series.team?.name ?? undefined,
        synopsis,
        contentRating: this.contentRating,
        status: this.parseStatus(series.status),
        tagGroups,
        shareUrl: `${this.baseUrl}/series/comic/${slug}`,
      },
    };
  }

  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    const slug = this.slugFromId(sourceManga.mangaId);
    const first = await this.fetchDetail(slug, 1);
    if (!first) throw new Error("Content not found");

    const all: ApiChapter[] = [...(first.chapters ?? [])];
    const totalPages =
      typeof first.totalPages === "number" ? first.totalPages : 1;
    for (let p = 2; p <= totalPages; p++) {
      const next = await this.fetchDetail(slug, p);
      if (!next) break;
      all.push(...(next.chapters ?? []));
    }

    const hideLocked = getHideLockedChapters(this.sourceName);
    const seen = new Set<string>();
    const chapters: Chapter[] = [];

    for (const ch of all) {
      const locked = ch.isLocked === true;
      if (hideLocked && locked) continue;
      const numberStr = String(ch.number).replace(/\.0$/, "");
      const chapterId = this.toSafeId(`${slug}/${numberStr}`);
      if (seen.has(chapterId)) continue;
      seen.add(chapterId);

      const title =
        !ch.title || ch.title.trim() === "" || ch.title === numberStr
          ? `Chapter ${numberStr}`
          : ch.title;

      chapters.push({
        chapterId,
        sourceManga,
        title: `${locked ? "🔒 " : ""}${title}`,
        volume: 0,
        chapNum: ch.number,
        publishDate: this.parseDate(ch.publishedAt),
        langCode: this.langCode,
      });
    }

    return chapters.sort((a, b) => b.chapNum - a.chapNum);
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const decoded = this.safeDecode(chapter.chapterId);
    const url = `${this.baseUrl}/series/comic/${decoded.replace("/", "/chapter/")}`;
    const body = await this.fetchRsc(url);
    const obj = findRscObject(body, (o) => "chapter" in o);
    const inner = obj?.chapter as { pages?: unknown } | undefined;
    const rawPages = Array.isArray(inner?.pages) ? inner.pages : [];

    const pages: string[] = [];
    for (const p of rawPages) {
      const dto = p as { imageUrl?: unknown };
      if (typeof dto.imageUrl === "string" && dto.imageUrl.length > 0) {
        pages.push(this.absoluteUrl(dto.imageUrl));
      }
    }

    if (pages.length === 0) {
      throw new Error(
        "No pages found. Locked chapters require coins on the site.",
      );
    }

    return {
      id: chapter.chapterId,
      mangaId: chapter.sourceManga.mangaId,
      pages,
    };
  }

  async getMangaShareUrl(mangaId: string): Promise<string> {
    return `${this.baseUrl}/series/comic/${this.slugFromId(mangaId)}`;
  }

  // ----------------------------------------------------------------
  // Fetch helpers
  // ----------------------------------------------------------------

  private async fetchSeries(opts: {
    page: number;
    sort?: string;
    q?: string;
    status?: string;
    type?: string;
    origin?: string;
    genre?: string;
  }): Promise<{ entries: ApiManga[]; hasNextPage: boolean }> {
    const params: string[] = [
      `contentMode=comics`,
      `limit=${PER_PAGE}`,
      `page=${opts.page}`,
    ];
    if (opts.sort) params.push(`sort=${encodeURIComponent(opts.sort)}`);
    if (opts.q) params.push(`q=${encodeURIComponent(opts.q)}`);
    if (opts.status) params.push(`status=${encodeURIComponent(opts.status)}`);
    if (opts.type) params.push(`type=${encodeURIComponent(opts.type)}`);
    if (opts.origin) params.push(`origin=${encodeURIComponent(opts.origin)}`);
    if (opts.genre) params.push(`genre=${encodeURIComponent(opts.genre)}`);

    const [response, data] = await Application.scheduleRequest({
      url: `${this.baseUrl}/api/series?${params.join("&")}`,
      method: "GET",
    });
    if (response.status < 200 || response.status >= 300) {
      return { entries: [], hasNextPage: false };
    }
    const parsed = this.parseJson<ApiSeriesResponse>(data);
    return {
      entries: parsed?.data ?? [],
      hasNextPage: parsed?.meta?.hasMore === true,
    };
  }

  /** Read `{ series, chapters, totalPages }` out of the details flight payload. */
  private async fetchDetail(
    slug: string,
    page: number,
  ): Promise<
    | { series?: ApiManga; chapters?: ApiChapter[]; totalPages?: number }
    | undefined
  > {
    const suffix = page > 1 ? `&page=${page}` : "";
    const body = await this.fetchRsc(
      `${this.baseUrl}/series/comic/${slug}?sort=desc${suffix}`,
    );
    const obj = findRscObject(
      body,
      (o) => "series" in o && "chapters" in o,
    );
    if (!obj) return undefined;
    return obj as {
      series?: ApiManga;
      chapters?: ApiChapter[];
      totalPages?: number;
    };
  }

  /**
   * Fetch a page as a raw RSC flight payload. The `rsc: 1` header makes Next.js
   * stream the payload directly instead of the hydrated HTML document.
   */
  private async fetchRsc(url: string): Promise<string> {
    const [response, data] = await Application.scheduleRequest({
      url,
      method: "GET",
      headers: { rsc: "1" },
    });
    if (response.status === 404) throw new Error("Content not found");
    return Application.arrayBufferToUTF8String(data);
  }

  // ----------------------------------------------------------------
  // Small helpers
  // ----------------------------------------------------------------

  private toMangaId(m: ApiManga): string {
    return this.toSafeId(m.slug || m.id);
  }

  private slugFromId(mangaId: string): string {
    return this.safeDecode(mangaId).split("/")[0];
  }

  private parseStatus(status?: string): string {
    switch ((status ?? "").toUpperCase()) {
      case "ONGOING":
        return "Ongoing";
      case "COMPLETED":
        return "Completed";
      case "HIATUS":
        return "Hiatus";
      case "CANCELLED":
        return "Cancelled";
      default:
        return "Unknown";
    }
  }

  /** Upstream `stripEmoji`: genre names are prefixed with decorative emoji. */
  private stripEmoji(value: string): string {
    return value.replace(/[^\p{L}\p{N}\-\s]+/gu, "").trim();
  }

  private parseDate(value?: string | null): Date {
    if (!value) return new Date(0);
    const t = Date.parse(value);
    return isNaN(t) ? new Date(0) : new Date(t);
  }

  private parseJson<T>(data: ArrayBuffer): T | undefined {
    try {
      return JSON.parse(Application.arrayBufferToUTF8String(data)) as T;
    } catch {
      return undefined;
    }
  }

  /**
   * Upstream #18699: descriptions come back as HTML. Render them as readable
   * text — links become `[text](url)`, paragraphs become blank lines and `<br>`
   * becomes a newline — instead of dumping raw tags into the synopsis.
   */
  private htmlToText(html: string): string {
    const raw = (html || "").trim();
    if (!raw) return "";
    if (!/[<&]/.test(raw)) return raw;

    const $ = cheerio.load(htmlparser2.parseDocument(raw));
    $("a[href]").each((_, el) => {
      const link = $(el);
      const href = this.absoluteUrl(link.attr("href") ?? "");
      const text = link.text().trim();
      link.replaceWith(text.length === 0 ? href : `[${text}](${href})`);
    });
    $("p").each((_, el) => {
      $(el).after("\n\n");
    });
    $("br").each((_, el) => {
      $(el).replaceWith("\n");
    });

    return $.root()
      .text()
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  private absoluteUrl(src: string): string {
    const s = (src || "").trim();
    if (!s) return "";
    if (s.startsWith("http")) return s;
    if (s.startsWith("//")) return `https:${s}`;
    return s.startsWith("/") ? `${this.baseUrl}${s}` : `${this.baseUrl}/${s}`;
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
}
