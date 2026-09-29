# TC SOA Studio

**Describe your Teamcenter program in plain English; get the Java.**

TC SOA Studio is a free Windows desktop app for engineers who write programs against the
**Siemens Teamcenter SOA API**. Type what the program should do, for example:

> *Check out an object, change a property, then check it in*

and the app picks the right Teamcenter operations from **your own** API catalog, checks
them, and writes a complete Java client program (login → calls in order → logout) with
your values filled in.

- **Private by design:** the AI runs locally on your PC via [Ollama](https://ollama.com).
  Nothing is sent to the internet ([PRIVACY.md](PRIVACY.md)).
- **Grounded:** the AI can only use operations that exist in your catalog; a built-in
  "recipe book" covers common Teamcenter tasks (BOM edits, check-out/in, workflows,
  saved queries, where-used, file upload/download, …).
- **Handy code viewer:** syntax highlighting, click line numbers to select, copy selection
  or all, search, `TODO` markers for values you still need to fill in.

*Works with Siemens Teamcenter. Not affiliated with or endorsed by Siemens.
Teamcenter is a trademark of Siemens.*

---

## What you need

1. **Windows 10/11** (8 GB RAM is enough).
2. **Ollama**: install from [ollama.com](https://ollama.com). The AI model (about 1 GB)
   is downloaded once: the app shows a **Download AI model** button with progress, or run
   `ollama pull qwen2.5-coder:1.5b` yourself.
3. **Your Teamcenter API catalog (`structure.js`)**: the data file behind the Teamcenter
   Services API reference that comes with your Teamcenter documentation. You must be licensed
   to use it; the app does **not** include any Siemens data. See [FINDINGS.md](FINDINGS.md)
   for what this file is.

## Install

There are two ways to install. Both need **Ollama** and your **catalog file** (see
[What you need](#what-you-need) above).

### Method 1 — Installer (easiest)

1. Open the [**Releases**](https://github.com/AICode96665-sys/AIPLM/releases) page.
2. Under the latest release, download **`TC SOA Studio Setup <version>.exe`**.
3. Double-click it and follow the steps (you can choose the install folder).
4. Start **TC SOA Studio** from the desktop or Start menu shortcut.

> **Note:** the installer is **not code-signed yet**. Windows SmartScreen may warn: click
> **More info → Run anyway**. On Windows 11 PCs with **Smart App Control** turned on,
> Windows blocks unsigned apps completely. In that case use **Method 2**.

### Method 2 — Clone (or download) and run `start.bat`

Needs **[Node.js](https://nodejs.org) 22 LTS** (or 20.19 or newer). Install it once; the
defaults are fine.

1. **Get the code**, either way:
   - with Git:
     ```bash
     git clone https://github.com/AICode96665-sys/AIPLM.git
     ```
   - or without Git: on this page click **Code → Download ZIP**, then right-click the ZIP →
     **Extract All…**
2. **Open the folder** `AIPLM` (for the ZIP: `AIPLM-main`) in File Explorer.
3. **Double-click `start.bat`.**

`start.bat` does everything for you:

| Step | What it does |
|---|---|
| 1 | Checks that Node.js is installed and new enough |
| 2 | **Ollama not installed?** Asks *"Install Ollama now?"*. **Y** installs it with Windows' `winget` (or opens ollama.com if winget isn't available); **N** continues, and the app shows setup help |
| 3 | **Ollama installed but not running?** Starts it automatically |
| 4 | **AI model missing?** Asks *"Download it now?"* (about 1 GB, once). **N** is fine: the app has a **Download AI model** button |
| 5 | First run only: installs the app's components (a few minutes) and Electron |
| 6 | Builds the app and opens **TC SOA Studio** |

Next time, just double-click `start.bat` again; it starts in seconds. Keep the black window
open while you use the app (closing it closes the app).

> **ZIP download:** Windows marks files from the internet, so it may ask before running
> `start.bat`. Click **More info → Run anyway** (or right-click the ZIP → **Properties** →
> tick **Unblock** before extracting). The `git clone` way doesn't have this prompt.

<details>
<summary>Developers: the same from a terminal</summary>

```bash
git clone https://github.com/AICode96665-sys/AIPLM.git
cd AIPLM
npm install
npm start        # build and run (production mode)
npm run dev      # or: development mode with hot reload and DevTools
```
</details>

## Update

- **Method 1:** download and run the newer installer from the Releases page.
- **Method 2:** `git pull` in the folder (or download the ZIP again), then run `start.bat`.

## Use

1. **Load your catalog:** on first start, pick your `structure.js` (file or path). It is
   remembered for next time (**Change catalog** to switch).
2. **Ask:** type what the program should do and press Enter. Up to **3 steps** per request,
   e.g. *"Create an item named Bracket, then get its properties"*. Split bigger jobs into
   several requests.
3. **Check the steps** in the chat. Click an operation name to see its description and full
   request/response structure.
4. **Copy the Java** on the right. Values from your request are marked
   `// from your request`; fill in the `// TODO` values and verify class/package names
   against your Teamcenter SDK.

The generated code is a starting point for an engineer to review, not a finished program.

## For developers

```bash
npm run dev            # run in development mode (DevTools available)
npm run build          # production build → out/
npm run dist           # Windows installer → dist/
npm run typecheck      # type-check everything
npm run check:recipes  # 63 fast recipe-matching checks (no AI needed)
npm run eval -- --models qwen2.5-coder:1.5b --only Basic,Medium   # AI test suite (needs Ollama + a catalog)
```

- How it works inside (AI pipeline, recipe book, code generator, tests):
  [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)
- Test results: [eval/RESULTS.md](eval/RESULTS.md)
- Release steps and security checks: [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)

### Project layout

```
src/
  main/        Electron main process: catalog loading, AI pipeline, Java generation, hardening
  preload/     Safe bridge between the UI and the main process (window.tc)
  shared/      Catalog parser, AI pipeline (retrieve, recipes, planner), Java generator
  renderer/    React UI: AI chat, Java viewer (CodeMirror), catalog loader
eval/          AI test suite (80 requests) and recipe checks
```

Contributions are welcome: please run `npm run typecheck` and `npm run check:recipes`
before opening a pull request, and write recipes and tests in your own words (never copy
Siemens documentation or sample code).

## License

[MIT](LICENSE) © 2026 Quick Sense Innovations. Third-party components:
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
