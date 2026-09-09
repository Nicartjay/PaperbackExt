import { ContentRating, ExtensionInfo, SourceIntents } from "@paperback/types";

export default {
  name: "Renascans",
  description: "Renascans - Iken source (renascans.net). Converted from keiyoushi.",
  version: "1.4.27.1",
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
    { label: "Iken", textColor: "#FFFFFF", backgroundColor: "#AD1457" },
  ],
  developers: [
    { name: "nicartjay" },
    { name: "keiyoushi" },
  ],
} satisfies ExtensionInfo;
