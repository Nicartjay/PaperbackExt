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
import * as cheerio from "cheerio";
import { CheerioAPI, Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import * as htmlparser2 from "htmlparser2";
import { findRscObject } from "../utils/nextjs-rsc/flight";

const BASE_URL = "https://valirscans.org";

// Valir Scans is a Next.js (App Router) site. Browse/search pages are plain
// HTML grids, but series-detail and reader data is hydrated as React Server
// Component flight payloads embedded in `self.__next_f.push([...])` scripts (or
// served raw as `text/x-component` when the `rsc:1` header is set). We port the
// upstream keiyoushi `extractNextJs` flight parser to read those chunks as JSON.
const RSC_HEADERS: Record<string, string> = { rsc: "1" };
const BROWSE_PAGE_SIZE = 24;
const TOTAL_RESULTS_REGEX = /Showing\s+\d+\s+of\s+(\d+)\s+results/i;

interface ValirScansMetadata {
  page?: number;
}

interface SeriesPageData {
  series: Record<string, unknown>;
  chapters: unknown[];
  currentPage: number;
  totalPages: number;
}

class ValirScansInterceptor extends PaperbackInterceptor {
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
    return data;
  }
}

type ValirScansImplementation = Extension &
  SearchResultsProviding &
  MangaProviding &
  ChapterProviding &
  CloudflareBypassRequestProviding &
  DiscoverSectionProviding;

export class ValirScansExtension implements ValirScansImplementation {
  requestManager = new ValirScansInterceptor("main");
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
    const meta = metadata as ValirScansMetadata | undefined;
    const page = meta?.page ?? 1;

    const url =
      section.id === "latest"
        ? `${BASE_URL}/series?sort=updated&order=desc&page=${page}`
        : `${BASE_URL}/series?sort=views&order=desc&page=${page}`;
    const $ = await this.fetchCheerio({ url, method: "GET" });

    const items: DiscoverSectionItem[] = [];
    const seen = new Set<string>();
    $("div[role=gridcell]").each((_, element) => {
      const parsed = this.itemFromElement($, $(element));
      if (!parsed || seen.has(parsed.mangaId)) return;
      seen.add(parsed.mangaId);
      items.push({
        type:
          section.id === "latest"
            ? "simpleCarouselItem"
            : "featuredCarouselItem",
        mangaId: parsed.mangaId,
        imageUrl: parsed.imageUrl,
        title: parsed.title,
        metadata: undefined,
      });
    });

    return {
      items,
      metadata: this.hasNextPage($, page) ? { page: page + 1 } : undefined,
    };
  }

  // ----------------------------------------------------------------
  // Search
  // ----------------------------------------------------------------

  async getSearchResults(
    query: SearchQuery<Metadata>,
    metadata: Metadata | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const meta = metadata as ValirScansMetadata | undefined;
    const page = meta?.page ?? 1;
    const titleQuery = (query.title || "").trim();

    const params: string[] = [`page=${page}`];
    if (titleQuery) params.push(`q=${encodeURIComponent(titleQuery)}`);
    const url = `${BASE_URL}/series?${params.join("&")}`;
    const $ = await this.fetchCheerio({ url, method: "GET" });

    const items: SearchResultItem[] = [];
    const seen = new Set<string>();
    $("div[role=gridcell]").each((_, element) => {
      const parsed = this.itemFromElement($, $(element));
      if (!parsed || seen.has(parsed.mangaId)) return;
      seen.add(parsed.mangaId);
      items.push({
        mangaId: parsed.mangaId,
        imageUrl: parsed.imageUrl,
        title: parsed.title,
        subtitle: undefined,
        metadata: undefined,
      });
    });

    return {
      items,
      metadata: this.hasNextPage($, page) ? { page: page + 1 } : undefined,
    };
  }

  private hasNextPage($: CheerioAPI, page: number): boolean {
    const match = TOTAL_RESULTS_REGEX.exec($.root().text());
    const total = match ? parseInt(match[1], 10) : NaN;
    if (Number.isNaN(total)) return false;
    return page * BROWSE_PAGE_SIZE < total;
  }

  private itemFromElement(
    $: CheerioAPI,
    el: Cheerio<AnyNode>,
  ): { mangaId: string; imageUrl: string; title: string } | undefined {
    const link =
      el
        .find("a[href*='?ref=browse']:not([href*='/novel/'])")
        .first()
        .attr("href") ||
      el
        .find(
          "a[href*='/series/']:not([href*='/chapter/']):not([href*='/novel/'])",
        )
        .first()
        .attr("href") ||
      "";
    if (!link) return undefined;
    const mangaId = this.parsePath(link.split("?")[0]);
    if (!mangaId) return undefined;

    const title =
      el.find("h3").first().text().trim() ||
      el.find("img[alt]").first().attr("alt")?.trim() ||
      "";
    if (!title) return undefined;

    const imageUrl = this.extractThumbnailUrl(
      $,
      el.find("img[src], img[srcset]").first(),
    );
    return { mangaId, imageUrl, title };
  }

  // ----------------------------------------------------------------
  // Manga details
  // ----------------------------------------------------------------

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const $ = await this.fetchCheerio({
      url: this.mangaUrl(mangaId),
      method: "GET",
    });

    const pageData = this.extractSeriesPageData($);
    const detail = pageData?.series;

    const schema = this.extractBookSchema($);

    const title =
      this.asString(schema?.name) ||
      $("h1").first().text().trim() ||
      this.safeDecode(mangaId);

    const description =
      this.asString(detail?.description) || this.asString(schema?.description);

    const author =
      this.asString(this.schemaAuthorName(schema)) ||
      this.asString(detail?.author);
    const artist = this.asString(detail?.artist);

    const coverImage =
      this.asString(detail?.coverImage) || this.asString(schema?.image);

    // Build genre list: type (capitalised) + named genres, falling back to
    // the ld+json genre array, then dedupe.
    const genreSet = new Set<string>();
    const type = this.asString(detail?.type);
    if (type) {
      genreSet.add(type.charAt(0).toUpperCase() + type.slice(1));
    }
    if (Array.isArray(detail?.genres)) {
      for (const g of detail.genres as unknown[]) {
        if (typeof g === "object" && g !== null) {
          const name = this.asString((g as Record<string, unknown>).name);
          if (name) genreSet.add(name);
        }
      }
    }
    if (genreSet.size === 0 && Array.isArray(schema?.genre)) {
      for (const g of schema.genre as unknown[]) {
        if (typeof g === "string" && g.length > 0) genreSet.add(g);
      }
    }
    const genres = [...genreSet];

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
        secondaryTitles: [],
        thumbnailUrl: coverImage ? this.absoluteUrl(coverImage) : "",
        author,
        artist,
        synopsis: description ?? "",
        contentRating: ContentRating.EVERYONE,
        status: this.parseStatus(this.asString(detail?.status)),
        tagGroups,
        shareUrl: this.mangaUrl(mangaId),
      },
    };
  }

  // ----------------------------------------------------------------
  // Chapters
  // ----------------------------------------------------------------

  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    const seriesUrl = this.mangaUrl(sourceManga.mangaId);
    const $ = await this.fetchCheerio({ url: seriesUrl, method: "GET" });

    const firstPage = this.extractSeriesPageData($);
    if (!firstPage) return [];

    const seriesPath = this.pathOf(seriesUrl);

    const rawChapters: unknown[] = [...firstPage.chapters];
    for (let p = firstPage.currentPage + 1; p <= firstPage.totalPages; p++) {
      const pageUrl = `${seriesUrl}${seriesUrl.includes("?") ? "&" : "?"}page=${p}`;
      const $$ = await this.fetchCheerio({ url: pageUrl, method: "GET" });
      const pageData = this.extractSeriesPageData($$);
      if (!pageData) continue;
      rawChapters.push(...pageData.chapters);
    }

    const chapters: Chapter[] = [];
    const seen = new Set<string>();
    for (const raw of rawChapters) {
      if (typeof raw !== "object" || raw === null) continue;
      const obj = raw as Record<string, unknown>;
      const number = typeof obj.number === "number" ? obj.number : NaN;
      if (Number.isNaN(number)) continue;

      const numStr = String(number).replace(/\.0$/, "");
      const chapterId = this.parsePath(`${seriesPath}/chapter/${numStr}`);
      if (seen.has(chapterId)) continue;
      seen.add(chapterId);

      const isLocked = obj.isLocked === true;
      const rawTitle = this.asString(obj.title);
      const baseName = rawTitle || `Chapter ${numStr}`;
      const name = isLocked ? `🔒 ${baseName}` : baseName;

      chapters.push({
        chapterId,
        sourceManga,
        title: name,
        volume: 0,
        chapNum: number,
        publishDate: this.parseDate(this.asString(obj.publishedAt)),
        langCode: "🇬🇧",
      });
    }

    // Upstream reverses the (ascending) accumulated list -> newest first.
    return chapters.reverse();
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const body = await this.fetchString({
      url: this.chapterUrl(chapter.chapterId),
      method: "GET",
      headers: RSC_HEADERS,
    });

    const flight = findRscObject(
      body,
      (obj) => typeof obj.chapter === "object" && obj.chapter !== null,
    );

    const pages: string[] = [];
    const chapterObj =
      flight && typeof flight.chapter === "object" && flight.chapter !== null
        ? (flight.chapter as Record<string, unknown>)
        : undefined;

    if (chapterObj && Array.isArray(chapterObj.pages)) {
      const sorted = [...(chapterObj.pages as unknown[])]
        .filter((p): p is Record<string, unknown> =>
          typeof p === "object" && p !== null,
        )
        .sort(
          (a, b) =>
            (typeof a.pageNumber === "number" ? a.pageNumber : 0) -
            (typeof b.pageNumber === "number" ? b.pageNumber : 0),
        );
      for (const p of sorted) {
        const imageUrl = this.asString(p.imageUrl);
        if (imageUrl) pages.push(this.absoluteUrl(imageUrl));
      }
    }

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
  // Next.js flight extraction
  // ----------------------------------------------------------------

  // Pulls the SeriesPageDto (object containing both `series` and `chapters`)
  // out of the hydrated flight payloads embedded in the HTML document.
  private extractSeriesPageData($: CheerioAPI): SeriesPageData | undefined {
    const body = this.collectFlightBody($);
    const obj = findRscObject(
      body,
      (o) => "series" in o && "chapters" in o,
    );
    if (!obj) return undefined;

    const series =
      typeof obj.series === "object" && obj.series !== null
        ? (obj.series as Record<string, unknown>)
        : {};
    const chapters = Array.isArray(obj.chapters)
      ? (obj.chapters as unknown[])
      : [];
    const currentPage =
      typeof obj.currentPage === "number" ? obj.currentPage : 1;
    const totalPages = typeof obj.totalPages === "number" ? obj.totalPages : 1;

    return { series, chapters, currentPage, totalPages };
  }

  // Pulls the ld+json BookSchema object (`@type == "Book"`).
  private extractBookSchema($: CheerioAPI): Record<string, unknown> | undefined {
    let result: Record<string, unknown> | undefined;
    $("script[type='application/ld+json']").each((_, el) => {
      if (result) return;
      const data = $(el).contents().text();
      if (!data) return;
      try {
        const parsed: unknown = JSON.parse(data);
        const candidates = Array.isArray(parsed) ? parsed : [parsed];
        for (const c of candidates) {
          if (
            typeof c === "object" &&
            c !== null &&
            (c as Record<string, unknown>)["@type"] === "Book"
          ) {
            result = c as Record<string, unknown>;
            return;
          }
        }
      } catch {
        // ignore malformed ld+json blocks
      }
    });
    return result;
  }

  private schemaAuthorName(
    schema: Record<string, unknown> | undefined,
  ): unknown {
    if (!schema) return undefined;
    const author = schema.author;
    if (typeof author === "object" && author !== null) {
      return (author as Record<string, unknown>).name;
    }
    return undefined;
  }

  // Concatenates the bodies of all `self.__next_f.push([1, "<body>"])` scripts.
  private collectFlightBody($: CheerioAPI): string {
    let body = "";
    $("script:not([src])").each((_, el) => {
      const data = $(el).contents().text();
      if (!data || !data.includes("self.__next_f.push")) return;
      const match = /self\.__next_f\.push\(\s*(\[[\s\S]*\])\s*\)\s*;?\s*$/.exec(
        data.trim(),
      );
      if (!match) return;
      try {
        const arr: unknown = JSON.parse(match[1]);
        if (Array.isArray(arr) && typeof arr[1] === "string") {
          body += arr[1];
        }
      } catch {
        // ignore unparseable push payloads
      }
    });
    return body;
  }

  // ----------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------

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
    const cleaned = href.replace(/[?#].*$/, "").replace(/\/+$/, "");
    const slug = cleaned.startsWith("http")
      ? cleaned.replace(/^https?:\/\/[^/]+\//, "")
      : cleaned.replace(/^\/+/, "");
    return this.toSafeId(slug);
  }

  private pathOf(url: string): string {
    const cleaned = url.replace(/[?#].*$/, "").replace(/\/+$/, "");
    const path = cleaned.startsWith("http")
      ? cleaned.replace(/^https?:\/\/[^/]+/, "")
      : cleaned;
    return path.startsWith("/") ? path : `/${path}`;
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

  private asString(value: unknown): string | undefined {
    return typeof value === "string" && value.length > 0 ? value : undefined;
  }

  private parseStatus(status?: string): string {
    switch ((status || "").toLowerCase()) {
      case "ongoing":
        return "Ongoing";
      case "completed":
        return "Completed";
      case "hiatus":
        return "Hiatus";
      case "cancelled":
      case "canceled":
      case "dropped":
        return "Cancelled";
      default:
        return "Unknown";
    }
  }

  private parseDate(value?: string): Date {
    if (!value) return new Date(0);
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? new Date(0) : d;
  }

  // Decodes Next.js `/_next/image?url=` proxy URLs back to the real source.
  private extractThumbnailUrl($: CheerioAPI, img: Cheerio<AnyNode>): string {
    let candidate = img.attr("src") || "";
    if (!candidate) {
      candidate = (img.attr("srcset") || "").split(" ")[0] || "";
    }
    candidate = this.absoluteUrl(candidate);
    if (!candidate.includes("/_next/image?url=")) {
      return candidate;
    }
    const match = /[?&]url=([^&]+)/.exec(candidate);
    if (!match) return candidate;
    const decoded = this.safeDecode(match[1]);
    return this.absoluteUrl(decoded);
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

  async fetchCheerio(request: Request): Promise<CheerioAPI> {
    const [response, data] = await Application.scheduleRequest(request);
    if (response.status === 404) {
      throw new Error("Content not found");
    }
    const htmlStr = Application.arrayBufferToUTF8String(data);
    const dom = htmlparser2.parseDocument(htmlStr);
    return cheerio.load(dom);
  }

  async fetchString(request: Request): Promise<string> {
    const [response, data] = await Application.scheduleRequest(request);
    if (response.status === 404) {
      throw new Error("Content not found");
    }
    return Application.arrayBufferToUTF8String(data);
  }
}

export const ValirScans = new ValirScansExtension();
