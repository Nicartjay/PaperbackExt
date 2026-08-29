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
import type { AnyNode } from "domhandler";
import { render as renderDom } from "dom-serializer";
import * as htmlparser2 from "htmlparser2";
import { URLBuilder } from "../url-builder/base";
import { decryptChapterProtector } from "./chapter-protector";
import { MadaraSearchForm, MadaraSearchMeta } from "./forms";
import { getBaseUrlOverride, MadaraSettingsForm } from "./settings";

// Paperback rejects an empty `thumbnailUrl`/`imageUrl` ("Could not convert
// JSValue: Invalid URL:"), so any item that genuinely has no cover falls back
// to this placeholder. It is an inline data: URI (a tiny self-contained SVG)
// rather than an external image, so it can never 404/402/expire the way a
// hosted placeholder can (the previous imageshack URL started returning
// "402 Bandwidth Limit Exceeded", breaking every cover-less manga).
const PLACEHOLDER_COVER =
  "data:image/svg+xml;base64," +
  "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAi" +
  "IGhlaWdodD0iNDUwIiB2aWV3Qm94PSIwIDAgMzAwIDQ1MCI+PHJlY3Qgd2lkdGg9IjMw" +
  "MCIgaGVpZ2h0PSI0NTAiIGZpbGw9IiMyMzI4MmYiLz48dGV4dCB4PSIxNTAiIHk9IjIy" +
  "NSIgZmlsbD0iIzhhOTNhMyIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiIGZvbnQtc2l6" +
  "ZT0iMjQiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGRvbWluYW50LWJhc2VsaW5lPSJtaWRk" +
  "bGUiPk5vIENvdmVyPC90ZXh0Pjwvc3ZnPg==";

/** Generate a random 16-byte (32-hex-char) string for the MadaraDex `mdx_fp`
 * fingerprint cookie. Mirrors keiyoushi's `randomHex16()` (SecureRandom 16
 * bytes -> hex). `Math.random` is adequate here: the value only needs to be
 * a well-formed unique-ish fingerprint, not cryptographically strong. */
function randomHex16(): string {
  let out = "";
  for (let i = 0; i < 16; i++) {
    out += Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, "0");
  }
  return out;
}

export interface MadaraConfig {
  name: string;
  baseUrl: string;
  mangaSubString?: string;
  useNewChapterEndpoint?: boolean;
  contentRating?: ContentRating;
  langCode?: string;

  // --- Optional per-source overrides (mirror the upstream keiyoushi Madara
  // subclass overrides). All default to the framework's standard behavior, so
  // omitting them keeps a source identical to a plain Madara site. ---

  /** Upstream `useLoadMoreRequest = LoadMoreStrategy.Always`: browse popular /
   * latest through the `madara_load_more` admin-ajax endpoint instead of
   * page-navigation. */
  useLoadMoreRequest?: boolean;
  /** Upstream `filterNonMangaItems` (default true): restrict listings to
   * `_wp_manga_chapter_type = manga` in the load-more query. */
  filterNonMangaItems?: boolean;
  /** Upstream `supportsLatest = false`: hide the "Latest Updates" section. */
  supportsLatest?: boolean;
  /** Anchor selector for popular list items (upstream `popularMangaUrlSelector`). */
  popularMangaUrlSelector?: string;
  /**
   * Container selector for discover (popular/latest) list items. Defaults to
   * the standard Madara `div.page-item-detail, .manga__item`. Custom themes
   * that rebuild the listing markup (e.g. HentaiRead `.manga-item`, Aqua Manga
   * `article.aqua-archive-card`) override this so the carousel isn't empty.
   */
  discoverItemSelector?: string;
  /** Anchor selector for search list items (upstream `searchMangaUrlSelector`). */
  searchMangaUrlSelector?: string;
  /** Chapter `<li>` selector (upstream `chapterListSelector`). */
  chapterListSelector?: string;
  /** Suffix appended to a chapter URL. Default `?style=list`; set `""` to drop. */
  chapterUrlSuffix?: string;
  /** Page-image container selector (upstream `pageListParseSelector`). */
  pageListSelector?: string;
  /** Manga-details selector overrides (upstream `mangaDetailsSelector*`). */
  mangaDetailsTitleSelector?: string;
  mangaDetailsStatusSelector?: string;
  mangaDetailsDescriptionSelector?: string;
  mangaDetailsThumbnailSelector?: string;
  mangaDetailsAuthorSelector?: string;
  mangaDetailsArtistSelector?: string;

  /**
   * Upstream MadaraDex-specific anti-bot scheme. When enabled, the source
   * requires two cookies — `mdx_fp` (a client fingerprint) and `mdx_auth`
   * (a server-issued token) — before it serves real chapter images. Without
   * them the site returns decoy pages (tiny `wp-content/uploads/NNN.webp`
   * images and a "MadaChan" block mascot). Mirrors keiyoushi's MadaraDex
   * `refreshAuth()` + `sec-fetch-site: same-site` header override. Only
   * MadaraDex sets this; every other Madara source omits it (default false).
   */
  mdxAuth?: boolean;
}

interface MadaraMetadata {
  page?: number;
  collectedIds?: string[];
  searchCollectedIds?: string[];
}

class MadaraInterceptor extends PaperbackInterceptor {
  constructor(
    id: string,
    private readonly getBaseUrl: () => string,
    private readonly mdxAuth: boolean = false,
  ) {
    super(id);
  }

  override async interceptRequest(request: Request): Promise<Request> {
    const baseUrl = this.getBaseUrl();
    const isImage = MadaraInterceptor.isImageRequest(request.url);
    request.headers = {
      ...request.headers,
      referer: `${baseUrl}/`,
      "user-agent": await Application.getDefaultUserAgent(),
      accept: isImage
        ? "image/avif,image/webp,image/apng,image/png,image/svg+xml,*/*;q=0.8"
        : "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.5",
      "accept-encoding": "gzip, deflate, br",
      "cache-control": "no-cache",
      pragma: "no-cache",
    };
    if (this.mdxAuth) {
      // Upstream MadaraDex sets this header on every request; the site's
      // anti-bot rejects requests without it (images come from the same-site
      // cdn.madaradex.org host).
      request.headers["sec-fetch-site"] = "same-site";
    }
    if (isImage) {
      // Browsers omit the Origin header when loading <img> elements (Origin is
      // a CORS/fetch concept). Image CDNs (e.g. cdn.madaradex.org) treat an
      // unexpected Origin as a hotlink attempt and return 403. Drop it for
      // image requests; keep it for the WordPress/AJAX page requests.
      delete request.headers["origin"];
    } else {
      request.headers["origin"] = baseUrl;
    }
    return request;
  }

  private static isImageRequest(url: string): boolean {
    return /\.(jpe?g|png|webp|gif|avif|bmp|svg|apng)(\?|#|$)/i.test(url);
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

type MadaraImplementation = Extension &
  SearchResultsProviding &
  MangaProviding &
  ChapterProviding &
  CloudflareBypassRequestProviding &
  SettingsFormProviding &
  DiscoverSectionProviding;

export class MadaraExtension implements MadaraImplementation {
  // Maximum number of pages to fetch when paginating search results.
  static readonly MAX_SEARCH_PAGES = 5;

  readonly sourceName: string;
  readonly defaultBaseUrl: string;
  readonly mangaSubString: string;
  readonly useNewChapterEndpoint: boolean;
  readonly contentRating: ContentRating;
  readonly langCode: string;

  readonly useLoadMoreRequest: boolean;
  readonly filterNonMangaItems: boolean;
  readonly supportsLatest: boolean;
  readonly popularMangaUrlSelector: string;
  readonly discoverItemSelector: string;
  readonly searchMangaUrlSelector: string;
  readonly chapterListSelector: string;
  readonly chapterUrlSuffix: string;
  readonly pageListSelector: string;
  readonly mangaDetailsTitleSelector: string;
  readonly mangaDetailsStatusSelector?: string;
  readonly mangaDetailsDescriptionSelector?: string;
  readonly mangaDetailsThumbnailSelector?: string;
  readonly mangaDetailsAuthorSelector?: string;
  readonly mangaDetailsArtistSelector?: string;
  readonly mdxAuth: boolean;

  /**
   * Effective base URL: a user-configured override (set via the settings
   * form) takes precedence over the bundled default. This lets users follow
   * a site that has changed domain without waiting for an extension update.
   */
  get baseUrl(): string {
    return getBaseUrlOverride(this.sourceName) ?? this.defaultBaseUrl;
  }

  requestManager: MadaraInterceptor;
  cookieStorageInterceptor = new CookieStorageInterceptor({
    storage: "stateManager",
  });
  globalRateLimiter = new BasicRateLimiter("rateLimiter", {
    numberOfRequests: 5,
    bufferInterval: 4,
    ignoreImages: true,
  });

  constructor(config: MadaraConfig) {
    this.sourceName = config.name;
    this.defaultBaseUrl = config.baseUrl.replace(/\/+$/, "");
    this.mangaSubString = config.mangaSubString ?? "manga";
    this.useNewChapterEndpoint = config.useNewChapterEndpoint ?? false;
    this.contentRating = config.contentRating ?? ContentRating.EVERYONE;
    this.langCode = config.langCode ?? "🇬🇧";

    this.useLoadMoreRequest = config.useLoadMoreRequest ?? false;
    this.filterNonMangaItems = config.filterNonMangaItems ?? true;
    this.supportsLatest = config.supportsLatest ?? true;
    this.popularMangaUrlSelector =
      config.popularMangaUrlSelector ?? "div.post-title a";
    this.discoverItemSelector =
      config.discoverItemSelector ?? "div.page-item-detail, .manga__item";
    this.searchMangaUrlSelector =
      config.searchMangaUrlSelector ?? "div.post-title a";
    this.chapterListSelector = config.chapterListSelector ?? "li.wp-manga-chapter";
    this.chapterUrlSuffix = config.chapterUrlSuffix ?? "?style=list";
    this.pageListSelector =
      config.pageListSelector ??
      "div.page-break, li.blocks-gallery-item, .reading-content .text-left:not(:has(.blocks-gallery-item)) img";
    this.mangaDetailsTitleSelector =
      config.mangaDetailsTitleSelector ??
      "div.post-title h3, div.post-title h1, #manga-title > h1";
    this.mangaDetailsStatusSelector = config.mangaDetailsStatusSelector;
    this.mangaDetailsDescriptionSelector =
      config.mangaDetailsDescriptionSelector;
    this.mangaDetailsThumbnailSelector = config.mangaDetailsThumbnailSelector;
    this.mangaDetailsAuthorSelector = config.mangaDetailsAuthorSelector;
    this.mangaDetailsArtistSelector = config.mangaDetailsArtistSelector;
    this.mdxAuth = config.mdxAuth ?? false;

    this.requestManager = new MadaraInterceptor(
      "main",
      () => this.baseUrl,
      this.mdxAuth,
    );
  }

  async getSettingsForm(): Promise<Form> {
    return new MadaraSettingsForm(this.sourceName, this.defaultBaseUrl);
  }

  async initialise(): Promise<void> {
    this.requestManager.registerInterceptor();
    this.cookieStorageInterceptor.registerInterceptor();
    this.globalRateLimiter.registerInterceptor();
    await this.ensureMdxAuth();
  }

  // ----------------------------------------------------------------
  // MadaraDex anti-bot auth (no-op unless `mdxAuth` is enabled)
  // ----------------------------------------------------------------

  /**
   * Establish the `mdx_fp` / `mdx_auth` cookie pair MadaraDex requires before
   * it serves real chapter images. Mirrors keiyoushi's `refreshAuth()`:
   *   1. If no `mdx_fp` cookie exists, mint a random 16-byte hex fingerprint
   *      and store it (30-day expiry, domain-scoped so it applies to the
   *      `cdn.madaradex.org` image subdomain too).
   *   2. If either `mdx_fp` or `mdx_auth` is missing, POST
   *      `action=mdx_auth_refresh` to `/wp-admin/admin-ajax.php` with the
   *      `X-Mdx-Auth-Refresh: 1` header; the response Set-Cookie supplies
   *      `mdx_auth`, captured automatically by the CookieStorageInterceptor.
   * Cheap to call repeatedly: it short-circuits once both cookies are present.
   */
  private async ensureMdxAuth(): Promise<void> {
    if (!this.mdxAuth) return;
    const host = this.baseUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    // Cookie domain without a leading dot; RFC 6265 domain-match covers
    // subdomains (e.g. cdn.<host>).
    const cookieDomain = host.replace(/^www\./, "");
    const stored = this.cookieStorageInterceptor.cookiesForUrl(this.baseUrl);
    const hasFp = stored.some((c) => c.name === "mdx_fp");
    const hasAuth = stored.some((c) => c.name === "mdx_auth");
    if (hasFp && hasAuth) return;

    if (!hasFp) {
      this.cookieStorageInterceptor.setCookie({
        name: "mdx_fp",
        value: randomHex16(),
        domain: cookieDomain,
        path: "/",
        expires: new Date(Date.now() + 2592000000),
      });
    }

    // Refresh the server-issued auth token. Errors here are non-fatal — the
    // chapter fetch will still be attempted and surface its own error.
    try {
      await Application.scheduleRequest({
        url: `${this.baseUrl}/wp-admin/admin-ajax.php`,
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          "x-mdx-auth-refresh": "1",
          "x-requested-with": "XMLHttpRequest",
        },
        body: "action=mdx_auth_refresh",
      });
    } catch {
      // ignore — best-effort token refresh
    }
  }

  // ----------------------------------------------------------------
  // Discover sections
  // ----------------------------------------------------------------

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    const sections: DiscoverSection[] = [
      {
        id: "new_series",
        title: "New Series",
        type: DiscoverSectionType.featured,
      },
    ];
    if (this.supportsLatest) {
      sections.push({
        id: "recently_updated",
        title: "Recently Updated",
        type: DiscoverSectionType.simpleCarousel,
      });
    }
    sections.push(
      {
        id: "currently_trending",
        title: "Currently Trending",
        type: DiscoverSectionType.simpleCarousel,
      },
      {
        id: "most_popular",
        title: "Most Popular",
        type: DiscoverSectionType.simpleCarousel,
      },
    );
    return sections;
  }

  async getAdvancedSearchForm(
    query: SearchQuery<Metadata>,
  ): Promise<AdvancedSearchForm> {
    const meta = query.metadata as
      | { searchMeta?: MadaraSearchMeta }
      | undefined;
    return new MadaraSearchForm(meta?.searchMeta);
  }

  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata: Metadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const meta = metadata as MadaraMetadata | undefined;
    switch (section.id) {
      case "new_series":
        return this.getMangaListItems(meta, "new-manga", "featuredCarouselItem");
      case "recently_updated":
        return this.getMangaListItems(meta, "latest", "simpleCarouselItem");
      case "currently_trending":
        return this.getMangaListItems(meta, "trending", "simpleCarouselItem");
      case "most_popular":
        return this.getMangaListItems(meta, "views", "simpleCarouselItem");
      default:
        return { items: [] };
    }
  }

  private async getMangaListItems(
    metadata: MadaraMetadata | undefined,
    orderBy: "views" | "latest" | "trending" | "new-manga",
    itemType: "featuredCarouselItem" | "simpleCarouselItem",
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const page = metadata?.page ?? 1;
    const collectedIds = metadata?.collectedIds ?? [];

    let $: CheerioAPI;
    if (this.useLoadMoreRequest) {
      // Sites with LoadMoreStrategy.Always serve listings only through the
      // madara_load_more admin-ajax endpoint (page is 0-indexed).
      $ = await this.fetchCheerio({
        url: `${this.baseUrl}/wp-admin/admin-ajax.php`,
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          "x-requested-with": "XMLHttpRequest",
          referer: `${this.baseUrl}/`,
        },
        body: this.loadMoreBody(page, orderBy),
      });
    } else {
      const builder = new URLBuilder(this.baseUrl).addPath(this.mangaSubString);
      if (page > 1) {
        builder.addPath("page").addPath(page.toString());
      }
      const url = builder.addQuery("m_orderby", orderBy).build();
      $ = await this.fetchCheerio({ url, method: "GET" });
    }

    const items: DiscoverSectionItem[] = [];

    $(this.discoverItemSelector).each((_, element) => {
      const unit = $(element);
      const titleLink = unit.find(this.popularMangaUrlSelector).first();
      const title = titleLink.text().trim() || titleLink.attr("title") || "";
      const href = titleLink.attr("href") || "";
      const mangaId = this.parseMangaId(href);
      const image = this.imageFromElement(unit.find("img").first());

      if (title && mangaId && !collectedIds.includes(mangaId)) {
        collectedIds.push(mangaId);
        items.push({
          type: itemType,
          mangaId,
          imageUrl: image || PLACEHOLDER_COVER,
          title,
          metadata: undefined,
        });
      }
    });

    // With load-more, an empty fragment means no more pages.
    const hasNextPage = this.useLoadMoreRequest
      ? items.length > 0
      : $("div.nav-previous, nav.navigation-ajax, a.nextpostslink").length > 0;

    return {
      items,
      metadata: hasNextPage ? { page: page + 1, collectedIds } : undefined,
    };
  }

  /** Build the `madara_load_more` admin-ajax form body (mirrors upstream). */
  protected loadMoreBody(
    page: number,
    orderBy: "views" | "latest" | "trending" | "new-manga",
  ): string {
    // Map the m_orderby value to the madara_load_more `orderby`/`meta_key` vars.
    let orderbyVar = "meta_value_num";
    let metaKey: string | undefined;
    switch (orderBy) {
      case "views":
        metaKey = "_wp_manga_views";
        break;
      case "trending":
        metaKey = "_wp_manga_week_views_value";
        break;
      case "new-manga":
        // Newest series order by post date, no meta key.
        orderbyVar = "date";
        break;
      case "latest":
      default:
        metaKey = "_latest_update";
        break;
    }

    const params: [string, string][] = [
      ["action", "madara_load_more"],
      ["page", (page - 1).toString()],
      ["template", "madara-core/content/content-archive"],
      ["vars[orderby]", orderbyVar],
      ["vars[paged]", "1"],
    ];
    if (this.filterNonMangaItems) {
      params.push(["vars[meta_query][0][key]", "_wp_manga_chapter_type"]);
      params.push(["vars[meta_query][0][value]", "manga"]);
    }
    params.push(
      ["vars[post_type]", "wp-manga"],
      ["vars[post_status]", "publish"],
    );
    if (metaKey) {
      params.push(["vars[meta_key]", metaKey]);
    }
    params.push(
      ["vars[order]", "desc"],
      ["vars[sidebar]", "right"],
      ["vars[manga_archives_item_layout]", "big_thumbnail"],
    );
    return params
      .map(
        ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`,
      )
      .join("&");
  }

  // ----------------------------------------------------------------
  // Search
  // ----------------------------------------------------------------

  async getSortingOptions(): Promise<SortingOption[]> {
    return [
      { id: "", label: "Relevance" },
      { id: "latest", label: "Latest" },
      { id: "alphabet", label: "A-Z" },
      { id: "rating", label: "Rating" },
      { id: "trending", label: "Trending" },
      { id: "views", label: "Most Views" },
      { id: "new-manga", label: "New" },
    ];
  }

  async getSearchResults(
    query: SearchQuery<Metadata>,
    metadata: Metadata | undefined,
    sortingOption?: SortingOption | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const meta = metadata as MadaraMetadata | undefined;
    const page = meta?.page ?? 1;
    const collectedIds = meta?.searchCollectedIds ?? [];
    const titleQuery = (query.title || "").trim();

    const searchMeta = (
      query.metadata as { searchMeta?: MadaraSearchMeta } | undefined
    )?.searchMeta;

    // Determine whether any advanced filter has been set.
    const hasFilters = !!(
      searchMeta &&
      (searchMeta.author ||
        searchMeta.artist ||
        searchMeta.release ||
        (searchMeta.status && searchMeta.status.length > 0) ||
        (searchMeta.orderBy &&
          searchMeta.orderBy.length > 0 &&
          searchMeta.orderBy[0] !== "") ||
        (searchMeta.adult &&
          searchMeta.adult.length > 0 &&
          searchMeta.adult[0] !== "") ||
        (searchMeta.genreCondition &&
          searchMeta.genreCondition.length > 0 &&
          searchMeta.genreCondition[0] !== ""))
    );

    // With no query term and no filters, browse the full manga listing
    // (same endpoint as the "Latest Updates" discover section) instead of
    // returning nothing. This mirrors how a bare search behaves elsewhere.
    const browseAll = !titleQuery && !hasFilters;

    // The sorting dropdown (getSortingOptions) takes precedence over the
    // advanced-form orderBy when the user picks a non-empty value.
    const sortId = sortingOption?.id ?? "";
    const filterOrderBy =
      searchMeta?.orderBy && searchMeta.orderBy.length > 0
        ? searchMeta.orderBy[0]
        : "";
    const effectiveOrderBy = sortId || filterOrderBy;

    const builder = new URLBuilder(this.baseUrl);
    if (browseAll) {
      builder.addPath(this.mangaSubString);
      if (page > 1) {
        builder.addPath("page").addPath(page.toString());
      }
      builder.addQuery("m_orderby", effectiveOrderBy || "latest");
    } else {
      if (page > 1) {
        builder.addPath("page").addPath(page.toString());
      }
      builder
        .addQuery("s", encodeURIComponent(titleQuery))
        .addQuery("post_type", "wp-manga");

      if (searchMeta) {
        if (searchMeta.author) {
          builder.addQuery("author", encodeURIComponent(searchMeta.author));
        }
        if (searchMeta.artist) {
          builder.addQuery("artist", encodeURIComponent(searchMeta.artist));
        }
        if (searchMeta.release) {
          builder.addQuery("release", encodeURIComponent(searchMeta.release));
        }
        if (searchMeta.status && searchMeta.status.length > 0) {
          builder.addQuery("status", searchMeta.status);
        }
        if (
          searchMeta.adult &&
          searchMeta.adult.length > 0 &&
          searchMeta.adult[0] !== ""
        ) {
          builder.addQuery("adult", searchMeta.adult[0]);
        }
        if (
          searchMeta.genreCondition &&
          searchMeta.genreCondition.length > 0 &&
          searchMeta.genreCondition[0] !== ""
        ) {
          builder.addQuery("op", searchMeta.genreCondition[0]);
        }
      }

      if (effectiveOrderBy) {
        builder.addQuery("m_orderby", effectiveOrderBy);
      }
    }

    const url = builder.build();

    const $ = await this.fetchCheerio({ url, method: "GET" });
    const results: SearchResultItem[] = [];

    // The listing page and the search page use different item containers.
    // Some themes use `c-tabs-item__content` for search; others reuse
    // `page-item-detail` (the same container as browse pages). Include both.
    const itemSelector = browseAll
      ? "div.page-item-detail, .manga__item"
      : "div.c-tabs-item__content, div.page-item-detail, .manga__item";

    $(itemSelector).each((_, element) => {
      const unit = $(element);
      const titleLink = unit.find(this.searchMangaUrlSelector).first();
      const title = titleLink.text().trim() || titleLink.attr("title") || "";
      const href = titleLink.attr("href") || "";
      const mangaId = this.parseMangaId(href);
      const image = this.imageFromElement(unit.find("img").first());

      if (title && mangaId && !collectedIds.includes(mangaId)) {
        collectedIds.push(mangaId);
        results.push({
          mangaId,
          imageUrl: image || PLACEHOLDER_COVER,
          title,
          subtitle: undefined,
          metadata: undefined,
        });
      }
    });

    const hasNextPage =
      $("div.nav-previous, nav.navigation-ajax, a.nextpostslink").length > 0;

    // Cap search pagination so the app doesn't keep loading every page.
    const reachedPageLimit = page >= MadaraExtension.MAX_SEARCH_PAGES;

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
    const url = this.buildMangaUrl(mangaId);
    const $ = await this.fetchCheerio({ url, method: "GET" });

    // Upstream #18681 switched this from `text()` to Jsoup's `ownText()`: some
    // themes nest extra elements inside the title heading (rating badges, a
    // "HOT"/"NEW" span, the alternative-name node), and those were being
    // concatenated into the manga title. cheerio has no `ownText()`, so clone
    // the node and drop its children to leave only its own text nodes.
    const titleNode = $(this.mangaDetailsTitleSelector).first();
    const title = titleNode.clone().children().remove().end().text().trim() ||
      titleNode.text().trim();

    const altTitles: string[] = [];
    $("div.post-content_item:contains(Alternative) div.summary-content")
      .first()
      .text()
      .split(/[,;]/)
      .forEach((t) => {
        const trimmed = t.trim();
        if (trimmed) altTitles.push(trimmed);
      });

    let image = this.imageFromElement(
      $(this.mangaDetailsThumbnailSelector ?? "div.summary_image img").first(),
    );

    // Some Madara skins render the cover with markup the default selector
    // misses (or lazy-load it client-side), leaving the thumbnail empty.
    // Paperback rejects an empty `thumbnailUrl` ("Invalid URL"), so fall back
    // to common alternative cover locations and finally the og:image meta tag.
    if (!image) {
      image = this.imageFromElement(
        $(
          "div.tab-summary img, div.summary_image a img, .profile-manga img, .site-content .summary_image img",
        ).first(),
      );
    }
    if (!image) {
      const ogImage =
        $('meta[property="og:image"]').attr("content") ||
        $('meta[name="twitter:image"]').attr("content") ||
        "";
      image = this.absoluteUrl(ogImage.trim());
    }
    // Last resort: never return an empty thumbnail or Paperback throws
    // "Invalid URL" and the whole manga fails to open.
    if (!image) {
      image = PLACEHOLDER_COVER;
    }

    const description = $(
      this.mangaDetailsDescriptionSelector ??
        "div.description-summary div.summary__content, div.summary_content div.post-content_item > h5 + div, div.summary_content div.manga-excerpt",
    )
      .first()
      .text()
      .trim();

    const authors: string[] = [];
    $(
      this.mangaDetailsAuthorSelector ??
        "div.author-content > a, div.manga-authors > a",
    ).each((_, el) => {
      const a = $(el).text().trim();
      if (a) authors.push(a);
    });

    const artists: string[] = [];
    $(this.mangaDetailsArtistSelector ?? "div.artist-content > a").each(
      (_, el) => {
        const a = $(el).text().trim();
        if (a) artists.push(a);
      },
    );

    let status = "Unknown";
    if (this.mangaDetailsStatusSelector) {
      status =
        $(this.mangaDetailsStatusSelector).first().text().trim() || status;
    } else {
      $("div.post-content_item, div.post-status div.summary-content").each(
        (_, el) => {
          const block = $(el);
          if (block.find("div.summary-heading").text().includes("Status")) {
            status = block.find("div.summary-content").text().trim() || status;
          }
        },
      );
    }

    const genres: string[] = [];
    $("div.genres-content a").each((_, el) => {
      const g = $(el).text().trim();
      if (g) genres.push(g);
    });

    const tagItems: string[] = [];
    $("div.tags-content a").each((_, el) => {
      const t = $(el).text().trim();
      if (t) tagItems.push(t);
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
    if (tagItems.length > 0) {
      tagGroups.push({
        id: "tags",
        title: "Tags",
        tags: tagItems.map((t) => ({
          id: t.toLowerCase().replace(/\s+/g, "-"),
          title: t,
        })),
      });
    }

    let rating = 0;
    const ratingValue = $("span#averagerate, span.score.total_votes")
      .first()
      .text()
      .trim();
    if (ratingValue) {
      const parsed = parseFloat(ratingValue);
      if (!isNaN(parsed)) rating = parsed / 5;
    }

    // Some Madara sites host both comics and text novels. The reader the app
    // opens is chosen by `contentType`; misclassifying a novel as a comic
    // makes the comic reader reject the HTML chapter details. Detect novels
    // via the title badge (e.g. `manga-title-badges ... novel-15` -> "Novel")
    // or a "Type: Novel" metadata row, falling back to comic.
    const badgeText = $(".manga-title-badges").text().toLowerCase();
    let typeMeta = "";
    $("div.post-content_item").each((_, el) => {
      const block = $(el);
      if (block.find("div.summary-heading").text().toLowerCase().includes("type")) {
        typeMeta = block.find("div.summary-content").text().toLowerCase();
      }
    });
    const isNovel =
      /\bnovel\b/.test(badgeText) ||
      $(".manga-title-badges.novel, .manga-title-badges[class*='novel']").length >
        0 ||
      /\bnovel\b/.test(typeMeta);

    return {
      mangaId,
      mangaInfo: {
        primaryTitle: title,
        secondaryTitles: altTitles,
        thumbnailUrl: image,
        author: authors.join(", ") || undefined,
        artist: artists.join(", ") || undefined,
        synopsis: description,
        rating,
        contentRating: this.contentRating,
        contentType: isNovel ? "novel" : "comic",
        status: this.parseStatus(status),
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
    const mangaUrl = this.buildMangaUrl(mangaId);

    let $ = await this.fetchCheerio({ url: mangaUrl, method: "GET" });
    let chapterElements = $(this.chapterListSelector);

    // Madara frequently loads chapters via AJAX. There are TWO endpoints:
    //   - legacy: POST {baseUrl}/wp-admin/admin-ajax.php
    //             body `action=manga_get_chapters&manga=<postId>`
    //   - modern: POST {mangaUrl}/ajax/chapters (no body)
    // Older sites only accept the legacy endpoint and actively block (403)
    // the modern one, and vice-versa. Mirror upstream: try the endpoint
    // implied by `useNewChapterEndpoint` first, then fall back to the other.
    if (chapterElements.length === 0) {
      // The WP post id lives on the chapters-holder wrapper.
      const postId = $("div[id^=manga-chapters-holder]").attr("data-id") ?? "";
      const tryOrder = this.useNewChapterEndpoint
        ? ["new", "legacy"]
        : ["legacy", "new"];

      for (const kind of tryOrder) {
        if (kind === "legacy" && !postId) continue;
        const ajax =
          kind === "new"
            ? await this.fetchChaptersNew(mangaUrl)
            : await this.fetchChaptersLegacy(postId);
        if (ajax && ajax(this.chapterListSelector).length > 0) {
          $ = ajax;
          chapterElements = ajax(this.chapterListSelector);
          break;
        }
      }
    }

    const chapters: Chapter[] = [];
    chapterElements.each((_, element) => {
      const el = $(element);
      // Some custom themes (e.g. Aqua Manga's `a.aqua-ch-item`) make the
      // chapter-row element itself the anchor rather than wrapping one, so
      // use the element directly when it is an <a>.
      const link = el.is("a") ? el : el.find("a").first();
      const href = link.attr("href") || "";
      if (!href) return;

      const chapterTitle = link.text().trim();
      const chapterId = this.parseChapterId(href, mangaId);
      if (!chapterId) return;

      let chapNum = 0;
      // Sites label chapters as "Chapter", "Episode", "Ch.", etc. Match the
      // known keywords first, then fall back to the slug, then to any trailing
      // number in the title.
      const numMatch = chapterTitle.match(
        /(?:chapter|episode|ch)[.\s-]*(\d+(?:\.\d+)?)/i,
      );
      if (numMatch) {
        chapNum = parseFloat(numMatch[1]);
      } else {
        const slugMatch = chapterId.match(
          /(?:chapter|episode|ch)-(\d+(?:[.-]\d+)?)/i,
        );
        if (slugMatch) {
          chapNum = parseFloat(slugMatch[1].replace("-", "."));
        } else {
          const titleNum = chapterTitle.match(/(\d+(?:\.\d+)?)/);
          if (titleNum) chapNum = parseFloat(titleNum[1]);
        }
      }

      const dateText = el.find("span.chapter-release-date").text().trim();
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

  /** Modern chapter list: POST {mangaUrl}/ajax/chapters (no body). */
  private async fetchChaptersNew(
    mangaUrl: string,
  ): Promise<CheerioAPI | undefined> {
    try {
      // Upstream keiyoushi POSTs this endpoint with NO body and NO
      // `content-type` header (just the standard headers + X-Requested-With).
      // Sending `content-type: application/x-www-form-urlencoded` on a bodyless
      // POST makes some Madara hosts (e.g. ToonGod) reject the request with a
      // 403, so omit it to mirror upstream.
      return await this.fetchCheerio({
        url: `${mangaUrl}/ajax/chapters`,
        method: "POST",
        headers: {
          referer: `${mangaUrl}/`,
          "x-requested-with": "XMLHttpRequest",
        },
      });
    } catch {
      return undefined;
    }
  }

  /**
   * Legacy chapter list: POST {baseUrl}/wp-admin/admin-ajax.php with
   * `action=manga_get_chapters&manga=<postId>`. Used by older Madara sites
   * (and by sites that block the modern /ajax/chapters route).
   */
  private async fetchChaptersLegacy(
    postId: string,
  ): Promise<CheerioAPI | undefined> {
    if (!postId) return undefined;
    try {
      return await this.fetchCheerio({
        url: `${this.baseUrl}/wp-admin/admin-ajax.php`,
        method: "POST",
        headers: {
          "content-type":
            "application/x-www-form-urlencoded; charset=UTF-8",
          referer: `${this.baseUrl}/`,
          "x-requested-with": "XMLHttpRequest",
        },
        body: `action=manga_get_chapters&manga=${encodeURIComponent(postId)}`,
      });
    } catch {
      return undefined;
    }
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    // Build the chapter URL with a TRAILING SLASH before the query string.
    // Madara runs on WordPress pretty-permalinks, whose canonical chapter URL
    // is `.../<chapter>/`. Requesting `.../<chapter>?style=list` (no trailing
    // slash) 404s on many hosts (the canonical redirect is dropped once a
    // query string is present), surfacing as "Content not found". Upstream
    // keiyoushi avoids this by round-tripping the site-provided `abs:href`,
    // which already carries the trailing slash. Mirror that here.
    const chapterId = chapter.chapterId;
    const decodedId = this.safeDecode(chapterId);
    let base: string;
    if (decodedId.startsWith("/")) {
      // chapterId is a full site-relative path (e.g. `/webtoon/<slug>/
      // chapter-N`) captured by parseChapterId when the chapter href did not
      // sit under `/<mangaSubString>/<mangaId>/`. Request it verbatim rather
      // than reconstructing (which would use the wrong path segment and 404).
      base = `${this.baseUrl.replace(/\/+$/, "")}${decodedId}`;
    } else {
      base = `${this.baseUrl.replace(/\/+$/, "")}/${this.mangaSubString}/${this.safeDecode(chapter.sourceManga.mangaId)}/${decodedId}`;
    }
    const path = base.replace(/\/+$/, "") + "/";
    // Upstream Madara 1.6 (#18075) made `?style=list` CONDITIONAL: the plain
    // chapter URL is fetched first and the list-style variant is only re-fetched
    // when the reader is actually paginated (`#single-pager` present). The old
    // unconditional suffix was flagged upstream as tripping Cloudflare on some
    // sites, so only pay for the second request when it buys something.
    let url: string;
    let styleListFallback: string | undefined;
    if (!this.chapterUrlSuffix) {
      url = path;
    } else if (this.chapterUrlSuffix === "?style=list") {
      url = path;
      styleListFallback = `${path}?style=list`;
    } else {
      url = path + this.chapterUrlSuffix;
    }

    // Ensure the MadaraDex anti-bot cookies are present before fetching the
    // reader page; without them the site returns decoy images. No-op for every
    // other Madara source.
    await this.ensureMdxAuth();

    let $ = await this.fetchCheerio({ url, method: "GET" });
    if (styleListFallback && $("#single-pager").length > 0) {
      $ = await this.fetchCheerio({ url: styleListFallback, method: "GET" });
    }
    const pages: string[] = [];

    // Real (image) manga may be served behind the Madara "chapter protector":
    // the page list is AES-encrypted in a `#chapter-protector-data` script
    // rather than inline `<img>` tags. Decrypt it when present; otherwise fall
    // back to scraping plain image elements.
    // The protector decrypt parses/decrypts site-controlled data; never let a
    // malformed payload throw out of here (that surfaces as a chapter error /
    // crash). On any failure, fall back to scraping plain `<img>` elements.
    let protectedPages: string[] | null = null;
    try {
      protectedPages = await decryptChapterProtector($);
    } catch {
      protectedPages = null;
    }
    if (protectedPages && protectedPages.length > 0) {
      for (const p of protectedPages) {
        const src = (p || "").trim();
        if (src) pages.push(src);
      }
    }
    if (pages.length === 0) {
      $(this.pageListSelector).each((_, element) => {
        const el = $(element);
        const img = el.is("img") ? el : el.find("img").first();
        const image = this.imageFromElement(img);
        if (image) pages.push(image);
      });
    }

    const uniquePages = [...new Set(pages)];

    // Some Madara sites host text novels (`chapter-type-text`) where the
    // chapter body is prose inside `.reading-content` with no page images.
    // Returning an empty image page list crashes the reader, so emit an HTML
    // (novel) chapter instead when no images were found but text content
    // exists.
    if (uniquePages.length === 0) {
      const html = this.extractNovelHtml($);
      if (html) {
        return {
          id: chapter.chapterId,
          mangaId: chapter.sourceManga.mangaId,
          type: "html",
          html,
        };
      }
      // No images and no prose. Returning an empty `pages` array crashes the
      // reader, so surface a clean error instead.
      throw new Error(
        "No pages found for this chapter; the page list may be loaded " +
          "dynamically or the site layout changed.",
      );
    }
    return {
      id: chapter.chapterId,
      mangaId: chapter.sourceManga.mangaId,
      pages: uniquePages,
    };
  }

  // Extract readable prose for text-novel chapters. Returns a well-formed
  // XHTML document, or "" if no meaningful text is present.
  //
  // The Paperback novel reader parses the returned `html` as XHTML (XML), so
  // the string MUST be a single rooted, well-formed document: void tags
  // self-closed (`<br/>`, `<img/>`), named entities like `&nbsp;` converted to
  // numeric/character form, and `&`/`<`/`>` escaped. Returning the container's
  // raw innerHTML (dozens of sibling `<p>` nodes, unclosed `<br>`, `&nbsp;`)
  // triggers `Extra content at the end of the document` / parse errors. We
  // serialize through dom-serializer in `xmlMode` to guarantee well-formedness.
  protected extractNovelHtml($: CheerioAPI): string {
    const container = $(
      ".reading-content .text-left, .reading-content .text-right, .reading-content .entry-content",
    ).first();
    const target = container.length > 0 ? container : $(".reading-content");
    if (target.length === 0) return "";

    // Drop non-prose noise (scripts, ads, nav, related widgets).
    const clone = target.clone();
    clone
      .find(
        "script, style, ins, .code-block, .adsbygoogle, nav, .navigation, iframe, .chapter-warning, .c-ads",
      )
      .remove();

    // Require some actual text so we don't emit an empty/whitespace body.
    if (clone.text().trim().length === 0) return "";

    // Serialize each child node as XML (self-closes void elements, encodes
    // entities) so the concatenation is well-formed XHTML.
    let inner = "";
    const children = clone.children().toArray();
    if (children.length > 0) {
      for (const node of children) {
        inner += renderDom(node, { xmlMode: true, decodeEntities: true });
      }
    } else {
      // No element children (plain text only): escape and wrap in a paragraph.
      inner = `<p>${this.escapeXml(clone.text().trim())}</p>`;
    }

    if (!inner.trim()) return "";

    return (
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>${inner}</body></html>`
    );
  }

  /** Escape the five XML special characters for use in text content. */
  protected escapeXml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  getMangaShareUrl(mangaId: string): string {
    return new URLBuilder(this.baseUrl)
      .addPath(this.mangaSubString)
      .addPath(mangaId)
      .build();
  }

  // ----------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------

  protected parseMangaId(href: string): string {
    const match = href.match(
      new RegExp(`/${this.mangaSubString}/([^/]+)`),
    );
    if (match) return this.toSafeId(match[1]);
    // Marker not found: the manga href doesn't sit under `/<mangaSubString>/`.
    // Some Madara sites list/browse manga under one path segment but serve the
    // canonical details page under another (e.g. ToonGod browses at
    // `/webtoons/<slug>` yet the real manga path is `/webtoon/<slug>/`).
    // Reconstructing from `mangaSubString` can 404, so preserve the full
    // site-relative path (marked by a leading slash) and let getMangaDetails /
    // getChapters request it verbatim — mirroring upstream keiyoushi, which
    // round-trips the site-provided `abs:href` via setUrlWithoutDomain.
    const cleaned = href.replace(/[?#].*$/, "").replace(/\/+$/, "");
    const hostMatch = cleaned.match(/^https?:\/\/[^/]+(\/.*)$/);
    if (hostMatch) return this.toSafeId(hostMatch[1]);
    if (cleaned.startsWith("/")) return this.toSafeId(cleaned);
    // fallback: generic /<seg>/<slug>
    return this.toSafeId(cleaned.split("/").pop() ?? "");
  }

  // Build the canonical manga page URL for a stored mangaId. A mangaId that
  // begins with "/" is a full site-relative path (captured by parseMangaId
  // when the href did not sit under `/<mangaSubString>/`) and is requested
  // verbatim; otherwise it is a slug under `/<mangaSubString>/`.
  protected buildMangaUrl(mangaId: string): string {
    const decoded = this.safeDecode(mangaId);
    if (decoded.startsWith("/")) {
      return `${this.baseUrl.replace(/\/+$/, "")}${decoded}`;
    }
    return new URLBuilder(this.baseUrl)
      .addPath(this.mangaSubString)
      .addPath(mangaId)
      .build();
  }

  protected parseChapterId(href: string, mangaId: string): string {
    const cleaned = href.replace(/[?#].*$/, "").replace(/\/$/, "");
    // mangaId may be percent-encoded; the raw href is not, so decode it
    // back when locating the manga segment within the chapter URL.
    const rawMangaId = this.safeDecode(mangaId);
    const marker = `/${this.mangaSubString}/${rawMangaId}/`;
    const idx = cleaned.indexOf(marker);
    if (idx !== -1) {
      return this.toSafeId(cleaned.slice(idx + marker.length));
    }
    // Marker not found: the chapter href doesn't sit under
    // `/<mangaSubString>/<mangaId>/`. Some Madara sites list manga under one
    // path segment (e.g. ToonGod browses at `/webtoons/<slug>`) but serve
    // chapters under another (e.g. `/webtoon/<slug>/chapter-N/`).
    // Reconstructing the chapter URL from `mangaSubString` would 404, so
    // preserve the full site-relative chapter path (marked by a leading
    // slash) and let `getChapterDetails` request it verbatim — mirroring
    // upstream keiyoushi, which round-trips the site-provided `abs:href`.
    const hostMatch = cleaned.match(/^https?:\/\/[^/]+(\/.*)$/);
    if (hostMatch) {
      return this.toSafeId(hostMatch[1]);
    }
    if (cleaned.startsWith("/")) {
      return this.toSafeId(cleaned);
    }
    return this.toSafeId(cleaned.split("/").pop() ?? "");
  }

  // Paperback only allows IDs matching alphanumerics + `._-@()[]%?#+=/&:`.
  // Slugs can contain decoded HTML entities such as apostrophes (from
  // `&#39;`), so percent-encode any disallowed character. The encoded ID
  // round-trips correctly when interpolated back into a request URL.
  protected toSafeId(slug: string): string {
    return slug.replace(/[^A-Za-z0-9._\-@()[\]%?#+=/&:]/g, (c) => {
      const enc = encodeURIComponent(c);
      if (enc !== c) return enc;
      return (
        "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")
      );
    });
  }

  protected safeDecode(id: string): string {
    try {
      return decodeURIComponent(id);
    } catch {
      return id;
    }
  }

  protected imageFromElement(img: Cheerio<AnyNode>): string {
    if (!img || img.length === 0) return "";
    let src = img.attr("data-src") || img.attr("data-lazy-src") || "";

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

    if (!src) src = img.attr("data-cfsrc") || "";
    if (!src) src = img.attr("data-manga-src") || "";
    if (!src) src = img.attr("src") || "";

    src = src.trim();
    if (src && !src.startsWith("http")) {
      src = src.startsWith("/")
        ? `${this.baseUrl}${src}`
        : `${this.baseUrl}/${src}`;
    }
    return src;
  }

  protected absoluteUrl(src: string): string {
    const s = (src || "").trim();
    if (!s) return "";
    if (s.startsWith("http")) return s;
    if (s.startsWith("//")) return `https:${s}`;
    return s.startsWith("/") ? `${this.baseUrl}${s}` : `${this.baseUrl}/${s}`;
  }

  protected parseStatus(status: string): string {
    const s = status.toLowerCase().trim();
    if (s.includes("complet")) return "Completed";
    if (
      s.includes("ongoing") ||
      s.includes("on going") ||
      s.includes("publishing")
    )
      return "Ongoing";
    if (s.includes("hold") || s.includes("hiatus")) return "Hiatus";
    if (s.includes("cancel") || s.includes("drop")) return "Cancelled";
    return "Unknown";
  }

  protected parseDate(dateText: string): Date {
    if (!dateText) return new Date();
    const direct = new Date(dateText);
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
