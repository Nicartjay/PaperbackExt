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
import { MangaCloudSearchForm, MangaCloudSearchMeta } from "./forms";

const BASE_URL = "https://mangacloud.org";
const API_URL = "https://api.mangacloud.org";
const CDN_URL = "https://pika.mangacloud.org";
const POPULAR_TIMES = ["today", "week", "month"];

interface Image {
  id: string;
  f: string;
}

interface BrowseManga {
  id: string;
  title: string;
  cover: Image;
}

interface Tag {
  id: string;
  name: string;
  type?: string;
}

interface Chapter5 {
  id: string;
  number: number;
  name?: string;
  createdDate: string;
}

interface Manga {
  id: string;
  title: string;
  alt_titles?: string;
  nativeTitles?: string;
  description?: string;
  status?: string;
  start_year?: number;
  end_year?: number;
  type?: string;
  authors?: string;
  artists?: string;
  tags?: Tag[];
  chapters?: Chapter5[];
  cover: Image;
}

interface ChapterContent {
  id: string;
  comicId: string;
  images: Image[];
}

interface DataWrap<T> {
  data: T;
}

interface DataList<T> {
  list: T[];
}

class MangaCloudInterceptor extends PaperbackInterceptor {
  override async interceptRequest(request: Request): Promise<Request> {
    request.headers = {
      ...request.headers,
      referer: `${BASE_URL}/`,
      origin: BASE_URL,
      "user-agent": await Application.getDefaultUserAgent(),
      accept: "application/json, text/plain, */*",
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

type MangaCloudImplementation = Extension &
  SearchResultsProviding &
  MangaProviding &
  ChapterProviding &
  CloudflareBypassRequestProviding &
  DiscoverSectionProviding;

class MangaCloudExtension implements MangaCloudImplementation {
  requestManager = new MangaCloudInterceptor("main");
  cookieStorageInterceptor = new CookieStorageInterceptor({ storage: "stateManager" });
  globalRateLimiter = new BasicRateLimiter("rateLimiter", {
    numberOfRequests: 1,
    bufferInterval: 1,
    ignoreImages: true,
  });

  async initialise(): Promise<void> {
    this.requestManager.registerInterceptor();
    this.cookieStorageInterceptor.registerInterceptor();
    this.globalRateLimiter.registerInterceptor();
  }

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    return [
      { id: "popular", title: "Popular", type: DiscoverSectionType.featured },
      { id: "latest", title: "Latest Updates", type: DiscoverSectionType.simpleCarousel },
    ];
  }

  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata: Metadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const page = (metadata as { page?: number } | undefined)?.page ?? 1;

    if (section.id === "popular") {
      const time = POPULAR_TIMES[page - 1] ?? POPULAR_TIMES[2];
      const data = await this.fetchJson<DataWrap<DataList<BrowseManga>>>({
        url: `${API_URL}/comic-popular-view/${time}`,
        method: "GET",
      });
      const items: DiscoverSectionItem[] = (data.data.list ?? []).map((m) => ({
        type: "featuredCarouselItem",
        mangaId: this.toSafeId(m.id),
        imageUrl: this.coverUrl(m.id, m.cover),
        title: m.title,
        metadata: undefined,
      }));
      return { items, metadata: page < POPULAR_TIMES.length ? { page: page + 1 } : undefined };
    }

    const data = await this.fetchJson<DataWrap<DataList<BrowseManga>>>({
      url: `${API_URL}/comic-updates`,
      method: "POST",
      headers: { "content-type": "application/json", referer: `${BASE_URL}/` },
      body: JSON.stringify({ page }),
    });
    const list = data.data.list ?? [];
    const items: DiscoverSectionItem[] = list.map((m) => ({
      type: "simpleCarouselItem",
      mangaId: this.toSafeId(m.id),
      imageUrl: this.coverUrl(m.id, m.cover),
      title: m.title,
      metadata: undefined,
    }));
    return { items, metadata: list.length === 60 ? { page: page + 1 } : undefined };
  }

  async getSearchResults(
    query: SearchQuery<Metadata>,
    metadata: Metadata | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const page = (metadata as { page?: number } | undefined)?.page ?? 1;
    const titleQuery = query.title.trim();
    if (titleQuery.length > 0 && titleQuery.length < 3) {
      throw new Error("Search query must be more than 3 characters!");
    }
    const searchMeta = (query.metadata as { searchMeta?: MangaCloudSearchMeta } | undefined)
      ?.searchMeta;

    const payload: Record<string, unknown> = {
      includes: [],
      excludes: [],
      page,
    };
    if (titleQuery.length >= 3) payload.title = titleQuery;
    const type = searchMeta?.type?.[0];
    const status = searchMeta?.status?.[0];
    const sort = searchMeta?.sort?.[0];
    if (type && type.length > 0) payload.type = type;
    if (status && status.length > 0) payload.status = status;
    if (sort && sort.length > 0) payload.sort = sort;

    const data = await this.fetchJson<DataWrap<BrowseManga[]>>({
      url: `${API_URL}/comic/library`,
      method: "POST",
      headers: { "content-type": "application/json", referer: `${BASE_URL}/` },
      body: JSON.stringify(payload),
    });

    const list = data.data ?? [];
    const items: SearchResultItem[] = list.map((m) => ({
      mangaId: this.toSafeId(m.id),
      imageUrl: this.coverUrl(m.id, m.cover),
      title: m.title,
      subtitle: undefined,
      metadata: undefined,
    }));
    return { items, metadata: list.length === 10 ? { page: page + 1 } : undefined };
  }

  async getAdvancedSearchForm(query: SearchQuery<Metadata>): Promise<AdvancedSearchForm> {
    const meta = (query.metadata as { searchMeta?: MangaCloudSearchMeta } | undefined)?.searchMeta;
    return new MangaCloudSearchForm(meta);
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const comicId = this.safeDecode(mangaId);
    const data = await this.fetchJson<DataWrap<Manga>>({
      url: `${API_URL}/comic/${comicId}`,
      method: "GET",
    });
    const manga = data.data;

    const author = this.joinDot(manga.authors);
    const artist = this.joinDot(manga.artists);

    let synopsis = (manga.description ?? "").trim();
    if (manga.start_year) {
      const yearLine =
        "Year: " +
        manga.start_year +
        (manga.end_year ? ` - ${manga.end_year}` : "");
      synopsis = synopsis.length > 0 ? `${synopsis}\n\n${yearLine}` : yearLine;
    }
    const altNames: string[] = [];
    for (const s of (manga.alt_titles ?? "").split("\u2022")) {
      const t = s.trim();
      if (t.length > 0) altNames.push(t);
    }
    for (const s of (manga.nativeTitles ?? "").split("\u3001")) {
      const t = s.trim();
      if (t.length > 0) altNames.push(t);
    }
    if (altNames.length > 0) {
      const block = "Alternative Name(s):\n" + altNames.map((n) => `- ${n}`).join("\n");
      synopsis = synopsis.length > 0 ? `${synopsis}\n\n${block}` : block;
    }

    const genreNames: string[] = [];
    if (manga.type) genreNames.push(manga.type);
    for (const tag of [...(manga.tags ?? [])].sort((a, b) =>
      (a.type ?? "").localeCompare(b.type ?? ""),
    )) {
      genreNames.push(tag.name);
    }
    const tagGroups: TagSection[] =
      genreNames.length > 0
        ? [
            {
              id: "genres",
              title: "Genres",
              tags: genreNames.map((g) => ({
                id: g.toLowerCase().replace(/\s+/g, "-"),
                title: g,
              })),
            },
          ]
        : [];

    return {
      mangaId,
      mangaInfo: {
        primaryTitle: manga.title,
        secondaryTitles: altNames,
        thumbnailUrl: this.coverUrl(manga.id, manga.cover),
        author,
        artist,
        synopsis: synopsis.trim(),
        contentRating: ContentRating.EVERYONE,
        status: this.parseStatus(manga.status),
        tagGroups,
        shareUrl: `${BASE_URL}/comic/${comicId}`,
      },
    };
  }

  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    const comicId = this.safeDecode(sourceManga.mangaId);
    const data = await this.fetchJson<DataWrap<Manga>>({
      url: `${API_URL}/comic/${comicId}`,
      method: "GET",
    });
    const chapters = data.data.chapters ?? [];

    return chapters.map((ch) => {
      const numStr = String(ch.number).replace(/\.0$/, "");
      let name = `Chapter ${numStr}`;
      if (ch.name && ch.name.trim().length > 0) name += ` - ${ch.name.trim()}`;
      return {
        chapterId: this.toSafeId(`${comicId}#${ch.id}`),
        sourceManga,
        title: name,
        volume: 0,
        chapNum: ch.number,
        publishDate: this.parseDate(ch.createdDate),
        langCode: "\ud83c\uddec\ud83c\udde7",
      };
    });
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const decoded = this.safeDecode(chapter.chapterId);
    const chapterContentId = decoded.split("#")[1] ?? decoded;
    const data = await this.fetchJson<DataWrap<ChapterContent>>({
      url: `${API_URL}/chapters/${chapterContentId}`,
      method: "GET",
    });
    const content = data.data;
    const pages = (content.images ?? []).map(
      (img) => `${CDN_URL}/${content.comicId}/${content.id}/${img.id}.${img.f}`,
    );
    return {
      id: chapter.chapterId,
      mangaId: chapter.sourceManga.mangaId,
      pages,
    };
  }

  async getMangaShareUrl(mangaId: string): Promise<string> {
    return `${BASE_URL}/comic/${this.safeDecode(mangaId)}`;
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

  private async fetchJson<T>(request: Request): Promise<T> {
    const [response, data] = await Application.scheduleRequest(request);
    if (response.status === 404) throw new Error("Content not found");
    return JSON.parse(Application.arrayBufferToUTF8String(data)) as T;
  }

  private coverUrl(id: string, cover: Image): string {
    if (!cover) return "";
    return `${CDN_URL}/${id}/${cover.id}.${cover.f}`;
  }

  private joinDot(value?: string): string | undefined {
    if (!value) return undefined;
    const parts = value
      .split("\u2022")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return parts.length > 0 ? parts.join(", ") : undefined;
  }

  private parseStatus(status?: string): string {
    const s = (status ?? "").toLowerCase();
    if (s.includes("ongoing")) return "Ongoing";
    if (s.includes("completed")) return "Completed";
    if (s.includes("cancelled")) return "Cancelled";
    if (s.includes("hiatus")) return "Hiatus";
    return "Unknown";
  }

  private parseDate(value?: string): Date {
    if (!value) return new Date(0);
    const iso = value.endsWith("Z") ? value : `${value}Z`;
    const d = new Date(iso);
    return isNaN(d.getTime()) ? new Date(0) : d;
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
}

export const MangaCloud = new MangaCloudExtension();
