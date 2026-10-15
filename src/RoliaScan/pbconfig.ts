import { ContentRating, ExtensionInfo, SourceIntents } from "@paperback/types";

export default {
  name: "Rolia Scan",
  description:
    "Rolia Scan - JSON API source (roliascan.com). Converted from keiyoushi.",
  version: "1.4.9.2",
  icon: "icon.png",
  language: "en",
  contentRating: ContentRating.EVERYONE,
  capabilities: [
    SourceIntents.DISCOVER_SECTION_PROVIDING,
    SourceIntents.SEARCH_RESULT_PROVIDING,
    SourceIntents.CHAPTER_PROVIDING,
    SourceIntents.CLOUDFLARE_BYPASS_PROVIDING,
  ],
  badges: [],
  developers: [{ name: "nicartjay" }, { name: "keiyoushi" }],
} satisfies ExtensionInfo;
