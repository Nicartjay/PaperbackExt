import { Form, Section, ToggleRow } from "@paperback/types";

const HIDE_PAID_KEY = "elftoon.hidePaidChapters";

/**
 * Whether coin-locked ("gem") chapters should be hidden. Mirrors the upstream
 * `MangaThemesiaPaidChapterHelper` preference added in #18890. Defaults to ON —
 * paid chapters cannot be opened without buying gems on the site, so listing
 * them just produces dead entries.
 */
export function getHidePaidChapters(): boolean {
  const value = Application.getState(HIDE_PAID_KEY);
  return typeof value === "boolean" ? value : true;
}

function setHidePaidChapters(value: boolean): void {
  Application.setState(value, HIDE_PAID_KEY);
}

export class ElfToonSettingsForm extends Form {
  private hidePaid: boolean;

  constructor() {
    super();
    this.hidePaid = getHidePaidChapters();
  }

  async updateHidePaid(value: boolean): Promise<void> {
    this.hidePaid = value;
    setHidePaidChapters(value);
    this.reloadForm();
  }

  override getSections() {
    return [
      Section(
        {
          id: "chapters",
          footer:
            "Paid chapters require gems on the site and cannot be opened " +
            "here. Turn this off to list them anyway.",
        },
        [
          ToggleRow("hide_paid", {
            title: "Hide paid chapters",
            value: this.hidePaid,
            onValueChange: Application.Selector<
              ElfToonSettingsForm,
              (value: boolean) => Promise<void>
            >(this, "updateHidePaid"),
          }),
        ],
      ),
    ];
  }
}
