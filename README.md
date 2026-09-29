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
2. **Ollama**: install from [ollama.com](https://ollama.com), then download the AI model
   (about 1 GB) once:
   ```bash
   ollama pull qwen2.5-coder:1.5b
   ```
3. **Your Teamcenter API catalog (`structure.js`)**: the data file behind the Teamcenter
   Services API reference that comes with your Teamcenter documentation. You must be licensed
   to use it; the app does **not** include any Siemens data. See [FINDINGS.md](FINDINGS.md)
   for what this file is.

## Install

### Option A — installer (no developer tools needed)

Download `TC SOA Studio Setup <version>.exe` from the
[Releases](https://github.com/AICode96665-sys/AIPLM/releases) page and run it.

> **Note:** the installer is **not code-signed yet**. Windows SmartScreen may warn (click
> **More info → Run anyway**), and on Windows 11 PCs with **Smart App Control** turned on,
> Windows blocks unsigned apps completely. In that case use Option B until signed releases
> are available.

### Option B — from source

Requires [Node.js](https://nodejs.org) 20 or newer.

```bash
git clone https://github.com/AICode96665-sys/AIPLM.git
cd AIPLM
npm install
npm run dev
```

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
