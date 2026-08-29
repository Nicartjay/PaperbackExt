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

const BASE_URL = "https://mgread.io";

const MANGA_GRID_SELECTOR = ".manga-item-grid";
const NEXT_PAGE_SELECTOR = "li:not(.uk-disabled) > a[aria-label='Next page']";
const CHAPTER_NUMBER_REGEX = /\/chapter-(\d+(?:\.\d+)?)\//;
const ISO_TZ_REGEX = /([+-]\d{2}):(\d{2})$/;

const GENRES: { id: string; title: string }[] = [
  { id: "action", title: "Action" },
  { id: "adaptation", title: "Adaptation" },
  { id: "adventure", title: "Adventure" },
  { id: "anime", title: "Anime" },
  { id: "comedy", title: "Comedy" },
  { id: "cooking", title: "Cooking" },
  { id: "crime", title: "Crime" },
  { id: "drama", title: "Drama" },
  { id: "ecchi", title: "Ecchi" },
  { id: "fantasy", title: "Fantasy" },
  { id: "harem", title: "Harem" },
  { id: "historical", title: "Historical" },
  { id: "horror", title: "Horror" },
  { id: "isekai", title: "Isekai" },
  { id: "josei", title: "Josei" },
  { id: "martial-arts", title: "Martial Arts" },
  { id: "mature", title: "Mature" },
  { id: "mecha", title: "Mecha" },
  { id: "medical", title: "Medical" },
  { id: "music", title: "Music" },
  { id: "mystery", title: "Mystery" },
  { id: "romance", title: "Romance" },
  { id: "school-life", title: "School Life" },
  { id: "shoujo", title: "Shoujo" },
  { id: "shounen", title: "Shounen" },
  { id: "slice-of-life", title: "Slice of life" },
  { id: "smut", title: "Smut" },
  { id: "sports", title: "Sports" },
  { id: "supernatural", title: "Supernatural" },
  { id: "webtoons", title: "Webtoons" },
];

interface MgreadIoMetadata {
  page?: number;
  genre?: string;
}

interface MgreadSearchDto {
  title: string;
  url: string;
  thumb?: string | null;
}

interface ChapterDto {
  title?: string;
  number?: number;
  slug?: string;
  created_at?: string;
}

interface ChapterListDto {
  items?: ChapterDto[];
  total_pages?: number;
}

class MgreadIoInterceptor extends PaperbackInterceptor {
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

type MgreadIoImplementation = Extension &
  SearchResultsProviding &
  MangaProviding &
  ChapterProviding &
  CloudflareBypassRequestProviding &
  DiscoverSectionProviding;

export class MgreadIoExtension implements MgreadIoImplementation {
  requestManager = new MgreadIoInterceptor("main");
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
        id: "manga-ranking",
        title: "Popular",
        type: DiscoverSectionType.featured,
      },
      {
        id: "recently-updated",
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
    if (section.type === DiscoverSectionType.genres) {
      const items: DiscoverSectionItem[] = GENRES.map((g) => ({
        type: "genresCarouselItem",
        searchQuery: {
          title: "",
          metadata: { genre: g.id },
        },
        name: g.title,
        metadata: undefined,
      }));
      return { items, metadata: undefined };
    }

    const meta = metadata as MgreadIoMetadata | undefined;
    const page = meta?.page ?? 1;
    const url = this.pageUrl(section.id, page);
    const $ = await this.fetchCheerio({ url, method: "GET" });

    const items: DiscoverSectionItem[] = [];
    const seen = new Set<string>();
    $(MANGA_GRID_SELECTOR).each((_, element) => {
      const parsed = this.mangaFromGridElement($, $(element));
      if (!parsed) return;
      if (this.isAnimeEntry(parsed.title, parsed.mangaId)) return;
      if (seen.has(parsed.mangaId)) return;
      seen.add(parsed.mangaId);
      items.push({
        type:
          section.id === "manga-ranking"
            ? "featuredCarouselItem"
            : "simpleCarouselItem",
        mangaId: parsed.mangaId,
        imageUrl: parsed.imageUrl,
        title: parsed.title,
        metadata: undefined,
      });
    });

    const hasNextPage = $(NEXT_PAGE_SELECTOR).length > 0;
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
    metadata: Metadata | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const meta = metadata as MgreadIoMetadata | undefined;
    const page = meta?.page ?? 1;
    const titleQuery = (query.title || "").trim();
    const queryMeta = query.metadata as MgreadIoMetadata | undefined;
    const genre = meta?.genre ?? queryMeta?.genre;

    // Text search hits the JSON search API (single page of results).
    if (titleQuery !== "") {
      const url = `${BASE_URL}/wp-json/initlise/v1/search?term=${encodeURIComponent(
        titleQuery,
      )}&page=${page}`;
      const json = await this.fetchJson<MgreadSearchDto[]>({
        url,
        method: "GET",
      });

      const results: SearchResultItem[] = [];
      const seen = new Set<string>();
      for (const dto of json ?? []) {
        const cleanUrl = (dto.url || "").trim();
        if (!cleanUrl) continue;
        const mangaId = this.parsePath(cleanUrl);
        if (!mangaId || seen.has(mangaId)) continue;
        const parsedTitle = cheerio.load(dto.title || "").text().trim();
        if (this.isAnimeEntry(parsedTitle, mangaId)) continue;
        seen.add(mangaId);
        results.push({
          mangaId,
          imageUrl: dto.thumb ? this.absoluteUrl(dto.thumb) : "",
          title: parsedTitle,
          subtitle: undefined,
          metadata: undefined,
        });
      }
      return { items: results, metadata: undefined };
    }

    // Empty query -> advanced filter HTML browsing (optionally by genre).
    const segments: string[] = ["advanced-filter"];
    if (page > 1) {
      segments.push("page", page.toString());
    }
    let url = `${BASE_URL}/${segments.join("/")}/`;
    if (genre) {
      url += `?genre[]=${encodeURIComponent(genre)}`;
    }
    const $ = await this.fetchCheerio({ url, method: "GET" });

    const results: SearchResultItem[] = [];
    const seen = new Set<string>();
    $(`${MANGA_GRID_SELECTOR}, .manga-item-details`).each((_, element) => {
      const parsed = this.mangaFromGridElement($, $(element));
      if (!parsed) return;
      if (this.isAnimeEntry(parsed.title, parsed.mangaId)) return;
      if (seen.has(parsed.mangaId)) return;
      seen.add(parsed.mangaId);
      results.push({
        mangaId: parsed.mangaId,
        imageUrl: parsed.imageUrl,
        title: parsed.title,
        subtitle: undefined,
        metadata: undefined,
      });
    });

    const hasNextPage = $(NEXT_PAGE_SELECTOR).length > 0;
    return {
      items: results,
      metadata: hasNextPage ? { page: page + 1, genre } : undefined,
    };
  }

  // ----------------------------------------------------------------
  // Manga details
  // ----------------------------------------------------------------

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const url = this.mangaUrl(mangaId);
    const $ = await this.fetchCheerio({ url, method: "GET" });

    const title =
      $("#manga-title").first().clone().children().remove().end().text().trim() ||
      ($("meta[property=og:title]").first().attr("content") || "")
        .split(" [Ch.")[0]
        .trim() ||
      this.safeDecode(mangaId);

    const thumbnailUrl = this.imageFromElement(
      $(".story-cover img, meta[property=og:image]").first(),
    );

    const descriptionText =
      $("#manga-description").first().text().trim() ||
      ($("meta[name=description]").first().attr("content") || "").trim();

    const genres = $("#genre-tags a[href*='/genre/']")
      .map((_, el) => $(el).text().trim())
      .get()
      .filter((g) => g.length > 0);

    const statusText = $("#manga-status").first().text();

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
        synopsis: descriptionText,
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
    const mangaPath = this.mangaPath(sourceManga.mangaId);
    const url = this.mangaUrl(sourceManga.mangaId);
    const $ = await this.fetchCheerio({ url, method: "GET" });

    const idAttr =
      $("#manga-title[data-id]").first().attr("data-id") ||
      $("#chapter-search-input[data-manga-id]").first().attr("data-manga-id") ||
      "";
    const mangaApiId = parseInt(idAttr, 10);

    if (!Number.isNaN(mangaApiId)) {
      const restChapters = await this.fetchChapterList(
        mangaApiId,
        mangaPath,
        sourceManga,
      );
      if (restChapters.length > 0) return restChapters;
    }

    // HTML fallback.
    const chapters: Chapter[] = [];
    const seen = new Set<string>();
    $(".chapter-list .chapter-item").each((_, element) => {
      const el = $(element);
      const link = el.find("a[href*='/chapter-']").first();
      const href = link.attr("href") || "";
      if (!href) return;
      const chapterId = this.parsePath(href);
      if (!chapterId || seen.has(chapterId)) return;
      seen.add(chapterId);

      const decoded = this.safeDecode(chapterId);
      const name =
        el.find("h3").first().text().trim() ||
        decoded
          .replace(/\/+$/, "")
          .split("/")
          .filter((s) => s.length > 0)
          .slice(-1)[0]
          ?.replace(/-/g, " ") ||
        "Chapter";

      const numMatch = href.match(CHAPTER_NUMBER_REGEX);
      const chapNum = numMatch ? parseFloat(numMatch[1]) : -1;
      const dateAttr = el.find("time[datetime]").first().attr("datetime");

      chapters.push({
        chapterId,
        sourceManga,
        title: name,
        volume: 0,
        chapNum,
        publishDate: this.parseChapterDate(dateAttr),
        langCode: "🇬🇧",
      });
    });

    return chapters;
  }

  private async fetchChapterList(
    mangaApiId: number,
    mangaPath: string,
    sourceManga: SourceManga,
  ): Promise<Chapter[]> {
    const chapters: Chapter[] = [];
    const cleanMangaPath = mangaPath.split("/chapter/")[0].replace(/\/+$/, "");

    let page = 1;
    let totalPages = 1;
    do {
      const url = `${BASE_URL}/wp-json/initmanga/v1/chapters?manga_id=${mangaApiId}&paged=${page}&per_page=50`;
      let listDto: ChapterListDto | undefined;
      try {
        listDto = await this.fetchJson<ChapterListDto>({ url, method: "GET" });
      } catch {
        break;
      }
      if (!listDto) break;
      totalPages = listDto.total_pages ?? 1;

      for (const item of listDto.items ?? []) {
        const slug = (item.slug || "").trim();
        if (!slug) continue;
        const chapterPath = `${cleanMangaPath}/${slug}/`;
        const chapterId = this.parsePath(chapterPath);
        const num = item.number ?? -1;
        const chapterName =
          num % 1 === 0 ? String(Math.trunc(num)) : String(num);
        const name = item.title
          ? `Chapter ${chapterName} - ${item.title}`
          : `Chapter ${chapterName}`;

        chapters.push({
          chapterId,
          sourceManga,
          title: name,
          volume: 0,
          chapNum: num,
          publishDate: this.parseRestChapterDate(item.created_at),
          langCode: "🇬🇧",
        });
      }
      page++;
    } while (page <= totalPages);

    return chapters;
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const url = this.chapterUrl(chapter.chapterId);
    const $ = await this.fetchCheerio({ url, method: "GET" });

    const pages: string[] = [];
    // Upstream #18641: the reader lazy-loads pages, so `src` holds a
    // placeholder and the real URL lives in `data-original-src`. Prefer that
    // and fall back to `src` for any non-lazy image.
    $("#chapter-content img[data-original-src], #chapter-content img[src]").each(
      (_, element) => {
        const el = $(element);
        const src = el.attr("data-original-src") || el.attr("src") || "";
        if (!src) return;
        const absolute = this.absoluteUrl(src);
        if (!pages.includes(absolute)) pages.push(absolute);
      },
    );

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

  private pageUrl(slug: string, page: number): string {
    return page === 1
      ? `${BASE_URL}/${slug}/`
      : `${BASE_URL}/${slug}/page/${page}/`;
  }

  private mangaFromGridElement(
    $: CheerioAPI,
    el: Cheerio<AnyNode>,
  ): { mangaId: string; imageUrl: string; title: string } | undefined {
    let link = el.find("h2 a[href*='/manga/']").first();
    if (link.length === 0) {
      link = el
        .find("a[href*='/manga/']:not([href*='/chapter-'])")
        .first();
    }
    const href = link.attr("href") || "";
    if (!href) return undefined;
    const mangaId = this.parsePath(href);
    if (!mangaId) return undefined;
    const title = link.text().trim();
    if (!title) return undefined;
    const imageUrl = this.imageFromElement(el.find("img").first());
    return { mangaId, imageUrl, title };
  }

  private isAnimeEntry(title: string, mangaId: string): boolean {
    const normalized = title.toLowerCase();
    if (normalized.startsWith("anime -") || normalized.startsWith("anime –")) {
      return true;
    }
    const slug = this.safeDecode(mangaId);
    const afterManga = slug.split("/manga/")[1] ?? "";
    return afterManga.startsWith("anime-");
  }

  private mangaUrl(mangaId: string): string {
    const slug = this.safeDecode(mangaId);
    if (slug.startsWith("http")) return slug;
    return `${BASE_URL}/${slug.replace(/^\/+/, "")}`;
  }

  private mangaPath(mangaId: string): string {
    const slug = this.safeDecode(mangaId);
    if (slug.startsWith("http")) {
      return "/" + slug.replace(/^https?:\/\/[^/]+\//, "");
    }
    return "/" + slug.replace(/^\/+/, "");
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

  private imageFromElement(img: Cheerio<AnyNode>): string {
    if (img.length === 0) return "";
    let src = "";
    if ((img.get(0) as { name?: string } | undefined)?.name === "meta") {
      src = img.attr("content") || "";
    } else {
      src =
        img.attr("data-src") ||
        img.attr("data-lazy-src") ||
        img.attr("src") ||
        "";
    }
    return this.absoluteUrl(src);
  }

  private absoluteUrl(src: string): string {
    const s = (src || "").trim();
    if (!s) return "";
    if (s.startsWith("http")) return s;
    if (s.startsWith("//")) return `https:${s}`;
    return s.startsWith("/") ? `${BASE_URL}${s}` : `${BASE_URL}/${s}`;
  }

  private parseStatus(status: string): string {
    switch ((status || "").toLowerCase().trim()) {
      case "ongoing":
        return "Ongoing";
      case "completed":
        return "Completed";
      case "season end":
      case "source hiatus":
      case "caught up":
        return "Hiatus";
      case "dropped":
        return "Cancelled";
      default:
        return "Unknown";
    }
  }

  // Site emits HTML5 datetime with "+07:00" offset or "Z".
  private parseChapterDate(datetime: string | undefined): Date {
    if (!datetime || datetime.trim() === "") return new Date(0);
    const normalized = datetime.replace(ISO_TZ_REGEX, "$1$2").replace(/Z$/, "+0000");
    const ts = Date.parse(normalized.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
    return Number.isNaN(ts) ? new Date(0) : new Date(ts);
  }

  // REST API created_at format: "yyyy-MM-dd HH:mm:ss" in GMT+7.
  private parseRestChapterDate(value: string | undefined): Date {
    if (!value || value.trim() === "") return new Date(0);
    const iso = value.trim().replace(" ", "T") + "+07:00";
    const ts = Date.parse(iso);
    return Number.isNaN(ts) ? new Date(0) : new Date(ts);
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

  async fetchJson<T>(request: Request): Promise<T> {
    const [response, data] = await Application.scheduleRequest(request);
    if (response.status === 404) {
      throw new Error("Content not found");
    }
    const str = Application.arrayBufferToUTF8String(data);
    return JSON.parse(str) as T;
  }
}

export const MgreadIo = new MgreadIoExtension();
