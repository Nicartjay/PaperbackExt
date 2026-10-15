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
import {
  ParadiseScansSearchForm,
  ParadiseScansSearchMeta,
  sortDirection,
} from "./forms";
import { getShowLocked, ParadiseScansSettingsForm } from "./settings";

/*
 * Upstream #19745 rewrote Paradise Scans as a standalone source: the site left
 * the Keyoapp theme for its own JSON API. Verified live while porting:
 *   GET /api/series?sort=&dir=&per_page=&page=   -> { data, meta{current_page,last_page} }
 *   GET /api/series/{slug}                       -> series detail
 *   GET /api/series/{slug}/chapters              -> chapter list (70 for a sample title)
 *   GET /api/chapters/{id}/pages                 -> pages (relative image_url)
 *
 * mangaId stays the bare series slug — the same value the previous Keyoapp
 * port stored — so existing library entries keep resolving.
 */

const BASE_URL = "https://paradisescans.com";
const PER_PAGE = 24;

interface SeriesDto {
  title: string;
  slug: string;
  cover_url?: string | null;
  description?: string | null;
  author?: string | null;
  artist?: string | null;
  status?: string | null;
  genres?: string[];
  alternative_titles?: string | string[] | null;
}

interface ListResponse {
  data?: SeriesDto[];
  meta?: { current_page?: number; last_page?: number } | null;
}

interface ChapterDto {
  id: string;
  number?: number | null;
  title?: string | null;
  price?: number | null;
  is_premium?: boolean;
  early_access?: boolean;
  early_locked?: boolean;
  created_at?: string | null;
}

interface PageDto {
  page_number: number;
  image_url: string;
}

class ParadiseScansInterceptor extends PaperbackInterceptor {
  override async interceptRequest(request: Request): Promise<Request> {
    request.headers = {
      ...request.headers,
      referer: `${BASE_URL}/`,
      "user-agent": await Application.getDefaultUserAgent(),
      accept: "application/json, text/plain, */*",
      "accept-language": "en-US,en;q=0.9",
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

type Impl = Extension &
  SearchResultsProviding &
  MangaProviding &
  ChapterProviding &
  CloudflareBypassRequestProviding &
  SettingsFormProviding &
  DiscoverSectionProviding;

export class ParadiseScansExtension implements Impl {
  requestManager = new ParadiseScansInterceptor("main");
  cookieStorageInterceptor = new CookieStorageInterceptor({ storage: "stateManager" });
  globalRateLimiter = new BasicRateLimiter("rateLimiter", {
    numberOfRequests: 3,
    bufferInterval: 1,
    ignoreImages: true,
  });

  async initialise(): Promise<void> {
    this.requestManager.registerInterceptor();
    this.cookieStorageInterceptor.registerInterceptor();
    this.globalRateLimiter.registerInterceptor();
  }

  async getSettingsForm(): Promise<Form> {
    return new ParadiseScansSettingsForm();
  }

  // ---------------------------------------------------------------- discover

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
    const popular = section.id === "popular";
    const { list, hasNext } = await this.fetchList({
      page,
      sort: popular ? "sales" : "latest_chapter",
    });
    return {
      items: list.map((s) => ({
        type: popular ? "featuredCarouselItem" : "simpleCarouselItem",
        mangaId: this.toSafeId(s.slug),
        imageUrl: this.absoluteUrl(s.cover_url ?? ""),
        title: s.title,
        metadata: undefined,
      })),
      metadata: hasNext ? { page: page + 1 } : undefined,
    };
  }

  // ---------------------------------------------------------------- search

  async getAdvancedSearchForm(query: SearchQuery<Metadata>): Promise<AdvancedSearchForm> {
    const meta = query.metadata as { searchMeta?: ParadiseScansSearchMeta } | undefined;
    return new ParadiseScansSearchForm(meta?.searchMeta);
  }

  async getSearchResults(
    query: SearchQuery<Metadata>,
    metadata: Metadata | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const page = (metadata as { page?: number } | undefined)?.page ?? 1;
    const meta = (query.metadata as { searchMeta?: ParadiseScansSearchMeta } | undefined)
      ?.searchMeta;
    const { list, hasNext } = await this.fetchList({
      page,
      q: (query.title || "").trim(),
      sort: meta?.sort?.[0],
      status: meta?.status?.[0],
      type: meta?.type?.[0],
      genres: meta?.genres ?? [],
    });
    return {
      items: list.map((s) => ({
        mangaId: this.toSafeId(s.slug),
        imageUrl: this.absoluteUrl(s.cover_url ?? ""),
        title: s.title,
        subtitle: undefined,
        metadata: undefined,
      })),
      metadata: hasNext ? { page: page + 1 } : undefined,
    };
  }

  // ---------------------------------------------------------------- details

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const slug = this.slugOf(mangaId);
    const s = await this.fetchJson<SeriesDto>(`${BASE_URL}/api/series/${slug}`);

    const genres = (s.genres ?? []).filter((g) => typeof g === "string" && g.trim());
    const tagGroups: TagSection[] = genres.length
      ? [
          {
            id: "genres",
            title: "Genres",
            tags: genres.map((g) => ({ id: g.toLowerCase().replace(/\s+/g, "-"), title: g })),
          },
        ]
      : [];

    const alt = Array.isArray(s.alternative_titles)
      ? s.alternative_titles
      : (s.alternative_titles ?? "").split(/[,;]/);

    return {
      mangaId,
      mangaInfo: {
        primaryTitle: s.title,
        secondaryTitles: alt.map((t) => t.trim()).filter((t) => t && t !== s.title),
        thumbnailUrl: this.absoluteUrl(s.cover_url ?? ""),
        author: s.author ?? undefined,
        artist: s.artist ?? s.author ?? undefined,
        synopsis: (s.description ?? "").replace(/<[^>]+>/g, "").trim(),
        contentRating: ContentRating.MATURE,
        status: this.parseStatus(s.status),
        tagGroups,
        shareUrl: `${BASE_URL}/series/${slug}`,
      },
    };
  }

  // ---------------------------------------------------------------- chapters

  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    const slug = this.slugOf(sourceManga.mangaId);
    const list = await this.fetchJson<ChapterDto[]>(`${BASE_URL}/api/series/${slug}/chapters`);
    const showLocked = getShowLocked();

    return (Array.isArray(list) ? list : [])
      .map((c) => ({ c, locked: this.isLocked(c) }))
      .filter(({ locked }) => showLocked || !locked)
      .sort((a, b) => (b.c.number ?? 0) - (a.c.number ?? 0))
      .map(({ c, locked }) => {
        const num = c.number != null ? this.formatNumber(c.number) : undefined;
        let name: string;
        if (num === undefined) name = c.title?.trim() || "Chapter";
        else if (!c.title?.trim() || c.title === num) name = `Chapter ${num}`;
        else if (/^chapter/i.test(c.title)) name = c.title;
        else name = `Chapter ${num} - ${c.title}`;
        return {
          // The API is keyed by the chapter UUID; keep the slug alongside it
          // so the share URL can be rebuilt.
          chapterId: this.toSafeId(`${slug}/${c.id}/${num ?? ""}`),
          sourceManga,
          title: `${locked ? "🔒 " : ""}${name}`,
          volume: 0,
          chapNum: c.number ?? -1,
          publishDate: this.parseDate(c.created_at),
          langCode: "🇬🇧",
        };
      });
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const id = this.safeDecode(chapter.chapterId).split("/")[1];
    if (!id) throw new Error("Refresh the chapter list");
    const pages = await this.fetchJson<PageDto[]>(`${BASE_URL}/api/chapters/${id}/pages`);
    const urls = (Array.isArray(pages) ? pages : [])
      .slice()
      .sort((a, b) => a.page_number - b.page_number)
      .map((p) => this.absoluteUrl(p.image_url))
      .filter(Boolean);
    if (urls.length === 0) {
      throw new Error("No pages found — the chapter may be locked on the site.");
    }
    return { id: chapter.chapterId, mangaId: chapter.sourceManga.mangaId, pages: urls };
  }

  async getMangaShareUrl(mangaId: string): Promise<string> {
    return `${BASE_URL}/series/${this.slugOf(mangaId)}`;
  }

  // ---------------------------------------------------------------- helpers

  private async fetchList(opts: {
    page: number;
    sort?: string;
    q?: string;
    status?: string;
    type?: string;
    genres?: string[];
  }): Promise<{ list: SeriesDto[]; hasNext: boolean }> {
    const p: string[] = [`per_page=${PER_PAGE}`, `page=${opts.page}`];
    if (opts.q) p.push(`q=${encodeURIComponent(opts.q)}`);
    if (opts.sort) {
      p.push(`sort=${encodeURIComponent(opts.sort)}`);
      const dir = sortDirection(opts.sort);
      if (dir) p.push(`dir=${dir}`);
    }
    if (opts.status) p.push(`status=${encodeURIComponent(opts.status)}`);
    if (opts.type) p.push(`type=${encodeURIComponent(opts.type)}`);
    if (opts.genres && opts.genres.length) {
      p.push(`genres=${encodeURIComponent(opts.genres.join(","))}`);
    }
    const r = await this.fetchJson<ListResponse>(`${BASE_URL}/api/series?${p.join("&")}`);
    const cur = r.meta?.current_page ?? 1;
    const last = r.meta?.last_page ?? 1;
    return { list: r.data ?? [], hasNext: cur < last };
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const [response, data] = await Application.scheduleRequest({ url, method: "GET" });
    if (response.status === 404) throw new Error("Content not found");
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Paradise Scans returned HTTP ${response.status}`);
    }
    return JSON.parse(Application.arrayBufferToUTF8String(data)) as T;
  }

  /** Upstream: priced, premium, early-access or early-locked. */
  private isLocked(c: ChapterDto): boolean {
    return (
      (c.price != null && c.price > 0) ||
      c.is_premium === true ||
      c.early_access === true ||
      c.early_locked === true
    );
  }

  private formatNumber(n: number): string {
    return Number.isInteger(n) ? String(n) : String(n);
  }

  /** Accepts the bare slug and legacy Keyoapp-style ids (`series/<slug>`). */
  private slugOf(mangaId: string): string {
    const d = this.safeDecode(mangaId).replace(/^\/+|\/+$/g, "");
    const i = d.indexOf("series/");
    return (i >= 0 ? d.slice(i + 7) : d).split("/")[0];
  }

  private parseStatus(status?: string | null): string {
    switch ((status ?? "").toLowerCase()) {
      case "ongoing":
        return "Ongoing";
      case "completed":
        return "Completed";
      case "hiatus":
        return "Hiatus";
      case "cancelled":
        return "Cancelled";
      default:
        return "Unknown";
    }
  }

  private parseDate(v?: string | null): Date {
    const t = v ? Date.parse(v) : NaN;
    return isNaN(t) ? new Date(0) : new Date(t);
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
      return enc !== c ? enc : "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0");
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
    for (const c of this.cookieStorageInterceptor.cookies) this.cookieStorageInterceptor.deleteCookie(c);
    for (const c of cookies) {
      if (c.expires && c.expires.getTime() <= Date.now()) continue;
      this.cookieStorageInterceptor.setCookie(c);
    }
  }
}

export const ParadiseScans = new ParadiseScansExtension();
