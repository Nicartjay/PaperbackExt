import { ContentRating, Form } from "@paperback/types";
import { MangaThemesiaExtension } from "../utils/mangathemesia/template";
import { ElfToonSettingsForm, getHidePaidChapters } from "./settings";

/**
 * Elf Toon marks coin-locked chapters with a `.gem-price-icon` badge. Upstream
 * #18890 made hiding them a user preference instead of an unconditional filter,
 * so the selector is chosen at runtime.
 */
class ElfToonExtension extends MangaThemesiaExtension {
  override get chapterSelector(): string {
    const base = super.chapterSelector;
    if (!getHidePaidChapters()) return base;
    return base
      .split(",")
      .map((sel) => `${sel.trim()}:not(:has(.gem-price-icon))`)
      .join(", ");
  }

  override async getSettingsForm(): Promise<Form> {
    return new ElfToonSettingsForm();
  }
}

export const ElfToon = new ElfToonExtension({
  name: "Elf Toon",
  baseUrl: "https://elftoon.com",
  mangaUrlDirectory: "/manga",
  contentRating: ContentRating.EVERYONE,
  langCode: "🇬🇧",
});
