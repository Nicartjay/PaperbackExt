import { ContentRating, ExtensionInfo, SourceIntents } from "@paperback/types";

export default {
  name: "Hiperdex",
  description: "Hiperdex - Hiper source (hiperdex.com). Converted from keiyoushi.",
  version: "1.4.89.1",
  icon: "icon.png",
  language: "en",
  contentRating: ContentRating.MATURE,
  capabilities: [
    SourceIntents.DISCOVER_SECTION_PROVIDING,
    SourceIntents.SEARCH_RESULT_PROVIDING,
    SourceIntents.CHAPTER_PROVIDING,
  ],
  badges: [
    { label: "Hiper", textColor: "#FFFFFF", backgroundColor: "#2E7D32" },
    { label: "Mature", textColor: "#FFFFFF", backgroundColor: "#C62828" },
  ],
  developers: [
    { name: "nicartjay" },
    { name: "keiyoushi" },
  ],
} satisfies ExtensionInfo;
