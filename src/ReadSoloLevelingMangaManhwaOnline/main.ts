import { ContentRating } from "@paperback/types";
import { MangaCatalogExtension } from "../utils/mangacatalog/template";

export const ReadSoloLevelingMangaManhwaOnline = new MangaCatalogExtension({
  name: "Read Solo Leveling Manga Manhwa Online",
  baseUrl: "https://ww4.readsololeveling.org",
  contentRating: ContentRating.EVERYONE,
  langCode: "🇬🇧",
  mangaList: [
    { title: "Solo Leveling Manhwa", url: "/manga/solo-leveling/" },
    { title: "Solo Leveling Light Novel", url: "/manga/solo-leveling-light-novel/" },
    { title: "Solo Leveling : Ragnarok", url: "/manga/solo-leveling-ragnarok/" },
    { title: "SL: Ragnarok Novel", url: "/manga/solo-leveling-ragnarok-novel/" },
  ],
});
