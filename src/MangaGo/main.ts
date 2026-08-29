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
import * as cheerio from "cheerio";
import { CheerioAPI, Cheerio } from "cheerio";
import type { Element } from "domhandler";
import * as htmlparser2 from "htmlparser2";
import { getHideRaws, MangaGoSettingsForm } from "./settings";
import { descrambleMangago } from "../utils/descramble/canvas";

const BASE_URL = "https://www.mangago.me";
const DOMAIN = "mangago.me";
// Chapter reader mirror; "/chapter/..." paths 404 on the main domain.
// Chapter lists are also fetched from here: the main domain randomly
// alternates between two chapter URL formats with unrelated ids, while
// the mirror consistently serves "/chapter/<mangaId>/<chapterId>/".
const READER_DOMAIN = "www.mangago.zone";

// Regular expressions taken verbatim from the keiyoushi Mangago source.
const IMG_SRCS_REGEX = /var imgsrcs\s*=\s*['"]([a-zA-Z0-9+=/]+)['"]/;
const COLS_REGEX = /var\s*widthnum\s*=\s*heightnum\s*=\s*(\d+);/;
const KEY_LOCATION_REGEX = /str\.charAt\(\s*(\d+)\s*\)/g;
const JS_FILTERS = [
  "jQuery",
  "document",
  "getContext",
  "toDataURL",
  "getImageData",
  "width",
  "height",
];

interface MangaGoMetadata {
  page?: number;
}

class MangaGoInterceptor extends PaperbackInterceptor {
  override async interceptRequest(request: Request): Promise<Request> {
    // The site gates some content behind an "adult confirmed" cookie.
    request.cookies = {
      ...request.cookies,
      _m_superu: "1",
    };

    // Some image hosts (e.g. iweb_N.mangapicgallery.com) contain an
    // underscore. These are served by Cloudflare and support HTTPS, but
    // the site emits plain-HTTP URLs for them. iOS App Transport Security
    // blocks cleartext HTTP (NSURLErrorDomain -1022), so force HTTPS here
    // rather than allowing the HTTP request to fail.
    if (request.url.startsWith("http://")) {
      request.url = "https://" + request.url.slice("http://".length);
    }

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

    // Scrambled images carry their descrambling key in the URL fragment.
    const fragment = request.url.split("#")[1] ?? "";
    if (fragment.includes("desckey=")) {
      try {
        return await descrambleImage(request.url, data);
      } catch {
        // If descrambling fails, return the original bytes so the reader
        // at least shows the scrambled page rather than nothing.
        return data;
      }
    }

    return data;
  }
}

type MangaGoImplementation = Extension &
  SearchResultsProviding &
  MangaProviding &
  ChapterProviding &
  CloudflareBypassRequestProviding &
  SettingsFormProviding &
  DiscoverSectionProviding;

export class MangaGoExtension implements MangaGoImplementation {
  requestManager = new MangaGoInterceptor("main");
  cookieStorageInterceptor = new CookieStorageInterceptor({
    storage: "stateManager",
  });
  globalRateLimiter = new BasicRateLimiter("rateLimiter", {
    numberOfRequests: 1,
    bufferInterval: 1,
    ignoreImages: true,
  });

  async getSettingsForm(): Promise<Form> {
    return new MangaGoSettingsForm();
  }

  async initialise(): Promise<void> {
    this.requestManager.registerInterceptor();
    this.cookieStorageInterceptor.registerInterceptor();
    this.globalRateLimiter.registerInterceptor();

    // Seed the adult-confirmation cookie.
    this.cookieStorageInterceptor.setCookie({
      name: "_m_superu",
      value: "1",
      domain: DOMAIN,
      path: "/",
    });
  }

  // ----------------------------------------------------------------
  // Discover sections
  // ----------------------------------------------------------------

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    return [
      {
        id: "popular",
        title: "Popular",
        type: DiscoverSectionType.featured,
      },
      {
        id: "latest",
        title: "Latest Updates",
        type: DiscoverSectionType.simpleCarousel,
      },
    ];
  }

  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata: Metadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const meta = metadata as MangaGoMetadata | undefined;
    const page = meta?.page ?? 1;

    const sortby = section.id === "latest" ? "update_date" : "view";
    const url = `${BASE_URL}/genre/all/${page}/?f=1&o=1&sortby=${sortby}&e=`;
    const $ = await this.fetchCheerio({ url, method: "GET" });

    const items: DiscoverSectionItem[] = [];
    const seen = new Set<string>();
    $(".thm-effect").each((_, element) => {
      const parsed = this.mangaFromLink($, $(element));
      if (parsed && !seen.has(parsed.mangaId)) {
        seen.add(parsed.mangaId);
        items.push({
          type:
            section.id === "popular"
              ? "featuredCarouselItem"
              : "simpleCarouselItem",
          mangaId: parsed.mangaId,
          imageUrl: parsed.image,
          title: parsed.title,
          metadata: undefined,
        });
      }
    });

    const hasNextPage = $(".current+li > a").length > 0;

    return {
      items,
      metadata: hasNextPage ? { page: page + 1 } : undefined,
    };
  }

  // ----------------------------------------------------------------
  // Search
  // ----------------------------------------------------------------

  async getSearchResults(
    query: SearchQuery<Metadata>,
    metadata: Metadata | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const meta = metadata as MangaGoMetadata | undefined;
    const page = meta?.page ?? 1;
    const titleQuery = (query.title || "").trim();

    let url: string;
    if (titleQuery) {
      url = `${BASE_URL}/r/l_search?name=${encodeURIComponent(titleQuery)}&page=${page}`;
    } else {
      url = `${BASE_URL}/genre/all/${page}/?f=1&o=1&sortby=view&e=`;
    }

    const $ = await this.fetchCheerio({ url, method: "GET" });

    const results: SearchResultItem[] = [];
    const seen = new Set<string>();
    // Iterate the cover anchors directly: there is exactly one `.thm-effect`
    // per result, so this is immune to the unclosed `<li>` tags Mangago emits
    // (the bundled htmlparser2 nests them, collapsing `.pic_list > li` to a
    // single element and yielding only one result per page).
    $(".thm-effect").each((_, element) => {
      const parsed = this.mangaFromLink($, $(element));
      if (parsed && !seen.has(parsed.mangaId)) {
        seen.add(parsed.mangaId);
        results.push({
          mangaId: parsed.mangaId,
          imageUrl: parsed.image,
          title: parsed.title,
          subtitle: undefined,
          metadata: undefined,
        });
      }
    });

    const hasNextPage = $(".current+li > a").length > 0;

    return {
      items: results,
      metadata: hasNextPage ? { page: page + 1 } : undefined,
    };
  }

  private mangaFromLink(
    $: CheerioAPI,
    link: Cheerio<Element>,
  ): { mangaId: string; title: string; image: string } | undefined {
    if (link.length === 0) return undefined;

    const href = link.attr("href") || "";
    if (!href) return undefined;
    const mangaId = this.parseMangaId(href);

    const title = (link.attr("title") || link.find("img").first().attr("alt") || "")
      .trim();
    if (!title) return undefined;

    const image = this.imageFromElement(link.find("img").first());

    return { mangaId, title, image };
  }

  // ----------------------------------------------------------------
  // Manga details
  // ----------------------------------------------------------------

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const url = this.mangaUrl(mangaId);
    const $ = await this.fetchCheerio({ url, method: "GET" });

    const title = $(".w-title h1").first().text().trim();

    const info = $("#information");
    const image = this.imageFromElement(info.find("img").first());

    const summary = info.find(".manga_summary").first().clone();
    summary.find("font").remove();
    let description = summary.text().trim();

    let author = "";
    let status = "Unknown";
    const genres: string[] = [];

    info.find(".manga_info li, .manga_right tr").each((_, el) => {
      const row = $(el);
      const label = row.find("b, label").first().text().trim().toLowerCase();

      if (label.startsWith("alternative")) {
        const alt = row.text().replace(/alternative:?/i, "").trim();
        if (alt) description = `${description}\n\n${alt}`.trim();
      } else if (label.startsWith("status")) {
        const s = row.find("span").first().text().trim().toLowerCase();
        if (s.includes("ongoing")) status = "Ongoing";
        else if (s.includes("completed")) status = "Completed";
      } else if (label.startsWith("author")) {
        author = row
          .find("a")
          .map((_i, a) => $(a).text().trim())
          .get()
          .filter((x) => x)
          .join(", ");
      } else if (label.startsWith("genre")) {
        row.find("a").each((_i, a) => {
          const g = $(a).text().trim();
          if (g) genres.push(g);
        });
      }
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

    return {
      mangaId,
      mangaInfo: {
        primaryTitle: title,
        secondaryTitles: [],
        thumbnailUrl: image,
        author: author || undefined,
        synopsis: description,
        contentRating: ContentRating.MATURE,
        status,
        tagGroups,
        shareUrl: url,
      },
    };
  }

  // ----------------------------------------------------------------
  // Chapters
  // ----------------------------------------------------------------

  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    // The main domain randomly alternates between two chapter URL formats
    // with unrelated ids, which resets read state. The reader mirror serves
    // a stable "/chapter/<mangaId>/<chapterId>/" path, so prefer it and fall
    // back to the main domain only if the mirror request fails.
    const mangaPath = this.mangaPath(sourceManga.mangaId);
    let $: CheerioAPI;
    if (mangaPath === null) {
      // Absolute-URL manga id: fetch it directly.
      $ = await this.fetchCheerio({
        url: this.mangaUrl(sourceManga.mangaId),
        method: "GET",
      });
    } else {
      try {
        $ = await this.fetchCheerio({
          url: `https://${READER_DOMAIN}${mangaPath}`,
          method: "GET",
        });
      } catch {
        $ = await this.fetchCheerio({
          url: this.mangaUrl(sourceManga.mangaId),
          method: "GET",
        });
      }
    }

    const chapters: Chapter[] = [];
    const seen = new Set<string>();

    // Upstream #18581: RAW (untranslated) chapters live in a separate
    // `#raws_table`, which was previously missed entirely. cheerio has no
    // `:is()`, so the tables are listed out explicitly.
    const hideRaws = getHideRaws();
    $(
      "table#raws_table > tbody > tr, table#chapter_table > tbody > tr, table.uk-table > tbody > tr",
    ).each((_, element) => {
      const row = $(element);
      const link = row.find("a.chico").first();
      const href = link.attr("href") || "";
      if (!href) return;
      if (hideRaws && href.includes("/raw/")) return;

      const chapterId = this.parseChapterId(href);
      if (!chapterId || seen.has(chapterId)) return;
      seen.add(chapterId);

      const name = link.text().trim();
      const dateText = row.find("td:last-child").text().trim();
      const chapNum = this.parseChapterNumber(name, chapterId);

      chapters.push({
        chapterId,
        sourceManga,
        title: name,
        volume: 0,
        chapNum,
        publishDate: this.parseDate(dateText),
        langCode: "🇬🇧",
      });
    });

    return chapters;
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const url = this.chapterUrl(chapter.chapterId);
    const { $, finalUrl } = await this.fetchCheerioWithUrl({
      url,
      method: "GET",
    });

    // chapter.js is identical for every page of a chapter, so cache its
    // decoded form to avoid re-fetching it once per missing page below.
    const jsCache = new Map<string, string>();
    const availableImages = await this.getChapterImageUrls($, jsCache);

    // Happy path: the landing page embedded every image URL.
    if (
      availableImages.length > 0 &&
      availableImages.every((u) => u.length > 0)
    ) {
      return {
        id: chapter.chapterId,
        mangaId: chapter.sourceManga.mangaId,
        pages: availableImages,
      };
    }

    // Otherwise Mangago only embedded the first few URLs (the rest are
    // blank). Resolve every page from the chapter's per-page URL template
    // so all pages load instead of just the handful that were embedded.
    const pages = await this.resolveAllPages(
      $,
      finalUrl,
      availableImages,
      jsCache,
    );

    return {
      id: chapter.chapterId,
      mangaId: chapter.sourceManga.mangaId,
      pages,
    };
  }

  // When the chapter landing page only embeds the first few image URLs,
  // build the rest from `total_pages` + the `input#curl` URL template,
  // fetching each missing page's HTML to recover its image URL.
  private async resolveAllPages(
    $: CheerioAPI,
    finalUrl: string,
    availableImages: string[],
    jsCache: Map<string, string>,
  ): Promise<string[]> {
    let totalPages = 0;
    $("script").each((_, el) => {
      if (totalPages) return;
      const content = $(el).html() || "";
      const m = content.match(/total_pages\s*=\s*(\d+)/);
      if (m) totalPages = parseInt(m[1], 10);
    });
    // Fall back to whatever we managed to extract if the count is missing.
    if (!totalPages) return availableImages.filter((u) => u.length > 0);

    const urlTemplate = ($("input#curl").attr("value") || "")
      .trim()
      .replace(/^\/+/, "");
    if (!urlTemplate.includes("{page}")) {
      return availableImages.filter((u) => u.length > 0);
    }

    const prefix = this.computePagePrefix(finalUrl, urlTemplate);
    if (!prefix) return availableImages.filter((u) => u.length > 0);

    const pages: string[] = [];
    for (let page = 1; page <= totalPages; page++) {
      const existing = availableImages[page - 1];
      if (existing && existing.length > 0) {
        pages.push(existing);
        continue;
      }

      const pageUrl = `${prefix}/${urlTemplate.replace("{page}", String(page))}`;
      try {
        const $$ = await this.fetchCheerio({ url: pageUrl, method: "GET" });
        const pageImages = await this.getChapterImageUrls($$, jsCache);
        pages.push(pageImages[page - 1] ?? "");
      } catch {
        pages.push("");
      }
    }

    return pages.filter((u) => u.length > 0);
  }

  // Reproduces the upstream prefix logic for the per-page URL template.
  private computePagePrefix(finalUrl: string, urlTemplate: string): string {
    const m = finalUrl.match(/^(https?):\/\/([^/]+)(\/[^?#]*)?/);
    if (!m) return "";
    const host = m[2];
    const pathSegments = (m[3] || "").split("/").filter((s) => s.length > 0);
    const urlTemplateSegment = urlTemplate.split("/")[0];

    if (
      host.endsWith(DOMAIN) &&
      pathSegments.length > 3 &&
      pathSegments[0] === "read-manga" &&
      pathSegments[2] === urlTemplateSegment
    ) {
      return `${BASE_URL}/read-manga/${pathSegments[1]}`;
    }
    if (!host.endsWith(DOMAIN) && pathSegments[0] === urlTemplateSegment) {
      return `https://${host}`;
    }
    return "";
  }

  // ----------------------------------------------------------------
  // Page image pipeline (the hard part)
  // ----------------------------------------------------------------

  private async getChapterImageUrls(
    $: CheerioAPI,
    jsCache?: Map<string, string>,
  ): Promise<string[]> {
    // 1. Extract the base64 `imgsrcs` blob from the inline script.
    let imgSrcsB64 = "";
    $("script").each((_, el) => {
      if (imgSrcsB64) return;
      const content = $(el).html() || "";
      const match = content.match(IMG_SRCS_REGEX);
      if (match) imgSrcsB64 = match[1];
    });
    if (!imgSrcsB64) return [];

    const encryptedBytes = this.base64ToBytes(imgSrcsB64);

    // 2. Fetch and deobfuscate chapter.js (sojson.v4).
    const chapterJsHref = $("script[src*=chapter.js]").first().attr("src");
    if (!chapterJsHref) return [];
    const chapterJsUrl = this.absoluteUrl(chapterJsHref);

    let chapterJs = jsCache?.get(chapterJsUrl);
    if (chapterJs === undefined) {
      const [jsResponse, jsData] = await Application.scheduleRequest({
        url: chapterJsUrl,
        method: "GET",
      });
      if (jsResponse.status !== 200) return [];
      const obfuscated = Application.arrayBufferToUTF8String(jsData);
      chapterJs = this.sojsonV4Decode(obfuscated);
      jsCache?.set(chapterJsUrl, chapterJs);
    }

    // 3. AES-CBC decrypt the imgsrcs blob with key/iv from chapter.js.
    const keyHex = this.findHexEncodedVariable(chapterJs, "key");
    const ivHex = this.findHexEncodedVariable(chapterJs, "iv");
    if (!keyHex || !ivHex) return [];

    const decrypted = await aesCbcDecryptNoPad(
      encryptedBytes,
      this.hexToBytes(keyHex),
      this.hexToBytes(ivHex),
    );
    let imageList = bytesToUtf8(decrypted);

    // 4. Unscramble the (possibly scrambled) image list.
    imageList = this.unscrambleImageList(imageList, chapterJs);

    // 5. Number of grid columns for scrambled images.
    const colsMatch = chapterJs.match(COLS_REGEX);
    const cols = colsMatch ? colsMatch[1] : "0";

    // 6. Extract the descrambling-key generator body.
    const imgKeys = this.extractImgKeys(chapterJs);

    // Keep blank entries: Mangago sometimes only embeds the first few
    // image URLs on the landing page and leaves the rest empty. The blanks
    // preserve page alignment so the caller can resolve them individually.
    const urls = imageList.split(",");

    // 7. Resolve descrambling keys for scrambled (cspiclink) images.
    const cspiclinkUrls = urls.filter((u) => u.includes("cspiclink"));
    let keyByUrl: Record<string, string> = {};
    if (cspiclinkUrls.length > 0 && imgKeys) {
      keyByUrl = await this.resolveDescramblingKeys(cspiclinkUrls, imgKeys);
    }

    return urls.map((url) => {
      if (!url) return "";
      if (url.includes("cspiclink")) {
        const descKey = keyByUrl[url];
        if (descKey) {
          return `${url}#desckey=${descKey}&cols=${cols}`;
        }
      }
      return url;
    });
  }

  private async resolveDescramblingKeys(
    urls: string[],
    imgKeys: string,
  ): Promise<Record<string, string>> {
    const inject = `
function replacePos(strObj, pos, replacetext){return strObj.substr(0,pos)+replacetext+strObj.substring(pos+1,strObj.length);}
function getDescramblingKey(url){ ${imgKeys}; return key; }
JSON.stringify(${JSON.stringify(urls)}.map(function(u){
  try { return { url: u, key: String(getDescramblingKey(u)) }; }
  catch (e) { return { url: u, key: "" }; }
}));
`;

    const result = await Application.executeInWebView({
      source: {
        html: "<html><head></head><body></body></html>",
        baseUrl: BASE_URL,
        loadCSS: false,
        loadImages: false,
      },
      inject,
      storage: { cookies: [] },
    });

    const map: Record<string, string> = {};
    try {
      const parsed = JSON.parse(String(result.result)) as {
        url: string;
        key: string;
      }[];
      for (const entry of parsed) {
        if (entry.key) map[entry.url] = entry.key;
      }
    } catch {
      // ignore parse failures
    }
    return map;
  }

  // sojson.v4 deobfuscator (port of SoJsonV4Deobfuscator.kt).
  private sojsonV4Decode(jsf: string): string {
    if (!jsf.startsWith("['sojson.v4']")) {
      throw new Error("Unexpected chapter.js format");
    }
    const slice = jsf.substring(240, jsf.length - 59);
    const tokens = slice.split(/[a-zA-Z]+/);
    let out = "";
    for (const token of tokens) {
      if (!token) continue;
      const code = parseInt(token, 10);
      if (!isNaN(code)) out += String.fromCharCode(code);
    }
    return out;
  }

  private findHexEncodedVariable(js: string, name: string): string {
    const regex = new RegExp(
      `var ${name}\\s*=\\s*CryptoJS\\.enc\\.Hex\\.parse\\("([0-9a-zA-Z]+)"\\)`,
    );
    const match = js.match(regex);
    return match ? match[1] : "";
  }

  private unscrambleImageList(imageList: string, chapterJs: string): string {
    const matches = [...chapterJs.matchAll(KEY_LOCATION_REGEX)].map((m) =>
      parseInt(m[1], 10),
    );
    const keyLocations = [...new Set(matches)];
    if (keyLocations.length === 0) return imageList;

    const unscrambleKey = keyLocations.map((loc) =>
      parseInt(imageList.charAt(loc), 10),
    );
    // A non-numeric character at a key location means the list was never
    // scrambled in the first place.
    if (unscrambleKey.some((n) => isNaN(n))) return imageList;

    const chars = imageList.split("");
    keyLocations.forEach((loc, idx) => {
      chars.splice(loc - idx, 1);
    });

    return this.unscramble(chars.join(""), unscrambleKey);
  }

  private unscramble(str: string, keys: number[]): string {
    const s = str.split("");
    [...keys].reverse().forEach((key) => {
      for (let i = s.length - 1; i >= key; i--) {
        if (i % 2 !== 0) {
          const tmp = s[i - key];
          s[i - key] = s[i];
          s[i] = tmp;
        }
      }
    });
    return s.join("");
  }

  private extractImgKeys(chapterJs: string): string {
    const afterMarker = chapterJs.split(
      "var renImg = function(img,width,height,id){",
    )[1];
    if (!afterMarker) return "";
    const body = afterMarker.split("key = key.split(")[0];
    if (!body) return "";
    return body
      .split("\n")
      .filter((line) => JS_FILTERS.every((f) => !line.includes(f)))
      .join("\n")
      .replace(/img\.src/g, "url");
  }

  getMangaShareUrl(mangaId: string): string {
    return this.mangaUrl(mangaId);
  }

  // ----------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------

  private mangaUrl(mangaId: string): string {
    const slug = this.safeDecode(mangaId);
    return slug.startsWith("http") ? slug : `${BASE_URL}/${slug}`;
  }

  // The path portion of a manga URL (leading slash, no host), used to build
  // reader-mirror requests. Returns null for absolute-URL manga ids.
  private mangaPath(mangaId: string): string | null {
    const slug = this.safeDecode(mangaId);
    if (slug.startsWith("http")) return null;
    return `/${slug.replace(/^\/+/, "")}`;
  }

  private chapterUrl(chapterId: string): string {
    const slug = this.safeDecode(chapterId);
    if (slug.startsWith("http")) return slug;
    // Reader paths only resolve on the mirror domain, not on baseUrl.
    const path = `/${slug.replace(/^\/+/, "")}`;
    if (path.startsWith("/chapter/")) {
      return `https://${READER_DOMAIN}${path}`;
    }
    return `${BASE_URL}/${slug}`;
  }

  private parseMangaId(href: string): string {
    return this.parsePath(href);
  }

  private parseChapterId(href: string): string {
    // Reader links rotate between mirror hosts but keep a stable path.
    // Store only the path for "/chapter/..." links so rotated hosts don't
    // register as new chapters (which would reset read state); the host is
    // restored by chapterUrl. Truly external links stay absolute.
    if (href.startsWith("http")) {
      try {
        const parsed = new URL(href);
        const firstSegment = parsed.pathname.replace(/^\/+/, "").split("/")[0];
        if (firstSegment === "chapter") {
          return this.parsePath(parsed.pathname);
        }
        if (parsed.host.endsWith(DOMAIN)) {
          return this.parsePath(parsed.pathname);
        }
      } catch {
        // Fall through to the default handling below.
      }
    }
    return this.parsePath(href);
  }

  private parsePath(href: string): string {
    if (href.startsWith("http")) {
      // Keep absolute URLs intact (used directly for requests).
      return this.toSafeId(href);
    }
    const slug = href.replace(/^\/+/, "").replace(/\/+$/, "");
    return this.toSafeId(slug);
  }

  private absoluteUrl(href: string): string {
    if (href.startsWith("http")) return href;
    if (href.startsWith("//")) return `https:${href}`;
    if (href.startsWith("/")) return `${BASE_URL}${href}`;
    return `${BASE_URL}/${href}`;
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

  private parseChapterNumber(name: string, chapterId: string): number {
    const numMatch = name.match(/chapter\s*(\d+(?:\.\d+)?)/i);
    if (numMatch) return parseFloat(numMatch[1]);
    const anyNum = name.match(/(\d+(?:\.\d+)?)/);
    if (anyNum) return parseFloat(anyNum[1]);
    const slugMatch = chapterId.match(/c(\d+(?:\.\d+)?)/i);
    if (slugMatch) return parseFloat(slugMatch[1]);
    return 0;
  }

  private base64ToBytes(value: string): Uint8Array {
    const decoded = Application.base64Decode(value);
    if (typeof decoded === "string") {
      const out = new Uint8Array(decoded.length);
      for (let i = 0; i < decoded.length; i++) out[i] = decoded.charCodeAt(i);
      return out;
    }
    return new Uint8Array(decoded);
  }

  private hexToBytes(hex: string): Uint8Array {
    const clean = hex.length % 2 === 0 ? hex : "0" + hex;
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) {
      out[i] = parseInt(clean.substr(i * 2, 2), 16);
    }
    return out;
  }

  private imageFromElement(img: Cheerio<Element>): string {
    if (!img || img.length === 0) return "";
    let src = img.attr("data-cfsrc") || img.attr("data-src") || "";
    if (!src) {
      const srcset = img.attr("srcset");
      if (srcset) src = srcset.split(",")[0]?.trim().split(/\s+/)[0] || "";
    }
    if (!src) src = img.attr("src") || "";

    src = src.trim();
    if (src && !src.startsWith("http")) {
      src = src.startsWith("/") ? `${BASE_URL}${src}` : `${BASE_URL}/${src}`;
    }
    return src;
  }

  private parseDate(dateText: string): Date {
    if (!dateText) return new Date(0);
    const direct = new Date(dateText);
    if (!isNaN(direct.getTime())) return direct;
    return new Date(0);
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

  async fetchCheerio(request: Request): Promise<CheerioAPI> {
    return (await this.fetchCheerioWithUrl(request)).$;
  }

  async fetchCheerioWithUrl(
    request: Request,
  ): Promise<{ $: CheerioAPI; finalUrl: string }> {
    const [response, data] = await Application.scheduleRequest(request);
    if (response.status === 404) {
      throw new Error("Content not found");
    }
    const htmlStr = Application.arrayBufferToUTF8String(data);
    const dom = htmlparser2.parseDocument(htmlStr);
    return { $: cheerio.load(dom), finalUrl: response.url || request.url };
  }
}

// --------------------------------------------------------------------
// Crypto + image descrambling (module-level helpers)
// --------------------------------------------------------------------

function bytesToUtf8(bytes: Uint8Array): string {
  return Application.arrayBufferToUTF8String(bufferOf(bytes));
}

// AES-CBC decryption that preserves zero-byte padding semantics.
//
// WebCrypto only supports PKCS7 padding and will reject the site's
// zero-byte-padded ciphertext. We append one synthetic block that decrypts
// to a valid PKCS7 pad block (which WebCrypto then strips), recovering the
// raw plaintext, and finally strip any trailing zero bytes ourselves.
async function aesCbcDecryptNoPad(
  ciphertext: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array,
): Promise<Uint8Array> {
  const subtle = (globalThis as { crypto: { subtle: SubtleLike } }).crypto
    .subtle;

  const cryptoKey = await subtle.importKey(
    "raw",
    bufferOf(key),
    { name: "AES-CBC" },
    false,
    ["encrypt", "decrypt"],
  );

  const lastBlock = ciphertext.slice(ciphertext.length - 16);
  const padBlock = new Uint8Array(16);
  for (let i = 0; i < 16; i++) padBlock[i] = 0x10 ^ lastBlock[i];

  const zeroIv = new Uint8Array(16);
  const encrypted = new Uint8Array(
    await subtle.encrypt(
      { name: "AES-CBC", iv: bufferOf(zeroIv) },
      cryptoKey,
      bufferOf(padBlock),
    ),
  );
  const syntheticBlock = encrypted.slice(0, 16);

  const extended = new Uint8Array(ciphertext.length + 16);
  extended.set(ciphertext, 0);
  extended.set(syntheticBlock, ciphertext.length);

  const decrypted = new Uint8Array(
    await subtle.decrypt(
      { name: "AES-CBC", iv: bufferOf(iv) },
      cryptoKey,
      bufferOf(extended),
    ),
  );

  let end = decrypted.length;
  while (end > 0 && decrypted[end - 1] === 0) end--;
  return decrypted.slice(0, end);
}

// Descramble a cols x cols grid-shuffled image inside a webview canvas.
async function descrambleImage(
  url: string,
  data: ArrayBuffer,
): Promise<ArrayBuffer> {
  const fragment = url.split("#")[1] ?? "";
  const params = new Map<string, string>();
  for (const part of fragment.split("&")) {
    const eq = part.indexOf("=");
    if (eq > 0) params.set(part.slice(0, eq), part.slice(eq + 1));
  }
  const key = params.get("desckey") || "";
  const cols = parseInt(params.get("cols") || "0", 10);
  if (!key || !cols || cols <= 0) return data;

  // keiyoushi/Aidoku key: `key.split("a")` -> per-cell destination indices.
  const keyArr = key.split("a").map((s) => parseInt(s, 10));

  // Descramble in-process via the polyfilled canvas (9-arg drawImage, the
  // exact reference algorithm — no executeInWebView, no Y-flip).
  return await descrambleMangago(data, "image/jpeg", keyArr, cols);
}

function bufferOf(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
}

// Minimal structural type for the WebCrypto subtle API used above.
interface SubtleLike {
  importKey(
    format: string,
    keyData: ArrayBuffer,
    algorithm: { name: string },
    extractable: boolean,
    keyUsages: string[],
  ): Promise<unknown>;
  encrypt(
    algorithm: { name: string; iv: ArrayBuffer },
    key: unknown,
    data: ArrayBuffer,
  ): Promise<ArrayBuffer>;
  decrypt(
    algorithm: { name: string; iv: ArrayBuffer },
    key: unknown,
    data: ArrayBuffer,
  ): Promise<ArrayBuffer>;
}

export const MangaGo = new MangaGoExtension();
