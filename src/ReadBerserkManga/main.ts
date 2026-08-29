import { ContentRating } from "@paperback/types";
import { MangaCatalogExtension } from "../utils/mangacatalog/template";

export const ReadBerserkManga = new MangaCatalogExtension({
  name: "Read Berserk Manga",
  baseUrl: "https://readberserk.com",
  contentRating: ContentRating.EVERYONE,
  langCode: "🇬🇧",
  detailVariant: "card",
  chapterVariant: "table",
  // Upstream #18571: reader markup changed to img.pages__img.
  pageVariant: "pagesImg",
  mangaList: [
    { title: "Berserk", url: "/manga/berserk/" },
    { title: "Guidebook", url: "/manga/berserk-official-guidebook/" },
    { title: "Colored", url: "/manga/berserk-colored/" },
    { title: "Duranki", url: "/manga/duranki/" },
    { title: "Gigantomakhia", url: "/manga/gigantomakhia/" },
    { title: "Futatabi", url: "/manga/futatabi/" },
    { title: "Berserk Spoilers & RAW", url: "/manga/berserk-spoilers-raw/" },
  ],
});
