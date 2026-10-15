import { ContentRating } from "@paperback/types";
import { KeyoappV2Extension } from "../utils/keyoapp/v2";

// Upstream #19781 moved this source to KeyoappV2 and it now lives at
// sirenscans.org; the old .com domain 302s and drops the query string.
export const SirenScans = new KeyoappV2Extension({
  name: "Siren Scans",
  baseUrl: "https://sirenscans.org",
  contentRating: ContentRating.EVERYONE,
  langCode: "🇬🇧",
});
