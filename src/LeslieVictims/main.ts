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
} from "@paperback/types";

const BASE_URL = "https://leslie-victims.pages.dev";
// Upstream #18667: /api/library started returning 503; the site serves the
// same catalog blob from /manga.json (verified: old 503, new 200).
const LIBRARY_URL = `${BASE_URL}/manga.json`;
const MAX_PROBE_PAGES = 150;

interface ChapterRoot {
  url: string;
  mode: string;
  data: unknown;
}

interface LibraryEntry {
  id: string;
  title: string;
  cover: string;
  chapters: string[];
  chapter_roots?: Record<string, ChapterRoot>;
}

class LeslieVictimsInterceptor extends PaperbackInterceptor {
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

type LeslieVictimsImplementation = Extension &
  SearchResultsProviding &
  MangaProviding &
  ChapterProviding &
  CloudflareBypassRequestProviding &
  DiscoverSectionProviding;

export class LeslieVictimsExtension implements LeslieVictimsImplementation {
  requestManager = new LeslieVictimsInterceptor("main");
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
        title: "Library",
        type: DiscoverSectionType.simpleCarousel,
      },
    ];
  }

  async getDiscoverSectionItems(
    _section: DiscoverSection,
    _metadata: Metadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const library = await this.fetchLibrary();
    const items: DiscoverSectionItem[] = library.map((entry) => ({
      type: "simpleCarouselItem",
      mangaId: entry.id,
      imageUrl: this.coverUrl(entry.cover),
      title: entry.title,
      metadata: undefined,
    }));
    return { items, metadata: undefined };
  }

  // ----------------------------------------------------------------
  // Search
  // ----------------------------------------------------------------

  async getSearchResults(
    query: SearchQuery<Metadata>,
    _metadata: Metadata | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const titleQuery = (query.title || "").trim().toLowerCase();
    const library = await this.fetchLibrary();
    const items: SearchResultItem[] = library
      .filter((entry) => entry.title.toLowerCase().includes(titleQuery))
      .map((entry) => ({
        mangaId: entry.id,
        imageUrl: this.coverUrl(entry.cover),
        title: entry.title,
        subtitle: undefined,
        metadata: undefined,
      }));
    return { items, metadata: undefined };
  }

  // ----------------------------------------------------------------
  // Manga details
  // ----------------------------------------------------------------

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const entry = await this.findEntry(mangaId);
    return {
      mangaId,
      mangaInfo: {
        primaryTitle: entry.title,
        secondaryTitles: [],
        thumbnailUrl: this.coverUrl(entry.cover),
        synopsis: "",
        contentRating: ContentRating.EVERYONE,
        status: "Unknown",
        tagGroups: [],
        shareUrl: this.mangaUrl(mangaId),
      },
    };
  }

  // ----------------------------------------------------------------
  // Chapters
  // ----------------------------------------------------------------

  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    const entry = await this.findEntry(sourceManga.mangaId);
    const reversed = [...entry.chapters].reverse();
    return reversed.map((chId) => ({
      chapterId: chId,
      sourceManga,
      title: `Chapter ${chId}`,
      volume: 0,
      chapNum: this.parseChapterNumber(chId),
      publishDate: new Date(0),
      langCode: "🇬🇧",
    }));
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const seriesId = chapter.sourceManga.mangaId;
    const chId = chapter.chapterId;
    const entry = await this.findEntry(seriesId);

    const pages = await this.resolvePages(entry, seriesId, chId);

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
  // Page resolution
  // ----------------------------------------------------------------

  private async resolvePages(
    entry: LibraryEntry,
    seriesId: string,
    chId: string,
  ): Promise<string[]> {
    const chapterRoot = entry.chapter_roots?.[chId];

    if (chapterRoot) {
      const rootUrl = chapterRoot.url;
      if (chapterRoot.mode === "list") {
        const data = chapterRoot.data;
        if (Array.isArray(data)) {
          return data.map((file) => `${rootUrl}/${String(file)}`);
        }
        return [];
      }
      if (chapterRoot.mode === "count") {
        const count = parseInt(String(chapterRoot.data), 10);
        if (!Number.isFinite(count)) return [];
        const pages: string[] = [];
        for (let i = 1; i <= count; i++) {
          pages.push(`${rootUrl}/${i.toString().padStart(2, "0")}.webp`);
        }
        return pages;
      }
      return [];
    }

    // Fallback: probe sequential numbered webp images via HEAD requests.
    const baseImgUrl = `${BASE_URL}/content/${seriesId}/${chId}`;
    const pages: string[] = [];
    for (let pageNum = 1; pageNum <= MAX_PROBE_PAGES; pageNum++) {
      const imgUrl = `${baseImgUrl}/${pageNum.toString().padStart(2, "0")}.webp`;
      const ok = await this.headIsImage(imgUrl);
      if (ok) {
        pages.push(imgUrl);
      } else {
        break;
      }
    }
    return pages;
  }

  private async headIsImage(url: string): Promise<boolean> {
    try {
      const [response] = await Application.scheduleRequest({
        url,
        method: "HEAD",
      });
      const status = response.status;
      if (status < 200 || status >= 300) return false;
      const contentType =
        response.headers?.["content-type"] ||
        response.headers?.["Content-Type"] ||
        "";
      return contentType.startsWith("image");
    } catch {
      return false;
    }
  }

  // ----------------------------------------------------------------
  // Library helpers
  // ----------------------------------------------------------------

  private async fetchLibrary(): Promise<LibraryEntry[]> {
    const [response, data] = await Application.scheduleRequest({
      url: LIBRARY_URL,
      method: "GET",
    });
    if (response.status === 404) {
      throw new Error("Content not found");
    }
    const json = JSON.parse(Application.arrayBufferToUTF8String(data));
    if (!Array.isArray(json)) return [];
    return json as LibraryEntry[];
  }

  private async findEntry(seriesId: string): Promise<LibraryEntry> {
    const id = this.safeDecode(seriesId);
    const library = await this.fetchLibrary();
    const entry = library.find((e) => e.id === id);
    if (!entry) {
      throw new Error(`Series not found: ${id}`);
    }
    return entry;
  }

  private coverUrl(cover: string): string {
    return this.absoluteUrl(cover);
  }

  // ----------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------

  private mangaUrl(mangaId: string): string {
    const id = this.safeDecode(mangaId);
    if (id.startsWith("http")) return id;
    return `${BASE_URL}/?series=${encodeURIComponent(id)}`;
  }

  private safeDecode(id: string): string {
    try {
      return decodeURIComponent(id);
    } catch {
      return id;
    }
  }

  private parseChapterNumber(name: string): number {
    const m = name.trim().match(/^(\d+(?:\.\d+)?)/);
    return m ? parseFloat(m[1]) : -1;
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
}

export const LeslieVictims = new LeslieVictimsExtension();
