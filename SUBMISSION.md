# Submitting Ambient Director to the Obsidian community plugin directory

This is the owner's manual checklist for getting this plugin into Obsidian's community
directory. Everything here is a **human step** — the accompanying PR only *prepares* the plugin
(manifest, licence, release scaffolding); it does not create any external repo, release, tag, or
submission.

> **Read this first — the process changed on 2026-05-15.** Obsidian **retired the old
> "open a pull request against `obsidianmd/obsidian-releases` and edit `community-plugins.json`"
> flow.** The PR templates and the validation bot were removed
> ([`obsidianmd/obsidian-releases@d4f069442`](https://github.com/obsidianmd/obsidian-releases/commit/d4f069442),
> "remove PR templates & validation actions"). Today you **submit through a web form at
> [community.obsidian.md](https://community.obsidian.md)**, and `community-plugins.json` is now a
> read-only mirror maintained hourly by "Obsidian Bot". Do **not** fork the releases repo or open a
> PR against it — it will be ignored. The exact entry JSON and the checklist below are still useful
> (the automated review enforces the same rules), so they're preserved further down, clearly labelled.
>
> Sources (verified 2026-07-18): the current
> [Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin) doc describes
> only the web form; the plugin PR template now 404s; the only workflows left in `obsidian-releases`
> are `mirror-community-json.yml` and `plugin-stat.yml`.

---

## 0. Confirmed identity (already final)

| Field | Value |
| --- | --- |
| `id` | `ambient-director` — **unique**, not present in `community-plugins.json` (checked against all 5,802 entries; nearest is `rpg-manager`/`RPG Manager`, distinct) |
| `name` | `Ambient Director` — unique, no `obsidian`, doesn't end in `plugin` |
| `version` | `0.1.0` |
| `minAppVersion` | `1.4.0` |
| `author` | `Vegolas` |
| `authorUrl` | `https://github.com/Vegolas` (the **profile**, not the plugin repo — the automated review errors if `authorUrl` points at the plugin's own repo) |

---

## 1. Split the plugin into its own GitHub repo (history preserved)

Obsidian requires a **dedicated public repo per plugin**, with `manifest.json` at the repo **root**.
Use `git subtree split` so the plugin keeps its own commit history.

Suggested repo name: **`obsidian-ambient-director`** (the `obsidian-` prefix is the usual convention for
the standalone repo — it's allowed in the *repo* name; only the `id` and `name` may not contain
"obsidian"). Full slug: `Vegolas/obsidian-ambient-director`.

```bash
# From the monorepo root, on an up-to-date main:
git checkout main && git pull

# 1) Carve integrations/obsidian into a branch whose ROOT is the plugin (history preserved).
git subtree split --prefix=integrations/obsidian -b obsidian-split

# 2) Create the empty public repo (no auto-init README/licence/gitignore — avoids a merge conflict).
gh repo create Vegolas/obsidian-ambient-director --public \
  --description "Trigger Ambient Director scenes, events and sounds from your Obsidian notes."

# 3) Push the split branch as the new repo's main.
git push git@github.com:Vegolas/obsidian-ambient-director.git obsidian-split:main

# 4) Tidy up locally.
git branch -D obsidian-split
```

After the split, in the new repo the plugin files sit at the root: `manifest.json`, `versions.json`,
`package.json`, `package-lock.json`, `styles.css`, `LICENSE`, `README.md`, `src/`,
`esbuild.config.mjs`, `tsconfig.json`, `version-bump.mjs`, `.gitignore`.

Notes on what is / isn't in the new repo:
- **`package-lock.json` MUST be committed** — the release workflow's `npm ci` refuses to run without a
  lockfile (`EUSAGE: The npm ci command can only install with an existing package-lock.json`). It used
  to be gitignored here, which made a split repo fail its first release; the ignore was removed and the
  lockfile is tracked now. If your split predates that fix: delete the `package-lock.json` line from the
  new repo's `.gitignore`, copy the lockfile from the monorepo, commit, then re-push the release tag
  (`git push --delete origin 0.1.0 && git push origin 0.1.0` after re-tagging the new commit).
- **`main.js` is not committed** — `.gitignore` (carried over) ignores it. Obsidian downloads it from
  the **release**, not the repo; the release workflow rebuilds it. (Same in this monorepo: `main.js`
  is gitignored and never committed here either.)
- **`node_modules/` is not committed** — never was.
- **Wire up the release workflow** (it's shipped here as a `.template` so the monorepo's CI ignores it):

  ```bash
  git clone git@github.com:Vegolas/obsidian-ambient-director.git
  cd obsidian-ambient-director
  mkdir -p .github/workflows
  git mv release-workflow.yml.template .github/workflows/release.yml
  # Delete the "TEMPLATE — move to ..." comment block at the top of the file.
  git add -A && git commit -m "Add release workflow"
  git push
  ```
  Then in the repo: **Settings → Actions → General → Workflow permissions → Read and write** (the
  workflow also sets `permissions: contents: write` at job level, but flip the repo setting too so
  `gh release create` can attach assets).
- **Fix the README for the standalone repo** (it currently targets the monorepo):
  - `[Ambient Director](../../README.md)` → `https://github.com/Vegolas/ambient-director`
  - `[installed PWA](../../README.md#using-it-from-an-ipad-or-any-tabletphone)` →
    `https://github.com/Vegolas/ambient-director#using-it-from-an-ipad-or-any-tabletphone`
  - Replace the "Install" section (currently "isn't in the community store — build and drop it in")
    with "Install from **Settings → Community plugins → Browse → Ambient Director**" once accepted;
    keep the manual build steps as a "from source" fallback.
- **Enable Issues** on the new repo (Settings → General → Features → Issues) — the automated review
  errors if the repo has no issue tracker.

---

## 2. Post-split sync strategy (recommended)

**Keep the monorepo (`integrations/obsidian`) as the single source of truth; treat the dedicated repo
as a regenerable publish mirror.** Develop here, merge to monorepo `main` as usual, then push a
snapshot to the mirror when you want to cut a release.

```bash
# Sync new plugin commits from the monorepo into the mirror:
git subtree push --prefix=integrations/obsidian git@github.com:Vegolas/obsidian-ambient-director.git main

# If subtree push ever refuses to fast-forward (e.g. after a commit made directly in the mirror,
# like the workflow move above), just re-split and force-push — the mirror is disposable:
git subtree split --prefix=integrations/obsidian -b obsidian-split
git push --force git@github.com:Vegolas/obsidian-ambient-director.git obsidian-split:main
git branch -D obsidian-split
```

**Why this model (and why it's the cheapest to change later):** Obsidian only needs the mirror for two
things — the `manifest.json` at the HEAD of the default branch (used for discovery + latest-version
lookup) and **tagged GitHub releases with the built assets**. It does *not* need rich history. So the
mirror is disposable: you can regenerate it from scratch at any time. Keeping all authoring in the
monorepo avoids double-maintenance and keeps CI, issues and the rest of the app together. If you later
decide to promote the standalone repo to the working copy, you just start committing there and stop
syncing — there's no data to migrate.

**Pro tip to keep `subtree push` conflict-free forever:** the one thing that lives *only* in the mirror
is `.github/workflows/release.yml`, and that's what forces the occasional force-push. You can avoid it
by keeping the workflow in the monorepo at
`integrations/obsidian/.github/workflows/release.yml` instead of as a `.template`: GitHub only runs
workflows found at the *repo root's* `.github/workflows/`, so it stays dormant in the monorepo, but
after `git subtree split --prefix=integrations/obsidian` it lands at the mirror's root where it *does*
run. Then every file flows one-way (monorepo → mirror) and `subtree push` never diverges. This PR keeps
the `.template` form because that's the explicit, low-surprise default; switch to the in-tree path if
the force-push dance annoys you.

---

## 3. Manual pre-submission verification in a real vault

**There is no Obsidian in the build environment**, so this is the first time the plugin runs in a real
Obsidian. Do this before submitting.

```bash
# In a clone of the dedicated repo (or in integrations/obsidian):
npm ci
npm run build            # produces main.js
```

Copy `main.js`, `manifest.json`, `styles.css` into `<vault>/.obsidian/plugins/ambient-director/`, then
enable **Ambient Director** under *Settings → Community plugins*. Point *Settings → Ambient Director →
Server address* at a running Ambient Director server. Then exercise:

- **Reading view** — a note containing `` `sm:scene:<id>` ``, `` `sm:event:<id>` ``, `` `sm:sound:<id>` ``,
  `` `sm:music:<uri>` ``, `` `sm:lights:reset` `` renders each as a chip; clicking fires and shows a toast.
- **Live Preview (CodeMirror 6) — the KNOWN UNTESTED RISK.** `src/livepreview.ts` has never run in a
  real Obsidian. Verify carefully: typing a token shows it as an editable code span while the caret is
  inside it, and it collapses to a clickable chip when the caret moves out; clicking the chip fires;
  editing around it doesn't corrupt the document or throw. Watch the console while doing this.
- **Settings tab** — Server address, API key (masked field), Button style dropdown (chip/banner),
  Show tile art toggle, Highlight what's live toggle, and the **Test** button (reports connected /
  not connected).
- **Commands** — "Open control panel" (both the ribbon dice icon and the command palette) opens the
  embedded panel pane; "Refresh scene / event / sound lists" shows its toast.
- **Autocomplete** — `sm:` suggests the kinds; `sm:scene:` suggests real scene ids (with art/emoji).
- **Server unreachable / wrong address** — chips still render (best-guess label); clicking shows a
  failure Notice rather than crashing; Test connection reports failure; an unknown id renders with a
  dashed outline. **No uncaught exceptions in the developer console** (Ctrl/Cmd+Shift+I).
- **Mobile (iPad), if available** — inline chips, autocomplete and firing should work; the embedded
  control-panel pane uses an `<iframe>` and may be blocked for a remote LAN-IP http server (documented
  limitation — "Open in browser" / PWA is the fallback).

The automated review and the guidelines both expect a **clean developer console** — no debug chatter,
only genuine errors.

---

## 4. Create the GitHub release (tag `0.1.0`)

Obsidian downloads the plugin from a **GitHub release whose tag equals `manifest.json` `version`
EXACTLY, with no leading `v`** (tag `0.1.0`, never `v0.1.0`).

**Option A — via the release workflow (recommended once wired up in step 1):**

```bash
# In a clone of the dedicated repo, on main with 0.1.0 already in manifest.json:
git tag -a 0.1.0 -m "0.1.0"
git push origin 0.1.0
```

The workflow builds and creates a **draft** release with the three assets attached. Then **Releases →
edit the draft → Publish** — the directory can only fetch assets from a *published* release.

> **Trap — two releases on one tag (bit us on 2026-07-19):** if you hand-create a release in the GitHub
> UI (or a workflow run fails and you retry), you can end up with BOTH an empty *published* release and
> the workflow's asset-carrying *draft* on tag `0.1.0`. The Obsidian bot only sees published releases,
> so it reports "release 0.1.0 is missing the main.js file" even though the draft has everything.
> Fix: list them (`gh api repos/<owner>/<repo>/releases -q '.[] | "\(.id) draft=\(.draft)
> assets=\(.assets|length)"'`), DELETE the empty published one by id (`gh api -X DELETE
> repos/<owner>/<repo>/releases/<id>` — the git tag survives), then publish the draft
> (`gh api -X PATCH repos/<owner>/<repo>/releases/<draft-id> -F draft=false -f tag_name=0.1.0`),
> and re-request the review. Never fix it by committing `main.js` — the review rejects that.

**Option B — by hand (no workflow):**

```bash
npm ci && npm run build
gh release create 0.1.0 --title 0.1.0 --generate-notes main.js manifest.json styles.css
```

Either way, confirm the published release lists **`main.js`, `manifest.json`, `styles.css` as
individual binary assets** (not only the auto-generated `Source code (zip/tar.gz)`).

**Bumping the version for later releases:** run `npm version patch|minor|major` in the plugin
(`version-bump.mjs` is wired to the `version` script — it updates `manifest.json` and appends to
`versions.json`, and stages them). To avoid polluting monorepo tags when bumping from the monorepo, use
`npm version <x.y.z> --no-git-tag-version` there and create the actual `x.y.z` tag in the mirror.

---

## 5. Submit through the web directory (current flow)

Per the current [Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin) doc:

1. Go to **[community.obsidian.md](https://community.obsidian.md)** and sign in with your Obsidian
   account.
2. **Link your GitHub account** to your profile.
3. Sidebar → **Plugins** → **New plugin**.
4. Enter the repo URL: `https://github.com/Vegolas/obsidian-ambient-director`.
5. Review and **agree to the Developer policies**, and confirm you'll continue to support the plugin.
6. **Submit.**

The directory reads `manifest.json` at the HEAD of the default branch, then runs an **automated
review**. Your plugin is **not installable from within Obsidian until that review passes**.

### For reference — the directory entry (you no longer submit this by hand)

Under the retired PR flow you would have appended this object to the end of `community-plugins.json`.
Today the web directory generates it and "Obsidian Bot" mirrors it into that file. It's here so you can
sanity-check what will be published — note `id`, `name` and `description` must match `manifest.json`
exactly:

```json
{
    "id": "ambient-director",
    "name": "Ambient Director",
    "author": "Vegolas",
    "description": "Trigger Ambient Director scenes, events and sounds from your notes with inline buttons.",
    "repo": "Vegolas/obsidian-ambient-director"
}
```

### Pre-submission self-review checklist

This mirrors the checklist Obsidian used to require in the (now-removed) plugin PR template. Every item
still maps to something the automated review checks — walk it before submitting:

- [ ] Tested on the platforms you support (Windows / macOS / Linux; iOS / Android if applicable) — see §3.
- [ ] The GitHub release contains **`main.js` + `manifest.json`** (and `styles.css`) as **individual
      files**, not only inside `source.zip` / `source.tar.gz`.
- [ ] The release **tag equals the `manifest.json` version exactly — no `v` prefix** (`0.1.0`).
- [ ] `manifest.json` `id` / `name` / `description` match the directory entry.
- [ ] `manifest.json` contains only allowed keys: `id`, `name`, `version`, `minAppVersion`,
      `description`, `author`, `isDesktopOnly` (+ optional `authorUrl`, `fundingUrl`, `helpUrl`). ✔ (this
      manifest has exactly these, with `authorUrl` and no `fundingUrl`.)
- [ ] `README.md` describes the plugin's purpose and usage. (Apply the README fixes from §1.)
- [ ] `LICENSE` present. ✔ (MIT, added in this PR.)
- [ ] Read the [Developer policies](https://docs.obsidian.md/Developer+policies) and the
      [Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines); self-reviewed.
- [ ] Any third-party code is attributed and licence-compatible. (None vendored here.)
- [ ] The repo has **Issues enabled**.

### What the automated review checks

(From the removed `validate-plugin-entry.yml` bot — the same rules now run server-side and are the best
available spec. Verified 2026-07-18.)

- **`id`**: matches `^[a-z0-9-_]+$`, doesn't contain `obsidian`, doesn't end with `plugin`, is unique,
  and isn't a previously-removed id. → `ambient-director` passes.
- **`name`**: doesn't contain `obsidian`, doesn't end with `plugin`, doesn't start `Obsi` / end `dian`,
  is unique. → `Ambient Director` passes.
- **`description`**: ≤ 250 chars, ends with `.`/`?`/`!`/`)`, doesn't contain `obsidian`, avoids
  "this is a plugin"/"this plugin allows", no emoji. → passes.
- **`manifest.json`** (fetched from the repo root): parseable; has all required keys; no *disallowed*
  keys; `id`/`name`/`description` match the directory entry; `version` matches `^[0-9.]+$` (no `v`);
  **`authorUrl` must not equal `https://obsidian.md` and must not point at the plugin's own repo**;
  `fundingUrl` (if present) must be a real donation link, never empty. → passes (`authorUrl` is the
  profile; no `fundingUrl`).
- **Repo**: `repo` is `owner/name`; the repo is reachable; **has a LICENSE**; Issues enabled (warning if
  not); the submitting account owns the repo.
- **Release**: a release tagged exactly `= manifest.version` exists and carries `main.js` +
  `manifest.json` as individual assets.

### Review-feedback loop

- The review is automated; the **directory web UI shows guidance** for anything to correct.
- To address feedback: **update the repo and publish a new GitHub release with an incremented version**
  (e.g. `0.1.1`) — then the directory re-checks. Don't open duplicate submissions.
- Manual staff code-review is now optional/deferred (many plugins are admitted automatically and shown
  as "not manually reviewed by Obsidian staff"), so the automated checks above are the gate that
  matters for getting listed.
- **One warning is skipped on purpose:** the reviewer suggests implementing `getSettingDefinitions()`
  (declarative settings, searchable in Obsidian ≥1.13). Adopting it means *using a 1.13 API*, which
  either re-triggers the "APIs newer than minAppVersion" **error** or forces `minAppVersion` up to
  `1.13.0`, dropping older installs. Deliberately deferred: revisit in a later release once a 1.13+
  floor is acceptable, bumping `minAppVersion` and the pinned `obsidian` typings together.

---

## 6. Known open risks to watch after listing

- **Live-Preview (CM6) path** (`src/livepreview.ts`) is the untested code path — smoke-test it in a real
  vault (§3) before and after listing; most bug reports are likely to land here.
- **Inline styles** in `src/panelview.ts` (the embedded-panel layout, set via JS as belt-and-suspenders
  against a stale `styles.css`) and the dynamic banner background-image in `src/chip.ts` are not flagged
  by the automated review, but a *manual* reviewer could suggest moving them to CSS classes / CSS
  custom properties. Left as-is here to keep behaviour identical; convert if a reviewer asks.
- **The embedded control-panel `<iframe>`** may be blocked by mixed-content policy for a remote LAN-IP
  http server (documented in the README); this is expected behaviour, not a bug.
