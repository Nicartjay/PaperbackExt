import { ContentRating } from "@paperback/types";
import { VineThemeExtension } from "../utils/vinetheme/template";

// Upstream moved Elf Toon onto the shared VineTheme: the site was rebuilt on the
// Next.js stack (no MangaThemesia markup remains) and moved to elftoon.net. The
// paid-chapter toggle from the previous MangaThemesia port is superseded by
// VineTheme's own "Hide locked chapters" setting.
export const ElfToon = new VineThemeExtension({
  name: "Elf Toon",
  baseUrl: "https://elftoon.net",
  contentRating: ContentRating.EVERYONE,
  langCode: "🇬🇧",
});
