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
  JSONObject,
  MangaProviding,
  Metadata,
  PagedResults,
  PaperbackInterceptor,
  Request,
  Response,
  SearchQuery,
  SearchResultItem,
  SearchResultsProviding,
  Section,
  SelectRow,
  SourceManga,
  TagSection,
} from "@paperback/types";
import * as cheerio from "cheerio";
import { CheerioAPI } from "cheerio";
import * as htmlparser2 from "htmlparser2";

/*
 * Upstream #19961 ("HentaiSco: rewrite for the new site") replaced the Madara
 * config with a standalone scraper — the site no longer runs Madara.
 *
 * NOT VERIFIED OFF-DEVICE: hentaisco.cc answers every non-browser request with
 * a Cloudflare challenge, so this is a straight port of upstream's selectors
 * and relies on Paperback's Cloudflare bypass on-device.
 *
 * Ids stay the bare series slug — what the previous Madara port stored with
 * mangaSubString "hentai" — so existing library entries keep resolving.
 */

const BASE_URL = "https://hentaisco.cc";

interface HentaiScoSearchMeta extends JSONObject {
  sort: string[];
  status: string[];
  type: string[];
}

const SORT = [
  { id: "", title: "Latest" },
  { id: "alphabet", title: "A–Z" },
  { id: "rating", title: "Rating" },
  { id: "trending", title: "Trending" },
  { id: "views", title: "Most viewed" },
  { id: "new-manga", title: "New" },
];
const STATUS = [
  { id: "", title: "Any status" },
  { id: "ongoing", title: "Ongoing" },
  { id: "completed", title: "Completed" },
  { id: "hiatus", title: "On hiatus" },
  { id: "dropped", title: "Dropped" },
];
const TYPE = [
  { id: "", title: "Any type" },
  { id: "manhwa", title: "Manhwa" },
  { id: "manga", title: "Manga" },
  { id: "manhua", title: "Manhua" },
  { id: "doujinshi", title: "Doujinshi" },
  { id: "webtoon", title: "Webtoon" },
  { id: "cg", title: "CG" },
  { id: "other", title: "Other" },
];

class HentaiScoSearchForm extends AdvancedSearchForm {
  private sort: string[];
  private status: string[];
  private type: string[];
  constructor(m?: HentaiScoSearchMeta) {
    super();
    this.sort = m?.sort ?? [];
    this.status = m?.status ?? [];
    this.type = m?.type ?? [];
  }
  async setSort(v: string[]) {
    this.sort = v;
    this.reloadForm();
  }
  async setStatus(v: string[]) {
    this.status = v;
    this.reloadForm();
  }
  async setType(v: string[]) {
    this.type = v;
    this.reloadForm();
  }
  getSearchQueryMetadata() {
    return { searchMeta: { sort: this.sort, status: this.status, type: this.type } satisfies HentaiScoSearchMeta };
  }
  override getSections() {
    type F = (v: string[]) => Promise<void>;
    return [
      Section("filters", [
        SelectRow("sort", {
          title: "Sort by",
          value: this.sort,
          options: SORT,
          minItemCount: 0,
          maxItemCount: 1,
          onValueChange: Application.Selector<HentaiScoSearchForm, F>(this, "setSort"),
        }),
        SelectRow("status", {
          title: "Status",
          value: this.status,
          options: STATUS,
          minItemCount: 0,
          maxItemCount: 1,
          onValueChange: Application.Selector<HentaiScoSearchForm, F>(this, "setStatus"),
        }),
        SelectRow("type", {
          title: "Type",
          value: this.type,
          options: TYPE,
          minItemCount: 0,
          maxItemCount: 1,
          onValueChange: Application.Selector<HentaiScoSearchForm, F>(this, "setType"),
        }),
      ]),
    ];
  }
}

class HentaiScoInterceptor extends PaperbackInterceptor {
  override async interceptRequest(request: Request): Promise<Request> {
    request.headers = {
      ...request.headers,
      referer: `${BASE_URL}/`,
      "user-agent": await Application.getDefaultUserAgent(),
      "accept-language": "en-US,en;q=0.9",
    };
    return request;
  }
  override async interceptResponse(request: Request, response: Response, data: ArrayBuffer): Promise<ArrayBuffer> {
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
  DiscoverSectionProviding;

export class HentaiScoExtension implements Impl {
  requestManager = new HentaiScoInterceptor("main");
  cookieStorageInterceptor = new CookieStorageInterceptor({ storage: "stateManager" });
  globalRateLimiter = new BasicRateLimiter("rateLimiter", { numberOfRequests: 2, bufferInterval: 1, ignoreImages: true });

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

  async getDiscoverSectionItems(section: DiscoverSection, metadata: Metadata | undefined): Promise<PagedResults<DiscoverSectionItem>> {
    const page = (metadata as { page?: number } | undefined)?.page ?? 1;
    const popular = section.id === "popular";
    const r = await this.browse(this.paged("hentai-list", page), popular ? ["m_orderby=views"] : []);
    return {
      items: r.items.map((i) => ({ type: popular ? "featuredCarouselItem" : "simpleCarouselItem", ...i, metadata: undefined })),
      metadata: r.hasNext ? { page: page + 1 } : undefined,
    };
  }

  async getAdvancedSearchForm(query: SearchQuery<Metadata>): Promise<AdvancedSearchForm> {
    return new HentaiScoSearchForm((query.metadata as { searchMeta?: HentaiScoSearchMeta } | undefined)?.searchMeta);
  }

  async getSearchResults(query: SearchQuery<Metadata>, metadata: Metadata | undefined): Promise<PagedResults<SearchResultItem>> {
    const page = (metadata as { page?: number } | undefined)?.page ?? 1;
    const q = (query.title || "").trim();
    let r;
    if (q) {
      // Upstream: the search pager's own /search/page/N/ links are 404.
      const params = [`q=${encodeURIComponent(q)}`];
      if (page > 1) params.push(`page=${page}`);
      r = await this.browse("search", params);
    } else {
      const m = (query.metadata as { searchMeta?: HentaiScoSearchMeta } | undefined)?.searchMeta;
      const params: string[] = [];
      const add = (k: string, v?: string) => v && params.push(`${k}=${encodeURIComponent(v)}`);
      // Upstream SortFilter defaults to "Most viewed".
      add("m_orderby", m?.sort?.[0] ?? "views");
      add("status", m?.status?.[0]);
      add("type", m?.type?.[0]);
      r = await this.browse(this.paged("hentai-list", page), params);
    }
    return {
      items: r.items.map((i) => ({ ...i, subtitle: undefined, metadata: undefined })),
      metadata: r.hasNext ? { page: page + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const $ = await this.fetchCheerio(this.mangaUrl(mangaId));
    const d = $("article[data-manga-id]").first();
    const scope = d.length ? d : $("body");

    const byLabel = (label: string) =>
      scope
        .find("dt")
        .filter((_, el) => $(el).text().trim() === label)
        .next("dd")
        .find("a")
        .map((_, a) => $(a).text().trim())
        .get()
        .join(", ") || undefined;

    const genres = scope
      .find('a[href^="/genre/"], a[href^="/tag/"]')
      .map((_, a) => $(a).text().trim().replace(/^#/, ""))
      .get()
      .filter(Boolean);
    const tagGroups: TagSection[] = genres.length
      ? [{ id: "genres", title: "Genres", tags: [...new Set(genres)].map((g) => ({ id: g.toLowerCase(), title: g })) }]
      : [];

    const desc = [...scope.find("[data-read-more-body] p").toArray(), ...scope.find("h1 + p").toArray()]
      .map((p) => $(p).text().trim())
      .filter(Boolean)
      .join("\n\n");
    const info = scope.find("h1").first().prev("p").text().toLowerCase();

    return {
      mangaId,
      mangaInfo: {
        primaryTitle: scope.find("h1").first().text().trim(),
        secondaryTitles: [],
        thumbnailUrl: this.abs(scope.find(".cover-frame img").first().attr("src") ?? ""),
        author: byLabel("Author"),
        artist: byLabel("Artist"),
        synopsis: desc,
        contentRating: ContentRating.MATURE,
        status: info.includes("ongoing") ? "Ongoing" : info.includes("completed") ? "Completed" : "Unknown",
        tagGroups,
        shareUrl: this.mangaUrl(mangaId),
      },
    };
  }

  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    const $ = await this.fetchCheerio(this.mangaUrl(sourceManga.mangaId));
    const chapters: Chapter[] = [];
    $("ol[data-chapter-list] > li > a").each((_, a) => {
      const link = $(a);
      // Path after the leading `/hentai/` segment, e.g. `<slug>/<chapter>`.
      const path = (link.attr("href") ?? "")
        .replace(/^https?:\/\/[^/]+/, "")
        .split("/")
        .filter(Boolean)
        .slice(1)
        .join("/");
      if (!path) return;
      const name = link.find("span").first().text().trim();
      const m = name.match(/(\d+(?:\.\d+)?)/);
      const t = Date.parse(link.find("time").attr("datetime") ?? "");
      chapters.push({
        chapterId: path,
        sourceManga,
        title: name,
        volume: 0,
        chapNum: m ? parseFloat(m[1]) : -1,
        publishDate: isNaN(t) ? undefined : new Date(t),
        langCode: "🇬🇧",
      });
    });
    return chapters;
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const $ = await this.fetchCheerio(`${BASE_URL}/hentai/${this.safeDecode(chapter.chapterId).replace(/^\/+|\/+$/g, "")}/`);
    const pages = $("[data-reader-pages] img.reader-page")
      .map((_, img) => this.abs($(img).attr("src") ?? ""))
      .get()
      .filter(Boolean);
    return { id: chapter.chapterId, mangaId: chapter.sourceManga.mangaId, pages };
  }

  async getMangaShareUrl(mangaId: string): Promise<string> {
    return this.mangaUrl(mangaId);
  }

  // ---------------------------------------------------------------- helpers

  private paged(path: string, page: number): string {
    return page > 1 ? `${path}/page/${page}` : path;
  }

  private async browse(path: string, params: string[]) {
    const url = `${BASE_URL}/${path}/${params.length ? `?${params.join("&")}` : ""}`;
    const $ = await this.fetchCheerio(url);
    const items: { mangaId: string; title: string; imageUrl: string }[] = [];
    $("article.cover-card").each((_, el) => {
      const card = $(el);
      const href = (card.find("a").first().attr("href") ?? "").replace(/^https?:\/\/[^/]+/, "");
      const slug = href.split("/").filter(Boolean)[1];
      if (!slug) return;
      items.push({
        mangaId: slug,
        title: card.find("h3").first().text().trim(),
        imageUrl: this.abs(card.find("img").first().attr("src") ?? ""),
      });
    });
    return { items, hasNext: $("nav.pager a[rel=next]").length > 0 };
  }

  private mangaUrl(mangaId: string): string {
    // Accept the bare slug and Madara-era `/hentai/<slug>/` forms.
    const d = this.safeDecode(mangaId).replace(/^\/+|\/+$/g, "");
    const slug = d.startsWith("hentai/") ? d.split("/")[1] : d.split("/")[0];
    return `${BASE_URL}/hentai/${slug}/`;
  }

  private abs(s: string): string {
    const v = s.trim();
    if (!v) return "";
    if (v.startsWith("http")) return v;
    if (v.startsWith("//")) return `https:${v}`;
    return v.startsWith("/") ? `${BASE_URL}${v}` : `${BASE_URL}/${v}`;
  }

  private safeDecode(s: string): string {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  }

  private async fetchCheerio(url: string): Promise<CheerioAPI> {
    const [response, data] = await Application.scheduleRequest({ url, method: "GET" });
    if (response.status === 404) throw new Error("Content not found");
    return cheerio.load(htmlparser2.parseDocument(Application.arrayBufferToUTF8String(data)));
  }

  async cloudflareBypassCompleted(_r: Request, cookies: Cookie[], _l: Record<string, string>): Promise<void> {
    for (const c of this.cookieStorageInterceptor.cookies) this.cookieStorageInterceptor.deleteCookie(c);
    for (const c of cookies) {
      if (c.expires && c.expires.getTime() <= Date.now()) continue;
      this.cookieStorageInterceptor.setCookie(c);
    }
  }
}

export const HentaiSco = new HentaiScoExtension();
