import {
  AdvancedSearchForm,
  Section,
  SelectRow,
  type JSONObject,
} from "@paperback/types";

export interface ParadiseScansSearchMeta extends JSONObject {
  sort: string[];
  status: string[];
  type: string[];
  genres: string[];
}

// Upstream Filters.kt (#19745).
export const SORT_OPTIONS = [
  { id: "latest_chapter", title: "Latest updates" },
  { id: "sales", title: "Popular" },
  { id: "created_at", title: "Newest series" },
  { id: "rating", title: "Highest rated" },
  { id: "title", title: "Title A–Z" },
];

export const STATUS_OPTIONS = [
  { id: "", title: "All" },
  { id: "ongoing", title: "Ongoing" },
  { id: "completed", title: "Completed" },
];

export const TYPE_OPTIONS = [
  { id: "", title: "All" },
  { id: "manga", title: "Manga / Manhwa" },
  { id: "novel", title: "Novels" },
];

export const GENRE_OPTIONS = [
  "Action", "Adult", "Adventure", "Campus", "Comedy", "Contemporary", "Drama",
  "Ecchi", "Fantasy", "Historical", "Mature", "Mystery", "Omegaverse",
  "Psychological", "Romance", "Sci-Fi", "Seinen", "Shounen Ai", "Smut",
  "Supernatural", "Webtoons", "Workplace", "Yaoi",
].map((g) => ({ id: g, title: g }));

/** Upstream `applyToUrl`: only some sorts take an explicit direction. */
export function sortDirection(sort: string): string | undefined {
  if (sort === "title") return "asc";
  if (sort === "sales" || sort === "created_at" || sort === "rating") return "desc";
  return undefined;
}

export class ParadiseScansSearchForm extends AdvancedSearchForm {
  private sort: string[];
  private status: string[];
  private type: string[];
  private genres: string[];

  constructor(initial?: ParadiseScansSearchMeta) {
    super();
    this.sort = initial?.sort ?? [];
    this.status = initial?.status ?? [];
    this.type = initial?.type ?? [];
    this.genres = initial?.genres ?? [];
  }

  async updateSort(v: string[]): Promise<void> {
    this.sort = v;
    this.reloadForm();
  }
  async updateStatus(v: string[]): Promise<void> {
    this.status = v;
    this.reloadForm();
  }
  async updateType(v: string[]): Promise<void> {
    this.type = v;
    this.reloadForm();
  }
  async updateGenres(v: string[]): Promise<void> {
    this.genres = v;
    this.reloadForm();
  }

  getSearchQueryMetadata() {
    return {
      searchMeta: {
        sort: this.sort,
        status: this.status,
        type: this.type,
        genres: this.genres,
      } satisfies ParadiseScansSearchMeta,
    };
  }

  override getSections() {
    type Sel = (value: string[]) => Promise<void>;
    return [
      Section("filters", [
        SelectRow("sort", {
          title: "Sort by",
          value: this.sort,
          options: SORT_OPTIONS,
          minItemCount: 0,
          maxItemCount: 1,
          onValueChange: Application.Selector<ParadiseScansSearchForm, Sel>(this, "updateSort"),
        }),
        SelectRow("status", {
          title: "Status",
          value: this.status,
          options: STATUS_OPTIONS,
          minItemCount: 0,
          maxItemCount: 1,
          onValueChange: Application.Selector<ParadiseScansSearchForm, Sel>(this, "updateStatus"),
        }),
        SelectRow("type", {
          title: "Format",
          value: this.type,
          options: TYPE_OPTIONS,
          minItemCount: 0,
          maxItemCount: 1,
          onValueChange: Application.Selector<ParadiseScansSearchForm, Sel>(this, "updateType"),
        }),
        SelectRow("genres", {
          title: "Genres",
          value: this.genres,
          options: GENRE_OPTIONS,
          minItemCount: 0,
          maxItemCount: GENRE_OPTIONS.length,
          onValueChange: Application.Selector<ParadiseScansSearchForm, Sel>(this, "updateGenres"),
        }),
      ]),
    ];
  }
}
