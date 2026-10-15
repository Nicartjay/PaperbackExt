import {
  Chapter,
  ChapterDetails,
  DiscoverSection,
  DiscoverSectionItem,
  Metadata,
  PagedResults,
  SearchQuery,
  SearchResultItem,
  SourceManga,
  TagSection,
} from "@paperback/types";
import * as cheerio from "cheerio";
import { CheerioAPI } from "cheerio";
import * as htmlparser2 from "htmlparser2";
import { getShowPaidChapters } from "./settings";
import { KeyoappConfig, KeyoappExtension } from "./template";

/*
 * Upstream #19781 ("Move Luna Toons and Siren Scans to a new KeyoappV2 class").
 * Sites on the newer Keyoapp build serve everything through `?_ajax=` / JSON
 * endpoints on the site root, and series live at `/<slug>` instead of
 * `/series/<slug>/`. Ids are the same bare slug the V1 port stored, so library
 * entries carry over.
 *
 * Verified live on lunatoons.net and sirenscans.org:
 *   search   /?_ajax=search&sort=&q=&offset=N   -> { html, has_more }   (20 a.group cards)
 *   latest   /?_ajax=recent-chapters&page=N      -> article.ru-card
 *   details  /<slug>                              -> h1, #series-desc, og:image, [data-series-uid]
 *   chapters /?_chapters_html=1&series_slug=<s>   -> { rows_html } with a.chapter-row[data-ch-*]
 *   pages    /<chapter-slug>                      -> #strip-reader img.reader-page
 */

interface SearchResponse {
  html?: string;
  has_more?: boolean;
}

interface ChaptersResponse {
  rows_html?: string;
}

const PAGE_SIZE = 20;

export class KeyoappV2Extension extends KeyoappExtension {
  constructor(config: KeyoappConfig) {
    super(config);
  }

  override async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata: Metadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const page = (metadata as { page?: number } | undefined)?.page ?? 1;

    if (section.id === "latest") {
      const $ = await this.load(`${this.baseUrl}/?_ajax=recent-chapters&page=${page}`);
      const items: DiscoverSectionItem[] = [];
      $("article.ru-card").each((_, el) => {
        const link = $(el).find("h2.ru-title > a").first();
        const slug = this.slugOf(link.attr("href") ?? "");
        if (!slug) return;
        const img = $(el).find("img.ru-cover-img").first();
        items.push({
          type: "simpleCarouselItem",
          mangaId: slug,
          title: link.text().trim(),
          imageUrl: this.abs(img.attr("data-src") || img.attr("src") || ""),
          metadata: undefined,
        });
      });
      const next = $('button[aria-label="Next recently updated page"]:not([disabled])').length > 0;
      return { items, metadata: next ? { page: page + 1 } : undefined };
    }

    const r = await this.search(page, { sort: "popular" });
    return {
      items: r.items.map((i) => ({ type: "featuredCarouselItem", ...i, metadata: undefined })),
      metadata: r.hasMore ? { page: page + 1 } : undefined,
    };
  }

  override async getSearchResults(
    query: SearchQuery<Metadata>,
    metadata: Metadata | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const page = (metadata as { page?: number } | undefined)?.page ?? 1;
    const r = await this.search(page, { q: (query.title || "").trim() });
    return {
      items: r.items.map((i) => ({ ...i, subtitle: undefined, metadata: undefined })),
      metadata: r.hasMore ? { page: page + 1 } : undefined,
    };
  }

  override async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const $ = await this.load(this.getMangaShareUrl(mangaId));
    if ($("[data-series-uid]").length === 0) throw new Error("Series not found");

    const meta = (label: string): string | undefined => {
      const span = $("span.text-xs")
        .filter((_, el) => $(el).text().trim() === label)
        .first();
      const v = span.parent().next().text().trim();
      return v || undefined;
    };
    const status = $("div.text-xs")
      .filter((_, el) => $(el).text().trim() === "Status")
      .first()
      .next("div")
      .find("span.text-sm")
      .first()
      .text()
      .trim()
      .toLowerCase();

    const genres = $('a[href*="?browse&tag"]')
      .map((_, a) => $(a).text().trim())
      .get()
      .filter(Boolean);
    const tagGroups: TagSection[] = genres.length
      ? [{ id: "genres", title: "Genres", tags: [...new Set(genres)].map((g) => ({ id: g.toLowerCase(), title: g })) }]
      : [];

    return {
      mangaId,
      mangaInfo: {
        primaryTitle: $("h1").first().text().trim(),
        secondaryTitles: [],
        thumbnailUrl: $('meta[property="og:image"]').attr("content") ?? "",
        author: meta("Author"),
        artist: meta("Artist"),
        synopsis: $("#series-desc").first().text().trim(),
        contentRating: this.contentRating,
        status: status.includes("ongoing")
          ? "Ongoing"
          : status.includes("completed")
            ? "Completed"
            : status.includes("hiatus")
              ? "Hiatus"
              : status.includes("dropped") || status.includes("cancel")
                ? "Cancelled"
                : "Unknown",
        tagGroups,
        shareUrl: this.getMangaShareUrl(mangaId),
      },
    };
  }

  override async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    const slug = this.slugOf(sourceManga.mangaId);
    const r = await this.json<ChaptersResponse>(
      `${this.baseUrl}/?_chapters_html=1&series_slug=${encodeURIComponent(slug)}`,
    );
    const $ = cheerio.load(htmlparser2.parseDocument(r.rows_html ?? ""));
    const showPaid = getShowPaidChapters(this.sourceName);
    const chapters: Chapter[] = [];
    $("a.chapter-row[href]").each((_, el) => {
      const a = $(el);
      const locked = a.attr("data-ch-locked") === "1";
      if (locked && !showPaid) return;
      const label = (a.attr("data-ch-label") ?? a.text()).trim();
      const id = this.slugOf(a.attr("href") ?? "");
      if (!id) return;
      const m = label.match(/(\d+(?:\.\d+)?)/);
      const t = Date.parse(a.find(".ch-date-row span").last().text().trim());
      chapters.push({
        chapterId: id,
        sourceManga,
        title: `${locked ? "🔒 " : ""}${label}`,
        volume: 0,
        chapNum: m ? parseFloat(m[1]) : -1,
        publishDate: isNaN(t) ? undefined : new Date(t),
        langCode: this.langCode,
      });
    });
    return chapters;
  }

  override async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const $ = await this.load(`${this.baseUrl}/${this.slugOf(chapter.chapterId)}`);
    const pages = $("#strip-reader img.reader-page")
      .map((_, img) => this.abs($(img).attr("src") || $(img).attr("data-src") || ""))
      .get()
      .filter(Boolean);
    if (pages.length === 0) {
      throw new Error("No pages found — the chapter may be locked on the site.");
    }
    return { id: chapter.chapterId, mangaId: chapter.sourceManga.mangaId, pages };
  }

  override getMangaShareUrl(mangaId: string): string {
    return `${this.baseUrl}/${this.slugOf(mangaId)}`;
  }

  // ---------------------------------------------------------------- helpers

  private async search(page: number, opts: { q?: string; sort?: string }) {
    const p = [`_ajax=search`, `offset=${(page - 1) * PAGE_SIZE}`];
    if (opts.q) p.push(`q=${encodeURIComponent(opts.q)}`);
    if (opts.sort) p.push(`sort=${encodeURIComponent(opts.sort)}`);
    const r = await this.json<SearchResponse>(`${this.baseUrl}/?${p.join("&")}`);
    const $ = cheerio.load(htmlparser2.parseDocument(r.html ?? ""));
    const items: { mangaId: string; title: string; imageUrl: string }[] = [];
    $("a.group[href]").each((_, el) => {
      const a = $(el);
      // Upstream `isNovel`: a `[data-type="novel"]` marker or a span whose own
      // text is exactly "Novel". Novels have no readable pages here.
      const novel =
        a.find('[data-type="novel" i]').length > 0 ||
        a.find("span").filter((_, s) => $(s).text().trim().toLowerCase() === "novel").length > 0;
      if (novel) return;
      const slug = this.slugOf(a.attr("href") ?? "");
      if (!slug) return;
      const img = a.find("img").first();
      items.push({
        mangaId: slug,
        title: a.find("h2").first().text().trim(),
        imageUrl: this.abs(img.attr("data-src") || img.attr("src") || ""),
      });
    });
    return { items, hasMore: r.has_more === true };
  }

  /** `/series/<slug>/` (V1 id form), `/<slug>` and bare slugs all map to the slug. */
  private slugOf(v: string): string {
    let s = v;
    try {
      s = decodeURIComponent(v);
    } catch {
      /* keep raw */
    }
    s = s.replace(/[?#].*$/, "").replace(/^https?:\/\/[^/]+/i, "").replace(/^\/+|\/+$/g, "");
    if (s.startsWith("series/")) s = s.slice(7);
    return s.split("/")[0];
  }

  private abs(s: string): string {
    const v = s.trim();
    if (!v) return "";
    if (v.startsWith("http")) return v;
    if (v.startsWith("//")) return `https:${v}`;
    return v.startsWith("/") ? `${this.baseUrl}${v}` : `${this.baseUrl}/${v}`;
  }

  private async load(url: string): Promise<CheerioAPI> {
    return this.fetchCheerio({ url, method: "GET" });
  }

  private async json<T>(url: string): Promise<T> {
    const [response, data] = await Application.scheduleRequest({
      url,
      method: "GET",
      headers: { accept: "application/json", "x-requested-with": "XMLHttpRequest" },
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}`);
    }
    return JSON.parse(Application.arrayBufferToUTF8String(data)) as T;
  }
}

