import { ContentRating, ExtensionInfo, SourceIntents } from "@paperback/types";

export default {
  name: "Nyx Scans",
  description: "Nyx Scans - Iken source (nyxscans.com). Converted from keiyoushi.",
  version: "1.4.31.1",
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
