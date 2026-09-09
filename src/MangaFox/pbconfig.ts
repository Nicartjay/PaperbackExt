import { ContentRating, ExtensionInfo, SourceIntents } from "@paperback/types";

export default {
  name: "MangaFox",
  description:
    "MangaFox - HTML scraper source (fanfox.net). Converted from keiyoushi.",
  version: "1.4.9.2",
  icon: "icon.png",
  language: "en",
  contentRating: ContentRating.MATURE,
  capabilities: [
    SourceIntents.DISCOVER_SECTION_PROVIDING,
    SourceIntents.SEARCH_RESULT_PROVIDING,
    SourceIntents.CHAPTER_PROVIDING,
    SourceIntents.CLOUDFLARE_BYPASS_PROVIDING,
  ],
  badges: [
    { label: "Mature", textColor: "#FFFFFF", backgroundColor: "#C62828" },
  ],
  developers: [{ name: "nicartjay" }, { name: "keiyoushi" }],
} satisfies ExtensionInfo;
