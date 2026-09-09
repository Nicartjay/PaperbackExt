import { ContentRating, ExtensionInfo, SourceIntents } from "@paperback/types";

export default {
  name: "The Duck Webcomics",
  description:
    "The Duck Webcomics - custom source (theduckwebcomics.com). Converted from keiyoushi.",
  version: "1.4.4.1",
  icon: "icon.png",
  language: "en",
  contentRating: ContentRating.MATURE,
  capabilities: [
    SourceIntents.DISCOVER_SECTION_PROVIDING,
    SourceIntents.SEARCH_RESULT_PROVIDING,
    SourceIntents.CHAPTER_PROVIDING,
    SourceIntents.CLOUDFLARE_BYPASS_PROVIDING,
  ],
  badges: [{ label: "Mature", textColor: "#FFFFFF", backgroundColor: "#C62828" }],
  developers: [{ name: "nicartjay" }, { name: "keiyoushi" }],
} satisfies ExtensionInfo;
