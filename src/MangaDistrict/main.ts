import { ContentRating } from "@paperback/types";
import { MadaraExtension } from "../utils/madara/template";
import type { AnyNode } from "domhandler";
import { Cheerio } from "cheerio";

class MangaDistrictExtension extends MadaraExtension {
  // Upstream `imageFromElement` checks the `data-wpfc-original-src` lazy-load
  // attribute (used by the WP Fastest Cache plugin) before the standard
  // Madara attributes. Reproduce that, falling back to the base behavior.
  protected override imageFromElement(img: Cheerio<AnyNode>): string {
    if (!img || img.length === 0) return "";

    const wpfc = img.attr("data-wpfc-original-src");
    if (wpfc) {
      let src = wpfc.trim();
      if (src && !src.startsWith("http")) {
        src = src.startsWith("/")
          ? `${this.baseUrl}${src}`
          : `${this.baseUrl}/${src}`;
      }
      return src;
    }

    return super.imageFromElement(img);
  }
}

export const MangaDistrict = new MangaDistrictExtension({
  name: "Manga District",
  baseUrl: "https://mangadistrict.com",
  mangaSubString: "series",
  useNewChapterEndpoint: false,
  contentRating: ContentRating.MATURE,
  langCode: "🇬🇧",
  pageListSelector: "div.page-break img:not(#image-99999)",
  // Upstream #19202: the theme's nav-previous link is always present here.
  nextPageSelector: ".wp-pagenavi a.last",
});
