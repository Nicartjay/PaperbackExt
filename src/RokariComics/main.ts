import { ContentRating } from "@paperback/types";
import { MangaThemesiaExtension } from "../utils/mangathemesia/template";

// Upstream #18890 moved this source to `MangaThemesiaAlt` (rotating `<digits>-`
// slug prefixes), noting "server redirects already, but added anyways".
// DELIBERATELY NOT MIRRORED: checked against the live site and the numeric
// prefix here is part of real title slugs, not a rotating token —
// `/manga/28-the-prime-of-youth/` returns 200 while the prefix-stripped
// `/manga/the-prime-of-youth/` returns 404. Enabling `randomUrl` would strip
// that prefix and break those titles, so the plain template is kept.
export const RokariComics = new MangaThemesiaExtension({
  name: "RokariComics",
  baseUrl: "https://rokaricomics.com",
  mangaUrlDirectory: "/manga",
  contentRating: ContentRating.EVERYONE,
  langCode: "🇬🇧",
});
