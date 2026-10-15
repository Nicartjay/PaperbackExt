import { ContentRating, ExtensionInfo, SourceIntents } from "@paperback/types";

export default {
  name: "18 Porn Comic",
  description: "18 Porn Comic - Manga18 source (18porncomic.com). Converted from keiyoushi.",
  version: "1.4.3.2",
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
    { label: "Manga18", textColor: "#FFFFFF", backgroundColor: "#880E4F" },
    { label: "Mature", textColor: "#FFFFFF", backgroundColor: "#C62828" },
  ],
  developers: [
    { name: "nicartjay" },
    { name: "keiyoushi" },
  ],
} satisfies ExtensionInfo;
