import { Form, Section, ToggleRow } from "@paperback/types";

const SHOW_LOCKED_KEY = "paradisescans.showLocked";

/**
 * Upstream `pref_show_locked_chap` (#19745). Defaults to OFF: locked chapters
 * (priced, premium or early-access) cannot be read without buying them on the
 * site, so listing them produces dead entries.
 */
export function getShowLocked(): boolean {
  const value = Application.getState(SHOW_LOCKED_KEY);
  return typeof value === "boolean" ? value : false;
}

export class ParadiseScansSettingsForm extends Form {
  private showLocked = getShowLocked();

  async updateShowLocked(value: boolean): Promise<void> {
    this.showLocked = value;
    Application.setState(value, SHOW_LOCKED_KEY);
    this.reloadForm();
  }

  override getSections() {
    return [
      Section(
        {
          id: "chapters",
          footer:
            "Locked chapters require a purchase on the site and cannot be " +
            "opened here. They are marked with 🔒 when shown.",
        },
        [
          ToggleRow("show_locked", {
            title: "Show locked chapters",
            value: this.showLocked,
            onValueChange: Application.Selector<
              ParadiseScansSettingsForm,
              (value: boolean) => Promise<void>
            >(this, "updateShowLocked"),
          }),
        ],
      ),
    ];
  }
}
