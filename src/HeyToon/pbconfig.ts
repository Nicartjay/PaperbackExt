import { ContentRating, ExtensionInfo, SourceIntents } from "@paperback/types";

export default {
  // Upstream renamed HeyToon to ToonHey (#18275) and pinned the old numeric
  // extension id so existing libraries survive. Our source id is the folder
  // name, so the directory stays `HeyToon` for the same reason.
  name: "ToonHey",
  description:
    "ToonHey - custom source (toonhey.com). Converted from keiyoushi.",
  version: "1.4.2.2",
  icon: "icon.png",
  language: "en",
  contentRating: ContentRating.MATURE,
  capabilities: [
    SourceIntents.DISCOVER_SECTION_PROVIDING,
    SourceIntents.SEARCH_RESULT_PROVIDING,
    SourceIntents.CHAPTER_PROVIDING,
    SourceIntents.CLOUDFLARE_BYPASS_PROVIDING,
  ],
  badges: [
    { label: "Mature", textColor: "#FFFFFF", backgroundColor: "#C62828" },
  ],
  developers: [{ name: "nicartjay" }, { name: "keiyoushi" }],
} satisfies ExtensionInfo;
