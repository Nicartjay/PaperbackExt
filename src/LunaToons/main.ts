import { ContentRating } from "@paperback/types";
import { KeyoappV2Extension } from "../utils/keyoapp/v2";

// Upstream #19781 moved this source to KeyoappV2 (the site runs the newer
// Keyoapp build) and it now lives at lunatoons.net; lunatoons.org redirects
// there and drops the query string, which broke every API call.
export const LunaToons = new KeyoappV2Extension({
  name: "Luna Toons",
  baseUrl: "https://lunatoons.net",
  contentRating: ContentRating.MATURE,
  langCode: "🇬🇧",
});
