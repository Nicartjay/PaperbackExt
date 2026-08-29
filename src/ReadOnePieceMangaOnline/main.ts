import { ContentRating } from "@paperback/types";
import { MangaCatalogExtension } from "../utils/mangacatalog/template";

export const ReadOnePieceMangaOnline = new MangaCatalogExtension({
  name: "Read One Piece Manga Online",
  baseUrl: "https://ww13.readonepiece.com",
  contentRating: ContentRating.EVERYONE,
  langCode: "🇬🇧",
  mangaList: [
    { title: "One Piece", url: "/manga/one-piece/" },
    { title: "Colored", url: "/manga/one-piece-digital-colored-comics/" },
    { title: "Soma x Sanji", url: "/manga/shokugeki-no-sanji-one-shot/" },
    { title: "OP x Toriko", url: "/manga/one-piece-x-toriko/" },
    { title: "Party", url: "/manga/one-piece-party/" },
    { title: "DB x OP", url: "/manga/dragon-ball-x-one-piece/" },
    { title: "Wanted!", url: "/manga/wanted-one-piece/" },
    { title: "Ace's Story", url: "/manga/one-piece-ace-s-story/" },
    { title: "Omake", url: "/manga/one-piece-omake/" },
    { title: "Vivre Card", url: "/manga/vivre-card-databook/" },
    { title: "Pirate Recipes", url: "/manga/one-piece-pirate-recipes/" },
    { title: "Databook", url: "/manga/one-piece-databook/" },
    { title: "Ace's Story Manga", url: "/manga/one-piece-ace-story-manga/" },
    { title: "OP Academy", url: "/manga/one-piece-academy/" },
    { title: "MONSTERS", url: "/manga/monsters/" },
    { title: "Zoro Novel", url: "/manga/one-piece-novel-zoro/" },
    { title: "OP in Love", url: "/manga/one-piece-in-love/" },
    { title: "Heroines", url: "/manga/one-piece-novel-heroines/" },
  ],
});
