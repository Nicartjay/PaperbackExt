import {
  ContentRating,
  ExtensionInfo,
  SourceIntents,
} from "@paperback/types";

export default {
  name: "StoneScape",
  description: "StoneScape - custom source (stonescape.xyz). Converted from keiyoushi.",
  version: "1.4.50.1",
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
