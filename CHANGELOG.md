# Changelog

## v0.2.0 (2026-10-01)

Smarter conversations, better Java, a faster first answer, and a one-click setup that
installs nothing on your system.

**Chat**
- **Follow-up requests:** continue the program on screen, e.g. *"check out this object"*,
  *"then check it in"*, *"after check out, set its description to Released"*, *"add the create
  item code to this code"*. New steps go where you say (after/before a step, at the start or
  end; a "create" goes first). Up to 6 steps per flow; earlier steps are shown in grey.
  Detected from your words with plain code, no extra AI.
- **"Thinking" view:** the stages appear as a checklist while an answer is being made.
- Answers show only the steps.

**Java**
- **Your values reach the Java** even inside nested structures (properties to set, file
  names to upload): on the Basic + Medium tests from 4 of 12 values to 11 of 12. Plain
  property words become Teamcenter names ("description" → `object_desc`).
- **Connections between steps are written as code when simple** (same type, or the first of
  a list), marked `// from step N` and shown in blue. Others stay TODO but list the exact
  choices (e.g. `.item (Item), .itemRev (ItemRevision)`).
- Fixed: a flow using the same operation twice declared the same variable twice.

**Choosing operations**
- If the AI picks an operation clearly weaker than the best catalog match, the best match is
  used (e.g. "export to PLM XML" now gets `exportObjectsToPLMXML`).
- Fixed: a job described twice ("find the saved query, run it") used its recipe twice;
  results could be wired into another step's search criteria; a value could be reused on a
  later step where it doesn't belong.

**Operation details**
- Opens with a short summary: what the operation does, what it takes and returns, and what
  the recipe book knows ("Needs first: createBOMWindows", "Follow with: saveBOMWindows,
  closeBOMWindows", "Usually part of: …").

**Speed**
- The AI model is loaded and primed in the background as soon as the app starts and kept
  loaded for 30 minutes: the first answer after opening the app went from ~10 s to ~4 s. Its
  memory is freed when the app closes. The window appears immediately.

**Setup (`start.bat`, Method 2)**
- Sets up everything **without installing anything on the system**: Node.js 22.23.3 is
  included; portable Ollama 0.34.4 and the AI model are downloaded (pinned versions, SHA-256
  verified, resumable) into a `runtime` folder and used only from there, on their own port.
  An existing Node.js or Ollama is neither used nor changed.

**Docs and tests**
- New `docs/HOW_IT_WORKS.md` (every step in detail) and `docs/ROADMAP.md`; README opens with
  "AI coding assistant for Teamcenter SOA" and "How it works".
- 82 AI tests (2 new regression tests), 63 recipe checks, 36 follow-up checks.
  qwen2.5-coder:1.5b: 91% on all 82 tests, 91% on Basic + Medium.

**Known:** the file upload/download steps use operations that the catalog marks as internal
(see ROADMAP); the installer is still not code-signed.

**Download:** `TC.SOA.Studio.Setup.0.2.0.exe` (106 MB)
SHA-256: `8D1D52FFB2CA296A4526F1F192ABEA1F23878CC148C0D06EDF51FD31E67989FC`

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
