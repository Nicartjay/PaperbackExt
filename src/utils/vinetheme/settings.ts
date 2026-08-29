import {
  ButtonRow,
  Form,
  InputRow,
  LabelRow,
  Section,
  ToggleRow,
} from "@paperback/types";

const BASE_URL_KEY_PREFIX = "vinetheme.baseUrlOverride.";
const HIDE_LOCKED_KEY_PREFIX = "vinetheme.hideLockedChapters.";

function baseUrlKey(sourceName: string): string {
  return `${BASE_URL_KEY_PREFIX}${sourceName}`;
}

function hideLockedKey(sourceName: string): string {
  return `${HIDE_LOCKED_KEY_PREFIX}${sourceName}`;
}

/**
 * Returns the user-configured base URL override for a source, or undefined
 * when none is set. Trailing slashes are stripped.
 */
export function getBaseUrlOverride(sourceName: string): string | undefined {
  const value = Application.getState(baseUrlKey(sourceName));
  if (typeof value === "string") {
    const trimmed = value.trim().replace(/\/+$/, "");
    if (trimmed.length > 0) return trimmed;
  }
  return undefined;
}

function setBaseUrlOverride(sourceName: string, value: string): void {
  Application.setState(value.trim().replace(/\/+$/, ""), baseUrlKey(sourceName));
}

/**
 * Whether coin-locked chapters should be hidden. Mirrors the upstream
 * `HIDE_LOCKED_PREF`, which defaults to ON — locked chapters cannot be opened
 * without purchasing coins on the site.
 */
export function getHideLockedChapters(sourceName: string): boolean {
  const value = Application.getState(hideLockedKey(sourceName));
  return typeof value === "boolean" ? value : true;
}

function setHideLockedChapters(sourceName: string, value: boolean): void {
  Application.setState(value, hideLockedKey(sourceName));
}

export class VineThemeSettingsForm extends Form {
  private override: string;
  private hideLocked: boolean;

  constructor(
    private readonly sourceName: string,
    private readonly defaultBaseUrl: string,
  ) {
    super();
    this.override = getBaseUrlOverride(sourceName) ?? "";
    this.hideLocked = getHideLockedChapters(sourceName);
  }

  async updateOverride(value: string): Promise<void> {
    this.override = value;
    setBaseUrlOverride(this.sourceName, value);
    this.reloadForm();
  }

  async resetOverride(): Promise<void> {
    this.override = "";
    setBaseUrlOverride(this.sourceName, "");
    this.reloadForm();
  }

  async updateHideLocked(value: boolean): Promise<void> {
    this.hideLocked = value;
    setHideLockedChapters(this.sourceName, value);
    this.reloadForm();
  }

  override getSections() {
    const effective =
      this.override.trim().length > 0
        ? this.override.trim().replace(/\/+$/, "")
        : this.defaultBaseUrl;

    return [
      Section(
        {
          id: "chapters",
          footer:
            "Locked chapters require coins on the site and cannot be opened " +
            "here. Turn this off to list them with a 🔒 marker.",
        },
        [
          ToggleRow("hide_locked", {
            title: "Hide locked chapters",
            value: this.hideLocked,
            onValueChange: Application.Selector<
              VineThemeSettingsForm,
              (value: boolean) => Promise<void>
            >(this, "updateHideLocked"),
          }),
        ],
      ),
      Section(
        {
          id: "base_url",
          footer:
            "Override the site address if this source has moved to a new " +
            "domain. Leave empty to use the default. Include the scheme, " +
            `e.g. ${this.defaultBaseUrl}`,
        },
        [
          InputRow("base_url_input", {
            title: "Base URL",
            value: this.override,
            onValueChange: Application.Selector<
              VineThemeSettingsForm,
              (value: string) => Promise<void>
            >(this, "updateOverride"),
          }),
          LabelRow("base_url_current", {
            title: "Currently using",
            value: effective,
          }),
          ButtonRow("base_url_reset", {
            title: "Reset to default",
            onSelect: Application.Selector<
              VineThemeSettingsForm,
              () => Promise<void>
            >(this, "resetOverride"),
          }),
        ],
      ),
    ];
  }
}
