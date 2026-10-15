import { ContentRating, ExtensionInfo, SourceIntents } from "@paperback/types";

export default {
  name: "Bakkin",
  description: "Bakkin - Bakkin source (bakkin.moe/reader). Converted from keiyoushi.",
  version: "1.4.7.2",
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
    { label: "Bakkin", textColor: "#FFFFFF", backgroundColor: "#455A64" },
  ],
  developers: [
    { name: "nicartjay" },
    { name: "keiyoushi" },
  ],
} satisfies ExtensionInfo;
