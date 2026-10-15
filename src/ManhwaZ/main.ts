import {
  BasicRateLimiter,
  ButtonRow,
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
  InputRow,
  LabelRow,
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
  SettingsFormProviding,
  SourceManga,
  TagSection,
} from "@paperback/types";
import * as cheerio from "cheerio";
import { Cheerio, CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";
import * as htmlparser2 from "htmlparser2";

/*
 * Upstream #19523 ("Manhwaz Fix") rewrote ManhwaZ as a standalone source: the
 * site left the shared ManhwaZ theme for its own layout and moved to
 * manhwaz.cc. The `utils/manhwaz` template is still used by ManhwaHub, which
 * did not change, so this source is now self-contained.
 *
 * Verified live while porting: 52 cards on the homepage
 * (`article.popular-card` / `article.latest-card`), 50 `a.release-row` chapter
 * rows on a series page, and 97 `figure.reader-page-image img` on a chapter.
 * `p.series-summary` no longer exists on the live site, so the synopsis falls
 * back to the page's meta description.
 */

const DEFAULT_BASE_URL = "https://manhwaz.cc";
const BASE_URL_KEY = "manhwaz.baseUrlOverride";

function baseUrl(): string {
  const v = Application.getState(BASE_URL_KEY);
  const s = typeof v === "string" ? v.trim().replace(/\/+$/, "") : "";
  return s || DEFAULT_BASE_URL;
}

class ManhwaZSettingsForm extends Form {
  private value =
    (typeof Application.getState(BASE_URL_KEY) === "string"
      ? (Application.getState(BASE_URL_KEY) as string)
      : "") || "";

  async update(v: string): Promise<void> {
    this.value = v;
    Application.setState(v.trim().replace(/\/+$/, ""), BASE_URL_KEY);
    this.reloadForm();
  }

  async reset(): Promise<void> {
    this.value = "";
    Application.setState("", BASE_URL_KEY);
    this.reloadForm();
  }

  override getSections() {
    return [
      Section(
        {
          id: "base_url",
          footer: `Override the site address if it moves. Leave empty for ${DEFAULT_BASE_URL}.`,
        },
        [
          InputRow("base_url_input", {
            title: "Base URL",
            value: this.value,
            onValueChange: Application.Selector<ManhwaZSettingsForm, (v: string) => Promise<void>>(
              this,
              "update",
            ),
          }),
          LabelRow("base_url_current", { title: "Currently using", value: baseUrl() }),
          ButtonRow("base_url_reset", {
            title: "Reset to default",
            onSelect: Application.Selector<ManhwaZSettingsForm, () => Promise<void>>(this, "reset"),
          }),
        ],
      ),
    ];
  }
}

class ManhwaZInterceptor extends PaperbackInterceptor {
  override async interceptRequest(request: Request): Promise<Request> {
    request.headers = {
      ...request.headers,
      referer: `${baseUrl()}/`,
      "user-agent": await Application.getDefaultUserAgent(),
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
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

interface Card {
  mangaId: string;
  title: string;
  imageUrl: string;
}

export class ManhwaZExtension implements Impl {
  requestManager = new ManhwaZInterceptor("main");
  cookieStorageInterceptor = new CookieStorageInterceptor({ storage: "stateManager" });
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
    return new ManhwaZSettingsForm();
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
    const popular = section.id === "popular";
    // Upstream: the homepage "popular" grid is static across ?page=N.
    if (popular && page > 1) return { items: [], metadata: undefined };
    const $ = await this.fetchCheerio(popular ? `${baseUrl()}/` : `${baseUrl()}/?page=${page}`);
    const cards = this.cards($, popular ? "article.popular-card" : "article.latest-card");
    return {
      items: cards.map((c) => ({
        type: popular ? "featuredCarouselItem" : "simpleCarouselItem",
        ...c,
        metadata: undefined,
      })),
      metadata: !popular && this.hasNext($) ? { page: page + 1 } : undefined,
    };
  }

  async getSearchResults(
    query: SearchQuery<Metadata>,
    metadata: Metadata | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const page = (metadata as { page?: number } | undefined)?.page ?? 1;
    const q = (query.title || "").trim();
    const url = q
      ? `${baseUrl()}/search?s=${encodeURIComponent(q)}&page=${page}`
      : `${baseUrl()}/?page=${page}`;
    const $ = await this.fetchCheerio(url);
    const cards = this.cards($, q ? "article.popular-card" : "article.latest-card");
    return {
      items: cards.map((c) => ({ ...c, subtitle: undefined, metadata: undefined })),
      metadata: this.hasNext($) ? { page: page + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const $ = await this.fetchCheerio(this.mangaUrl(mangaId));

    const facts = new Map<string, Cheerio<AnyNode>>();
    $("div.series-facts dl > div").each((_, row) => {
      const label = $(row).find("dt").first().text().trim().toLowerCase();
      facts.set(label, $(row).find("dd").first());
    });

    const h1 = $("section.profile-manga h1").first();
    const title =
      h1.clone().children().remove().end().text().trim() || h1.text().trim() || mangaId;

    const author = facts.get("author(s)")?.text().trim();
    const genres: string[] = [];
    facts.get("genre(s)")?.find("a").each((_, a) => {
      const g = $(a).text().trim();
      if (g) genres.push(g);
    });
    const tagGroups: TagSection[] = genres.length
      ? [{ id: "genres", title: "Genres", tags: genres.map((g) => ({ id: g.toLowerCase(), title: g })) }]
      : [];

    const statusText = (facts.get("status")?.text() ?? "").toLowerCase();
    const altRaw = facts.get("alternative")?.text().trim() ?? "";

    const synopsis =
      $("p.series-summary").first().text().trim() ||
      ($('meta[name="description"]').attr("content") ?? "").trim();

    return {
      mangaId,
      mangaInfo: {
        primaryTitle: title,
        secondaryTitles: altRaw
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s && s.toLowerCase() !== "updating" && s !== title),
        thumbnailUrl: this.abs($("div.series-cover-frame img").first().attr("src") ?? ""),
        author: author && author.toLowerCase() !== "updating" ? author : undefined,
        synopsis,
        contentRating: ContentRating.MATURE,
        status: statusText.includes("ongoing")
          ? "Ongoing"
          : statusText.includes("completed")
            ? "Completed"
            : "Unknown",
        tagGroups,
        shareUrl: this.mangaUrl(mangaId),
      },
    };
  }

  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    // Chapters are server-paginated via ?chapterPage=N; follow "Next page".
    const chapters: Chapter[] = [];
    const seen = new Set<string>();
    let url: string | undefined = this.mangaUrl(sourceManga.mangaId);
    for (let guard = 0; url && guard < 100; guard++) {
      const $ = await this.fetchCheerio(url);
      $("a.release-row").each((_, el) => {
        const href = $(el).attr("href") ?? "";
        const id = this.pathOf(href);
        if (!id || seen.has(id)) return;
        seen.add(id);
        const name = $(el).find("strong").first().text().trim();
        const m = name.match(/(\d+(?:\.\d+)?)/);
        chapters.push({
          chapterId: id,
          sourceManga,
          title: name,
          volume: 0,
          chapNum: m ? parseFloat(m[1]) : -1,
          langCode: "🇬🇧",
        });
      });
      const next = $('nav.pagination a[aria-label="Next page"]').first().attr("href");
      url = next ? this.abs(next) : undefined;
    }
    return chapters;
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const $ = await this.fetchCheerio(`${baseUrl()}/${this.safeDecode(chapter.chapterId)}`);
    const pages: string[] = [];
    $("div.reader-pages figure.reader-page-image img").each((_, img) => {
      const src = $(img).attr("src") || $(img).attr("data-src") || "";
      if (src) pages.push(this.abs(src));
    });
    return { id: chapter.chapterId, mangaId: chapter.sourceManga.mangaId, pages };
  }

  async getMangaShareUrl(mangaId: string): Promise<string> {
    return this.mangaUrl(mangaId);
  }

  // ---------------------------------------------------------------- helpers

  private cards($: CheerioAPI, selector: string): Card[] {
    const out: Card[] = [];
    const seen = new Set<string>();
    $(selector).each((_, el) => {
      const a = $(el).find("h3 a").first();
      const href = a.attr("href") ?? "";
      const id = this.pathOf(href);
      if (!id || seen.has(id)) return;
      seen.add(id);
      const img = $(el).find("img").first();
      out.push({
        mangaId: id,
        title: a.text().trim(),
        imageUrl: this.abs(img.attr("src") || img.attr("data-src") || ""),
      });
    });
    return out;
  }

  private hasNext($: CheerioAPI): boolean {
    return $('nav.pagination a[aria-label="Next page"]').length > 0;
  }

  /**
   * Store ids as the path without the domain (upstream `setUrlWithoutDomain`),
   * so a base-URL override keeps old library entries working.
   */
  private pathOf(href: string): string {
    // Same shape the previous theme port stored (path, no domain, no leading
    // slash — e.g. `webtoon/<slug>`), so existing library entries still match.
    const p = href
      .replace(/[?#].*$/, "")
      .replace(/^https?:\/\/[^/]+/i, "")
      .replace(/^\/+|\/+$/g, "");
    return p ? encodeURI(p) : "";
  }

  private mangaUrl(mangaId: string): string {
    const d = this.safeDecode(mangaId).replace(/^\/+/, "");
    if (d.startsWith("http")) return d;
    // A bare slug (no section prefix) is treated as a webtoon path.
    return d.includes("/") ? `${baseUrl()}/${d}` : `${baseUrl()}/webtoon/${d}`;
  }

  private abs(src: string): string {
    const s = (src || "").trim();
    if (!s) return "";
    if (s.startsWith("http")) return s;
    if (s.startsWith("//")) return `https:${s}`;
    return s.startsWith("/") ? `${baseUrl()}${s}` : `${baseUrl()}/${s}`;
  }

  private safeDecode(s: string): string {
    try {
      return decodeURI(s);
    } catch {
      return s;
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

  private async fetchCheerio(url: string): Promise<CheerioAPI> {
    const [response, data] = await Application.scheduleRequest({ url, method: "GET" });
    if (response.status === 404) throw new Error("Content not found");
    return cheerio.load(htmlparser2.parseDocument(Application.arrayBufferToUTF8String(data)));
  }
}

export const ManhwaZ = new ManhwaZExtension();
