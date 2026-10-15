import { ContentRating, ExtensionInfo, SourceIntents } from "@paperback/types";

export default {
  name: "Solar and Sundry",
  description:
    "Solar and Sundry - single webcomic JSON-API source (sas.ewanb.me). Converted from keiyoushi.",
  version: "1.4.2.2",
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
