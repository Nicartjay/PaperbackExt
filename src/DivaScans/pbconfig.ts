import { ContentRating, ExtensionInfo, SourceIntents } from "@paperback/types";

export default {
  name: "Diva Scans",
  description: "Diva Scans - Iken source (divatoon.com). Converted from keiyoushi.",
  version: "1.4.29.1",
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
    { label: "VineTheme", textColor: "#FFFFFF", backgroundColor: "#6A1B9A" },
    { label: "Mature", textColor: "#FFFFFF", backgroundColor: "#C62828" },
  ],
  developers: [
    { name: "nicartjay" },
    { name: "keiyoushi" },
  ],
} satisfies ExtensionInfo;
