import { ContentRating, ExtensionInfo, SourceIntents } from "@paperback/types";

export default {
  name: "Violet Scans",
  description: "Violet Scans - MangaThemesia source (violetscans.org). Converted from keiyoushi.",
  version: "1.4.37.1",
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
    { label: "MangaThemesia", textColor: "#FFFFFF", backgroundColor: "#1565C0" },
  ],
  developers: [
    { name: "nicartjay" },
    { name: "keiyoushi" },
  ],
} satisfies ExtensionInfo;
