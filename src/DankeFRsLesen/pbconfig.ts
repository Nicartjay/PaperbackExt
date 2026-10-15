import { ContentRating, ExtensionInfo, SourceIntents } from "@paperback/types";

export default {
  name: "Danke fürs Lesen",
  description: "Danke fürs Lesen - Guya source (danke.moe). Converted from keiyoushi.",
  version: "1.4.7.2",
  icon: "icon.png",
  language: "en",
  contentRating: ContentRating.MATURE,
  capabilities: [
    SourceIntents.DISCOVER_SECTION_PROVIDING,
    SourceIntents.SEARCH_RESULT_PROVIDING,
    SourceIntents.CHAPTER_PROVIDING,
    SourceIntents.CLOUDFLARE_BYPASS_PROVIDING,
    SourceIntents.SETTINGS_FORM_PROVIDING,
  ],
  badges: [
    { label: "Guya", textColor: "#FFFFFF", backgroundColor: "#5D4037" },
    { label: "Mature", textColor: "#FFFFFF", backgroundColor: "#C62828" },
  ],
  developers: [
    { name: "nicartjay" },
    { name: "keiyoushi" },
  ],
} satisfies ExtensionInfo;
