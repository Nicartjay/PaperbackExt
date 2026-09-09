import { ContentRating } from "@paperback/types";
import { VineThemeExtension } from "../utils/vinetheme/template";

// Upstream #18699 moved this source onto the shared VineTheme: the Iken API at
// api.kaynscan.org now answers 403 and the site relocated to kaynscans.com.
export const KaynScans = new VineThemeExtension({
  name: "Kayn Scans",
  baseUrl: "https://kaynscans.com",
  contentRating: ContentRating.EVERYONE,
  langCode: "🇬🇧",
});
