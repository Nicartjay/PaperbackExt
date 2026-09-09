import {
  AdvancedSearchForm,
  Section,
  SelectRow,
  type JSONObject,
} from "@paperback/types";

export interface SilentQuillSearchMeta extends JSONObject {
  status: string[];
  genre: string[];
}

// Upstream Filters.kt (#18885).
export const STATUS_OPTIONS = [
  { id: "", title: "All" },
  { id: "ongoing", title: "Ongoing" },
  { id: "completed", title: "Completed" },
];

export const GENRE_OPTIONS = [
  { id: "", title: "All" },
  { id: "action", title: "Action" },
  { id: "adaptation", title: "Adaptation" },
  { id: "adult", title: "Adult" },
  { id: "adventure", title: "Adventure" },
  { id: "aliens", title: "Aliens" },
  { id: "comedy", title: "Comedy" },
  { id: "delinquents", title: "Delinquents" },
  { id: "demons", title: "Demons" },
  { id: "drama", title: "Drama" },
  { id: "ecchi", title: "Ecchi" },
  { id: "erotica", title: "Erotica" },
  { id: "fantasy", title: "Fantasy" },
  { id: "full-color", title: "Full Color" },
  { id: "gender-bender", title: "Gender Bender" },
  { id: "genderswap", title: "Genderswap" },
  { id: "ghosts", title: "Ghosts" },
  { id: "girls-love", title: "Girls' Love" },
  { id: "gore", title: "Gore" },
  { id: "gyaru", title: "Gyaru" },
  { id: "harem", title: "Harem" },
  { id: "hentai", title: "Hentai" },
  { id: "historical", title: "Historical" },
  { id: "horror", title: "Horror" },
  { id: "isekai", title: "Isekai" },
  { id: "josei", title: "Josei" },
  { id: "magic", title: "Magic" },
  { id: "martial-arts", title: "Martial Arts" },
  { id: "mature", title: "Mature" },
  { id: "mecha", title: "Mecha" },
  { id: "monster-girls", title: "Monster Girls" },
  { id: "monsters", title: "Monsters" },
  { id: "mystery", title: "Mystery" },
  { id: "one-shot", title: "One-shot" },
  { id: "psychological", title: "Psychological" },
  { id: "reincarnation", title: "Reincarnation" },
  { id: "romance", title: "Romance" },
  { id: "school-life", title: "School Life" },
  { id: "sci-fi", title: "Sci-fi" },
  { id: "seinen", title: "Seinen" },
  { id: "sexual-violence", title: "Sexual Violence" },
  { id: "shoujo", title: "Shoujo" },
  { id: "shounen", title: "Shounen" },
  { id: "slice-of-life", title: "Slice of Life" },
  { id: "smut", title: "Smut" },
  { id: "sports", title: "Sports" },
  { id: "suggestive", title: "Suggestive" },
  { id: "supernatural", title: "Supernatural" },
  { id: "survival", title: "Survival" },
  { id: "thriller", title: "Thriller" },
  { id: "tragedy", title: "Tragedy" },
  { id: "video-games", title: "Video Games" },
  { id: "web-comic", title: "Web Comic" },
  { id: "zombies", title: "Zombies" },
];

export class SilentQuillSearchForm extends AdvancedSearchForm {
  private status: string[];
  private genre: string[];

  constructor(initialMeta?: SilentQuillSearchMeta) {
    super();
    this.status = initialMeta?.status ?? [];
    this.genre = initialMeta?.genre ?? [];
  }

  async updateStatus(value: string[]): Promise<void> {
    this.status = value;
    this.reloadForm();
  }

  async updateGenre(value: string[]): Promise<void> {
    this.genre = value;
    this.reloadForm();
  }

  getSearchQueryMetadata() {
    return {
      searchMeta: {
        status: this.status,
        genre: this.genre,
      } satisfies SilentQuillSearchMeta,
    };
  }

  override getSections() {
    return [
      Section("filters", [
        SelectRow("status", {
          title: "Status",
          value: this.status,
          options: STATUS_OPTIONS,
          minItemCount: 0,
          maxItemCount: 1,
          onValueChange: Application.Selector<
            SilentQuillSearchForm,
            (value: string[]) => Promise<void>
          >(this, "updateStatus"),
        }),
        SelectRow("genre", {
          title: "Genres",
          value: this.genre,
          options: GENRE_OPTIONS,
          minItemCount: 0,
          maxItemCount: 1,
          onValueChange: Application.Selector<
            SilentQuillSearchForm,
            (value: string[]) => Promise<void>
          >(this, "updateGenre"),
        }),
      ]),
    ];
  }
}
