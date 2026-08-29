import { ContentRating } from "@paperback/types";
import { VineThemeExtension } from "../utils/vinetheme/template";

// Upstream #18653 grouped this site into the new shared `vinetheme`: it moved
// off the Iken API onto a Next.js RSC front end and from divatoon.com to
// divascans.org (the old api.divatoon.com endpoints now return HTML).
export const DivaScans = new VineThemeExtension({
  name: "Diva Scans",
  baseUrl: "https://divascans.org",
  contentRating: ContentRating.MATURE,
  langCode: "🇬🇧",
});
