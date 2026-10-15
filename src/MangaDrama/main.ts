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
  Section,
  SettingsFormProviding,
  SourceManga,
  TagSection,
  ToggleRow,
} from "@paperback/types";
import * as cheerio from "cheerio";
import { Cheerio, CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";
import * as htmlparser2 from "htmlparser2";

/*
 * Upstream (#19495, "Migrate some sources to 1.6") moved Manga Drama off
 * Madara onto the InitManga theme; the live site no longer serves any Madara
 * markup, so the previous port was broken. This is a focused port of the
 * InitManga paths Manga Drama actually exercises, each verified live:
 *
 *   browse   /manga-ranking/ and /recently-updated/page/N/ (div.manga-item-grid > div.uk-panel)
 *   search   /wp-json/initlise/v1/search?term=&page=   (JSON)
 *   details  /manga/<slug>/  (div#manga-description, div#genre-tags, span#manga-status)
 *   chapters /wp-json/initmanga/v1/chapters?manga_id=&per_page=50&paged=N
 *            (manga id from the `postid-N` body class)
 *   pages    `var InitMangaEncryptedChapter = {ciphertext, iv, salt}` decrypted
 *            with AES-256-CBC, key = PBKDF2-SHA512(passphrase, salt, 999 iters),
 *            passphrase = base64-decoded `InitMangaData.decryption_key`.
 *            Checked against a real chapter: decrypts to 10 <img> tags.
 */

const BASE_URL = "https://mangadrama.com";
const HIDE_LOCKED_KEY = "mangadrama.hideLocked";

function hideLocked(): boolean {
  // Upstream PREF_HIDE_LOCKED_DEFAULT = false.
  return Application.getState(HIDE_LOCKED_KEY) === true;
}

class MangaDramaSettingsForm extends Form {
  private value = hideLocked();
  async update(v: boolean): Promise<void> {
    this.value = v;
    Application.setState(v, HIDE_LOCKED_KEY);
    this.reloadForm();
  }
  override getSections() {
    return [
      Section(
        { id: "chapters", footer: "Coin-locked chapters cannot be opened here. They are marked 🔒 when shown." },
        [
          ToggleRow("hide_locked", {
            title: "Hide locked chapters",
            value: this.value,
            onValueChange: Application.Selector<MangaDramaSettingsForm, (v: boolean) => Promise<void>>(
              this,
              "update",
            ),
          }),
        ],
      ),
    ];
  }
}

interface ApiChapter {
  number: number;
  title?: string;
  slug: string;
  created_at?: string;
  lock_type?: string;
  is_purchased?: boolean;
}

interface ApiChapterList {
  items?: ApiChapter[];
  total_pages?: number;
}

interface ApiSearchHit {
  title: string;
  url: string;
  thumb?: string;
}

interface SubtleLike {
  importKey(f: string, k: ArrayBuffer, a: unknown, e: boolean, u: string[]): Promise<unknown>;
  deriveKey(a: unknown, b: unknown, d: unknown, e: boolean, u: string[]): Promise<unknown>;
  decrypt(a: unknown, k: unknown, d: ArrayBuffer): Promise<ArrayBuffer>;
}

class MangaDramaInterceptor extends PaperbackInterceptor {
  override async interceptRequest(request: Request): Promise<Request> {
    request.headers = {
      ...request.headers,
      referer: `${BASE_URL}/`,
      "user-agent": await Application.getDefaultUserAgent(),
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

export class MangaDramaExtension implements Impl {
  requestManager = new MangaDramaInterceptor("main");
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
    return new MangaDramaSettingsForm();
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
    const slug = popular ? "manga-ranking" : "recently-updated";
    const $ = await this.fetchCheerio(`${BASE_URL}/${slug}/${page > 1 ? `page/${page}/` : ""}`);
    const cards = this.cards($);
    return {
      items: cards.map((c) => ({
        type: popular ? "featuredCarouselItem" : "simpleCarouselItem",
        ...c,
        metadata: undefined,
      })),
      // The site renders no "next" link; an empty page marks the end.
      metadata: cards.length > 0 && !popular ? { page: page + 1 } : undefined,
    };
  }

  async getSearchResults(
    query: SearchQuery<Metadata>,
    metadata: Metadata | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const page = (metadata as { page?: number } | undefined)?.page ?? 1;
    const term = (query.title || "").trim();
    if (!term) {
      const $ = await this.fetchCheerio(`${BASE_URL}/manga/${page > 1 ? `page/${page}/` : ""}`);
      const cards = this.cards($);
      return {
        items: cards.map((c) => ({ ...c, subtitle: undefined, metadata: undefined })),
        metadata: cards.length > 0 ? { page: page + 1 } : undefined,
      };
    }
    const hits = await this.fetchJson<ApiSearchHit[]>(
      `${BASE_URL}/wp-json/initlise/v1/search?term=${encodeURIComponent(term)}&page=${page}`,
    );
    return {
      items: (Array.isArray(hits) ? hits : []).map((h) => ({
        mangaId: this.slugFromUrl(h.url),
        // Search highlights matches with <mark>.
        title: h.title.replace(/<[^>]+>/g, "").trim(),
        imageUrl: h.thumb ?? "",
        subtitle: undefined,
        metadata: undefined,
      })),
      metadata: undefined,
    };
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const $ = await this.fetchCheerio(this.mangaUrl(mangaId));

    const desc = $("div#manga-description").first().clone();
    desc.find("a, span").remove();

    const genres = $("div#genre-tags a:not(.uk-disabled)")
      .map((_, a) => $(a).text().trim())
      .get()
      .filter(Boolean);
    const tagGroups: TagSection[] = genres.length
      ? [{ id: "genres", title: "Genres", tags: genres.map((g) => ({ id: g.toLowerCase(), title: g })) }]
      : [];

    const statusText = $("span#manga-status, div.manga-status-ribbons span.manga-status-ribbon__text")
      .first()
      .text()
      .toLowerCase();

    const info = $("div.manga-info-details").first();
    const img = $("div.story-cover-wrap img, div.single-thumb img, a.story-cover img").first();

    return {
      mangaId,
      mangaInfo: {
        primaryTitle: $("h1").first().text().trim() || $("h2.uk-h3").first().text().trim(),
        secondaryTitles: [],
        thumbnailUrl: this.imgAttr(img),
        author: this.infoValue($, info, "Author"),
        artist: this.infoValue($, info, "Illustrator"),
        synopsis: desc.text().trim(),
        contentRating: ContentRating.MATURE,
        status: statusText.includes("ongoing")
          ? "Ongoing"
          : statusText.includes("completed")
            ? "Completed"
            : statusText.includes("hiatus")
              ? "Hiatus"
              : statusText.includes("dropped") || statusText.includes("cancel")
                ? "Cancelled"
                : "Unknown",
        tagGroups,
        shareUrl: this.mangaUrl(mangaId),
      },
    };
  }

  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    const slug = this.safeDecode(sourceManga.mangaId);
    const [, data] = await Application.scheduleRequest({ url: this.mangaUrl(slug), method: "GET" });
    const html = Application.arrayBufferToUTF8String(data);
    const id = html.match(/(?:postid-|window\.post_id\s*=\s*|post_id["']?\s*:\s*["']?)(\d+)/)?.[1];
    if (!id) throw new Error("Could not determine the manga id");

    const hide = hideLocked();
    const chapters: Chapter[] = [];
    for (let page = 1, total = 1; page <= total && page <= 200; page++) {
      const r = await this.fetchJson<ApiChapterList>(
        `${BASE_URL}/wp-json/initmanga/v1/chapters?manga_id=${id}&per_page=50&paged=${page}`,
      );
      total = r.total_pages ?? 1;
      for (const c of r.items ?? []) {
        const locked = (c.lock_type ?? "none") !== "none" && !c.is_purchased;
        if (hide && locked) continue;
        const num = String(c.number).replace(/\.0$/, "");
        const t = (c.title ?? "").trim();
        const name = /^(chapter|bölüm)/i.test(t) ? t : `Chapter ${num}${t ? ` - ${t}` : ""}`;
        chapters.push({
          chapterId: `${slug}/${c.slug.replace(/^\/+|\/+$/g, "")}`,
          sourceManga,
          title: `${locked ? "🔒 " : ""}${name}`,
          volume: 0,
          chapNum: Number(c.number) || -1,
          publishDate: this.parseDate(c.created_at),
          langCode: "🇬🇧",
        });
      }
    }
    return chapters;
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const url = `${BASE_URL}/manga/${this.safeDecode(chapter.chapterId)}/`;
    const [, data] = await Application.scheduleRequest({ url, method: "GET" });
    const html = Application.arrayBufferToUTF8String(data);
    const $ = cheerio.load(htmlparser2.parseDocument(html));

    if ($("div.lock-card, div.imc-locked").length > 0) {
      throw new Error("This chapter is locked and must be unlocked on the site.");
    }

    let pages: string[] = [];
    const decrypted = await this.decryptChapter(html).catch(() => undefined);
    if (decrypted) {
      const trimmed = decrypted.trim();
      if (trimmed.startsWith("[")) {
        try {
          pages = (JSON.parse(trimmed) as unknown[]).filter((s): s is string => typeof s === "string").map((s) => this.abs(s));
        } catch {
          pages = [];
        }
      } else {
        const frag = cheerio.load(htmlparser2.parseDocument(trimmed));
        frag("img").each((_, img) => {
          const src = this.imgAttr(frag(img));
          if (src) pages.push(src);
        });
      }
    }
    if (pages.length === 0) {
      // Upstream fallbackPages: un-encrypted readers.
      $("div#chapter-content img, div.chapter-content img, div.reader-area img, div#readerarea img").each((_, img) => {
        const src = this.imgAttr($(img));
        if (src) pages.push(src);
      });
    }
    if (pages.length === 0) throw new Error("No pages found for this chapter");
    return { id: chapter.chapterId, mangaId: chapter.sourceManga.mangaId, pages };
  }

  async getMangaShareUrl(mangaId: string): Promise<string> {
    return this.mangaUrl(mangaId);
  }

  // ---------------------------------------------------------------- helpers

  /** Upstream `AesDecrypt.decryptLayered`. */
  private async decryptChapter(html: string): Promise<string | undefined> {
    const payloadRaw = html.match(/var\s+InitMangaEncryptedChapter\s*=\s*(\{.*?\});/s)?.[1];
    if (!payloadRaw) return undefined;
    const p = JSON.parse(payloadRaw) as { ciphertext?: string; iv?: string; salt?: string };
    if (!p.ciphertext || !p.iv || !p.salt) return undefined;
    const rawKey =
      html.match(/["']?decryption_key["']?\s*[:=]\s*["']([^"']+)["']/)?.[1] ??
      html.match(/InitMangaData[\s\S]*?decryption_key["']?\s*[:=]\s*["']([^"']+)["']/)?.[1];
    if (!rawKey) return undefined;

    const passphrase = this.b64ToUtf8(rawKey);
    const subtle = (globalThis as unknown as { crypto: { subtle: SubtleLike } }).crypto.subtle;
    const base = await subtle.importKey("raw", this.buf(this.utf8(passphrase)), "PBKDF2", false, ["deriveKey"]);
    const key = await subtle.deriveKey(
      { name: "PBKDF2", salt: this.buf(this.hex(p.salt)), iterations: 999, hash: "SHA-512" },
      base,
      { name: "AES-CBC", length: 256 },
      false,
      ["decrypt"],
    );
    const plain = await subtle.decrypt(
      { name: "AES-CBC", iv: this.buf(this.hex(p.iv)) },
      key,
      this.buf(this.b64ToBytes(p.ciphertext)),
    );
    const text = Application.arrayBufferToUTF8String(plain).trim();
    return text.startsWith("<") || text.startsWith("[") ? text : undefined;
  }

  private cards($: CheerioAPI): { mangaId: string; title: string; imageUrl: string }[] {
    const out: { mangaId: string; title: string; imageUrl: string }[] = [];
    const seen = new Set<string>();
    $("div.manga-item-grid > div.uk-panel").each((_, el) => {
      const e = $(el);
      const link = e.find("h2 a, h3 a, div.uk-overflow-hidden a").first();
      const href = link.attr("href") ?? e.find("a").first().attr("href") ?? "";
      const id = this.slugFromUrl(href);
      if (!id || seen.has(id)) return;
      seen.add(id);
      out.push({
        mangaId: id,
        title: e.find("h2 a, h3 a, div.manga-overlay-title, h2, h3").first().text().trim() || link.text().trim(),
        imageUrl: this.imgAttr(e.find("img").first()),
      });
    });
    return out;
  }

  /** The "Author:" / "Illustrator:" label text nodes are followed by their value element. */
  private infoValue($: CheerioAPI, info: Cheerio<AnyNode>, label: string): string | undefined {
    let value: string | undefined;
    info.contents().each((_, node) => {
      if (value !== undefined) return;
      if (node.type === "text" && $(node).text().trim() === `${label}:`) {
        const next = node.nextSibling;
        if (next) value = $(next).text().trim() || undefined;
      }
    });
    return value;
  }

  private imgAttr(img: Cheerio<AnyNode>): string {
    for (const a of ["data-original-src", "data-src", "data-lazy-src", "data-cfsrc", "data-original", "src"]) {
      const v = (img.attr(a) ?? "").trim();
      if (v && !v.startsWith("data:")) return this.abs(v);
    }
    return "";
  }

  private slugFromUrl(url: string): string {
    const m = url.match(/\/manga\/([^/?#]+)/);
    return m ? m[1] : "";
  }

  private mangaUrl(mangaId: string): string {
    return `${BASE_URL}/manga/${this.safeDecode(mangaId).split("/")[0]}/`;
  }

  private parseDate(s?: string): Date {
    if (!s) return new Date(0);
    // REST dates are "yyyy-MM-dd HH:mm:ss" in Europe/Istanbul (UTC+3).
    const t = Date.parse(`${s.replace(" ", "T")}+03:00`);
    return isNaN(t) ? new Date(0) : new Date(t);
  }

  private abs(s: string): string {
    if (s.startsWith("http")) return s;
    if (s.startsWith("//")) return `https:${s}`;
    return s.startsWith("/") ? `${BASE_URL}${s}` : `${BASE_URL}/${s}`;
  }

  private hex(s: string): Uint8Array {
    const out = new Uint8Array(s.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
    return out;
  }

  private b64ToBytes(s: string): Uint8Array {
    const d = Application.base64Decode(s);
    if (typeof d === "string") {
      const out = new Uint8Array(d.length);
      for (let i = 0; i < d.length; i++) out[i] = d.charCodeAt(i);
      return out;
    }
    return new Uint8Array(d);
  }

  private b64ToUtf8(s: string): string {
    return Application.arrayBufferToUTF8String(this.buf(this.b64ToBytes(s)));
  }

  private utf8(s: string): Uint8Array {
    const out: number[] = [];
    for (const ch of unescape(encodeURIComponent(s))) out.push(ch.charCodeAt(0));
    return Uint8Array.from(out);
  }

  private buf(b: Uint8Array): ArrayBuffer {
    const o = new ArrayBuffer(b.byteLength);
    new Uint8Array(o).set(b);
    return o;
  }

  private safeDecode(s: string): string {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const [response, data] = await Application.scheduleRequest({ url, method: "GET" });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Manga Drama returned HTTP ${response.status}`);
    }
    return JSON.parse(Application.arrayBufferToUTF8String(data)) as T;
  }

  private async fetchCheerio(url: string): Promise<CheerioAPI> {
    const [response, data] = await Application.scheduleRequest({ url, method: "GET" });
    if (response.status === 404) return cheerio.load("");
    return cheerio.load(htmlparser2.parseDocument(Application.arrayBufferToUTF8String(data)));
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

export const MangaDrama = new MangaDramaExtension();
