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
import { CheerioAPI, Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import * as htmlparser2 from "htmlparser2";
import {
  GENRE_ORDER,
  MangaFreakSearchForm,
  MangaFreakSearchMeta,
} from "./forms";

const BASE_URL = "https://ww3.mangafreak.me";

interface MangaFreakMetadata {
  page?: number;
}

class MangaFreakInterceptor extends PaperbackInterceptor {
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

type MangaFreakImplementation = Extension &
  SearchResultsProviding &
  MangaProviding &
  ChapterProviding &
  CloudflareBypassRequestProviding &
  DiscoverSectionProviding;

export class MangaFreakExtension implements MangaFreakImplementation {
  requestManager = new MangaFreakInterceptor("main");
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

  async getAdvancedSearchForm(
    query: SearchQuery<Metadata>,
  ): Promise<AdvancedSearchForm> {
    const meta = query.metadata as
      | { searchMeta?: MangaFreakSearchMeta }
      | undefined;
    return new MangaFreakSearchForm(meta?.searchMeta);
  }

  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata: Metadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const meta = metadata as MangaFreakMetadata | undefined;
    const page = meta?.page ?? 1;

    let url: string;
    let isLatest = false;
    if (section.id === "popular") {
      url = `${BASE_URL}/Genre/All/${page}`;
    } else {
      isLatest = true;
      url = page === 1 ? BASE_URL : `${BASE_URL}/Latest_Releases/${page}`;
    }

    const $ = await this.fetchCheerio({ url, method: "GET" });

    const items: DiscoverSectionItem[] = [];
    if (isLatest) {
      $("div.latest_item, div.latest_releases_item").each((_, element) => {
        const el = $(element);
        const parsed = this.parseLatestItem($, el);
        if (!parsed) return;
        items.push({
          type: "simpleCarouselItem",
          mangaId: parsed.mangaId,
          imageUrl: parsed.imageUrl,
          title: parsed.title,
          metadata: undefined,
        });
      });
    } else {
      $("div.ranking_item").each((_, element) => {
        const el = $(element);
        const parsed = this.parseListItem($, el, "a");
        if (!parsed) return;
        items.push({
          type: "featuredCarouselItem",
          mangaId: parsed.mangaId,
          imageUrl: parsed.imageUrl,
          title: parsed.title,
          metadata: undefined,
        });
      });
    }

    const hasNextPage = $("a.next_p").length > 0;
    return {
      items,
      metadata: hasNextPage ? { page: page + 1 } : undefined,
    };
  }

  // ----------------------------------------------------------------
  // Search
  // ----------------------------------------------------------------

  async getSearchResults(
    query: SearchQuery<Metadata>,
    _metadata: Metadata | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const titleQuery = (query.title || "").trim();
    const searchMeta = (
      query.metadata as { searchMeta?: MangaFreakSearchMeta } | undefined
    )?.searchMeta;

    const url = this.buildSearchUrl(titleQuery, searchMeta);
    const $ = await this.fetchCheerio({ url, method: "GET" });

    const results: SearchResultItem[] = [];
    $("div.manga_search_item , div.mangaka_search_item").each(
      (_, element) => {
        const el = $(element);
        const parsed = this.parseListItem($, el, "h3 a, h5 a");
        if (!parsed) return;
        results.push({
          mangaId: parsed.mangaId,
          imageUrl: parsed.imageUrl,
          title: parsed.title,
          subtitle: undefined,
          metadata: undefined,
        });
      },
    );

    // MangaFreak search returns a single page.
    return {
      items: results,
      metadata: undefined,
    };
  }

  private buildSearchUrl(
    query: string,
    searchMeta: MangaFreakSearchMeta | undefined,
  ): string {
    const segments: string[] = [];

    if (query) {
      segments.push("Find", encodeURIComponent(query));
    }

    // Genre tri-state encoding: one digit per genre, 0=ignore, 1=include, 2=exclude.
    const include = new Set(searchMeta?.includeGenres ?? []);
    const exclude = new Set(searchMeta?.excludeGenres ?? []);
    if (include.size > 0 || exclude.size > 0) {
      const digits = GENRE_ORDER.map((g) => {
        if (include.has(g)) return "1";
        if (exclude.has(g)) return "2";
        return "0";
      }).join("");
      segments.push("Genre", digits);
    }

    const status = searchMeta?.status?.[0];
    if (status) {
      segments.push("Status", status);
    }

    const type = searchMeta?.type?.[0];
    if (type) {
      segments.push("Type", type);
    }

    if (segments.length === 0) {
      // Fall back to the genre browse listing so an empty query shows content.
      return `${BASE_URL}/Genre/All/1`;
    }

    return `${BASE_URL}/${segments.join("/")}`;
  }

  // ----------------------------------------------------------------
  // Manga details
  // ----------------------------------------------------------------

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const url = this.mangaUrl(mangaId);
    const $ = await this.fetchCheerio({ url, method: "GET" });

    const thumbnailUrl = this.absoluteUrl(
      $("div.manga_series_image img").first().attr("src") || "",
    );
    const title =
      $("div.manga_series_data h5").first().text().trim() ||
      this.safeDecode(mangaId);
    const statusText = $("div.manga_series_data > div:eq(2)")
      .first()
      .text()
      .trim();
    const author = $("div.manga_series_data > div:eq(3)").first().text().trim();
    const artist = $("div.manga_series_data > div:eq(4)").first().text().trim();

    const genres = $("div.series_sub_genre_list a")
      .map((_, el) => $(el).text().trim())
      .get()
      .filter((g) => g.length > 0);
    const synopsis = $("div.manga_series_description p").first().text().trim();

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
        thumbnailUrl,
        author: author || undefined,
        artist: artist || undefined,
        synopsis,
        contentRating: ContentRating.MATURE,
        status: this.parseStatus(statusText),
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
    const $ = await this.fetchCheerio({ url, method: "GET" });

    const chapters: Chapter[] = [];
    $("div.manga_series_list tr:has(a)").each((_, element) => {
      const el = $(element);
      const name = el.find("td:eq(0)").first().text().trim();
      const href = el.find("a").first().attr("href") || "";
      if (!href) return;
      const chapterId = this.parsePath(href);
      const dateText = el.find("td:eq(1)").first().text().trim();

      chapters.push({
        chapterId,
        sourceManga,
        title: name,
        volume: 0,
        chapNum: this.parseChapterNumber(name),
        publishDate: this.parseDate(dateText),
        langCode: "🇬🇧",
      });
    });

    // Source lists newest-first; reverse to ascending like keiyoushi.
    return chapters.reverse();
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const url = this.chapterUrl(chapter.chapterId);
    const $ = await this.fetchCheerio({ url, method: "GET" });

    const pages: string[] = [];
    $("img#gohere[src]").each((_, element) => {
      const src = $(element).attr("src") || "";
      if (src) pages.push(this.absoluteUrl(src));
    });

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

  private parseListItem(
    $: CheerioAPI,
    el: Cheerio<AnyNode>,
    urlSelector: string,
  ): { mangaId: string; title: string; imageUrl: string } | undefined {
    const link = el.find(urlSelector).first();
    const href = link.attr("href") || "";
    const title = link.text().trim();
    if (!href || !title) return undefined;
    const imageUrl = this.absoluteUrl(el.find("img").first().attr("src") || "");
    return { mangaId: this.parsePath(href), title, imageUrl };
  }

  private parseLatestItem(
    $: CheerioAPI,
    el: Cheerio<AnyNode>,
  ): { mangaId: string; title: string; imageUrl: string } | undefined {
    let link: Cheerio<AnyNode>;
    if (el.hasClass("latest_item")) {
      link = el.find("a.name").first();
    } else {
      link = el.find("a").first();
    }
    const href = link.attr("href") || "";
    const title = link.text().trim();
    if (!href || !title) return undefined;

    // mini_images thumbnails resolve to a higher-res manga_images cover.
    const rawThumb = this.absoluteUrl(el.find("img").first().attr("src") || "");
    const imageUrl = this.upgradeThumbnail(rawThumb);
    return { mangaId: this.parsePath(href), title, imageUrl };
  }

  private upgradeThumbnail(thumb: string): string {
    if (!thumb) return thumb;
    const match = thumb.match(/^(https?:\/\/[^/]+)\/mini_images\/([^/]+)\//);
    if (match) {
      return `${match[1]}/manga_images/${match[2]}.jpg`;
    }
    return thumb;
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
    const cleaned = href.replace(/[?#].*$/, "").replace(/\/+$/, "");
    const slug = cleaned.startsWith("http")
      ? cleaned.replace(/^https?:\/\/[^/]+\//, "")
      : cleaned.replace(/^\/+/, "");
    return this.toSafeId(slug);
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
    // Mirrors keiyoushi floatLetterPattern: /(\d+)(\.\d+|[a-i]+\b)?/
    const match = name.match(/(\d+)(\.\d+|[a-i]+\b)?/);
    if (!match) return -1;
    const suffix = match[2];
    if (!suffix || suffix[0] === ".") {
      return parseFloat(match[0]);
    }
    // Letter suffix (e.g. "10a") -> fractional part: a=1, b=2, ...
    let frac = "0.";
    for (const ch of suffix) {
      frac += String(ch.charCodeAt(0) - "a".charCodeAt(0) + 1);
    }
    return parseFloat(match[1]) + parseFloat(frac);
  }

  private absoluteUrl(src: string): string {
    const s = (src || "").trim();
    if (!s) return "";
    if (s.startsWith("http")) return s;
    return s.startsWith("/") ? `${BASE_URL}${s}` : `${BASE_URL}/${s}`;
  }

  private parseStatus(status: string): string {
    const s = (status || "").toUpperCase().trim();
    if (s === "ON-GOING") return "Ongoing";
    if (s === "COMPLETED") return "Completed";
    return "Unknown";
  }

  private parseDate(dateText: string | undefined): Date {
    if (!dateText) return new Date(0);
    // Format yyyy/MM/dd
    const m = dateText.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    if (m) {
      const d = new Date(
        Number(m[1]),
        Number(m[2]) - 1,
        Number(m[3]),
      );
      if (!isNaN(d.getTime())) return d;
    }
    const fallback = new Date(dateText);
    return isNaN(fallback.getTime()) ? new Date(0) : fallback;
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
}

export const MangaFreak = new MangaFreakExtension();
