import { ContentRating, ExtensionInfo, SourceIntents } from "@paperback/types";

export default {
  name: "Monochrome Scans",
  description: "Monochrome Scans - Monochrome source (manga.d34d.one). Converted from keiyoushi.",
  version: "1.4.5.2",
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
    { label: "Monochrome", textColor: "#FFFFFF", backgroundColor: "#424242" },
  ],
  developers: [
    { name: "nicartjay" },
    { name: "keiyoushi" },
  ],
} satisfies ExtensionInfo;
