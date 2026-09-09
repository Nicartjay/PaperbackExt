import { ContentRating } from "@paperback/types";
import { MangaThemesiaExtension } from "../utils/mangathemesia/template";

export const VioletScans = new MangaThemesiaExtension({
  name: "Violet Scans",
  baseUrl: "https://violetscans.org",
  mangaUrlDirectory: "/comics",
  contentRating: ContentRating.EVERYONE,
  langCode: "🇬🇧",
  // Upstream #18834: the site also lists light novels, which have no readable
  // chapters here. They are tagged with a `.novelabel` badge on the card, so
  // exclude those entries from browse/search.
  discoverItemSelector:
    ".utao .uta .imgu, .listupd .bs .bsx:not(:has(.novelabel)), .listo .bs .bsx:not(:has(.novelabel))",
});
