import { ContentRating, ExtensionInfo, SourceIntents } from "@paperback/types";

export default {
  name: "8Muses",
  description: "8Muses - EroMuse source (comics.8muses.com). Converted from keiyoushi.",
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
    { label: "EroMuse", textColor: "#FFFFFF", backgroundColor: "#AD1457" },
    { label: "Mature", textColor: "#FFFFFF", backgroundColor: "#C62828" },
  ],
  developers: [
    { name: "nicartjay" },
    { name: "keiyoushi" },
  ],
} satisfies ExtensionInfo;
