# Paperback Extensions

A repository of community manga/manhua/comic extensions for
[Paperback](https://github.com/Paperback-iOS/app) **v0.9**.

Sources are converted from the
[keiyoushi Tachiyomi extensions](https://github.com/keiyoushi/extensions-source).
Each upstream theme framework (Madara, MangaThemesia, Keyoapp, Iken, MangaHub,
HeanCms, ZeistManga, MMRCMS, and many more) is reimplemented once as a shared
TypeScript template, and every source built on that framework is generated from
it. A number of sources that don't share a framework (e.g. LikeManga, Mangago,
WeebCentral, MangaPill, MangaFreak, MangaKatana, Manga Demon, TCB Scans, Flame
Comics) are fully self-contained.

> [!IMPORTANT]
> **Not all sources have been tested.** These extensions are plain conversions
> of the keiyoushi Tachiyomi extensions, so while many work, some may be broken,
> incomplete, or out of date. If you find a source that isn't working, please
> [open an issue](../../issues) describing the problem (source name, what you
> did, and what went wrong). I maintain this in my spare time, so I'll get to
> fixes when I have free time — thanks for your patience and for helping improve
> the repository.

> [!NOTE]
> **Only sources that already exist in keiyoushi will be added here.** This
> repository is a port of the keiyoushi Tachiyomi extensions, not a place for
> brand-new sources. If a source exists in keiyoushi but isn't available here
> yet, please [open an issue](../../issues) to request it and I'll work on
> converting it.

### Features

- **Discover, search, details, chapters and pages** for every source.
- **Search sorting** — frameworks that support server-side ordering expose a
  sort dropdown (e.g. Madara: Relevance, Latest, A-Z, Rating, Trending, Most
  Views, New).
- **Advanced search filters** — author, artist, release year, status, type,
  adult content, genre condition, etc., depending on what the upstream
  framework supports.
- **Per-source settings** — every source has a settings form with a
  **base-URL override**, so you can point it at a new domain if the site moves
  without waiting for an update. Some frameworks add extra toggles (e.g.
  "show locked/paid chapters", "show adult content", image quality, a separate
  API-URL override).
- **Cloudflare challenge handling** via the bypass interceptor.
- **Source badges** in the extension list (the framework name, e.g. `Madara`,
  `Iken`, `MangaHub`, plus `Mature` for NSFW sources).

## Installation

### One-tap (recommended)

On the device that has Paperback (v0.9 or newer) installed, open the
installation page and tap **Add Repository to Paperback**, then confirm the
prompt:

**https://nicartjay.github.io/PaperbackExt/0.9/stable/**

The page lists every source — you can also tap individual sources and use the
**Install** button to add just the ones you want.

### Manual

If the one-tap link doesn't work, add the repository by hand:

1. Open Paperback (v0.9 or newer).
2. Go to **Settings → Extensions → Add Repository**.
3. Paste this URL:

   ```
   https://nicartjay.github.io/PaperbackExt/0.9/stable/
   ```

4. Install the sources you want and enjoy reading.

> Some sources sit behind Cloudflare. The first time you open them
> Paperback may show a Cloudflare challenge in a webview — solve it once and
> the cookies are stored for subsequent requests.

### Changing a source's domain

If a site moves to a new domain, open the source's **settings** (gear icon on
the source page) and set a **Base URL override**. The source will use your
override instead of the built-in domain until you reset it. Self-hosted
frameworks (e.g. Monochrome Custom, Bakkin Self-hosted) rely on this to point at
your own server.

## Contributing

Contributions are welcome — anyone can help fix a broken source or keep sources
up to date. You don't need write access; just fork the repo, make your change,
and open a pull request against `0.9/stable`. See
**[CONTRIBUTING.md](CONTRIBUTING.md)** for the full workflow (project layout,
version bumping, type-checking, and the stray-`.js` cleanup step).

If you've found a broken source but can't fix it yourself, please
[open an issue](../../issues) — a source name, the exact error, and an HTTP log
(Charles/Pulse) help a lot.

## Frameworks

The repository implements **25 shared theme frameworks** plus standalone
sources. Each framework lives under `src/utils/<framework>/` and is reused by
every source built on it.

| Framework | Style | Sources | Notes |
| --------- | ----- | ------: | ----- |
| Madara | HTML | 95 | WordPress theme; `mangaSubString` / `useNewChapterEndpoint` per source |
| MangaThemesia | HTML | 23 | Flat chapter URLs; `?title=&page=&order=` browse |
| Keyoapp | HTML | 16 | Homepage popular + client-side search; CSS background-image thumbs; `KeyoappV2` variant for the rebuilt sites |
| MangaCatalog | HTML | 13 | Single-franchise sites with hardcoded title lists |
| Iken | JSON | 9 | `{apiUrl}/api/query|post|chapter`; locked-chapter toggle |
| VineTheme | JSON/RSC | 5 | `/api/series` browse + Next.js flight payload for details/pages |
| MangaHub | GraphQL | 11 | Shared `api.mghcdn.com/graphql` with `x-mhub-access` key |
| guya | JSON | 3 | `get_all_series` blob |
| manga18 | HTML | 3 | Base64-encoded page list |
| mangabox | HTML/JSON | 3 | Mirror list + chapter JSON API |
| MangaK | JSON/RSC | 2 | `api.<host>` search API + Next.js flight payloads |
| HeanCms | JSON | 2 | `query`/`series`/`chapter`; paid-chapter toggle |
| MangAdventure | JSON | 2 | `api/v2` series/chapters/pages |
| Bakkin | JSON | 2 | Single `main.php` catalog blob |
| FoolSlide | HTML | 2 | POST search; `var pages = [...]` page list |
| EroMuse | HTML | 2 | Recursive NSFW album crawler |
| EZManhwa | JSON | 2 | `api/v1` on a separate API host |
| ManhwaZ | HTML | 1 | Madara-like |
| Monochrome | JSON | 2 | Dual base-URL + API-URL override |
| HotComics | HTML | 1 | Age-gate cookie; configurable browse list |
| MangaReader | HTML | 1 | Zoro-style two-step AJAX page fetch |
| Paprika | HTML | 1 | AJAX chapter list; `#arraydata` page list |
| Liliana | HTML | 1 | Two-step AJAX page fetch |
| ZeistManga | JSON/HTML | 1 | Blogger feed + HTML hybrid |
| MMRCMS | HTML | 1 | MyMangaReaderCMS |

Plus several standalone sources (not built on a shared framework):
**LikeManga**, **Mangago** (AES-decrypted image list + grid-descrambled
images, unscrambled in-process via Paperback's canvas polyfill),
**WeebCentral**, **MangaPill**, **MangaFreak**,
**MangaKatana**, **Manga Demon**, **TCB Scans**, **Flame Comics**,
**ReadComicOnline**, **AllManga**, **MangaGeko**, **Batcave**,
**MangaHere**, **AsuraScans**, **ComicK Fanmade**, **VyvyManga**,
**Temple Scan**, **ReadAllComics**, **MangaBolt**, **Manhwa18**,
**Oppai Stream**, **Comivex**, **MangaCloud**,
**DFlowScans**, **Honkai Impact 3rd**, **New Manhwa**,
**Manhwalike**, **ScansGG**, **ToonHey**, **Kappa Beast**, **AsiaToon**,
**StoneScape**, **Manga Mirai**, **Alandal**, **Swords Comic**,
**MangaDot**, **XoManga**, **One Punch Man Online**, **Clone Manga**,
**Alpha Manga**, **Paradise Scans**, **ManhwaZ**, **Manga Drama**,
**HentaiSco**, **The Duck Webcomics** and **Oglaf**.

## Available Sources

**383** sources are currently published. Sources marked **Mature** contain
adult/NSFW content (203 Mature, 180 Everyone).

These are conversions of the keiyoushi extensions, so a source may be broken,
incomplete, or out of date. Where a source is known to have a problem or a
limitation, it is called out in the **Note** column. If you hit a broken source,
please [open an issue](../../issues).

| Source | Version | Content | Note |
| ------ | ------- | ------- | ---- |
| 18 Porn Comic | 1.4.3.2 | Mature |  |
| 1Manga.co | 1.4.38.1 | Mature |  |
| 8Muses | 1.4.3.2 | Mature |  |
| Akai Comic | 1.4.3.1 | Everyone |  |
| Akaza Scans | 1.4.32.2 | Everyone |  |
| Alandal | 1.4.2.1 | Everyone |  |
| AllManga | 1.4.29.1 | Mature |  |
| AllPornComic | 1.4.57.1 | Mature |  |
| AllPornComic.io | 1.4.55.1 | Mature |  |
| Alpha Manga | 1.4.2.1 | Everyone |  |
| Anisa Scans | 1.4.56.1 | Mature |  |
| AP Comics | 1.4.55.1 | Mature |  |
| Aqua Manga | 1.4.69.1 | Everyone |  |
| Arc-Relight | 1.4.16.2 | Everyone | Server down — arc-relight.com’s TLS certificate expired (Jun 22, 2026; Let’s Encrypt E7). iOS rejects the handshake (NSURLErrorDomain -1200 / errSSLClosedAbort -9802); curl/openssl confirm “certificate has expired”. Affects all clients, not just Paperback. Will re-test once the cert is renewed. |
| Arena Scans | 1.4.32.3 | Everyone |  |
| Art Lapsa | 1.4.29.1 | Everyone |  |
| AsiaToon | 1.4.3.1 | Mature |  |
| Asmodeus Scans | 1.4.25.1 | Everyone |  |
| Assorted Scans | 1.4.18.2 | Everyone |  |
| Asura Scans | 1.4.69.1 | Everyone |  |
| Athrea Scans | 1.4.33.3 | Mature |  |
| Atsumaru | 1.4.25.1 | Mature |  |
| aurora | 1.4.4.1 | Everyone |  |
| Bakkin | 1.4.7.2 | Everyone |  |
| Bakkin Self-hosted | 1.4.7.2 | Everyone |  |
| BatCave | 1.4.12.1 | Everyone |  |
| Battle In 5 Seconds After Meeting | 1.4.56.1 | Everyone |  |
| Bbato | 1.4.2.1 | Mature |  |
| BookWalker | 1.4.7.2 | Mature |  |
| Borat Scans | 1.4.55.1 | Everyone |  |
| BrainRotComics | 1.4.58.1 | Everyone |  |
| Broccoli Soup | 1.4.1.2 | Everyone |  |
| Bun Manga | 1.4.55.1 | Everyone |  |
| buttsmithy | 1.4.4.2 | Mature |  |
| Clone Manga | 1.4.3.2 | Everyone |  |
| Clown Corps | 1.4.3.2 | Everyone |  |
| Cocomic | 1.4.57.1 | Mature |  |
| Collected Curios | 1.4.2.2 | Everyone |  |
| Comic Asura | 1.4.34.4 | Mature |  |
| Comic CX | 1.4.1.1 | Mature |  |
| ComicHubFree | 1.4.3.2 | Everyone |  |
| ComicK Fanmade | 1.4.2.1 | Mature |  |
| ComicLand | 1.4.1.2 | Mature |  |
| Comivex | 1.4.3.2 | Everyone |  |
| Comix | 1.4.50.1 | Mature | Scanlation group shown in each chapter title, e.g. [Group]. |
| Coolmic | 1.4.4.2 | Mature |  |
| Cucumber Manga | 1.4.55.1 | Mature |  |
| CulturedWorks | 1.4.33.3 | Mature |  |
| Cutie Comics | 1.4.5.2 | Mature |  |
| Cyanide & Happiness | 1.4.5.2 | Everyone |  |
| Danke fürs Lesen | 1.4.7.2 | Mature |  |
| Dark Legacy Comics | 1.4.1.2 | Everyone |  |
| Dark Science | 1.4.1.2 | Everyone |  |
| Darths & Droids | 1.4.2.2 | Everyone |  |
| Death Toll Scans | 1.4.6.1 | Everyone |  |
| Decadence Scans | 1.4.57.1 | Mature |  |
| DFlowScans | 1.4.1.1 | Everyone |  |
| Digital Comic Museum | 1.4.4.2 | Everyone |  |
| Diva Scans | 1.4.29.1 | Mature |  |
| Doujin.io - J18 | 1.4.4.1 | Mature |  |
| Doujins | 1.4.6.2 | Mature |  |
| DragonTea | 1.4.60.1 | Everyone |  |
| Drake Scans | 1.4.52.1 | Everyone |  |
| Dynasty | 1.4.31.1 | Mature |  |
| Eggporncomics | 1.4.3.2 | Mature |  |
| El Goonish Shive | 1.4.2.2 | Everyone |  |
| Elan School | 1.4.1.2 | Everyone |  |
| Elf Toon | 1.4.34.4 | Everyone |  |
| emaqi | 1.4.1.2 | Mature |  |
| Eris Scans | 1.4.22.1 | Mature |  |
| Ero18x | 1.4.55.1 | Mature |  |
| Erofus | 1.4.3.2 | Mature |  |
| Eva Scans | 1.4.35.3 | Everyone |  |
| Existential Comics | 1.4.5.2 | Everyone |  |
| EZmanga | 1.4.62.2 | Everyone |  |
| Fairy Scans | 1.4.34.1 | Mature |  |
| Flame Comics | 1.4.50.2 | Everyone |  |
| FlameScans.lol | 1.4.53.2 | Everyone |  |
| Frieren Online | 1.4.55.1 | Everyone |  |
| GakaMangas | 1.4.55.1 | Everyone |  |
| Galaxy Manga | 1.4.32.3 | Mature |  |
| GalaxyDegenScans | 1.4.59.1 | Mature |  |
| GEDE Comix | 1.4.55.1 | Mature |  |
| Gensura | 1.4.3.2 | Mature |  |
| Genz Toons | 1.4.55.1 | Everyone |  |
| GingeRTooN | 1.4.55.1 | Mature |  |
| GirlsTop | 1.4.1.2 | Mature |  |
| Goda | 1.4.3.1 | Everyone |  |
| Gone with the Blastwave | 1.4.3.1 | Everyone |  |
| Gourmet Scans | 1.4.55.1 | Mature |  |
| Greed Scans | 1.4.32.1 | Everyone |  |
| Grim Scans | 1.4.22.1 | Everyone |  |
| Grrl Power Comic | 1.4.5.2 | Everyone |  |
| Gunnerkrigg Court | 1.4.3.2 | Everyone |  |
| Guya | 1.4.25.2 | Everyone |  |
| Hachirumi | 1.4.7.2 | Mature |  |
| Hades Scans | 1.4.33.3 | Everyone |  |
| Hentai3z.CC | 1.4.3.2 | Mature |  |
| Hentai4Free | 1.4.55.1 | Mature |  |
| HentaiHere | 1.4.7.3 | Mature |  |
| HentaiKisu | 1.4.1.2 | Mature |  |
| HentaiKun | 1.4.1.1 | Mature |  |
| HentaiNexus | 1.4.20.1 | Mature |  |
| HentaiRead | 1.4.62.2 | Mature |  |
| HentaiRead.io | 1.4.1.1 | Mature |  |
| HentaiSco | 1.4.56.1 | Mature |  |
| HentaiTnT | 1.4.7.1 | Mature |  |
| HentaiXComic | 1.4.55.1 | Mature |  |
| HentaiXDickgirl | 1.4.55.1 | Mature |  |
| HentaiXYuri | 1.4.55.1 | Mature |  |
| Hentara | 1.4.3.2 | Mature |  |
| Hijala Scans | 1.4.27.1 | Everyone |  |
| Hiperdex | 1.4.89.1 | Mature |  |
| Hive Scans | 1.4.71.1 | Everyone |  |
| Hiveworks Comics | 1.4.12.2 | Everyone |  |
| HM2D | 1.4.57.1 | Mature |  |
| Honkai Impact 3rd | 1.4.4.1 | Everyone |  |
| HotComics | 1.4.3.2 | Mature |  |
| Hyakuro Translations | 1.4.1.1 | Mature |  |
| I Roved Out | 1.4.5.2 | Mature |  |
| I'm An Evil God | 1.4.7.3 | Everyone |  |
| InfinityScans | 1.4.14.1 | Mature |  |
| J-Novel | 1.4.4.2 | Everyone |  |
| Jinmangas | 1.4.56.1 | Mature |  |
| K Manga | 1.4.7.1 | Everyone | Only unlocked/free chapters tested; rented/purchased chapters require logging in (region-locked to Japan). |
| Kaizen Scan | 1.4.22.1 | Mature | Coin-locked (paid) chapters can’t be opened — purchase required on the site. |
| Kappa Beast | 1.4.33.2 | Mature |  |
| Kayn Scans | 1.4.35.1 | Everyone |  |
| keenspot | 1.4.3.2 | Everyone |  |
| Ken Scans | 1.4.37.1 | Everyone |  |
| Kewn Scans | 1.4.23.1 | Everyone |  |
| Kill Six Billion Demons | 1.4.6.2 | Everyone |  |
| King of Shojo | 1.4.32.3 | Mature |  |
| KingComiX | 1.4.2.1 | Mature |  |
| Kissmanga.in | 1.4.59.1 | Mature |  |
| Kodansha | 1.4.1.1 | Mature |  |
| KokoMangas | 1.4.57.1 | Mature |  |
| KSGroupScans | 1.4.55.1 | Mature |  |
| Kun Manga Online | 1.4.57.1 | Mature |  |
| KuraManga | 1.4.3.1 | Mature |  |
| Lagoon Scans | 1.4.32.3 | Everyone |  |
| Leslie&Victims | 1.4.2.2 | Everyone |  |
| LHTranslation | 1.4.56.1 | Everyone |  |
| LikeManga | 1.4.8.2 | Everyone |  |
| Lily Manga | 1.4.62.1 | Mature |  |
| LinkManga | 1.4.55.1 | Mature |  |
| Loading Artist | 1.4.3.2 | Everyone |  |
| Lua Scans | 1.4.52.1 | Everyone |  |
| Luminare Translations | 1.4.3.2 | Everyone |  |
| Luna Toons | 1.4.23.1 | Mature |  |
| LustToon | 1.4.2.1 | Mature |  |
| Madara Scans | 1.4.35.3 | Everyone |  |
| MadaraDex | 1.4.58.1 | Mature |  |
| Madokami | 1.4.16.1 | Everyone | Needs HTTP Basic account credentials. |
| Magus Manga | 1.4.73.1 | Everyone |  |
| Mahouirexnohentaikarte | 1.4.55.1 | Mature |  |
| Manga 18x | 1.4.56.1 | Mature |  |
| Manga Dass | 1.4.58.1 | Mature |  |
| Manga Demon | 1.4.20.2 | Everyone |  |
| Manga District | 1.4.73.1 | Mature |  |
| Manga Drama | 1.4.52.2 | Mature |  |
| Manga Kiss | 1.4.56.1 | Everyone |  |
| Manga Mirai | 1.4.1.1 | Everyone |  |
| Manga Trend | 1.4.32.3 | Everyone |  |
| Manga-Bay | 1.4.1.1 | Mature |  |
| Manga.uno | 1.4.2.1 | Mature |  |
| Manga18.Club | 1.4.3.2 | Mature |  |
| Manga18Free | 1.4.56.1 | Mature |  |
| Manga18fx | 1.4.58.2 | Mature |  |
| Mangabat | 1.4.23.1 | Mature |  |
| MangaBolt | 1.4.1.3 | Everyone |  |
| Mangack | 1.4.2.2 | Everyone |  |
| MangaCloud | 1.4.8.2 | Everyone |  |
| MangaDE | 1.4.1.1 | Mature |  |
| MangaDia | 1.4.55.1 | Everyone |  |
| MangaDot | 1.4.25.1 | Mature |  |
| Mangaforfree.com | 1.4.57.1 | Mature |  |
| MangaFox | 1.4.9.3 | Mature |  |
| MangaFox.fun | 1.4.38.1 | Mature |  |
| Mangafreak | 1.4.15.2 | Mature |  |
| Mangafree | 1.4.55.1 | Mature |  |
| MangaGeko | 1.4.34.2 | Mature |  |
| MangaGG | 1.4.59.1 | Mature |  |
| Mangago | 1.4.41.1 | Mature |  |
| MangaHe | 1.4.55.1 | Mature |  |
| Mangahere | 1.4.24.3 | Mature | Page images load slowly — each page URL must be fetched and de-obfuscated via a separate sequential request. |
| MangaHere.onl | 1.4.38.1 | Mature |  |
| MangaHub | 1.4.48.1 | Mature |  |
| MangaK | 1.4.34.1 | Mature |  |
| Mangakakalot | 1.4.24.1 | Mature |  |
| Mangakakalot.fun | 1.4.38.1 | Mature |  |
| MangaKatana | 1.4.12.3 | Mature |  |
| MangaLix | 1.4.1.1 | Mature |  |
| MangaManiacs | 1.4.55.1 | Mature |  |
| Mangamo | 1.4.8.1 | Everyone |  |
| Manganato | 1.4.22.1 | Mature |  |
| MangaNel | 1.4.38.1 | Mature |  |
| MangaNow | 1.4.5.1 | Mature |  |
| MangaOnline.fun | 1.4.38.1 | Mature |  |
| MangaOwl.io (unoriginal) | 1.4.56.1 | Mature |  |
| MangaPanda.onl | 1.4.38.1 | Everyone |  |
| MangaPill | 1.4.9.2 | Mature |  |
| MangaRead.org | 1.4.58.1 | Mature |  |
| MangaReader.in | 1.4.6.1 | Mature | Images down — the site delivers every cover and page through its own server-side proxy (`mangareader.in/imgs/<base64>`), which times out (HTTP 500 `cURL error 28`) when its upstream CDNs (`h2.manimg24.com`, `harimanga.me`) are unreachable. Those origins return Cloudflare 522 directly. Parsing/selectors verified correct (reachable images load fine via the same path); affects all clients, not just Paperback. Will re-test when the image origins recover. |
| MangaReader.site | 1.4.38.1 | Everyone |  |
| Mangasushi | 1.4.58.1 | Everyone |  |
| Mangatellers | 1.4.6.1 | Everyone |  |
| MangaToday | 1.4.38.1 | Mature |  |
| Mangatown | 1.4.10.3 | Mature |  |
| MangaYi | 1.4.2.1 | Everyone |  |
| MangaYY | 1.4.56.1 | Mature |  |
| Manhua Plus | 1.4.62.1 | Everyone |  |
| Manhua Rush | 1.4.2.1 | Everyone |  |
| Manhua Zonghe | 1.4.56.1 | Mature |  |
| ManhuaFast.net (unoriginal) | 1.4.52.2 | Everyone |  |
| ManhuaHot | 1.4.55.1 | Everyone |  |
| Manhuanext | 1.4.56.1 | Everyone |  |
| ManhuaPlus (unoriginal) | 1.4.5.2 | Everyone |  |
| ManhuaTop | 1.4.56.1 | Mature |  |
| ManhuaUS | 1.4.60.1 | Everyone |  |
| Manhwa Comics | 1.4.55.1 | Mature |  |
| Manhwa Reads | 1.4.55.1 | Mature |  |
| Manhwa Toon | 1.4.56.1 | Mature |  |
| Manhwa18 | 1.4.14.2 | Mature |  |
| Manhwa68 | 1.4.58.1 | Mature |  |
| ManhwaBuddy | 1.4.3.2 | Mature |  |
| ManhwaDen | 1.4.55.1 | Mature |  |
| ManhwaGet | 1.4.55.1 | Everyone |  |
| ManhwaHub | 1.4.5.1 | Mature |  |
| Manhwalike | 1.4.3.2 | Mature |  |
| ManhwaManhua | 1.4.55.1 | Mature |  |
| ManhwaNex | 1.4.55.1 | Everyone |  |
| ManhwaRead | 1.4.1.2 | Mature |  |
| Manhwatop | 1.4.57.1 | Mature |  |
| ManhwaZ | 1.4.43.1 | Mature |  |
| ManhwaZone | 1.4.1.2 | Mature |  |
| Megatokyo | 1.4.4.2 | Everyone |  |
| Mehgazone | 1.4.2.2 | Mature |  |
| MeiToon | 1.4.22.1 | Everyone |  |
| Mgread.io | 1.4.3.1 | Mature |  |
| Milftoon | 1.4.57.1 | Mature |  |
| Mist Scans | 1.4.23.1 | Everyone |  |
| MLBB Lore | 1.4.1.2 | Everyone |  |
| Monochrome Custom | 1.4.6.2 | Everyone |  |
| Monochrome Scans | 1.4.5.2 | Everyone |  |
| Multporn | 1.4.6.2 | Mature |  |
| MurimScan | 1.4.50.1 | Mature | Paid (VIP) chapters can’t be opened — they require purchase/login on the site. |
| MyAdultComics | 1.4.1.2 | Mature |  |
| MyHentaiComics | 1.4.4.2 | Mature |  |
| MyHentaiGallery | 1.4.10.2 | Mature |  |
| New Manhwa | 1.4.35.1 | Mature |  |
| NexComic | 1.4.32.3 | Mature |  |
| NineHentai | 1.4.6.2 | Mature |  |
| Ninekon | 1.4.1.2 | Mature |  |
| NixManga | 1.4.2.1 | Mature |  |
| Nuvia Toon | 1.4.2.1 | Everyone |  |
| Nux Scans | 1.4.2.2 | Everyone |  |
| Nyanu Kafe | 1.4.23.1 | Everyone |  |
| Nyra Scans | 1.4.22.1 | Mature |  |
| Nyx Scans | 1.4.31.1 | Everyone |  |
| OctopusManga | 1.4.55.1 | Mature |  |
| Oglaf | 1.4.4.2 | Mature |  |
| Oh Joy Sex Toy | 1.4.3.2 | Mature |  |
| Omega Scans | 1.4.51.1 | Mature |  |
| Omoi | 1.4.2.3 | Mature |  |
| One Punch Man Online | 1.4.2.2 | Everyone |  |
| OneManga.info | 1.4.39.1 | Mature |  |
| Only The Best Hentai | 1.4.1.2 | Mature |  |
| oots | 1.4.3.2 | Everyone |  |
| Oppai Stream | 1.4.5.2 | Mature |  |
| Orchisasia | 1.4.55.1 | Mature |  |
| Orion Scans | 1.4.27.1 | Everyone |  |
| Paradise Scans | 1.4.23.1 | Mature |  |
| Paritehaber | 1.4.56.1 | Mature |  |
| Patch Friday | 1.4.2.2 | Everyone |  |
| Petrotechsociety | 1.4.55.1 | Mature |  |
| Philia Scans | 1.4.59.2 | Everyone |  |
| PornComix | 1.4.49.2 | Mature |  |
| Qi Scans | 1.4.26.2 | Everyone |  |
| Questionable Content | 1.4.10.2 | Everyone |  |
| Rackus | 1.4.39.3 | Everyone |  |
| Rage Scans | 1.4.34.2 | Everyone |  |
| Randowiz | 1.4.2.2 | Everyone |  |
| Raven Scans | 1.4.37.2 | Mature |  |
| Razure | 1.4.32.3 | Everyone |  |
| Read Attack on Titan Shingeki no Kyojin Manga | 1.4.14.2 | Everyone |  |
| Read Berserk Manga | 1.4.9.2 | Everyone |  |
| Read Black Clover Manga Online | 1.4.8.4 | Everyone |  |
| Read Chainsaw Man Manga Online | 1.4.10.2 | Mature |  |
| Read Comics Online | 1.4.15.2 | Everyone |  |
| Read Fairy Tail & Edens Zero Manga Online | 1.4.10.2 | Everyone |  |
| Read Horimiya Online | 1.4.2.1 | Everyone |  |
| Read Jujutsu Kaisen Manga Online | 1.4.10.2 | Everyone |  |
| Read Kingdom Manga Online | 1.4.9.2 | Everyone |  |
| Read Nanatsu no Taizai 7 Deadly Sins Manga Online | 1.4.11.2 | Everyone |  |
| Read One Piece Manga Online | 1.4.9.2 | Everyone |  |
| Read One-Punch Man Manga Online | 1.4.9.2 | Everyone |  |
| Read Solo Leveling Manga Manhwa Online | 1.4.11.2 | Everyone |  |
| Read Tokyo Ghoul Re & Tokyo Ghoul Manga Online | 1.4.12.2 | Everyone |  |
| Read Vagabond Manga | 1.4.1.2 | Everyone |  |
| ReadAllComics | 1.4.8.1 | Everyone |  |
| ReadComicOnline | 1.4.43.13 | Everyone |  |
| Real Life Comics | 1.4.3.2 | Everyone |  |
| ReiManga | 1.4.6.1 | Mature |  |
| Renascans | 1.4.27.1 | Everyone |  |
| Revival Scans | 1.4.1.2 | Mature |  |
| Rinko Comics | 1.4.2.2 | Everyone |  |
| RitharScans | 1.4.27.1 | Everyone |  |
| Rizz Comic | 1.4.46.2 | Everyone |  |
| Rizz Comic (unoriginal) | 1.4.32.3 | Everyone |  |
| RokariComics | 1.4.34.3 | Everyone |  |
| Rolia Scan | 1.4.9.2 | Everyone |  |
| Rose Squad Scans | 1.4.56.1 | Mature |  |
| S2Manga | 1.4.60.1 | Mature |  |
| Sabrina Online | 1.4.2.2 | Everyone |  |
| SACACHISPA | 1.4.2.1 | Mature |  |
| Sana Scans | 1.4.27.1 | Everyone |  |
| Saturday Morning Breakfast Comics | 1.4.2.2 | Everyone |  |
| ScansGG | 1.4.2.1 | Mature |  |
| Schlock Mercenary | 1.4.2.2 | Everyone |  |
| Scythe Scans | 1.4.40.3 | Everyone |  |
| Setsu Scans | 1.4.58.1 | Everyone |  |
| SilentQuill | 1.4.35.1 | Mature |  |
| Siren Scans | 1.4.23.1 | Everyone |  |
| Sleepy Translations | 1.4.56.1 | Everyone |  |
| Solar and Sundry | 1.4.2.2 | Everyone |  |
| Spmanhwa | 1.4.55.1 | Everyone |  |
| SpyFakku | 1.4.16.2 | Mature |  |
| StoneScape | 1.4.50.2 | Everyone |  |
| Sunshine Butterfly Scans | 1.4.39.3 | Mature |  |
| SUPER MEGA | 1.4.4.2 | Everyone |  |
| Swords Comic | 1.4.5.2 | Everyone |  |
| Tapas | 1.4.24.4 | Mature | Locked/paywalled chapters can’t be opened — purchase required. |
| TCB Scans | 1.4.12.2 | Everyone |  |
| Team Shadowi | 1.4.2.1 | Mature |  |
| Temple Scan | 1.4.60.1 | Mature |  |
| The Blank | 1.4.57.2 | Mature |  |
| The Duck Webcomics | 1.4.4.1 | Mature |  |
| The Property of Hate | 1.4.6.1 | Everyone |  |
| Thunderscans | 1.4.33.2 | Everyone |  |
| TimelessToons | 1.4.23.1 | Everyone |  |
| TodayManga | 1.4.4.1 | Mature |  |
| ToonGod | 1.4.60.1 | Mature |  |
| ToonHey | 1.4.2.2 | Mature |  |
| Toonily | 1.4.72.1 | Mature |  |
| Toonily.me | 1.4.4.1 | Mature | Re-platformed upstream — the source moved off MadTheme onto the new shared **MangaK** theme and its domain changed from `toonily.me` to `toontop.io`. Both `toontop.io` and its `api.toontop.io` search endpoint answer every non-browser request with Cloudflare HTTP 403 (`Just a moment…`), so the port can only be exercised through Paperback's Cloudflare bypass on-device. Will re-test once verified on a device. |
| Toonizy | 1.4.56.1 | Mature |  |
| Top Manhua | 1.4.62.1 | Mature |  |
| TopManhua.fan | 1.4.55.1 | Mature |  |
| TopManhua.net | 1.4.55.1 | Mature |  |
| TritiniaScans | 1.4.59.1 | Everyone |  |
| Valir Scans | 1.4.26.1 | Everyone |  |
| Vanilla Scans | 1.4.27.1 | Everyone |  |
| vgperson | 1.4.8.1 | Everyone |  |
| Violet Scans | 1.4.37.3 | Everyone |  |
| Vision Haze | 1.4.1.1 | Everyone |  |
| Vixen Logic | 1.4.1.1 | Mature |  |
| VIZ | 1.4.29.1 | Everyone | Free chapters only; full library is region-gated (US). |
| Vortex Scans | 1.4.89.1 | Everyone |  |
| Voyce.Me | 1.4.7.1 | Everyone |  |
| VyvyManga | 1.4.43.1 | Mature |  |
| War For Rayuba | 1.4.4.1 | Everyone |  |
| Webcomics | 1.4.11.1 | Everyone |  |
| Webdex Scans | 1.4.54.1 | Everyone |  |
| WebNovel | 1.4.14.1 | Everyone |  |
| WebtoonScan | 1.4.55.1 | Mature |  |
| WebtoonXYZ | 1.4.59.1 | Mature |  |
| Weeb Central | 1.4.25.1 | Mature |  |
| WitchScans | 1.4.36.1 | Everyone |  |
| Writer Scans | 1.4.22.1 | Everyone |  |
| WuxiaWorld | 1.4.56.1 | Everyone |  |
| XlecX | 1.4.2.1 | Mature |  |
| XoManga | 1.4.3.1 | Mature |  |
| XOXO Comics | 1.4.14.1 | Everyone | Images unavailable to headless clients — every chapter page image is self-hosted on xoxocomic.com (`/comic/<slug>/<issue>/<id>/<n>.jpg`) but those URLs return HTTP 200 with a ~106 KB HTML "404!" reader page instead of image bytes for any non-browser request (verified across iOS/Googlebot UAs, image-only Accept, with/without referer/cookies). The site gates page images behind JS/Cloudflare/adblock detection, so Paperback can never retrieve them. Affects all headless clients. |
| XYZ Comics | 1.4.7.2 | Mature |  |
| YakshaComics | 1.4.57.1 | Everyone |  |
| YaoiHot | 1.4.2.1 | Mature |  |
| Yaoihub | 1.4.58.1 | Mature |  |
| YaoiScan | 1.4.55.1 | Mature |  |
| Yorai | 1.4.2.1 | Everyone |  |
| Zazamanga | 1.4.56.1 | Mature |  |
| Zinmanga | 1.4.58.1 | Mature |  |
| Zinmanga.net | 1.4.57.1 | Everyone |  |

## Project Layout

```
src/
  <SourceName>/
    main.ts        # source instance (usually a small config one-liner)
    pbconfig.ts    # extension manifest (name, version, content rating, ...)
    static/
      icon.png     # source icon (from the upstream keiyoushi source)
  utils/
    <framework>/   # one folder per shared theme framework
      template.ts       # the shared extension implementation
      settings.ts       # base-URL override state + settings form
      forms.ts          # advanced-search form (when the framework supports it)
    url-builder/
      base.ts           # URL builder helper
      array-query-variant.ts
```

The Paperback bundler only treats a `src/` subfolder as a source when it
contains **both** `main.ts` and `pbconfig.ts`. Everything under `src/utils/` is
shared code and is ignored by the bundler, so a framework can be imported via a
relative path (e.g. `../utils/madara/template`).

### How a source is wired

Each source's `main.ts` is just a small config that instantiates its
framework's extension class:

```ts
import { ContentRating } from "@paperback/types";
import { MadaraExtension } from "../utils/madara/template";

export const ManhuaFast = new MadaraExtension({
  name: "ManhuaFast",
  baseUrl: "https://manhuafast.com",
  mangaSubString: "manga",
  useNewChapterEndpoint: false,
  contentRating: ContentRating.MATURE,
  langCode: "🇬🇧",
});
```

> **Important:** the exported `const` name **must exactly match the folder
> name** (which is the source id). The Paperback loader imports each source via
> a named import — `import { ManhuaFast } from "../ManhuaFast/main.js"` — so a
> mismatch makes the source fail to install.

Per-source options (e.g. `mangaSubString`, `useNewChapterEndpoint`, `apiUrl`,
`pageListSelector`, mirror lists) are ported from each upstream Kotlin source.
The shared template implements popular/latest discovery, search (with sorting +
advanced filters where supported), manga details, chapters, page lists,
lazy-image attribute fallbacks, status normalization, a per-source settings
form, and the Cloudflare challenge interceptor.

### Standalone sources

Many sources aren't built on a shared framework — they have a fully
self-contained `main.ts` that implements the Paperback interfaces directly.
These include the long-standing standalones (**LikeManga**, **Mangago**,
**WeebCentral**, **MangaPill**, **MangaFreak**, **MangaKatana**, **Manga Demon**,
**TCB Scans**, **Flame Comics**, **ReadComicOnline**, **AllManga**, **MangaGeko**,
**Batcave**, **MangaHere**, **AsuraScans**, **ComicK Fanmade**, **VyvyManga**,
**Temple Scan**, **ReadAllComics**, **MangaBolt**, **Manhwa18**, **Oppai Stream**,
**Comivex**, **MangaCloud**, **DFlowScans**, **Paradise Scans**, **ManhwaZ**,
**Manga Drama**, **HentaiSco**,
**Honkai Impact 3rd**, **Clone Manga**, **The Duck Webcomics**, **Oglaf**), the
many **self-contained webcomics** (e.g. Gunnerkrigg Court, Questionable Content,
Schlock Mercenary, El Goonish Shive, Megatokyo, Kill Six Billion Demons,
Darths & Droids, Hiveworks Comics, Cyanide & Happiness, Vixen Logic,
Vision Haze), **HTML/JSON manga &
gallery sites** (e.g. MangaFox, Mangatown, Dynasty, InfinityScans, Vortex Scans,
NineHentai, MyHentaiGallery, Multporn, Doujins), the four single-consumer theme
ports (**Goda**, **The Blank**, **XOXO Comics**, **Rolia Scan**), and the
auth/DRM platforms listed under *Notes & Limitations*. See the **Available
Sources** table above for the full list.

## Building

Requirements: Node.js 20+.

```bash
npm install        # install dependencies
npm run tsc        # typecheck (tsc --noEmit)
npm run bundle     # produce ./bundles
npm run serve      # serve ./bundles locally for testing in the app
```

`npm run bundle` outputs one folder per source under `bundles/`, plus
`versioning.json` (the repository manifest) and `index.html`.

## Deployment

Pushing to the `0.9/stable` branch triggers the
`.github/workflows/bundle-deploy.yaml` GitHub Action, which bundles every source
and publishes `bundles/` to the `gh-pages` branch under `0.9/stable/`. GitHub
Pages then serves it at the install URL above.

## Versioning

Versions use a four-part scheme: **`1.4.<keiyoushi>.<internal>`**.

The first three components mirror the upstream keiyoushi version for each
source, so upstream changes stay detectable:

- **Theme (framework) sources:** `1.4.(baseVersionCode + overrideVersionCode)`,
  where each framework's `baseVersionCode` comes from
  `lib-multisrc/<framework>/build.gradle.kts` and the per-source
  `overrideVersionCode` comes from `src/en/<dir>/build.gradle`.
- **Standalone sources:** `1.4.(extVersionCode)`.

The fourth component is this repo's **internal revision**. Bump it (`.1` →
`.2` → …) whenever a template or a source's config changes **without** a
corresponding upstream change, so the app still surfaces the update to users.

To pick up upstream updates, re-pull the keiyoushi repo and recompute the
first three components for each source. Any source whose recomputed
keiyoushi number is higher than the one published here has changed upstream
and should be reviewed; reset its internal revision to `.1` when you do.

## Notes & Limitations

- Sources are generated from shared framework logic. Standard sites on a given
  framework behave the same way as that framework's reference source.
- The Madara framework now carries per-source override knobs (load-more browsing,
  custom chapter/list/detail/page selectors, `chapterUrlSuffix`,
  `filterNonMangaItems`, etc.) mirroring the upstream keiyoushi subclasses, and
  the ~30 Madara sites with genuinely custom Kotlin logic (e.g. Hiperdex,
  Manga18fx, HentaiRead, Manga District, Firescans' AES chapter
  protector, the year-inference date parsers) are reproduced as small
  `MadaraExtension` subclasses.
- The bespoke standalone (non-framework) keiyoushi **English** sources are now
  ported as well, so essentially the full English catalog (framework-based and
  standalone) is available. Multi-language (`src/all`) sources remain out of
  scope for now.
- **Next.js React-Server-Component (RSC) sites** are read by parsing the flight
  payload rather than the rendered DOM: the chunk/model reference resolver is
  reproduced in TypeScript and reused by **MangaK** (shared theme),
  **InfinityScans**, **J-Novel**, **Temple Scan** and **Valir Scans**. Details
  and page lists come straight out of the payload, and where a site only exposes
  pages through a Next.js *server action* (InfinityScans) the action id is posted
  directly. These ids and the sites' rotating slug hashes are cached in extension
  state and re-derived automatically when a request starts failing.
- The **MangaK** theme fetches its genre list from the site at runtime
  (`api.<host>/genres`) instead of hard-coding it. The list is cached in
  extension state, which is what lets the settings screen render the *Global
  Genre Blacklist* picker; open the browse filters once on a fresh install so the
  cache is populated.
- **DRM page-image decryption is implemented.** A source interceptor's
  `interceptResponse` transforms the raw image `ArrayBuffer`: pixel/cell/tile
  descrambles run in-process on Paperback's polyfilled canvas
  (shared helpers in `src/utils/descramble/canvas.ts`), byte
  ciphers run directly on the `Uint8Array`, and AES/RSA use `window.crypto.subtle`.
  These sources now decode their scrambled / encrypted pages for free or owned
  content: **Mangago** (grid descramble), **Omoi** (Azuki, XOR), **K Manga**
  (cell descramble), **VIZ** (EXIF grid unshuffle), **Comix** (tile descramble +
  byte-XOR), **Coolmic** (PBKDF2 + AES-CBC), **Philia Scans** (AES-CTR/ChaCha20 +
  tile unscramble), **emaqi** (RSA-OAEP + AES-GCM), **Doujin.io - J18**
  (AES-ECB watermark patch composited over the page). HentaiNexus and Sunshine
  Butterfly encrypt only metadata (already handled), not image bytes.
  `Application.executeInWebView` is still used where a source's own JavaScript
  must run (e.g. Mangago's per-image descrambling-key derivation), not for the
  pixel work.
  WebCrypto has no ECB mode, so Doujin.io's AES-ECB layer is emulated with
  zero-IV CBC plus manual un-chaining (verified off-device against Node's
  `aes-128-ecb`/`aes-256-ecb`).
- **Canvas-polyfill caveat for tile remaps.** Paperback's in-process canvas
  polyfill does **not** reliably honour the 9-argument
  `drawImage(src, sx,sy,sw,sh, dx,dy,dw,dh)` source-crop form (the source
  sub-rectangle is ignored), and `getImageData`/`putImageData` apply an
  unreliable Y-axis origin that silently re-scrambles output. Tile cropping must
  therefore use only the 4-argument `drawImage(img, x, y, w, h)` form: draw the
  full image into a tile-sized scratch canvas shifted by `(-srcX0, -srcY0)` so
  only the wanted tile lands in bounds, then draw that scratch 1:1 to the
  destination position. **Comix** uses this technique; the Comix descramble math
  was validated off-device against a real scrambled page (seam-continuity
  reconstruction reproduced the page perfectly), proving the bug was the canvas
  primitive, not the permutation.
- **What still can't be bypassed is payment/login, not decryption.** Chapters a
  site refuses to serve to an anonymous/un-purchased account (most paid content on
  **K Manga**, **VIZ**, **Kodansha**, **Mangamo**, **WebNovel**, **J-Novel**,
  **BookWalker**, **Tapas**, **Coolmic**) return no bytes to decrypt, and
  **Madokami** needs HTTP Basic credentials. **The Blank**'s libsodium
  secretstream image layer (X25519 key-exchange + HMAC-signed URLs +
  XChaCha20-Poly1305 secretstream) is now fully reproduced in the runtime, so its
  images decrypt and render correctly. Browsing, search, details and chapter
  lists work for all of these.
- These extensions are **not affiliated** with the source websites. They only
  scrape publicly available pages.

## Upstream Sync Tracker

<!-- Machine-readable keiyoushi sync state. Format:
     LAST_REVIEWED_COMMIT=<full sha>
     LAST_REVIEWED_DATE=<ISO 8601>
     LAST_APPLIED_COMMIT=<full sha of newest commit that resulted in a code change>
     LAST_APPLIED_PR=<PR number>
     REVIEW_SCOPE=all English sources in our repo (~383 sources)
-->

```
LAST_REVIEWED_COMMIT=2b9ffe569b227f832e1c59bff584cfd6785c69db
LAST_REVIEWED_DATE=2026-10-15
LAST_APPLIED_COMMIT=c9c2a81de124c0d720e8c90b4c621ecb529b1433
LAST_APPLIED_PR=#19961
BASELINE_PORT_DATE=2026-06-20
```

**How to read:** All keiyoushi commits up to and including `LAST_REVIEWED_COMMIT`
have been evaluated against our sources. `LAST_APPLIED_COMMIT` is the newest
upstream commit that produced an actual code change here (the HentaiSco rewrite,
PR #19961). This review covered the 533 upstream commits since `a1a1d8ccf`. Out
of scope as usual: non-English sources, `src/all` sources we do not ship, themes
with no consumer here, and CI/gradle chores. Every changed source was exercised
against its live site (browse → details → chapters → pages → image) unless it is
Cloudflare-gated from outside a device, which is noted below.

**Versions.** 269 sources were bumped. 140 moved to the new keiyoushi
`versionCode`. 126 belong to themes or sources whose upstream count *reset* under
the `libVersion` 1.6 scheme (#18703); as in the previous syncs they keep a
monotonic keiyoushi component and only bump the internal revision.

**Eighteen sources removed** (401 → 383): Firescans, MangaBlaze,
IsekaiScan.top (unoriginal), Manhwa18.org, NovelCrow, Paw Manga, RD Scans,
Shiba Manga, Toon18, Whale Manga, MangaGo.fun and NineAnime (dropped upstream and
confirmed dead); KaliScan, MangaKa, MangaTX and TCB Scans (unoriginal) (dead);
**WoopRead** (removed upstream in #19768 — the site now hosts novels only); and
**CManhua** (re-categorised upstream as Chinese). The `madtheme` framework had
KaliScan as its only consumer and is removed with it. **ManhuaFast (unoriginal)**
and **FlameScans.lol** are kept: both are alive.

**Re-platformed sources** (stored ids are unchanged, so libraries carry over):

- **Temple Scan** (#19430 → #19892). The site now 403s the `rsc: 1` endpoint and
  renames `title`/`series_slug` to short keys that rotate on every rebuild;
  upstream moved to a WebView. We instead read the flight rows embedded in the
  ordinary HTML and identify fields by shape (slugs are lower-case kebab, prices
  are the only non-zero numeric field), with details from the page's
  `ComicSeries` JSON-LD. Request headers are a full navigation/image fingerprint
  without `Origin`. Verified: 297-entry catalog, 130 chapters, pages and images.
- **Paradise Scans**: off Keyoapp onto the site's JSON API.
- **ManhwaZ** (#19523): standalone at `manhwaz.cc`.
- **Manga Drama**: InitManga port with AES-256-CBC page decryption.
- **HentaiSco** (#19961): rewrite for the new site. *Unverified* — Cloudflare
  gated from here.
- **Elf Toon**: now VineTheme. **Luna Toons** and **Siren Scans**: new
  `KeyoappV2` variant (#19781).
- **Mangadotnet** is renamed **MangaDot** and shows its volume count.

**Theme fixes:**

- **VineTheme**: series ids prefer `urlSlug` — requesting a series by `slug`
  returns no payload on Diva Scans.
- **Madara**: relative dates match whole words and treat "a/an" as 1 (#19098);
  recent chapters read their date from the "new" tag's `title` instead of
  parsing the view counter as a year; `nextPageSelector` is configurable.
- **Keyoapp**: relative-date parser rewritten (#19533).
- **MangaHub**: `enc:v1` AES-GCM page lists with the key from
  `/api/chapter-crypto` (#19592). Verified with a local round-trip only.

**Source fixes:**

- **Manga District** (#19171, #19202): chapter dates were parsed as year 0602 and
  the directory never paged (`.wp-pagenavi a.last`).
- **Manhwa18**: the site reverted to the `ul.list-chapters > a` layout and our
  chapter list was empty; both layouts are accepted, as upstream does.
- **Atsumaru** (#19086, #19782): page images now load from the `cdn.` host (the
  main host answers 410), plus *Deduplicate chapters* and *Excluded scanlators*
  settings.
- **XOXO Comics** (#19312): dates with `-`/`.` delimiters or no year.

**Not mirrored / still open:**

- **Comix** received ten upstream fixes in this window (rotate-captcha solving,
  chapter lists through the site's API, `xrt`). It is Cloudflare gated from here,
  so it is version-aligned but not re-ported; it needs an on-device pass.
- **HentaiRead** went standalone upstream; Cloudflare gated from here, so our
  Madara port is kept.
- **Kodoku Studio** and **Manhuarm** left Madara upstream; we do not ship them.
- **Manhwa18.cc** (#19896) is not shipped here. MangaNow and MangaReader 1.6
  (#19186) have no behavioural delta; MangaNow was re-verified live.

To check for new upstream changes, compare `LAST_REVIEWED_COMMIT` against
`https://github.com/keiyoushi/extensions-source/commits/main`.

## Credits

- [Paperback](https://github.com/Paperback-iOS/app) for the app and extension SDK.
- [keiyoushi/extensions-source](https://github.com/keiyoushi/extensions-source)
  for the original Tachiyomi sources and icons.
- The **keiyoushi extension developers and contributors**, whose original work
  every source in this repository is ported from. All credit for the source
  logic, scraping, and decryption belongs to them — this repository only adapts
  their extensions to the Paperback runtime. See the
  [keiyoushi contributors](https://github.com/keiyoushi/extensions-source/graphs/contributors)
  for the full list of authors.

