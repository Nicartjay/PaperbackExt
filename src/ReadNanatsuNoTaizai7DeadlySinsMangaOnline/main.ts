import { ContentRating } from "@paperback/types";
import { MangaCatalogExtension } from "../utils/mangacatalog/template";

export const ReadNanatsuNoTaizai7DeadlySinsMangaOnline = new MangaCatalogExtension({
  name: "Read Nanatsu no Taizai 7 Deadly Sins Manga Online",
  baseUrl: "https://ww8.read7deadlysins.com",
  contentRating: ContentRating.EVERYONE,
  langCode: "🇬🇧",
  mangaList: [
    { title: "Four Horsemen of the Apocalypse", url: "/manga/four-horsemen-of-the-apocalypse/" },
    { title: "7DS: School", url: "/manga/mayoe-nanatsu-no-taizai-gakuen/" },
    { title: "7DS:7 Days", url: "/manga/nanatsu-no-taizai-seven-days/" },
    { title: "7DS:Vampires", url: "/manga/nanatsu-no-taizai-vampires-of-edinburgh/" },
    { title: "Queen of Altar", url: "/manga/the-queen-of-the-altar/" },
    { title: "7DS: 7 Colors", url: "/manga/nanatsu-no-taizai-nanairo-no-tsuioku/" },
    { title: "7DS x FT", url: "/manga/fairy-tail-x-nanatsu-no-taizai-christmas-special/" },
    { title: "Kongou Banchou", url: "/manga/kongou-banchou/" },
    { title: "7DS:7 Scars", url: "/manga/nanatsu-no-taizai-the-seven-scars-which-they-left-behind/" },
    { title: "7 Deadly Sins", url: "/manga/nanatsu-no-taizai/" },
    { title: "Mokushiroku no Yonkishi", url: "/manga/four-horsemen-of-the-apocalypse/" },
  ],
});
