import { ContentRating } from "@paperback/types";
import { VineThemeExtension } from "../utils/vinetheme/template";

// Upstream #18653: the site re-platformed off MangaThemesia onto the Next.js
// RSC stack shared by the `vinetheme` sources, and moved to drakecomic.net.
export const DrakeScans = new VineThemeExtension({
  name: "Drake Scans",
  baseUrl: "https://drakecomic.net",
  contentRating: ContentRating.EVERYONE,
  langCode: "🇬🇧",
});
