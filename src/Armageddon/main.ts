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
import { CheerioAPI } from "cheerio";
import * as htmlparser2 from "htmlparser2";
import { findRscObject } from "../utils/nextjs-rsc/flight";
import { SilentQuillSearchForm, SilentQuillSearchMeta } from "./forms";

/*
 * Upstream #18885 replaced this source: "Armageddon" was redesigned and
 * relaunched as "SilentQuill" on a Next.js stack (the old MangaThemesia markup
 * is gone entirely). The folder — and therefore our source id — is kept so
 * existing libraries survive the rename.
 *
 * Listings, details and genres are all present in the served HTML, so those are
 * scraped directly. Only the chapter list and the page list live exclusively in
 * the React flight payload, which is read with the shared parser in
 * `src/utils/nextjs-rsc/flight.ts` (chapters from the embedded
 * `self.__next_f.push(...)` scripts, pages from a direct `rsc: 1` request).
 *
 * Verified live while porting: 84 series links on the homepage, chapter objects
 * (`chapter_no`/`slug`/`time_ago`) from the details payload, and 37 pages for a
 * real chapter.
 */

const BASE_URL = "https://silentquill.net";

interface SilentQuillMetadata {
  page?: number;
}

/** Chapter row inside the details flight payload (upstream `ChapterResponse`). */
interface ChapterDto {
  id: number;
  slug: string;
  chapter_no: string;
  time_ago?: string;
}

class SilentQuillInterceptor extends PaperbackInterceptor {
  override async interceptRequest(request: Request): Promise<Request> {
    request.headers = {
      ...request.headers,
      referer: `${BASE_URL}/`,
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
        headers: { "user-agent": await Application.getDefaultUserAgent() },
      });
    }
    return data;
  }
}

type SilentQuillImplementation = Extension &
  SearchResultsProviding &
  MangaProviding &
  ChapterProviding &
  CloudflareBypassRequestProviding &
  DiscoverSectionProviding;

export class ArmageddonExtension implements SilentQuillImplementation {
  requestManager = new SilentQuillInterceptor("main");
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
    _metadata: Metadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    // The homepage carries both carousels; latest updates come from the search
    // listing (upstream routes `getLatestUpdates` through an empty search).
    const $ =
      section.id === "popular"
        ? await this.fetchCheerio({ url: `${BASE_URL}/`, method: "GET" })
        : await this.fetchCheerio({
            url: `${BASE_URL}/search/?q=&page=1`,
            method: "GET",
          });

    const items: DiscoverSectionItem[] = this.parseCards($).map((c) => ({
      type:
        section.id === "popular" ? "featuredCarouselItem" : "simpleCarouselItem",
      mangaId: c.mangaId,
      imageUrl: c.imageUrl,
      title: c.title,
      metadata: undefined,
    }));

    return { items, metadata: undefined };
  }

  // ----------------------------------------------------------------
  // Search
  // ----------------------------------------------------------------

  async getAdvancedSearchForm(
    query: SearchQuery<Metadata>,
  ): Promise<AdvancedSearchForm> {
    const meta = query.metadata as
      | { searchMeta?: SilentQuillSearchMeta }
      | undefined;
    return new SilentQuillSearchForm(meta?.searchMeta);
  }

  async getSearchResults(
    query: SearchQuery<Metadata>,
    metadata: Metadata | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const page = (metadata as SilentQuillMetadata | undefined)?.page ?? 1;
    const searchMeta = (
      query.metadata as { searchMeta?: SilentQuillSearchMeta } | undefined
    )?.searchMeta;

    const params: string[] = [];
    const status = searchMeta?.status?.[0];
    const genre = searchMeta?.genre?.[0];
    if (status) params.push(`status=${encodeURIComponent(status)}`);
    if (genre) params.push(`genre=${encodeURIComponent(genre)}`);
    params.push(`q=${encodeURIComponent((query.title || "").trim())}`);
    params.push(`page=${page}`);

    const $ = await this.fetchCheerio({
      url: `${BASE_URL}/search/?${params.join("&")}`,
      method: "GET",
    });

    const cards = this.parseCards($);
    const items: SearchResultItem[] = cards.map((c) => ({
      mangaId: c.mangaId,
      imageUrl: c.imageUrl,
      title: c.title,
      subtitle: undefined,
      metadata: undefined,
    }));

    // The pager links to the next page explicitly.
    const hasNextPage = $(`a[href*="page=${page + 1}"]`).length > 0;
    return { items, metadata: hasNextPage ? { page: page + 1 } : undefined };
  }

  // ----------------------------------------------------------------
  // Details
  // ----------------------------------------------------------------

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const slug = this.safeDecode(mangaId);
    const $ = await this.fetchCheerio({
      url: `${BASE_URL}/series/${slug}/`,
      method: "GET",
    });

    const title = $("h1").first().text().trim();
    // "AUTHOR · art by ARTIST"
    const authorLine = $("p.mt-2.text-sm.text-ink-dim").first().text().trim();
    const author = authorLine.split(" · art by ")[0]?.trim();
    const artist = authorLine.includes(" · art by ")
      ? authorLine.split(" · art by ")[1]?.trim()
      : undefined;

    const synopsis = $("div.reader-content").first().text().trim();

    const genres: string[] = [];
    $('a[href^="/search/?genre="]').each((_, el) => {
      const g = $(el).text().trim();
      if (g && !genres.includes(g)) genres.push(g);
    });
    const tagGroups: TagSection[] =
      genres.length > 0
        ? [
            {
              id: "genres",
              title: "Genres",
              tags: genres.map((g) => ({
                id: g.toLowerCase().replace(/\s+/g, "-"),
                title: g,
              })),
            },
          ]
        : [];

    // Status sits in a <dt>Status</dt><dd>…</dd> pair.
    let statusText = "";
    $("dt").each((_, el) => {
      if (statusText) return;
      if ($(el).text().trim().toLowerCase() === "status") {
        statusText = $(el).next("dd").text().trim();
      }
    });

    const thumbnailUrl = this.absoluteUrl(
      $('main img[src^="/img/"], img[src^="/img/"]').first().attr("src") || "",
    );

    return {
      mangaId,
      mangaInfo: {
        primaryTitle: title,
        secondaryTitles: [],
        thumbnailUrl,
        author: author || undefined,
        artist: artist || undefined,
        synopsis,
        contentRating: ContentRating.MATURE,
        status: this.parseStatus(statusText),
        tagGroups,
        shareUrl: `${BASE_URL}/series/${slug}/`,
      },
    };
  }

  // ----------------------------------------------------------------
  // Chapters
  // ----------------------------------------------------------------

  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    const slug = this.safeDecode(sourceManga.mangaId);
    const [response, data] = await Application.scheduleRequest({
      url: `${BASE_URL}/series/${slug}/`,
      method: "GET",
    });
    if (response.status === 404) throw new Error("Content not found");
    const html = Application.arrayBufferToUTF8String(data);

    // Chapters are only in the flight payload, not the rendered DOM.
    const body = this.collectFlightBody(html);
    const list = findRscObject(
      body,
      (o) => Array.isArray(o.chapters) || "chapter_no" in o,
    );

    let rows: ChapterDto[] = [];
    if (list && Array.isArray((list as { chapters?: unknown }).chapters)) {
      rows = (list as { chapters: ChapterDto[] }).chapters;
    } else {
      // The payload may hold a bare array of chapter objects instead.
      rows = this.collectChapterRows(body);
    }

    const seen = new Set<string>();
    const chapters: Chapter[] = [];
    for (const row of rows) {
      if (!row || typeof row.slug !== "string") continue;
      const chapterId = this.toSafeId(`${slug}/${row.slug}`);
      if (seen.has(chapterId)) continue;
      seen.add(chapterId);

      const num = parseFloat(String(row.chapter_no ?? ""));
      chapters.push({
        chapterId,
        sourceManga,
        title: `Chapter ${row.chapter_no}`,
        volume: 0,
        chapNum: isNaN(num) ? -1 : num,
        publishDate: this.parseRelativeDate(row.time_ago),
        langCode: "🇬🇧",
      });
    }

    return chapters.sort((a, b) => b.chapNum - a.chapNum);
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const path = this.safeDecode(chapter.chapterId);
    const [response, data] = await Application.scheduleRequest({
      url: `${BASE_URL}/series/${path}/`,
      method: "GET",
      headers: { rsc: "1" },
    });
    if (response.status === 404) throw new Error("Content not found");
    const body = Application.arrayBufferToUTF8String(data);

    const viewer = findRscObject(
      body,
      (o) => Array.isArray((o as { pages?: unknown }).pages),
    );
    const rawPages = (viewer as { pages?: unknown[] } | undefined)?.pages ?? [];

    const pages: string[] = [];
    for (const p of rawPages) {
      const url = (p as { url?: unknown }).url;
      if (typeof url === "string" && url.length > 0) {
        pages.push(this.absoluteUrl(url));
      }
    }

    if (pages.length === 0) throw new Error("No pages found for this chapter");

    return {
      id: chapter.chapterId,
      mangaId: chapter.sourceManga.mangaId,
      pages,
    };
  }

  getMangaShareUrl(mangaId: string): string {
    return `${BASE_URL}/series/${this.safeDecode(mangaId)}/`;
  }

  // ----------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------

  /** Series cards: an `/series/<slug>/` anchor plus an `/img/...` cover. */
  private parseCards(
    $: CheerioAPI,
  ): { mangaId: string; title: string; imageUrl: string }[] {
    const out: { mangaId: string; title: string; imageUrl: string }[] = [];
    const seen = new Set<string>();

    $('img[src^="/img/"]').each((_, el) => {
      const img = $(el);
      const alt = (img.attr("alt") || "").trim();
      const src = img.attr("src") || "";
      if (!alt || !src) return;

      // Nearest ancestor anchor pointing at a series (not a chapter) page.
      const anchor = img
        .parents("a")
        .filter((__, a) => {
          const href = $(a).attr("href") || "";
          return /^\/series\/[^/]+\/$/.test(href);
        })
        .first();
      const href = anchor.attr("href") || "";
      if (!href) return;

      const slug = href.replace(/^\/series\//, "").replace(/\/+$/, "");
      if (!slug || seen.has(slug)) return;
      seen.add(slug);

      out.push({
        mangaId: this.toSafeId(slug),
        title: alt,
        imageUrl: this.absoluteUrl(src),
      });
    });

    return out;
  }

  /** Concatenate every `self.__next_f.push([1, "<body>"])` payload. */
  private collectFlightBody(html: string): string {
    let body = "";
    const re = /self\.__next_f\.push\(\s*(\[[\s\S]*?\])\s*\)\s*;?/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(html)) !== null) {
      try {
        const parsed: unknown = JSON.parse(match[1]);
        if (Array.isArray(parsed) && typeof parsed[1] === "string") {
          body += parsed[1];
        }
      } catch {
        // ignore unparseable push payloads
      }
    }
    return body;
  }

  /**
   * Fallback: sweep the flight body for every `{"chapter_no": ...}` object when
   * the chapters are not wrapped in a single container.
   */
  private collectChapterRows(body: string): ChapterDto[] {
    const rows: ChapterDto[] = [];
    const re = /\{"id":\d+,"slug":"[^"]+","chapter_no":"[^"]*"[^{}]*\}/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(body)) !== null) {
      try {
        rows.push(JSON.parse(match[0]) as ChapterDto);
      } catch {
        // skip malformed row
      }
    }
    return rows;
  }

  /** Upstream `toRelativeDate`: "3 days", "1 year", ... */
  private parseRelativeDate(text?: string): Date {
    if (!text) return new Date(0);
    const m = text.match(/(\d+)\s+(minute|hour|day|week|month|year)s?/i);
    if (!m) return new Date(0);
    const amount = parseInt(m[1], 10);
    const unit = m[2].toLowerCase();
    const now = Date.now();
    const MIN = 60_000;
    const factors: Record<string, number> = {
      minute: MIN,
      hour: 60 * MIN,
      day: 24 * 60 * MIN,
      week: 7 * 24 * 60 * MIN,
      month: 30 * 24 * 60 * MIN,
      year: 365 * 24 * 60 * MIN,
    };
    return new Date(now - amount * (factors[unit] ?? 0));
  }

  private parseStatus(status: string): string {
    switch (status.trim().toLowerCase()) {
      case "ongoing":
        return "Ongoing";
      case "completed":
        return "Completed";
      default:
        return "Unknown";
    }
  }

  private absoluteUrl(src: string): string {
    const s = (src || "").trim();
    if (!s) return "";
    if (s.startsWith("http")) return s;
    if (s.startsWith("//")) return `https:${s}`;
    return s.startsWith("/") ? `${BASE_URL}${s}` : `${BASE_URL}/${s}`;
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

  async fetchCheerio(request: Request): Promise<CheerioAPI> {
    const [response, data] = await Application.scheduleRequest(request);
    if (response.status === 404) throw new Error("Content not found");
    const html = Application.arrayBufferToUTF8String(data);
    return cheerio.load(htmlparser2.parseDocument(html));
  }
}

export const Armageddon = new ArmageddonExtension();
