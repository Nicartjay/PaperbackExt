import { Form, InputRow, Section, SelectRow, ToggleRow } from "@paperback/types";

const EXCLUDE_GENRES_KEY = "atsumaru.excludeGenres";

/**
 * Genres excluded from browsing. Mirrors the upstream `PREF_EXCLUDE_GENRES`
 * MultiSelectListPreference added in #18502: the ids are passed to the site as
 * `&excludedTags=` on the browse carousels and as a `genreIds:!=[...]`
 * Typesense filter on search.
 */
export function getExcludedGenres(): string[] {
  const value = Application.getState(EXCLUDE_GENRES_KEY);
  return Array.isArray(value) ? (value as string[]) : [];
}

function setExcludedGenres(value: string[]): void {
  Application.setState(value, EXCLUDE_GENRES_KEY);
}

const DEDUPLICATE_KEY = "atsumaru.deduplicateChapters";
const SCANLATOR_BLACKLIST_KEY = "atsumaru.scanlatorBlacklist";

/** Upstream #19782: show one upload per chapter number. Default off. */
export function getDeduplicateChapters(): boolean {
  return Application.getState(DEDUPLICATE_KEY) === true;
}

/** Upstream #19782: comma-separated scanlator names, lower-cased. */
export function getScanlatorBlacklistRaw(): string {
  const v = Application.getState(SCANLATOR_BLACKLIST_KEY);
  return typeof v === "string" ? v : "";
}

export function getScanlatorBlacklist(): Set<string> {
  return new Set(
    getScanlatorBlacklistRaw()
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0),
  );
}

export class AtsumaruSettingsForm extends Form {
  private excluded: string[];
  private dedupe: boolean;
  private blacklist: string;

  constructor(private readonly genres: { name: string; id: string }[]) {
    super();
    this.excluded = getExcludedGenres();
    this.dedupe = getDeduplicateChapters();
    this.blacklist = getScanlatorBlacklistRaw();
  }

  async updateDedupe(value: boolean): Promise<void> {
    this.dedupe = value;
    Application.setState(value, DEDUPLICATE_KEY);
  }

  async updateBlacklist(value: string): Promise<void> {
    this.blacklist = value;
    Application.setState(value, SCANLATOR_BLACKLIST_KEY);
  }

  async updateExcluded(value: string[]): Promise<void> {
    this.excluded = value;
    setExcludedGenres(value);
    this.reloadForm();
  }

  override getSections() {
    return [
      Section(
        {
          id: "browse",
          footer:
            "Titles in the selected genres are hidden from the discover " +
            "carousels and from search results.",
        },
        [
          SelectRow("exclude_genres", {
            title: "Exclude genres from browse",
            value: this.excluded,
            options: this.genres.map((g) => ({ id: g.id, title: g.name })),
            minItemCount: 0,
            maxItemCount: this.genres.length,
            onValueChange: Application.Selector<
              AtsumaruSettingsForm,
              (value: string[]) => Promise<void>
            >(this, "updateExcluded"),
          }),
        ],
      ),
      Section(
        {
          id: "chapters",
          header: "Chapters",
          footer:
            "Deduplicate keeps one upload per chapter, from the highest rated " +
            "group that has it. Excluded scanlators is a comma-separated list " +
            "of group names to drop from the chapter list.",
        },
        [
          ToggleRow("deduplicate_chapters", {
            title: "Deduplicate chapters",
            value: this.dedupe,
            onValueChange: Application.Selector<
              AtsumaruSettingsForm,
              (value: boolean) => Promise<void>
            >(this, "updateDedupe"),
          }),
          InputRow("scanlator_blacklist", {
            title: "Excluded scanlators",
            value: this.blacklist,
            onValueChange: Application.Selector<
              AtsumaruSettingsForm,
              (value: string) => Promise<void>
            >(this, "updateBlacklist"),
          }),
        ],
      ),
    ];
  }
}
