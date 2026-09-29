# Changelog

## v0.1.2 (2026-09-29)

Recipe book protection and cleanup. Same features as v0.1.1.

- The recipe book is now stored encrypted (AES-256-GCM) and decrypted in memory by the
  app, so it is not readable on GitHub or inside the installed app.
- Removed unused code (model picker, old screens' styles, duplicate types); smaller and
  simpler, with no change in behaviour.

**Download:** `TC SOA Studio Setup 0.1.2.exe`
SHA-256: `58D4C29E9A5FDBE1F5B50154705A9114BC1A67110358A29F7C6CEC47881950DE`

*Works with Siemens Teamcenter. Not affiliated with or endorsed by Siemens.*

## v0.1.1 (2026-09-29)

Easier setup: the app now gets its AI ready by itself.

- **Automatic setup:** the app starts Ollama if it is installed but not running, and
  downloads the AI model automatically when it is missing (progress bar + Cancel).
  `start.bat` downloads the model without asking and installs Ollama after a 10-second
  countdown (press N to skip).
- **Download AI model** button in the app: asks the local Ollama to download the model
  (about 1 GB, once) with a progress bar and Cancel; no terminal command needed.
- Install method 2: `start.bat` — clone (or download the ZIP), then double-click to check
  Node.js and Ollama, install components, and start the app.
- `npm install` now always downloads Electron (some npm versions skip its install step).

**Download:** `TC SOA Studio Setup 0.1.1.exe`
SHA-256: `9BEFEB2F8CBC2C98102BE85BB30CA851AEBF85A43B3944DA10A5C858FCAA29DA`

*Works with Siemens Teamcenter. Not affiliated with or endorsed by Siemens.*

## v0.1.0 — first public release (2026-09-29)

Describe your Teamcenter SOA program in plain English and get the Java — with a local AI
that runs on your own PC.

**Features**
- AI chat that turns a request (up to 3 steps) into a validated flow of Teamcenter SOA
  operations from **your own** API catalog (`structure.js`), then generates a Java client
  program (login → calls → logout) with your values filled in.
- Built-in recipe book (31 recipes): items & properties, check out/in, relations, folders,
  projects, BOM structure edits, where-used, saved queries, workflows, release status,
  change items, file upload/download.
- Works with plain English, typos and Hinglish; off-topic requests are rejected.
- Click any step to see the operation's description and full request/response structure.
- Java viewer: syntax highlighting, line selection, copy selection/all, search,
  `TODO` and "from your request" markers.

**Requirements**
- Windows 10/11, [Ollama](https://ollama.com), and the model: `ollama pull qwen2.5-coder:1.5b`
- Your licensed Teamcenter API catalog (`structure.js`); no Siemens data is included.

**Privacy & security**
- Nothing leaves your PC: no server, no accounts, no telemetry, local AI only (see PRIVACY.md).
- Sandboxed UI, no DevTools, all browser permissions denied, Electron security fuses,
  app integrity check (a modified app refuses to start).

**Known limitations**
- The installer is **not code-signed yet**: SmartScreen may warn, and Windows 11 Smart App
  Control can block it. Run from source (see README) if that happens.
- Java class/package names are inferred from the catalog; verify against your Teamcenter SDK.
- Up to 3 steps per request.

**Download:** `TC SOA Studio Setup 0.1.0.exe` (106 MB)
SHA-256: `22A5F507909872C594485E288D9BA41099127C7EF3777275CF998B93D55960DE`

*Works with Siemens Teamcenter. Not affiliated with or endorsed by Siemens.*
