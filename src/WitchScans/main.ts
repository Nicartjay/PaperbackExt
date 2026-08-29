import { ContentRating } from "@paperback/types";
import { VineThemeExtension } from "../utils/vinetheme/template";

// Upstream #18653: the site re-platformed off MangaThemesia onto the Next.js
// RSC stack shared by the `vinetheme` sources, and moved to witchtoons.net.
export const WitchScans = new VineThemeExtension({
  name: "WitchScans",
  baseUrl: "https://witchtoons.net",
  contentRating: ContentRating.EVERYONE,
  langCode: "🇬🇧",
});
