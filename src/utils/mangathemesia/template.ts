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
  SortingOption,
  SourceManga,
  TagSection,
} from "@paperback/types";
import * as cheerio from "cheerio";
import { CheerioAPI, Cheerio } from "cheerio";
import type { Element } from "domhandler";
import * as htmlparser2 from "htmlparser2";
import { URLBuilder } from "../url-builder/base";
import {
  MangaThemesiaSearchForm,
  MangaThemesiaSearchMeta,
} from "./forms";
import {
  getBaseUrlOverride,
  MangaThemesiaSettingsForm,
} from "./settings";

export interface MangaThemesiaConfig {
  name: string;
  baseUrl: string;
  // The path prefix where manga live, defaults to "/manga".
  mangaUrlDirectory?: string;
  contentRating?: ContentRating;
  langCode?: string;
  // ----------------------------------------------------------------
  // Optional per-source overrides. These default to the standard
  // WordPress MangaThemesia behaviour; only heavily-customised forks
  // (e.g. Comic Asura's Next.js rebuild) need to set them.
  // ----------------------------------------------------------------
  // Browse/search endpoint path (relative). Defaults to mangaUrlDirectory.
  // e.g. Comic Asura uses "/advanced-search".
  browsePath?: string;
  // When true, the browse/search endpoint expects the Comic-Asura style
  // query params (name=, sort=, page=) instead of the standard
  // title=, order=, page=. Also maps the discover orders rating/latest.
  useAdvancedSearchParams?: boolean;
  // Override CSS selectors (cheerio). Each defaults to the standard set.
  discoverItemSelector?: string; // selects each manga card/link
  /**
   * Container that scopes the details page lookups. Defaults to the standard
   * `div.bigcontent, div.animefull, div.main-info, div.postbody`. Forks that
   * rebuild the details markup (e.g. Eva Scans `.series-premium-header`)
   * override this so the scoped selectors below resolve.
   */
  seriesDetailsSelector?: string;
  seriesTitleSelector?: string;
  seriesThumbnailSelector?: string;
  seriesDescriptionSelector?: string;
  seriesGenreSelector?: string;
  seriesStatusSelector?: string;
  seriesAltNameSelector?: string;
  // Label text used to find the status row (e.g. "Status").
  chapterSelector?: string;
  chapterNameSelector?: string;
  chapterDateSelector?: string;
  pageSelector?: string;
  // MangaThemesiaAlt: some sites (e.g. Thunder Scans) prefix manga slugs
  // with a rotating "<digits>-" segment that changes periodically, which
  // breaks stored URLs. When enabled, the permanent slug (prefix stripped)
  // is stored as the mangaId and the current rotating slug is resolved on
  // demand from the site's "/list-mode/" index (cached for an hour).
  randomUrl?: boolean;
  // Selector for the title inside a search/browse card, with a fallback to
  // the card anchor's `title` attribute. Used by Alt forks whose card title
  // markup differs from the standard MangaThemesia layout.
  searchTitleSelector?: string;
}

interface MangaThemesiaMetadata {
  page?: number;
  collectedIds?: string[];
  searchCollectedIds?: string[];
}

class MangaThemesiaInterceptor extends PaperbackInterceptor {
  constructor(
    id: string,
    private readonly getBaseUrl: () => string,
  ) {
    super(id);
  }

  override async interceptRequest(request: Request): Promise<Request> {
    const baseUrl = this.getBaseUrl();
    request.headers = {
      ...request.headers,
      referer: `${baseUrl}/`,
      origin: baseUrl,
      "user-agent": await Application.getDefaultUserAgent(),
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.5",
    };
    return request;
  }

  override async interceptResponse(
    request: Request,
    response: Response,
    data: ArrayBuffer,
  ): Promise<ArrayBuffer> {
    const cfMitigated = response.headers?.["cf-mitigated"];
    if (cfMitigated === "challenge") {
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

type MangaThemesiaImplementation = Extension &
  SearchResultsProviding &
  MangaProviding &
  ChapterProviding &
  CloudflareBypassRequestProviding &
  SettingsFormProviding &
  DiscoverSectionProviding;

export class MangaThemesiaExtension implements MangaThemesiaImplementation {
  static readonly MAX_SEARCH_PAGES = 5;

  readonly sourceName: string;
  readonly defaultBaseUrl: string;
  readonly mangaUrlDirectory: string;
  readonly contentRating: ContentRating;
  readonly langCode: string;

  // Optional overrides (see MangaThemesiaConfig).
  readonly browsePath: string;
  readonly useAdvancedSearchParams: boolean;
  readonly discoverItemSelectorOverride?: string;
  readonly seriesDetailsSelectorOverride?: string;
  readonly seriesTitleSelectorOverride?: string;
  readonly seriesThumbnailSelectorOverride?: string;
  readonly seriesDescriptionSelectorOverride?: string;
  readonly seriesGenreSelectorOverride?: string;
  readonly seriesStatusSelectorOverride?: string;
  readonly seriesAltNameSelectorOverride?: string;
  readonly chapterSelectorOverride?: string;
  readonly chapterNameSelectorOverride?: string;
  readonly chapterDateSelectorOverride?: string;
  readonly pageSelectorOverride?: string;

  // MangaThemesiaAlt random-url support.
  readonly randomUrl: boolean;
  readonly searchTitleSelectorOverride?: string;
  private static readonly SLUG_PREFIX_REGEX = /^(\d+-)/;
  private static readonly URL_MAP_TTL_MS = 60 * 60 * 1000; // 1 hour
  // Maps permanent slug -> current rotating slug.
  private urlMap: Map<string, string> = new Map();
  private urlMapFetchedAt = 0;

  get baseUrl(): string {
    return getBaseUrlOverride(this.sourceName) ?? this.defaultBaseUrl;
  }

  requestManager: MangaThemesiaInterceptor;
  cookieStorageInterceptor = new CookieStorageInterceptor({
    storage: "stateManager",
  });
  globalRateLimiter = new BasicRateLimiter("rateLimiter", {
    numberOfRequests: 5,
    bufferInterval: 4,
    ignoreImages: true,
  });

  constructor(config: MangaThemesiaConfig) {
    this.sourceName = config.name;
    this.defaultBaseUrl = config.baseUrl.replace(/\/+$/, "");
    // mangaUrlDirectory is stored without leading/trailing slashes.
    this.mangaUrlDirectory = (config.mangaUrlDirectory ?? "/manga").replace(
      /^\/+|\/+$/g,
      "",
    );
    this.contentRating = config.contentRating ?? ContentRating.EVERYONE;
    this.langCode = config.langCode ?? "🇬🇧";
    // browsePath stored without leading/trailing slashes; defaults to the
    // manga directory (standard MangaThemesia behaviour).
    this.browsePath = (config.browsePath ?? `/${this.mangaUrlDirectory}`)
      .replace(/^\/+|\/+$/g, "");
    this.useAdvancedSearchParams = config.useAdvancedSearchParams ?? false;
    this.discoverItemSelectorOverride = config.discoverItemSelector;
    this.seriesDetailsSelectorOverride = config.seriesDetailsSelector;
    this.seriesTitleSelectorOverride = config.seriesTitleSelector;
    this.seriesThumbnailSelectorOverride = config.seriesThumbnailSelector;
    this.seriesDescriptionSelectorOverride = config.seriesDescriptionSelector;
    this.seriesGenreSelectorOverride = config.seriesGenreSelector;
    this.seriesStatusSelectorOverride = config.seriesStatusSelector;
    this.seriesAltNameSelectorOverride = config.seriesAltNameSelector;
    this.chapterSelectorOverride = config.chapterSelector;
    this.chapterNameSelectorOverride = config.chapterNameSelector;
    this.chapterDateSelectorOverride = config.chapterDateSelector;
    this.pageSelectorOverride = config.pageSelector;
    this.randomUrl = config.randomUrl ?? false;
    this.searchTitleSelectorOverride = config.searchTitleSelector;
    this.requestManager = new MangaThemesiaInterceptor(
      "main",
      () => this.baseUrl,
    );
  }

  async getSettingsForm(): Promise<Form> {
    return new MangaThemesiaSettingsForm(this.sourceName, this.defaultBaseUrl);
  }

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
        id: "popular_section",
        title: "Popular",
        type: DiscoverSectionType.featured,
      },
      {
        id: "latest_section",
        title: "Latest Updates",
        type: DiscoverSectionType.simpleCarousel,
      },
    ];
  }

  async getAdvancedSearchForm(
    query: SearchQuery<Metadata>,
  ): Promise<AdvancedSearchForm> {
    const meta = query.metadata as
      | { searchMeta?: MangaThemesiaSearchMeta }
      | undefined;
    return new MangaThemesiaSearchForm(meta?.searchMeta);
  }

  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata: Metadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const meta = metadata as MangaThemesiaMetadata | undefined;
    switch (section.id) {
      case "popular_section":
        return this.getMangaListItems(meta, "popular", "featuredCarouselItem");
      case "latest_section":
        return this.getMangaListItems(meta, "update", "simpleCarouselItem");
      default:
        return { items: [] };
    }
  }

  private async getMangaListItems(
    metadata: MangaThemesiaMetadata | undefined,
    order: string,
    itemType: "featuredCarouselItem" | "simpleCarouselItem",
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const page = metadata?.page ?? 1;
    const collectedIds = metadata?.collectedIds ?? [];

    const url = this.buildBrowseUrl({ page, order });

    const $ = await this.fetchCheerio({ url, method: "GET" });
    const items: DiscoverSectionItem[] = [];

    $(this.searchMangaSelector).each((_, element) => {
      const unit = $(element);
      const link = unit.is("a") ? unit : unit.find("a").first();
      const href = link.attr("href") || "";
      const img = unit.find("img").first();
      const title = (
        (this.searchTitleSelectorOverride
          ? unit.find(this.searchTitleSelectorOverride).first().text().trim()
          : "") ||
        img.attr("title") ||
        link.attr("title") ||
        link.text()
      ).trim();
      const mangaId = this.parseMangaId(href);
      const image = this.imageFromElement(img);

      if (title && mangaId && !collectedIds.includes(mangaId)) {
        collectedIds.push(mangaId);
        items.push({
          type: itemType,
          mangaId,
          imageUrl: image,
          title,
          metadata: undefined,
        });
      }
    });

    const hasNextPage = this.hasNextBrowsePage($);

    return {
      items,
      metadata: hasNextPage ? { page: page + 1, collectedIds } : undefined,
    };
  }

  // ----------------------------------------------------------------
  // Search
  // ----------------------------------------------------------------

  /**
   * Chapter-row selector. Exposed as a getter (not just a constructor override)
   * so subclasses can vary it at runtime — e.g. Elf Toon filters out paid
   * chapters based on a user setting (upstream #18890).
   */
  get chapterSelector(): string {
    return (
      this.chapterSelectorOverride ??
      "div.bxcl li, div.cl li, #chapterlist li, ul li:has(div.chbox):has(div.eph-num)"
    );
  }

  get searchMangaSelector(): string {
    return (
      this.discoverItemSelectorOverride ??
      ".utao .uta .imgu, .listupd .bs .bsx, .listo .bs .bsx"
    );
  }

  // Detects whether a browse/search page has a "next page" link. Includes
  // the standard MangaThemesia pagination plus the Comic-Asura-style
  // "Next" image button used by advanced-search forks.
  private hasNextBrowsePage($: CheerioAPI): boolean {
    return (
      $("div.pagination .next, div.hpage .r, a:has(img[alt=Next])").length > 0
    );
  }

  // Builds the browse/search URL, honouring browsePath +
  // useAdvancedSearchParams overrides. `order` uses the standard tokens
  // ("popular"/"update"/...) and is translated for advanced-search forks.
  private buildBrowseUrl(opts: {
    page: number;
    order?: string;
    title?: string;
    author?: string;
    year?: string;
    status?: string;
    type?: string;
  }): string {
    const builder = new URLBuilder(this.baseUrl).addPath(this.browsePath);

    if (this.useAdvancedSearchParams) {
      // Comic-Asura style: name=, sort=, page=, status=, type=
      builder.addQuery("name", encodeURIComponent(opts.title ?? ""));
      const sort = this.mapAdvancedOrder(opts.order);
      if (sort) builder.addQuery("sort", sort);
      if (opts.status) builder.addQuery("status", opts.status);
      if (opts.type) builder.addQuery("type", opts.type.toLowerCase());
      builder.addQuery("page", opts.page.toString());
      return builder.build();
    }

    // Standard MangaThemesia: title=, page=, order=, author=, yearx=, ...
    builder
      .addQuery("title", encodeURIComponent(opts.title ?? ""))
      .addQuery("page", opts.page.toString());
    if (opts.order) builder.addQuery("order", opts.order);
    if (opts.author) builder.addQuery("author", encodeURIComponent(opts.author));
    if (opts.year) builder.addQuery("yearx", encodeURIComponent(opts.year));
    if (opts.status) builder.addQuery("status", opts.status);
    if (opts.type) builder.addQuery("type", opts.type);
    return builder.build();
  }

  // Maps standard discover/sort tokens to Comic-Asura's `sort` values.
  private mapAdvancedOrder(order?: string): string {
    switch (order) {
      case "popular":
        return "rating";
      case "update":
      case "latest":
        return "latest";
      case "title":
        return "name_desc";
      default:
        return order ?? "";
    }
  }

  async getSortingOptions(): Promise<SortingOption[]> {
    return [
      { id: "", label: "Default" },
      { id: "title", label: "A-Z" },
      { id: "titlereverse", label: "Z-A" },
      { id: "update", label: "Latest Update" },
      { id: "latest", label: "Latest Added" },
      { id: "popular", label: "Popular" },
    ];
  }

  async getSearchResults(
    query: SearchQuery<Metadata>,
    metadata: Metadata | undefined,
    sortingOption?: SortingOption | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const meta = metadata as MangaThemesiaMetadata | undefined;
    const page = meta?.page ?? 1;
    const collectedIds = meta?.searchCollectedIds ?? [];
    const titleQuery = (query.title || "").trim();

    const searchMeta = (
      query.metadata as { searchMeta?: MangaThemesiaSearchMeta } | undefined
    )?.searchMeta;

    const sortId = sortingOption?.id ?? "";
    const filterOrderBy =
      searchMeta?.orderBy && searchMeta.orderBy.length > 0
        ? searchMeta.orderBy[0]
        : "";
    const effectiveOrderBy = sortId || filterOrderBy;

    // MangaThemesia uses the SAME endpoint for search, popular, latest and
    // browse: {browsePath}/?title=&page=&order=&... so an empty query
    // simply lists everything. Forks like Comic Asura use a dedicated
    // /advanced-search endpoint with name=/sort= params (handled in
    // buildBrowseUrl via useAdvancedSearchParams).
    const url = this.buildBrowseUrl({
      page,
      title: titleQuery,
      order: effectiveOrderBy || undefined,
      author: searchMeta?.author,
      year: searchMeta?.year,
      status:
        searchMeta?.status && searchMeta.status.length > 0
          ? searchMeta.status[0]
          : undefined,
      type:
        searchMeta?.type && searchMeta.type.length > 0
          ? searchMeta.type[0]
          : undefined,
    });
    const $ = await this.fetchCheerio({ url, method: "GET" });
    const results: SearchResultItem[] = [];

    $(this.searchMangaSelector).each((_, element) => {
      const unit = $(element);
      const link = unit.is("a") ? unit : unit.find("a").first();
      const href = link.attr("href") || "";
      const img = unit.find("img").first();
      const title = (
        (this.searchTitleSelectorOverride
          ? unit.find(this.searchTitleSelectorOverride).first().text().trim()
          : "") ||
        img.attr("title") ||
        link.attr("title") ||
        link.text()
      ).trim();
      const mangaId = this.parseMangaId(href);
      const image = this.imageFromElement(img);

      if (title && mangaId && !collectedIds.includes(mangaId)) {
        collectedIds.push(mangaId);
        results.push({
          mangaId,
          imageUrl: image,
          title,
          subtitle: undefined,
          metadata: undefined,
        });
      }
    });

    const hasNextPage = this.hasNextBrowsePage($);
    const reachedPageLimit = page >= MangaThemesiaExtension.MAX_SEARCH_PAGES;

    return {
      items: results,
      metadata:
        hasNextPage && !reachedPageLimit
          ? { page: page + 1, searchCollectedIds: collectedIds }
          : undefined,
    };
  }

  // ----------------------------------------------------------------
  // Manga details
  // ----------------------------------------------------------------

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const slug = await this.resolveMangaSlug(mangaId);
    const url = new URLBuilder(this.baseUrl)
      .addPath(this.mangaUrlDirectory)
      .addPath(slug)
      .build();
    const $ = await this.fetchCheerio({ url, method: "GET" });

    const details = $(
      this.seriesDetailsSelectorOverride ??
        "div.bigcontent, div.animefull, div.main-info, div.postbody",
    ).first();
    const scope = details.length > 0 ? details : $("html");

    const title = scope
      .find(
        this.seriesTitleSelectorOverride ??
          "h1.entry-title, .ts-breadcrumb li:last-child span",
      )
      .first()
      .text()
      .trim();

    const image = this.imageFromElement(
      scope
        .find(
          this.seriesThumbnailSelectorOverride ??
            ".infomanga > div[itemprop=image] img, .thumb img",
        )
        .first(),
    );

    let description = "";
    scope
      .find(
        this.seriesDescriptionSelectorOverride ??
          ".desc, .entry-content[itemprop=description]",
      )
      .each((_, el) => {
        const t = $(el).text().trim();
        if (t) description += (description ? "\n" : "") + t;
      });

    // Alt name appended to description (mirrors Kotlin behaviour).
    const altName = scope
      .find(
        this.seriesAltNameSelectorOverride ??
          ".alternative, .wd-full:contains(alt) span, .alter, .seriestualt",
      )
      .first()
      .text()
      .trim();
    const altTitles: string[] = [];
    if (altName) {
      altName.split(/[,;|]/).forEach((t) => {
        const trimmed = t.trim();
        if (trimmed) altTitles.push(trimmed);
      });
    }

    const authors: string[] = [];
    scope
      .find(
        ".infotable tr:contains(Author) td:last-child, .tsinfo .imptdt:contains(Author) i, .fmed b:contains(Author)+span",
      )
      .each((_, el) => {
        const a = $(el).text().trim();
        if (a && a !== "-" && a.toLowerCase() !== "n/a") authors.push(a);
      });

    const artists: string[] = [];
    scope
      .find(
        ".infotable tr:contains(Artist) td:last-child, .tsinfo .imptdt:contains(Artist) i, .fmed b:contains(Artist)+span",
      )
      .each((_, el) => {
        const a = $(el).text().trim();
        if (a && a !== "-" && a.toLowerCase() !== "n/a") artists.push(a);
      });

    const genres: string[] = [];
    scope
      .find(
        this.seriesGenreSelectorOverride ??
          "div.gnr a, .mgen a, .seriestugenre a",
      )
      .each((_, el) => {
        const g = $(el).text().trim();
        if (g && !genres.includes(g)) genres.push(g);
      });

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

    const statusText = scope
      .find(
        this.seriesStatusSelectorOverride ??
          ".infotable tr:contains(Status) td:last-child, .tsinfo .imptdt:contains(Status) i, .fmed b:contains(Status)+span",
      )
      .first()
      .text()
      .trim();

    return {
      mangaId,
      mangaInfo: {
        primaryTitle: title,
        secondaryTitles: altTitles,
        thumbnailUrl: image,
        author: authors.join(", ") || undefined,
        artist: artists.join(", ") || undefined,
        synopsis: description,
        contentRating: this.contentRating,
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
    const mangaId = sourceManga.mangaId;
    const slug = await this.resolveMangaSlug(mangaId);
    const mangaUrl = new URLBuilder(this.baseUrl)
      .addPath(this.mangaUrlDirectory)
      .addPath(slug)
      .build();

    const $ = await this.fetchCheerio({ url: mangaUrl, method: "GET" });
    const chapters: Chapter[] = [];

    $(this.chapterSelector).each((_, element) => {
      const el = $(element);
      // Some forks (e.g. Comic Asura) use the row element itself as the
      // anchor; otherwise the anchor is nested inside the row.
      const link = el.is("a") ? el : el.find("a").first();
      const href = link.attr("href") || "";
      if (!href) return;

      const chapterId = this.parseChapterId(href, mangaId);
      if (!chapterId) return;

      const chapterTitle =
        el
          .find(this.chapterNameSelectorOverride ?? ".lch a, .chapternum")
          .text()
          .trim() || link.text().trim();

      let chapNum = 0;
      const numMatch = chapterTitle.match(/chapter[.\s-]*(\d+(?:\.\d+)?)/i);
      if (numMatch) {
        chapNum = parseFloat(numMatch[1]);
      } else {
        const anyNum = chapterTitle.match(/(\d+(?:\.\d+)?)/);
        if (anyNum) chapNum = parseFloat(anyNum[1]);
      }

      const dateText = el
        .find(this.chapterDateSelectorOverride ?? ".chapterdate")
        .first()
        .text()
        .trim();
      const publishDate = this.parseDate(dateText);

      chapters.push({
        chapterId,
        sourceManga,
        title: chapterTitle,
        volume: 0,
        chapNum,
        publishDate,
        langCode: this.langCode,
      });
    });

    return chapters;
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    // chapterId now holds the full path (minus the domain), so request it
    // directly instead of rebuilding a nested {mangaUrlDirectory}/{mangaId}/...
    // URL (which broke forks whose chapters live under a different prefix).
    const url = `${this.baseUrl}/${chapter.chapterId}`;

    const $ = await this.fetchCheerio({ url, method: "GET" });
    const pages: string[] = [];

    $(this.pageSelectorOverride ?? "div#readerarea img").each((_, element) => {
      const image = this.imageFromElement($(element as Element));
      if (image) pages.push(image);
    });

    // Fallback: some sites embed the image list as JSON in a script:
    // "images":[ ... ]
    if (pages.length === 0) {
      const html = $.root().html() || "";
      const match = html.match(/"images"\s*:\s*(\[.*?\])/s);
      if (match) {
        try {
          const arr = JSON.parse(match[1]) as unknown[];
          for (const entry of arr) {
            if (typeof entry === "string") {
              const u = entry.trim().replace(/\\\//g, "/");
              if (u) pages.push(u);
            }
          }
        } catch {
          // ignore malformed JSON
        }
      }
    }

    return {
      id: chapter.chapterId,
      mangaId: chapter.sourceManga.mangaId,
      pages: [...new Set(pages)],
    };
  }

  getMangaShareUrl(mangaId: string): string {
    return new URLBuilder(this.baseUrl)
      .addPath(this.mangaUrlDirectory)
      .addPath(mangaId)
      .build();
  }

  // ----------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------

  private parseMangaId(href: string): string {
    const marker = `/${this.mangaUrlDirectory}/`;
    const cleaned = href.replace(/[?#].*$/, "").replace(/\/$/, "");
    let slug: string;
    const idx = cleaned.indexOf(marker);
    if (idx !== -1) {
      slug = cleaned.slice(idx + marker.length).split("/")[0];
    } else {
      slug = cleaned.split("/").pop() ?? "";
    }
    // MangaThemesiaAlt: strip the rotating "<digits>-" prefix so the stored
    // mangaId is stable across the site's periodic slug rotation.
    if (this.randomUrl) {
      slug = slug.replace(MangaThemesiaExtension.SLUG_PREFIX_REGEX, "");
    }
    return this.toSafeId(slug);
  }

  // MangaThemesiaAlt: resolves a stored permanent slug to the current
  // rotating slug using the site's "/list-mode/" index. Falls back to the
  // permanent slug itself if the map has no entry.
  protected async resolveMangaSlug(mangaId: string): Promise<string> {
    if (!this.randomUrl) return mangaId;
    await this.ensureUrlMap();
    const permaSlug = mangaId.replace(
      MangaThemesiaExtension.SLUG_PREFIX_REGEX,
      "",
    );
    return this.urlMap.get(permaSlug) ?? mangaId;
  }

  private async ensureUrlMap(): Promise<void> {
    const now = Date.now();
    if (
      this.urlMap.size > 0 &&
      now - this.urlMapFetchedAt < MangaThemesiaExtension.URL_MAP_TTL_MS
    ) {
      return;
    }

    const url = new URLBuilder(this.baseUrl)
      .addPath(this.mangaUrlDirectory)
      .addPath("list-mode")
      .build();

    try {
      const $ = await this.fetchCheerio({ url, method: "GET" });
      const map = new Map<string, string>();
      $("div#content div.soralist ul li a.series").each((_, element) => {
        const href = $(element).attr("href") || "";
        const cleaned = href.replace(/[?#].*$/, "").replace(/\/$/, "");
        const slug = cleaned.split("/").pop() ?? "";
        if (!slug) return;
        const permaSlug = slug.replace(
          MangaThemesiaExtension.SLUG_PREFIX_REGEX,
          "",
        );
        map.set(permaSlug, slug);
      });
      if (map.size > 0) {
        this.urlMap = map;
        this.urlMapFetchedAt = now;
      }
    } catch {
      // Network/parse failure: keep any previous map and fall back to
      // requesting the permanent slug directly.
    }
  }

  private parseChapterId(href: string, _mangaId: string): string {
    // Store the FULL path (minus the domain), mirroring keiyoushi's
    // setUrlWithoutDomain(). Chapter URLs differ between forks: standard
    // MangaThemesia is flat ({baseUrl}/{chapter-slug}), some forks nest the
    // chapter under a "/chapter/" prefix (e.g. Rizz Comic:
    // {baseUrl}/chapter/{slug}) and others nest under the series directory
    // (e.g. Comic Asura: {baseUrl}/manga/{series}/chapter-N). Keeping only the
    // last path segment dropped these prefixes and produced a broken nested
    // URL in getChapterDetails. Preserving the whole path lets the chapter be
    // requested verbatim.
    const cleaned = href
      .replace(/^https?:\/\/[^/]+/i, "")
      .replace(/[?#].*$/, "")
      .replace(/^\/+/, "")
      .replace(/\/$/, "");
    return this.toSafeId(cleaned);
  }

  // Paperback only allows IDs matching alphanumerics + `._-@()[]%?#+=/&:`.
  private toSafeId(slug: string): string {
    return slug.replace(/[^A-Za-z0-9._\-@()[\]%?#+=/&:]/g, (c) => {
      const enc = encodeURIComponent(c);
      if (enc !== c) return enc;
      return "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0");
    });
  }

  private imageFromElement(img: Cheerio<Element>): string {
    if (!img || img.length === 0) return "";
    let src =
      img.attr("data-lazy-src") ||
      img.attr("data-src") ||
      img.attr("data-cfsrc") ||
      "";

    if (!src) {
      const srcset = img.attr("srcset");
      if (srcset) {
        const candidates = srcset
          .split(",")
          .map((part) => part.trim().split(/\s+/))
          .map(([u, w]) => ({
            url: u,
            width: parseInt((w || "0").replace(/\D/g, "")) || 0,
          }));
        candidates.sort((a, b) => b.width - a.width);
        if (candidates.length > 0) src = candidates[0].url;
      }
    }

    if (!src) src = img.attr("src") || "";

    src = src.trim();
    if (src && !src.startsWith("http")) {
      src = src.startsWith("/")
        ? `${this.baseUrl}${src}`
        : `${this.baseUrl}/${src}`;
    }
    return src;
  }

  protected parseStatus(status: string): string {
    const s = status.toLowerCase().trim();
    if (!s) return "Unknown";
    if (s.includes("complet") || s.includes("finished") || s.includes("tamat"))
      return "Completed";
    if (
      s.includes("ongoing") ||
      s.includes("on going") ||
      s.includes("publishing") ||
      s.includes("updating") ||
      s.includes("berjalan")
    )
      return "Ongoing";
    if (s.includes("hiatus") || s.includes("hold") || s.includes("pause"))
      return "Hiatus";
    if (s.includes("cancel") || s.includes("drop") || s.includes("discontin"))
      return "Cancelled";
    return "Unknown";
  }

  private parseDate(dateText: string): Date {
    if (!dateText) return new Date();
    // Strip ordinal suffixes ("12th", "1st", "2nd", "3rd") that some
    // forks (e.g. Comic Asura) embed, which break Date parsing.
    const normalized = dateText.replace(/(\d+)(st|nd|rd|th)/gi, "$1");
    const direct = new Date(normalized);
    if (!isNaN(direct.getTime())) return direct;

    const now = new Date();
    const lower = dateText.toLowerCase();
    if (lower.includes("ago")) {
      const amount = parseInt(lower.match(/\d+/)?.[0] || "0");
      if (lower.includes("min")) return new Date(now.getTime() - amount * 60000);
      if (lower.includes("hour"))
        return new Date(now.getTime() - amount * 3600000);
      if (lower.includes("day"))
        return new Date(now.getTime() - amount * 86400000);
      if (lower.includes("week"))
        return new Date(now.getTime() - amount * 604800000);
      if (lower.includes("month"))
        return new Date(now.getTime() - amount * 2592000000);
      if (lower.includes("year"))
        return new Date(now.getTime() - amount * 31536000000);
    }
    return now;
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
      if (cookie.expires && cookie.expires.getTime() <= Date.now()) {
        continue;
      }
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
