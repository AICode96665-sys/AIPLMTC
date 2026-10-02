# TC SOA Studio

**AI coding assistant for Teamcenter SOA.**
Describe your Teamcenter program in plain English; get the Java.

## How it works

1. **Load your API catalog:** pick the `structure.js` from your own Teamcenter
   documentation, once. The app remembers it.
2. **Describe the job:** e.g. *"Create an item, check it out, set its description, then check
   it in"*. Add to it with follow-ups such as *"then …"* or *"after check out, …"*.
3. **Get the Java:** the steps appear in the chat and a complete Java program on the right,
   with your values filled in. Copy it into your project.

Everything runs on your PC; nothing is sent to the internet.

**What the AI does, and what it doesn't.** A small AI model (running locally) does two
narrow jobs: it *understands* your request (splits it into steps, picks out names and values)
and, when several operations fit a step, *chooses* among real ones from your catalog. Everything
that must be exact is ordinary code: the built-in recipe book, the catalog search, a check that
overrules weak AI picks, connecting the steps, and writing the Java. So the AI can never invent
an operation that isn't in your catalog.

---

TC SOA Studio is a free Windows desktop app for engineers who write programs against the
**Siemens Teamcenter SOA API**. Type what the program should do, for example:

> *Check out an object, change a property, then check it in*

and the app picks the right Teamcenter operations from **your own** API catalog, checks
them, and writes a complete Java client program (login → calls in order → logout) with
your values filled in.

- **Private by design:** the AI runs locally on your PC via [Ollama](https://ollama.com).
  Nothing is sent to the internet.
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
2. **Ollama** (free), which runs the AI on your PC: install from [ollama.com](https://ollama.com)
   (or use Method 2: its `start.bat` brings its own portable copy). You don't need to do anything else: the app
   **starts Ollama automatically** and **downloads the AI model automatically** the first time
   (about 1 GB, once, with a progress bar and Cancel).
3. **Your Teamcenter API catalog (`structure.js`)**: the data file behind the Teamcenter
   Services API reference that comes with your Teamcenter documentation. You must be licensed
   to use it; the app does **not** include any Siemens data.

## Install

There are two ways to install. Both need **Ollama** and your **catalog file** (see
[What you need](#what-you-need) above).

### Method 1 — Installer (easiest)

1. Open the [**Releases**](https://github.com/AICode96665-sys/AIPLMTC/releases) page.
2. Under the latest release, download **`TC.SOA.Studio.Setup.<version>.exe`** (e.g.
   `TC.SOA.Studio.Setup.0.2.0.exe`; GitHub shows dots instead of spaces in the name).
3. Double-click it and follow the steps (you can choose the install folder).
4. Start **TC SOA Studio** from the desktop or Start menu shortcut.

> **Note:** the installer is **not code-signed yet**. Windows SmartScreen may warn: click
> **More info → Run anyway**. On Windows 11 PCs with **Smart App Control** turned on,
> Windows blocks unsigned apps completely. In that case use **Method 2**.

### Method 2 — Clone (or download) and double-click `start.bat`

**Nothing to install first, and nothing gets installed on your system.** Node.js comes with
the code (`bundled\`); `start.bat` downloads Ollama and the AI model, keeps everything in a
`runtime` folder next to it, and uses only those.

1. **Get the code**, either way:
   - with Git:
     ```bash
     git clone https://github.com/AICode96665-sys/AIPLMTC.git
     ```
   - or without Git: on this page click **Code → Download ZIP**, then right-click the ZIP →
     **Extract All…**
2. **Open the folder** `AIPLMTC` (for the ZIP: `AIPLMTC-main`) in File Explorer.
3. **Double-click `start.bat`.**

| Step | What it does |
|---|---|
| 1/5 | **Node.js 22.23.3** (portable, included in `bundled\`) → unpacked to `runtime\node` |
| 2/5 | **Ollama 0.34.4** (portable, runs the AI on your PC) → `runtime\ollama`, started on its own port **11435** |
| 3/5 | **AI model** `qwen2.5-coder:1.5b` → `runtime\models` |
| 4/5 | **App components** and Electron → `node_modules` (npm/Electron caches in `runtime`) |
| 5/5 | Builds and opens **TC SOA Studio** |

Each piece is downloaded only the first time; after that the app opens in seconds.

- **Your own Node.js or Ollama are never used or changed.** No admin rights, no installers,
  no PATH or system changes. A Node.js or Ollama you already have keeps working as before
  (our Ollama uses port 11435, the normal one uses 11434).
- **Checked files:** the included Node.js (the official nodejs.org archive) and the Ollama
  download (official GitHub release) are pinned versions verified against their SHA-256
  checksums; a damaged or altered file is not used. Interrupted downloads resume.
- **To remove everything:** delete the `AIPLMTC` folder (or just its `runtime` folder).

**You need:** Windows 10 (version 1803 or newer) or Windows 11, an internet connection for the
first run, and about **6 GB** of free disk space (checked automatically; the first run
downloads about 2.4 GB). Keep the black window open while you use the app; when you close the
app, `start.bat` stops its Ollama again.

> **ZIP download:** Windows marks files from the internet, so it may ask before running
> `start.bat`. Click **More info → Run anyway** (or right-click the ZIP → **Properties** →
> tick **Unblock** before extracting). The `git clone` way doesn't have this prompt.

<details>
<summary>Developers: the same from a terminal</summary>

```bash
git clone https://github.com/AICode96665-sys/AIPLMTC.git
cd AIPLMTC
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
   e.g. *"Create an item named Bracket, then get its properties"*. To add to the same
   program, just continue: *"then check it in"*, *"check out this object"*. A flow can grow
   to **6 steps**. A request that doesn't point back ("Delete a dataset") starts a new program.
3. **Check the steps** in the chat. Click an operation name to see its description and full
   request/response structure.
4. **Copy the Java** on the right. Values from your request are marked
   `// from your request`; fill in the `// TODO` values and verify class/package names
   against your Teamcenter SDK.

The generated code is a starting point for an engineer to review, not a finished program.

## License

[MIT](LICENSE) © 2026 AICode96665-sys. The installer includes the license notices of the
open-source components it uses.
