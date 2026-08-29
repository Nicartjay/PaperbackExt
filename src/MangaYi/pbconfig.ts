import { ContentRating, ExtensionInfo, SourceIntents } from "@paperback/types";

export default {
  name: "MangaYi",
  description:
    "MangaYi - JSON+HTML source (mangayi.com). Converted from keiyoushi.",
  version: "1.4.2.1",
  icon: "icon.png",
  language: "en",
  contentRating: ContentRating.EVERYONE,
  capabilities: [
    SourceIntents.DISCOVER_SECTION_PROVIDING,
    SourceIntents.SEARCH_RESULT_PROVIDING,
    SourceIntents.CHAPTER_PROVIDING,
    SourceIntents.CLOUDFLARE_BYPASS_PROVIDING,
  ],
  badges: [{ label: "Safe", textColor: "#FFFFFF", backgroundColor: "#2E7D32" }],
  developers: [{ name: "nicartjay" }, { name: "keiyoushi" }],
} satisfies ExtensionInfo;
