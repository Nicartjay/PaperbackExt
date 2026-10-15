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
import {
  AtsumaruSettingsForm,
  getDeduplicateChapters,
  getExcludedGenres,
  getScanlatorBlacklist,
} from "./settings";

const BASE_URL = "https://atsu.moe";
const TYPES = "Manga,Manwha,Manhua,OEL";
const PER_PAGE = 40;
// Upstream #18405 `BROWSE_LIMIT`: page size for the /api/home2/* carousels.
const BROWSE_LIMIT = 40;
const PROTOCOL_REGEX = /^https?:?\/\//;

// Genre list ported from the upstream Filters.kt (name -> Typesense genreId)
const GENRES: { name: string; id: string }[] = [
  { name: "Action", id: "39" },
  { name: "Adult", id: "46" },
  { name: "Adventure", id: "37" },
  { name: "Boys Love", id: "180" },
  { name: "Comedy", id: "6" },
  { name: "Drama", id: "31" },
  { name: "Fantasy", id: "36" },
  { name: "Girls Love", id: "4" },
  { name: "Hentai", id: "10" },
  { name: "Historical", id: "45" },
  { name: "Horror", id: "44" },
  { name: "Martial Arts", id: "29" },
  { name: "Mystery", id: "32" },
  { name: "Psychological", id: "18" },
  { name: "Romance", id: "9" },
  { name: "Sci-Fi", id: "1" },
  { name: "Slice of Life", id: "7" },
  { name: "Smut", id: "41" },
  { name: "Supernatural", id: "22" },
  { name: "Thriller", id: "19" },
  { name: "Tragedy", id: "5" },
];

interface AtsumaruMetadata {
  page?: number;
  genreId?: string;
}

// ----------------------------------------------------------------
// Upstream JSON shapes (subset of what we actually consume)
// ----------------------------------------------------------------

interface MangaJson {
  id: string;
  title: string;
  poster?: unknown;
  image?: unknown;
  authors?: unknown;
  synopsis?: string;
  genres?: unknown;
  tags?: unknown;
  released?: number;
  status?: string;
  type?: string;
  views?: unknown;
  otherNames?: string[];
  avgRating?: number;
  scanlators?: { id: string; name: string; score?: number }[];
  recommendations?: MangaJson[];
}

interface ChapterJson {
  id: string;
  number: number;
  title: string;
  scanlationMangaId?: string;
  createdAt?: unknown;
}

class AtsumaruInterceptor extends PaperbackInterceptor {
  override async interceptRequest(request: Request): Promise<Request> {
    const isImage = /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(request.url);
    request.headers = {
      ...request.headers,
      referer: `${BASE_URL}/`,
      origin: BASE_URL,
      "user-agent": await Application.getDefaultUserAgent(),
      accept: isImage
        ? "image/avif,image/webp,*/*"
        : "*/*",
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

type AtsumaruImplementation = Extension &
  SearchResultsProviding &
  MangaProviding &
  ChapterProviding &
  CloudflareBypassRequestProviding &
  SettingsFormProviding &
  DiscoverSectionProviding;

export class AtsumaruExtension implements AtsumaruImplementation {
  requestManager = new AtsumaruInterceptor("main");
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

  async getSettingsForm(): Promise<Form> {
    return new AtsumaruSettingsForm(GENRES);
  }

  // ----------------------------------------------------------------
  // Discover sections
  // ----------------------------------------------------------------

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    return [
      {
        id: "trending",
        title: "Trending",
        type: DiscoverSectionType.featured,
      },
      {
        id: "recentlyUpdated",
        title: "Recently Updated",
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
      const items: DiscoverSectionItem[] = GENRES.map((genre) => ({
        type: "genresCarouselItem",
        searchQuery: {
          title: "",
          metadata: { genreId: genre.id },
        },
        name: genre.name,
        metadata: undefined,
      }));
      return { items, metadata: undefined };
    }

    const meta = metadata as AtsumaruMetadata | undefined;
    const page = meta?.page ?? 1;
    // Upstream #18405: the browse endpoints moved from `/api/infinite/*`
    // (page-indexed) to `/api/home2/*` (offset/limit) and now pass
    // `mediums=Comic` so light novels are excluded from the carousels.
    const endpoint =
      section.id === "trending" ? "popular" : "recentlyUpdated";
    const offset = (page - 1) * BROWSE_LIMIT;
    const timeframe = section.id === "trending" ? "&timeframe=daily" : "";
    const url =
      `${BASE_URL}/api/home2/${endpoint}?offset=${offset}&limit=${BROWSE_LIMIT}` +
      `&types=${TYPES}&mediums=Comic${timeframe}${this.excludedGenresQuery()}`;

    const json = (await this.fetchJson(url)) as { items?: MangaJson[] };
    const list = json.items ?? [];

    const items: DiscoverSectionItem[] = list.map((manga) => ({
      type:
        section.id === "trending"
          ? "featuredCarouselItem"
          : "simpleCarouselItem",
      mangaId: this.toSafeId(manga.id),
      imageUrl: this.imageUrl(manga),
      title: manga.title,
      metadata: undefined,
    }));

    return {
      items,
      metadata: list.length >= BROWSE_LIMIT ? { page: page + 1 } : undefined,
    };
  }

  /**
   * Upstream #18502: genres blacklisted in the settings are excluded
   * server-side from the browse carousels.
   */
  private excludedGenresQuery(): string {
    const ids = getExcludedGenres();
    if (ids.length === 0) return "";
    return `&excludedTags=${ids.join(",")}`;
  }

  // ----------------------------------------------------------------
  // Search (Typesense documents/search)
  // ----------------------------------------------------------------

  async getSearchResults(
    query: SearchQuery<Metadata>,
    metadata: Metadata | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const pageMeta = metadata as AtsumaruMetadata | undefined;
    const page = pageMeta?.page ?? 1;
    const titleQuery = (query.title || "").trim();

    const queryMeta = query.metadata as AtsumaruMetadata | undefined;
    const genreId = queryMeta?.genreId;

    const params: string[] = [];
    params.push(`q=${encodeURIComponent(titleQuery || "*")}`);

    const filterBy: string[] = [];
    filterBy.push("hidden:!=true");
    if (genreId) {
      filterBy.push(`genreIds:=\`${genreId}\``);
    }
    // Safe mode (adult disabled, mirroring the default upstream preference).
    filterBy.push("isAdult:=false");
    filterBy.push(
      "(mbContentRating:=[`Safe`,`Suggestive`,`Erotica`] || mbContentRating:!=*)",
    );
    filterBy.push("views:>0");
    // Upstream #18405: exclude light novels from search results.
    filterBy.push("medium:!=[`Novel`]");
    // Upstream #18502: honour the settings-level genre blacklist.
    const excluded = getExcludedGenres();
    if (excluded.length > 0) {
      filterBy.push(
        `genreIds:!=[${excluded.map((id) => `\`${id}\``).join(",")}]`,
      );
    }

    params.push(`filter_by=${encodeURIComponent(filterBy.join(" && "))}`);

    if (titleQuery.length > 0) {
      params.push(
        `query_by=${encodeURIComponent("title,englishTitle,otherNames,authors")}`,
      );
      params.push(`query_by_weights=${encodeURIComponent("4,3,2,1")}`);
      params.push(`num_typos=${encodeURIComponent("4,3,2,1")}`);
    }

    params.push(`page=${page}`);
    params.push(`per_page=${PER_PAGE}`);

    const url = `${BASE_URL}/collections/manga/documents/search?${params.join(
      "&",
    )}`;

    const json = (await this.fetchJson(url)) as {
      hits?: { document: MangaJson }[];
      found?: number;
      page?: number;
      request_params?: { per_page?: number };
    };

    const hits = json.hits ?? [];
    const results: SearchResultItem[] = hits.map((hit) => ({
      mangaId: this.toSafeId(hit.document.id),
      imageUrl: this.imageUrl(hit.document),
      title: hit.document.title,
      subtitle: undefined,
      metadata: undefined,
    }));

    const found = json.found ?? 0;
    const perPage = json.request_params?.per_page ?? PER_PAGE;
    const currentPage = json.page ?? page;
    const hasNextPage = currentPage * perPage < found;

    return {
      items: results,
      metadata: hasNextPage ? { page: page + 1, genreId } : undefined,
    };
  }

  // ----------------------------------------------------------------
  // Manga details
  // ----------------------------------------------------------------

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const id = this.safeDecode(mangaId);
    const url = `${BASE_URL}/api/manga/page?id=${encodeURIComponent(id)}`;
    const json = (await this.fetchJson(url)) as { mangaPage?: MangaJson };
    const manga = json.mangaPage;
    if (!manga) {
      throw new Error("Content not found");
    }

    const synopsis = (manga.synopsis ?? "").trim();
    const otherNames = (manga.otherNames ?? []).filter(
      (n) => n && n !== manga.title,
    );

    const authors = this.parseAuthorsWithType(manga.authors);
    const author = authors
      .filter((a) => a.type === "Author" || a.type === undefined)
      .map((a) => a.name)
      .join(", ");
    const artist = authors
      .filter((a) => a.type === "Artist")
      .map((a) => a.name)
      .join(", ");

    const tagGroups: TagSection[] = [];
    const genreNames = this.parseNames(manga.genres);
    const tagNames = this.parseNames(manga.tags);
    if (manga.type) genreNames.unshift(manga.type);
    if (genreNames.length > 0) {
      tagGroups.push({
        id: "genres",
        title: "Genres",
        tags: genreNames.map((g) => ({
          id: g.toLowerCase().replace(/\s+/g, "-"),
          title: g,
        })),
      });
    }
    if (tagNames.length > 0) {
      tagGroups.push({
        id: "tags",
        title: "Tags",
        tags: tagNames.map((t) => ({
          id: t.toLowerCase().replace(/\s+/g, "-"),
          title: t,
        })),
      });
    }

    return {
      mangaId,
      mangaInfo: {
        primaryTitle: manga.title,
        secondaryTitles: otherNames,
        thumbnailUrl: this.imageUrl(manga),
        author: author || undefined,
        artist: artist || undefined,
        synopsis,
        contentRating: ContentRating.MATURE,
        status: this.parseStatus(manga.status),
        tagGroups,
        shareUrl: this.mangaUrl(mangaId),
      },
    };
  }

  // ----------------------------------------------------------------
  // Chapters
  // ----------------------------------------------------------------

  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    const id = this.safeDecode(sourceManga.mangaId);
    const url = `${BASE_URL}/api/manga/allChapters?mangaId=${encodeURIComponent(
      id,
    )}`;
    const json = (await this.fetchJson(url)) as { chapters?: ChapterJson[] };

    // Resolve scanlator names from the details endpoint (best effort).
    let scanlatorMap: Record<string, string> = {};
    let scanlatorScore: Record<string, number> = {};
    try {
      const detailsUrl = `${BASE_URL}/api/manga/page?id=${encodeURIComponent(
        id,
      )}`;
      const detailsJson = (await this.fetchJson(detailsUrl)) as {
        mangaPage?: MangaJson;
      };
      for (const s of detailsJson.mangaPage?.scanlators ?? []) {
        scanlatorMap[s.id] = s.name;
        if (typeof s.score === "number") scanlatorScore[s.id] = s.score;
      }
    } catch {
      scanlatorMap = {};
      scanlatorScore = {};
    }

    // Upstream #19782: optional scanlator blacklist and per-number dedupe
    // (highest-scored group wins, newest upload breaks ties).
    let raw = json.chapters ?? [];
    const blacklist = getScanlatorBlacklist();
    if (blacklist.size > 0) {
      raw = raw.filter((c) => {
        const name = c.scanlationMangaId ? scanlatorMap[c.scanlationMangaId] : undefined;
        return name === undefined || !blacklist.has(name.trim().toLowerCase());
      });
    }
    if (getDeduplicateChapters()) {
      const best = new Map<number, ChapterJson>();
      const score = (c: ChapterJson) =>
        (c.scanlationMangaId ? scanlatorScore[c.scanlationMangaId] : undefined) ?? Number.MIN_SAFE_INTEGER;
      const time = (c: ChapterJson) => this.parseDate(c.createdAt).getTime() || 0;
      for (const c of raw) {
        const cur = best.get(c.number);
        if (!cur || score(c) > score(cur) || (score(c) === score(cur) && time(c) > time(cur))) {
          best.set(c.number, c);
        }
      }
      raw = [...best.values()];
    }
    const chapters: Chapter[] = raw.map((c) => {
      const scanlator = c.scanlationMangaId
        ? scanlatorMap[c.scanlationMangaId]
        : undefined;
      const baseTitle = (c.title || "").trim();
      const title = scanlator ? `${baseTitle} [${scanlator}]` : baseTitle;
      return {
        chapterId: this.toSafeId(`${id}/${c.id}`),
        sourceManga,
        title: title || undefined,
        volume: 0,
        chapNum: typeof c.number === "number" ? c.number : 0,
        publishDate: this.parseDate(c.createdAt),
        langCode: "🇬🇧",
      };
    });

    chapters.sort((a, b) => b.chapNum - a.chapNum);
    return chapters;
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const path = this.safeDecode(chapter.chapterId);
    const slash = path.indexOf("/");
    const slug = slash >= 0 ? path.slice(0, slash) : path;
    const name = slash >= 0 ? path.slice(slash + 1) : "";

    const url = `${BASE_URL}/api/read/chapter?mangaId=${encodeURIComponent(
      slug,
    )}&chapterId=${encodeURIComponent(name)}`;
    const json = (await this.fetchJson(url)) as {
      readChapter?: { pages?: { image: string }[] };
    };

    const pages: string[] = (json.readChapter?.pages ?? []).map((p) =>
      this.pageImageUrl(p.image),
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

  private mangaUrl(mangaId: string): string {
    const slug = this.safeDecode(mangaId);
    if (slug.startsWith("http")) return slug;
    return `${BASE_URL}/manga/${slug.replace(/^\/+/, "")}`;
  }

  private imageUrl(manga: MangaJson): string {
    let raw: string | undefined;
    const src = manga.poster ?? manga.image;
    if (typeof src === "string") {
      raw = src;
    } else if (src && typeof src === "object") {
      const inner = (src as Record<string, unknown>)["image"];
      if (typeof inner === "string") raw = inner;
    }
    if (!raw) return "";
    let cleaned = raw.replace(/^\//, "").replace(/^static\//, "");
    let full: string;
    if (cleaned.startsWith("http")) {
      full = cleaned;
    } else if (cleaned.startsWith("//")) {
      full = `https:${cleaned}`;
    } else {
      full = `${BASE_URL}/static/${cleaned}`;
    }
    return full.replace(PROTOCOL_REGEX, "https://");
  }

  private pageImageUrl(image: string): string {
    let full: string;
    if (image.startsWith("http")) {
      full = image;
    } else if (image.startsWith("//")) {
      full = `https:${image}`;
    } else {
      full = `${BASE_URL}/static/${image
        .replace(/^\//, "")
        .replace(/^static\//, "")}`;
    }
    // Upstream #19086: page images are served from the `cdn.` host; the main
    // host answers 410 Gone for them.
    return full.replace(PROTOCOL_REGEX, "https://cdn.").replace(/^https:\/\/cdn\.cdn\./, "https://cdn.");
  }

  private parseNames(element: unknown): string[] {
    if (!Array.isArray(element)) return [];
    const out: string[] = [];
    for (const item of element) {
      if (typeof item === "string") {
        out.push(item);
      } else if (item && typeof item === "object") {
        const name = (item as Record<string, unknown>)["name"];
        if (typeof name === "string") out.push(name);
      }
    }
    return out;
  }

  private parseAuthorsWithType(
    element: unknown,
  ): { name: string; type?: string }[] {
    if (!Array.isArray(element)) return [];
    const out: { name: string; type?: string }[] = [];
    for (const item of element) {
      if (typeof item === "string") {
        out.push({ name: item });
      } else if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        const name = obj["name"];
        if (typeof name !== "string") continue;
        const type = obj["type"];
        out.push({ name, type: typeof type === "string" ? type : undefined });
      }
    }
    return out;
  }

  private parseDate(element: unknown): Date {
    if (typeof element === "number") {
      return new Date(element);
    }
    if (typeof element === "string") {
      const asNum = Number(element);
      if (!Number.isNaN(asNum) && element.trim() !== "") {
        return new Date(asNum);
      }
      const parsed = Date.parse(element.replace("T ", "T"));
      if (!Number.isNaN(parsed)) return new Date(parsed);
    }
    return new Date(0);
  }

  private parseStatus(status: string | undefined): string {
    switch ((status || "").toLowerCase().trim()) {
      case "ongoing":
        return "Ongoing";
      case "completed":
        return "Completed";
      case "hiatus":
        return "Hiatus";
      case "canceled":
      case "cancelled":
        return "Cancelled";
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

  async fetchJson(url: string): Promise<unknown> {
    const [response, data] = await Application.scheduleRequest({
      url,
      method: "GET",
    });
    if (response.status === 404) {
      throw new Error("Content not found");
    }
    const text = Application.arrayBufferToUTF8String(data);
    return JSON.parse(text);
  }
}

export const Atsumaru = new AtsumaruExtension();
