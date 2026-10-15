import { ContentRating, ExtensionInfo, SourceIntents } from "@paperback/types";

export default {
  name: "Sabrina Online",
  description:
    "Sabrina Online - webcomic source (www.sabrina-online.com). Converted from keiyoushi.",
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
