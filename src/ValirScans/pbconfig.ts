import { ContentRating, ExtensionInfo, SourceIntents } from "@paperback/types";

export default {
  name: "Valir Scans",
  description:
    "Valir Scans - Next.js (RSC) HTML source (valirscans.org). Converted from keiyoushi.",
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
  badges: [],
  developers: [{ name: "nicartjay" }, { name: "keiyoushi" }],
} satisfies ExtensionInfo;
