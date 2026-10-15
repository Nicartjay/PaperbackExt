import { ContentRating, ExtensionInfo, SourceIntents } from "@paperback/types";

export default {
  name: "Guya",
  description: "Guya - Guya source (guya.cubari.moe). Converted from keiyoushi.",
  version: "1.4.25.2",
  icon: "icon.png",
  language: "en",
  contentRating: ContentRating.EVERYONE,
  capabilities: [
    SourceIntents.DISCOVER_SECTION_PROVIDING,
    SourceIntents.SEARCH_RESULT_PROVIDING,
    SourceIntents.CHAPTER_PROVIDING,
    SourceIntents.CLOUDFLARE_BYPASS_PROVIDING,
    SourceIntents.SETTINGS_FORM_PROVIDING,
  ],
  badges: [
    { label: "Guya", textColor: "#FFFFFF", backgroundColor: "#5D4037" },
  ],
  developers: [
    { name: "nicartjay" },
    { name: "keiyoushi" },
  ],
} satisfies ExtensionInfo;
