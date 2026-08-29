import {
  AdvancedSearchForm,
  Section,
  SelectRow,
  type JSONObject,
} from "@paperback/types";

export interface VineThemeSearchMeta extends JSONObject {
  sort: string[];
  status: string[];
  type: string[];
  origin: string[];
  genre: string[];
}

// Upstream Filters.kt (`SortFilter`); the site defaults to `updated`.
export const SORT_OPTIONS = [
  { id: "updated", title: "Latest" },
  { id: "popular", title: "Popular" },
  { id: "trending", title: "Trending" },
  { id: "views", title: "Views" },
  { id: "rating", title: "Rating" },
  { id: "longest", title: "Longest" },
  { id: "newest", title: "Newest" },
];

export const STATUS_OPTIONS = [
  { id: "", title: "All" },
  { id: "Ongoing", title: "Ongoing" },
  { id: "Completed", title: "Completed" },
  { id: "Hiatus", title: "Hiatus" },
  { id: "Dropped", title: "Dropped" },
  { id: "Discontinued", title: "Discontinued" },
  { id: "Upcoming", title: "Upcoming" },
];

export const TYPE_OPTIONS = [
  { id: "", title: "All" },
  { id: "MANHWA", title: "Manhwa" },
  { id: "MANHUA", title: "Manhua" },
  { id: "MANGA", title: "Manga" },
];

export const ORIGIN_OPTIONS = [
  { id: "", title: "All" },
  { id: "KOREAN", title: "Korean" },
  { id: "JAPANESE", title: "Japanese" },
  { id: "CHINESE", title: "Chinese" },
  { id: "OTHER", title: "Other" },
];

export class VineThemeSearchForm extends AdvancedSearchForm {
  private sort: string[];
  private status: string[];
  private type: string[];
  private origin: string[];
  private genre: string[];

  constructor(initialMeta?: VineThemeSearchMeta) {
    super();
    this.sort = initialMeta?.sort ?? [];
    this.status = initialMeta?.status ?? [];
    this.type = initialMeta?.type ?? [];
    this.origin = initialMeta?.origin ?? [];
    this.genre = initialMeta?.genre ?? [];
  }

  async updateSort(value: string[]): Promise<void> {
    this.sort = value;
    this.reloadForm();
  }

  async updateStatus(value: string[]): Promise<void> {
    this.status = value;
    this.reloadForm();
  }

  async updateType(value: string[]): Promise<void> {
    this.type = value;
    this.reloadForm();
  }

  async updateOrigin(value: string[]): Promise<void> {
    this.origin = value;
    this.reloadForm();
  }

  async updateGenre(value: string[]): Promise<void> {
    this.genre = value;
    this.reloadForm();
  }

  getSearchQueryMetadata() {
    return {
      searchMeta: {
        sort: this.sort,
        status: this.status,
        type: this.type,
        origin: this.origin,
        genre: this.genre,
      } satisfies VineThemeSearchMeta,
    };
  }

  override getSections() {
    return [
      Section("filters", [
        SelectRow("sort", {
          title: "Sort",
          value: this.sort,
          options: SORT_OPTIONS,
          minItemCount: 0,
          maxItemCount: 1,
          onValueChange: Application.Selector<
            VineThemeSearchForm,
            (value: string[]) => Promise<void>
          >(this, "updateSort"),
        }),
        SelectRow("status", {
          title: "Status",
          value: this.status,
          options: STATUS_OPTIONS,
          minItemCount: 0,
          maxItemCount: 1,
          onValueChange: Application.Selector<
            VineThemeSearchForm,
            (value: string[]) => Promise<void>
          >(this, "updateStatus"),
        }),
        SelectRow("type", {
          title: "Type",
          value: this.type,
          options: TYPE_OPTIONS,
          minItemCount: 0,
          maxItemCount: 1,
          onValueChange: Application.Selector<
            VineThemeSearchForm,
            (value: string[]) => Promise<void>
          >(this, "updateType"),
        }),
        SelectRow("origin", {
          title: "Origin",
          value: this.origin,
          options: ORIGIN_OPTIONS,
          minItemCount: 0,
          maxItemCount: 1,
          onValueChange: Application.Selector<
            VineThemeSearchForm,
            (value: string[]) => Promise<void>
          >(this, "updateOrigin"),
        }),
      ]),
    ];
  }
}
