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
} from "@paperback/types";
import * as cheerio from "cheerio";
import { CheerioAPI } from "cheerio";
import * as htmlparser2 from "htmlparser2";
import { NewManhwaSearchForm, NewManhwaSearchMeta } from "./forms";

const BASE_URL = "https://saymanhwa.com";

interface NewManhwaMetadata {
  page?: number;
}

class NewManhwaInterceptor extends PaperbackInterceptor {
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

type NewManhwaImplementation = Extension &
  SearchResultsProviding &
  MangaProviding &
  ChapterProviding &
  CloudflareBypassRequestProviding &
  DiscoverSectionProviding;

export class NewManhwaExtension implements NewManhwaImplementation {
  requestManager = new NewManhwaInterceptor("main");
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
      | { searchMeta?: NewManhwaSearchMeta }
      | undefined;
    return new NewManhwaSearchForm(meta?.searchMeta);
  }

  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata: Metadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const meta = metadata as NewManhwaMetadata | undefined;
    const page = meta?.page ?? 1;

    const path = section.id === "latest" ? "latest" : "popular";
    const { items: listItems, hasNextPage } = await this.fetchList(
      `${BASE_URL}/${path}?page=${page}`,
    );

    const itemType =
      section.id === "latest" ? "simpleCarouselItem" : "featuredCarouselItem";
    const items: DiscoverSectionItem[] = listItems.map((it) => ({
      type: itemType,
      mangaId: it.mangaId,
      imageUrl: it.imageUrl,
      title: it.title,
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
    const meta = metadata as NewManhwaMetadata | undefined;
    const page = meta?.page ?? 1;

    const titleQuery = (query.title || "").trim();
    const searchMeta = (
      query.metadata as { searchMeta?: NewManhwaSearchMeta } | undefined
    )?.searchMeta;

    const params: string[] = [`q=${encodeURIComponent(titleQuery)}`];
    const status = searchMeta?.status?.[0];
    if (status) params.push(`status=${encodeURIComponent(status)}`);
    const genre = searchMeta?.genre?.[0];
    if (genre) params.push(`genre=${encodeURIComponent(genre)}`);
    const sort = searchMeta?.sort?.[0];
    if (sort) params.push(`sort=${encodeURIComponent(sort)}`);
    if (page > 1) params.push(`page=${page}`);

    const url = `${BASE_URL}/search?${params.join("&")}`;
    const $ = await this.fetchCheerio({ url, method: "GET" });

    // Detail-page redirect case.
    if ($("aside.series-left").length > 0) {
      const title = $("h1").first().text().trim();
      const imageUrl = this.absoluteUrl(
        $("aside.series-left .cover-card img").first().attr("src") || "",
      );
      return {
        items: [
          {
            mangaId: this.parsePath(url),
            imageUrl,
            title,
            subtitle: undefined,
            metadata: undefined,
          },
        ],
        metadata: undefined,
      };
    }

    const { items: listItems, hasNextPage } = this.parseList($);
    const items: SearchResultItem[] = listItems.map((it) => ({
      mangaId: it.mangaId,
      imageUrl: it.imageUrl,
      title: it.title,
      subtitle: undefined,
      metadata: undefined,
    }));
    return { items, metadata: hasNextPage ? { page: page + 1 } : undefined };
  }

  private async fetchList(url: string): Promise<{
    items: { mangaId: string; title: string; imageUrl: string }[];
    hasNextPage: boolean;
  }> {
    const $ = await this.fetchCheerio({ url, method: "GET" });
    return this.parseList($);
  }

  private parseList($: CheerioAPI): {
    items: { mangaId: string; title: string; imageUrl: string }[];
    hasNextPage: boolean;
  } {
    const items: { mangaId: string; title: string; imageUrl: string }[] = [];
    // Upstream #18541: the site moved to saymanhwa.com and rebuilt the cards.
    // Each entry is now an `<article class="series-card">` wrapping a separate
    // cover anchor and a body heading, instead of one big `<a class="series-card">`.
    $("article.series-card").each((_, element) => {
      const el = $(element);
      const coverLink = el.find("a.series-card-cover").first();
      const href = coverLink.attr("href") || "";
      const title = this.removeTitleRank(
        el.find("div.series-card-body h2 a").first().text().trim(),
      );
      if (!href || !title) return;
      const img = coverLink.find("img").first();
      const imageUrl = this.absoluteUrl(
        img.attr("data-src") || img.attr("src") || "",
      );
      items.push({ mangaId: this.parsePath(href), title, imageUrl });
    });
    const hasNextPage =
      $("a:contains(Next):not(.disabled)").length > 0;
    return { items, hasNextPage };
  }

  // ----------------------------------------------------------------
  // Manga details
  // ----------------------------------------------------------------

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const url = this.mangaUrl(mangaId);
    const $ = await this.fetchCheerio({ url, method: "GET" });

    // Upstream #18541: the details page was rebuilt with the `series-v72-*`
    // layout. Author/artist are no longer exposed as definition lists; the
    // sidebar now carries label/value pairs (Status, Type, Released, Category)
    // and genres come from the sidebar links or the JSON-LD block.
    const title = $("h1").first().text().trim() || this.safeDecode(mangaId);
    const synopsis = $("div.series-v72-description").first().text().trim();
    const statusText = this.metaValue($, "Status");
    const thumbnailUrl = this.absoluteUrl(
      $(".series-v72-cover img").first().attr("src") || "",
    );

    const altTitles = $("div.series-v72-alt")
      .first()
      .text()
      .split("/")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const tagGroups = [];
    const sidebarGenres = $("div.series-v72-genres a")
      .toArray()
      .map((el) => $(el).text().trim())
      .filter((g) => g.length > 0);
    if (sidebarGenres.length > 0) {
      tagGroups.push({
        id: "genres",
        title: "Genres",
        tags: sidebarGenres.map((g) => ({
          id: g.toLowerCase().replace(/\s+/g, "-"),
          title: g,
        })),
      });
    }
    const jsonLd = tagGroups.length > 0 ? undefined : $("script[type='application/ld+json']")
      .toArray()
      .map((el) => $(el).text())
      .find((d) => d.includes('"@type":"ComicSeries"'));
    if (jsonLd) {
      const m = jsonLd.match(/"genre":\s*\[(.*?)\]/);
      if (m) {
        const genres = m[1]
          .replace(/"/g, "")
          .split(",")
          .map((g) => g.trim())
          .filter((g) => g.length > 0);
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
      }
    }

    return {
      mangaId,
      mangaInfo: {
        primaryTitle: title,
        secondaryTitles: altTitles,
        thumbnailUrl,
        author: undefined,
        artist: undefined,
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
    // Upstream #18541: chapter rows are now `a.series-v72-chapter-row` with the
    // label in `.series-chapter-number-text` and an ISO `datetime` attribute.
    $("a.series-v72-chapter-row").each((_, element) => {
      const el = $(element);
      const href = el.attr("href") || "";
      if (!href) return;
      const name = el.find(".series-chapter-number-text").first().text().trim();
      const dateText =
        el.find("time.series-chapter-date").first().attr("datetime") ||
        el.find(".series-chapter-date").first().text().trim();

      chapters.push({
        chapterId: this.parsePath(href),
        sourceManga,
        title: name,
        volume: 0,
        chapNum: this.parseChapterNumber(name),
        publishDate: this.parseDate(dateText),
        langCode: "🇬🇧",
      });
    });

    return chapters;
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const url = this.chapterUrl(chapter.chapterId);
    const $ = await this.fetchCheerio({ url, method: "GET" });

    const pages: string[] = [];
    // Upstream #18541: reader images live in `div.reader-pages`.
    $("div.reader-pages img").each((_, element) => {
      const el = $(element);
      const src = el.attr("data-src") || el.attr("src") || "";
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

  /**
   * Read a `series-v72` sidebar label/value pair (Status, Type, Released,
   * Category). The markup is `<div><span>Label</span><strong>Value</strong></div>`.
   */
  private metaValue($: CheerioAPI, label: string): string {
    let value = "";
    $(".series-v72-meta span").each((_, el) => {
      if (value) return;
      const span = $(el);
      if (span.text().trim() !== label) return;
      const strong = span.parent().find("strong").first();
      if (strong.length > 0) value = strong.text().trim();
    });
    return value;
  }

  private removeTitleRank(title: string): string {
    return title.replace(/^#\d+\s+/, "").trim();
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
    const cleaned = decoded.replace(/#.*$/, "").replace(/\/+$/, "");
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
    const s = (status || "").toLowerCase();
    if (s.includes("ongoing")) return "Ongoing";
    if (s.includes("completed")) return "Completed";
    if (s.includes("hiatus")) return "Hiatus";
    return "Unknown";
  }

  private parseDate(dateText: string | undefined): Date {
    if (!dateText) return new Date(0);
    const d = new Date(dateText);
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

export const NewManhwa = new NewManhwaExtension();
