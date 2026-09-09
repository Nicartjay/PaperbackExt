import { ContentRating } from "@paperback/types";
import { MadaraExtension } from "../utils/madara/template";

// Upstream #18788: Arya Scans rebranded to BrainRotComics. The folder (and so
// our source id) is kept so existing libraries survive the rename.
//
// NOTE: this previously carried
//   popularMangaUrlSelector: "${super.popularMangaUrlSelector}:not(...)"
// which was a Kotlin string-interpolation expression copied verbatim into
// TypeScript — it is not a template literal here, so the selector was the
// literal text "${super.popularMangaUrlSelector}..." and matched nothing,
// silently falling back to an empty popular list. Upstream has since dropped
// the override entirely, so it is simply removed.
export const AryaScans = new MadaraExtension({
  name: "BrainRotComics",
  baseUrl: "https://brainrotcomics.com",
  useNewChapterEndpoint: true,
  contentRating: ContentRating.EVERYONE,
  langCode: "🇬🇧",
});
