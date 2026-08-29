import { Form, Section, ToggleRow } from "@paperback/types";

const HIDE_RAWS_KEY = "mangago.hideRaws";

/**
 * Whether untranslated ("RAW") chapters should be hidden. Mirrors the upstream
 * `REMOVE_RAW_PREF` switch added in #18581, which defaults to ON — the site
 * lists RAW chapters in a separate `#raws_table` and most readers do not want
 * them interleaved with the translated ones.
 */
export function getHideRaws(): boolean {
  const value = Application.getState(HIDE_RAWS_KEY);
  return typeof value === "boolean" ? value : true;
}

function setHideRaws(value: boolean): void {
  Application.setState(value, HIDE_RAWS_KEY);
}

export class MangaGoSettingsForm extends Form {
  private hideRaws: boolean;

  constructor() {
    super();
    this.hideRaws = getHideRaws();
  }

  async updateHideRaws(value: boolean): Promise<void> {
    this.hideRaws = value;
    setHideRaws(value);
    this.reloadForm();
  }

  override getSections() {
    return [
      Section(
        {
          id: "chapters",
          footer:
            "RAW chapters are the original untranslated scans. Turn this off " +
            "to list them alongside the translated chapters.",
        },
        [
          ToggleRow("hide_raws", {
            title: "Hide RAW chapters",
            value: this.hideRaws,
            onValueChange: Application.Selector<
              MangaGoSettingsForm,
              (value: boolean) => Promise<void>
            >(this, "updateHideRaws"),
          }),
        ],
      ),
    ];
  }
}
