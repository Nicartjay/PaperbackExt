import { ContentRating } from "@paperback/types";
import { MangaCatalogExtension } from "../utils/mangacatalog/template";

export const ReadFairyTailEdensZeroMangaOnline = new MangaCatalogExtension({
  name: "Read Fairy Tail & Edens Zero Manga Online",
  baseUrl: "https://ww9.readfairytail.com",
  contentRating: ContentRating.EVERYONE,
  langCode: "🇬🇧",
  mangaList: [
    { title: "Eden's Zero", url: "/manga/edens-zero/" },
    { title: "Fairy Tail", url: "/manga/fairy-tail/" },
    { title: "FT Zero", url: "/manga/fairy-tail-zero/" },
    { title: "FT City Hero", url: "/manga/fairy-tail-city-hero/" },
    { title: "Hero’s", url: "/manga/heros/" },
    { title: "FT Happy Adv", url: "/manga/fairy-tail-happys-grand-adventure/" },
    { title: "FT 100 Year", url: "/manga/fairy-tail-100-years-quest/" },
    { title: "FT Ice Trail", url: "/manga/fairy-tail-ice-trail/" },
    { title: "FT x Taizai", url: "/manga/fairy-tail-x-nanatsu-no-taizai-christmas-special/" },
    { title: "Parasyte x FT", url: "/manga/parasyte-x-fairy-tail/" },
    { title: "Gaiden 1", url: "/manga/fairy-tail-gaiden-raigo-issen/" },
    { title: "FT x Rave", url: "/manga/fairy-tail-x-rave/" },
    { title: "Monster Hunter", url: "/manga/monster-hunter-orage/" },
    { title: "Rave Master", url: "/manga/rave-master/" },
    { title: "Dead Rock", url: "/manga/dead-rock/" },
    { title: "Fairy Girls", url: "/manga/fairy-girls/" },
    { title: "Gaiden 4", url: "/manga/fairy-tail-gaiden-raigo-issen/" },
    { title: "Gaiden 2", url: "/manga/fairy-tail-gaiden-kengami-no-souryuu/" },
    { title: "Gaiden 3", url: "/manga/fairy-tail-gaiden-road-knight/" },
    { title: "FT x 7DS", url: "/manga/fairy-tail-x-nanatsu-no-taizai-christmas-special/" },
  ],
});
