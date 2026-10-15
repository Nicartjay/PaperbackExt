import { ContentRating, ExtensionInfo, SourceIntents } from "@paperback/types";

export default {
  name: "Kewn Scans",
  description: "Kewn Scans - Keyoapp source (kewnscans.org). Converted from keiyoushi.",
  version: "1.4.23.1",
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
    { label: "Keyoapp", textColor: "#FFFFFF", backgroundColor: "#6A1B9A" },
  ],
  developers: [
    { name: "nicartjay" },
    { name: "keiyoushi" },
  ],
} satisfies ExtensionInfo;
