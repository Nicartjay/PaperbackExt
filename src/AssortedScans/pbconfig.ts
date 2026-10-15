import { ContentRating, ExtensionInfo, SourceIntents } from "@paperback/types";

export default {
  name: "Assorted Scans",
  description: "Assorted Scans - MangAdventure source (assortedscans.com). Converted from keiyoushi.",
  version: "1.4.18.2",
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
    { label: "MangAdventure", textColor: "#FFFFFF", backgroundColor: "#EF6C00" },
  ],
  developers: [
    { name: "nicartjay" },
    { name: "keiyoushi" },
  ],
} satisfies ExtensionInfo;
