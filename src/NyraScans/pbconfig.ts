import { ContentRating, ExtensionInfo, SourceIntents } from "@paperback/types";

export default {
  name: "Nyra Scans",
  description: "Nyra Scans - Keyoapp source (nyrascans.com). Converted from keiyoushi.",
  version: "1.4.22.1",
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
    { label: "Keyoapp", textColor: "#FFFFFF", backgroundColor: "#6A1B9A" },
    { label: "Mature", textColor: "#FFFFFF", backgroundColor: "#C62828" },
  ],
  developers: [
    { name: "nicartjay" },
    { name: "keiyoushi" },
  ],
} satisfies ExtensionInfo;
