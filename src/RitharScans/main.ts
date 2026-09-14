import { ContentRating } from "@paperback/types";
import { KeyoappExtension } from "../utils/keyoapp/template";

export const RitharScans = new KeyoappExtension({
  name: "RitharScans",
  baseUrl: "https://ritharscans.com",
  contentRating: ContentRating.EVERYONE,
  langCode: "🇬🇧",
  // Upstream #18950: this fork also marks locked chapters with a star-circle
  // image rather than the standard "Coin" alt text, so unlockable chapters were
  // slipping through as readable and then failing to open.
  paidChapterSelector: "img[alt~='Coin'], img[src*=star-circle]",
});
