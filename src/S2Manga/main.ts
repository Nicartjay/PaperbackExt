import { ContentRating } from "@paperback/types";
import { MadaraExtension } from "../utils/madara/template";

// NOTE: this previously set
//   pageListSelector: "div.page-break img[src*=\\\"https\\\"]"
// The escaped quotes came from the upstream Kotlin string literal and are NOT
// unescaped by TypeScript, so cheerio received a selector containing literal
// backslash-quote characters and matched ZERO elements — the source returned no
// pages at all. Upstream #18962 dropped the override entirely (its only real
// change, trimming the image URL, is already done by our `imageFromElement`),
// so the default Madara page selector is used.
export const S2Manga = new MadaraExtension({
  name: "S2Manga",
  baseUrl: "https://s2read.com",
  useNewChapterEndpoint: false,
  contentRating: ContentRating.MATURE,
  langCode: "🇬🇧",
  useLoadMoreRequest: true,
});
