# How TC SOA Studio works — the complete guide

This guide explains **every part of TC SOA Studio in detail**: how it is started, how it
loads the Teamcenter catalog, how one plain-English request becomes a list of Teamcenter
operations and then a Java program, what each screen does, how it is secured, built,
tested and released. It follows the code; file names and line references are given so
you can read along.

For a short summary see [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md). For installing and
using the app see the [README](../README.md).

**Contents**

1. [The big picture](#1-the-big-picture)
2. [Every file and what it does](#2-every-file-and-what-it-does)
3. [Starting the app: `start.bat`, installer, developer mode](#3-starting-the-app)
4. [What happens when the app starts](#4-what-happens-when-the-app-starts)
5. [Loading the Teamcenter catalog](#5-loading-the-teamcenter-catalog)
6. [The bridge between screen and back end (IPC)](#6-the-bridge-between-screen-and-back-end-ipc)
7. [The local AI engine (Ollama)](#7-the-local-ai-engine-ollama)
8. [One request, step by step — the AI pipeline](#8-one-request-step-by-step--the-ai-pipeline)
9. [Writing the Java program](#9-writing-the-java-program)
10. [Worked examples (real traces)](#10-worked-examples-real-traces)
11. [The screens](#11-the-screens)
12. [The recipe book and its encryption](#12-the-recipe-book-and-its-encryption)
13. [Security design](#13-security-design)
14. [Building and releasing](#14-building-and-releasing)
15. [Testing and measuring accuracy](#15-testing-and-measuring-accuracy)
16. [All settings and limits in one place](#16-all-settings-and-limits-in-one-place)
17. [Known gaps](#17-known-gaps)
18. [Troubleshooting](#18-troubleshooting)
19. [How to extend it](#19-how-to-extend-it)

---

## 1. The big picture

The user types something like *"Check out an object, change its description, then check
it in"*. The app answers with the Teamcenter SOA operations that do this, in order
(`checkout → setProperties → checkin`), and a Java client program that calls them.

Three programs work together, all on the user's PC:

```
┌──────────────────────────────── the user's PC ─────────────────────────────────┐
│                                                                                 │
│  TC SOA Studio (Electron app)                                                   │
│  ┌──────────────────────────────┐   IPC    ┌──────────────────────────────────┐ │
│  │ Renderer = the window (React) │ ◄──────► │ Main process (Node.js)           │ │
│  │ chat · Java viewer · loader  │ window.tc│ catalog · AI pipeline · Java gen │ │
│  │ sandboxed, no file/OS access │          │ file access · starts Ollama      │ │
│  └──────────────────────────────┘          └───────────────┬──────────────────┘ │
│                                                            │ HTTP, 127.0.0.1    │
│                                                            ▼ only               │
│                                            ┌──────────────────────────────────┐ │
│                                            │ Ollama  (local AI server)        │ │
│                                            │ model qwen2.5-coder:1.5b (~1 GB) │ │
│                                            └──────────────────────────────────┘ │
│                                                                                 │
│  structure.js  ← the user's own Teamcenter API catalog (never shipped with app) │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**The core idea:** a small AI model is unreliable at big jobs but good at small, narrow
ones. So the AI is used for only two narrow jobs:

1. **Understand**: split the request into actions and pull out the user's values.
2. **Choose**: pick one operation from a short list of real candidates.

Everything else (the off-topic check, the recipe book, catalog search, value cleaning, setup and cleanup
steps, wiring, Java generation) is ordinary, deterministic code. That is why a
1.5-billion-parameter model that runs on a normal laptop is enough, and why the AI can never
name an operation that doesn't exist in the user's catalog.

**Nothing leaves the PC.** The app only talks to Ollama on `127.0.0.1`. The only
internet traffic is the one-time downloads: Ollama, the AI model, and (for `start.bat`)
app components.

---

## 2. Every file and what it does

```
start.bat                     Portable one-click setup + start (section 3.1)
bundled/
  node-v22.23.3-win-x64.zip   Official Node.js archive used by start.bat (unmodified)
runtime/                      Created by start.bat, git-ignored: node, ollama, models, caches

src/main/                     ── Electron main process (back end) ──
  index.ts                    App start, hardened window, catalog cache, every IPC handler
  ollama.ts                   Talks to Ollama: status, chat, model download, auto-start

src/preload/
  index.ts                    The ONLY bridge the window gets: window.tc.* (section 6)
  index.d.ts                  Type of window.tc for the renderer

src/shared/                   ── Pure logic, no Electron; used by main, renderer and tests ──
  index.ts                    parseStructureJs() + re-exports
  types.ts                    Catalog, Operation, Field, TypeDef, PRIMITIVES
  buildCatalog.ts             structure.js data tree → flat list of libraries/services/operations
  expand.ts                   Resolves type names (A::B::C) and expands nested types
  ports.ts                    An operation's inputs/outputs ("ports") + type-compatibility rules
  text.ts                     HTML descriptions → plain text
  edition.ts                  LIMITS: model name, max steps (3), code depth (1)
  ai/
    planner.ts                THE PIPELINE: guard → understand → recipe/search → choose → wire
    retrieve.ts               BM25 keyword search over the catalog
    recipes.ts                Recipe matching + resolving operation names in the catalog
    recipeCrypto.ts           AES-256-GCM encrypt/decrypt of the recipe book
    recipeData.ts             The recipe book, encrypted (generated file — do not edit)
    status.ts                 AiStatus / AiBuildResult types shared by main and window
  codegen/
    fromPlan.ts               AI plan → code-generator input
    java.ts                   The Java program generator

src/renderer/                 ── The window (React) ──
  index.html, src/main.tsx    Page + React start
  src/App.tsx                 Screen switcher: checking → load catalog → studio
  src/components/
    CatalogLoader.tsx         "Load your structure.js" screen
    AiStudio.tsx              Main screen: chat left, Java right, operation details drawer
    AiChat.tsx                Chat column: setup states, answers, input box
    ModelDownload.tsx         Model download with progress bar and Cancel
    JavaCodeView.tsx          Read-only CodeMirror Java viewer (highlighting, line select)
    SchemaView.tsx            Tree view of an operation's request/response structure
  src/styles.css              All styling

eval/                         ── Tests ──
  cases.ts                    80 test requests with the expected operations and values
  run.ts                      Runs the AI test suite, writes eval/RESULTS.md
  recipes.check.ts            63 fast recipe-matching checks (no AI needed)
  results/*.json, RESULTS.md  Saved results per model

scripts/recipes.ts            npm run recipes:encrypt / recipes:decrypt
electron.vite.config.ts       Build config for main / preload / renderer
package.json                  Scripts, dependencies, electron-builder (installer) config
tsconfig*.json                TypeScript settings (node side / web side)

README.md · PROJECT_CONTEXT.md · PRIVACY.md · CHANGELOG.md · RELEASE_CHECKLIST.md
FINDINGS.md · THIRD_PARTY_NOTICES.md · LICENSE (MIT)
```

---

## 3. Starting the app

There are three ways, and all of them end in the same Electron app.

### 3.1 `start.bat`, the portable one-click start (Method 2 in the README)

Goal: clone or download, double-click, and it works, **without installing anything on the
system**. Everything lives in a `runtime` folder next to `start.bat`.

**Variables it sets (only inside its own window):**

| Variable | Value | Why |
|---|---|---|
| `RT` | `<app folder>\runtime` | Where everything goes |
| `OLLAMA_HOST` | `127.0.0.1:11435` | The portable Ollama listens on its **own port**, so it can never clash with a normally installed Ollama (11434) |
| `OLLAMA_MODELS` | `runtime\models` | Models stored inside the app folder |
| `TC_OLLAMA_URL` | `http://127.0.0.1:11435` | Tells the **app** which Ollama to use (read in `ollama.ts`) |
| `TC_OLLAMA_EXE` | `runtime\ollama\ollama.exe` | Lets the **app** restart that Ollama if it stops |
| `npm_config_cache`, `electron_config_cache` | inside `runtime` | npm/Electron download caches stay in the folder too |
| `npm_config_update_notifier`, `npm_config_fund` | `false` | No "update npm" prompts that might lead users to change their global npm |
| `PATH` | `runtime\node;` + old PATH | Our Node.js is found first; the change is only for this window |

**Step by step:**

```
[0] Checks
    package.json present?          no → "run start.bat from the app's folder / extract the ZIP"
    curl and tar present?          no → "update Windows (10 1803+ / 11)"
    free disk ≥ 6 GB (first run)?  no → "free some space"

[1/5] Node.js 22.23.3
    runtime\node\node.exe exists?  → use it
    else bundled\node-v22.23.3-win-x64.zip exists?
         → check its SHA-256   (mismatch → "damaged or changed, get the app again")
         → tar -xf into runtime, rename folder to runtime\node
    else (zip missing) → download it from nodejs.org (same checks as below)

[2/5] Ollama 0.34.4
    runtime\ollama\ollama.exe exists? → use it
    else download ollama-windows-amd64.zip (1.36 GB) from github.com/ollama/ollama/releases
         curl -L --fail --retry 3 -C -   (resumes an interrupted download: *.part file)
         → check SHA-256 (mismatch → delete the file, stop)
         → tar -xf into runtime\ollama
    Is something answering on 11435?  no → start "ollama.exe serve" hidden (PowerShell
         Start-Process, remembers its process ID), wait for it to answer (30 tries)

[3/5] AI model qwen2.5-coder:1.5b
    "ollama list" shows it?  no → "ollama pull qwen2.5-coder:1.5b" (~1 GB, into runtime\models)
    (if this fails, the app retries the download itself when it opens)

[4/5] App components
    node_modules missing?   → npm install   (using OUR Node/npm)
    Electron binary missing? → node node_modules\electron\install.js  (some npm versions skip it)

[5/5] npm start  → electron-vite builds the app and opens the window
    …the user works…
    app closed → start.bat stops the Ollama it started (taskkill by the remembered process ID)
```

**The download helper** (`:download` in `start.bat`): `curl` downloads to `<file>.part`,
`:check_sha` computes the SHA-256 with PowerShell `Get-FileHash` and compares it with the
pinned value at the top of the script. Only a matching file is renamed to its final name.
A wrong checksum deletes the file, so a damaged or altered download is never used.

**Pinned versions and checksums** are at the top of `start.bat` (`NODE_VER`, `NODE_SHA`,
`OLLAMA_VER`, `OLLAMA_SHA`). To upgrade, change them together and replace the zip in
`bundled/`.

**Disk use after the first run:** Node.js 0.09 GB, Ollama 1.80 GB, model 0.92 GB, plus
`node_modules`. Deleting `runtime` removes all of it.

### 3.2 The installer (Method 1)

`TC SOA Studio Setup <version>.exe`, built by `npm run dist` (section 14). It contains only
the compiled app. It does **not** contain Ollama or the model. The app finds a normally
installed Ollama (`%LOCALAPPDATA%\Programs\Ollama`) on port 11434, starts it if needed, and
downloads the model itself (section 7).

### 3.3 Developer mode

`npm run dev` runs electron-vite with hot reload; DevTools and the menu are available
(`isDev` in `index.ts` is true when `ELECTRON_RENDERER_URL` is set). `npm start` builds
and runs the production build without installing.

---

## 4. What happens when the app starts

`src/main/index.ts`, in order:

1. **Debugger switches refused.** In the packaged app, if the command line contains
   `--remote-debugging…`, `--inspect…` or `--js-flags…`, the app exits immediately.
2. **`app.whenReady()`**:
   - `Menu.setApplicationMenu(null)` in production (no Reload / DevTools menu).
   - **All browser permissions denied** (camera, microphone, location, notifications,
     clipboard…): `setPermissionRequestHandler` → `false`, `setPermissionCheckHandler` → `false`.
   - **`tryLoadCache()`**: if a catalog was loaded before, it is read from
     `%APPDATA%\tc-soa-studio\catalog.js` (+ `catalog-meta.json`) and parsed (section 5).
     A corrupt cache is ignored and the user sees the loader again.
   - **`createWindow()`**: 1500×950, hidden until ready, with `sandbox: true`,
     `contextIsolation: true`, `nodeIntegration: false`, `webviewTag: false`,
     `devTools` only in dev. New windows are denied (https links open in the system
     browser instead) and navigation away from the app is blocked.
3. The window loads `out/renderer/index.html` and React starts `App.tsx`.

**`App.tsx` screen phases:**

```
'checking' ──window.tc.status()──► catalog loaded?  yes → 'loading' → getCatalog + getRawData → 'ready' (Studio)
                                                    no  → 'load' (CatalogLoader)
CatalogLoader "Open Studio →"  → 'loading' → 'ready'
"Change catalog" button        → window.tc.reset() (clears memory + cache files) → 'load'
```

While loading, it shows the cached catalog's name, version and number of operations.

---

## 5. Loading the Teamcenter catalog

### 5.1 What `structure.js` is

The data file behind the Teamcenter Services API reference that customers get with their
Teamcenter documentation. It is **not** shipped with the app; each user loads their own
licensed copy (see [FINDINGS.md](../FINDINGS.md)). Its shape is `const data = { … }`, a tree:

```
data
 └─ <template>            e.g. Teamcenter
     └─ Soa
         ├─ <library>     e.g. Core, Cad, Bom …
         │   └─ <yearKey> e.g. _2006_03
         │       └─ <Service>   e.g. Reservation
         │           ├─ <operation> e.g. checkout → { description, input: {…}, output: {…} }
         │           └─ <TypeName>  e.g. request/response structures (start upper-case)
         └─ Internal      same shape again, for internal APIs
```

Input and output are objects of fields `{ name: { type, description } }`. A type is a
primitive (`String`, `int`, `bool`, `tag_t`…), a path to another structure (`A::B::C`),
an array (`…[]`), or a map (`"KeyType;ValueType"`).

### 5.2 From file to catalog

1. **Getting the text** (`CatalogLoader.tsx`): pick with the file dialog, drag and drop, or
   type a path. A dropped file with a disk path goes through `catalog:loadPath` (the main
   process reads it). Otherwise the renderer reads the text and sends it with `catalog:loadContent`.
2. **`parseStructureJs(text)`** (`shared/index.ts`): takes everything from the first `{`,
   drops a trailing `;`, and `JSON.parse`s it. No code in the file is ever executed.
3. **`buildCatalog(data)`** (`shared/buildCatalog.ts`) walks
   template → Soa → library → year → service → operation. An entry is an **operation** when
   its name starts lower-case and isn't a number. For each one it creates:

   | Field | Example |
   |---|---|
   | `lib` | `Core` |
   | `year` | `2006-03` (from `_2006_03`) |
   | `serviceStub` / `service` | `Reservation` / `Reservation - 2006-03` |
   | `name` | `checkout` |
   | `url` (unique ID used everywhere) | `Core-2006-03-Reservation/checkout` (prefix `Internal-` for internal APIs) |
   | `include` | `Teamcenter.Soa.Core._2006_03.Reservation.checkout` |
   | `internal` | `false` |
   | `description` | HTML converted to plain text (`text.ts`) |
   | `input` / `output` | the raw field objects |

   Libraries and services are also collected and everything is sorted by name, then year.
   A typical catalog has about 90 libraries, 500 services and 1,470 operations.
4. **Summary + cache**: the main process stores the catalog in memory and copies the raw
   text into `%APPDATA%\tc-soa-studio\catalog.js` with `catalog-meta.json`
   (`{ sourceLabel, version }`), so the user loads it only once. The version is guessed
   from the file name or path (`tc…` pattern, e.g. `tc2412`).

### 5.3 Types and ports

- **Ports** (`ports.ts`, `operationPorts`): the top-level fields of an operation's input and
  output, as `{ name, type }`. E.g. `checkin` has one input port, `objects`.
- **`createExpander(data)`** (`expand.ts`): `getNamespaceProp("A::B::C")` walks the data
  tree to a type definition (deep copy). `expandObject` recursively replaces field types
  with their definitions, marks cycles as `recursive`, and turns `"K;V"` map strings into
  `{ $: true, key, value }`. Used by the operation details view (section 11).
- **`makeFieldResolver(data)`**: gives the immediate fields of one type, which the Java
  generator uses (section 9).
- **Type rules for wiring**: `typesMatchExactly` compares simple names (the last part of
  `A::B::C`, without `[]`). `typesCompatible` also accepts any generic object type
  (`IModelObject`, `ModelObject`, `BusinessObject`, `WorkspaceObject`, `POM_object`, `tag_t`),
  because Teamcenter passes objects around loosely.

---

## 6. The bridge between screen and back end (IPC)

The window is sandboxed: it cannot read files, start programs or reach the network. It
can only call the functions in `window.tc`, defined in `src/preload/index.ts`. Each one
maps to one `ipcMain.handle` in `src/main/index.ts`.

| `window.tc.` | IPC channel | Does | Returns |
|---|---|---|---|
| `status()` | `catalog:status` | Is a catalog loaded? | `{ loaded, summary }` |
| `pickFile()` | `dialog:pickFile` | Windows "open file" dialog | path or `null` |
| `loadPath(path)` | `catalog:loadPath` | Read + parse + cache a file | `{ ok, summary }` / `{ ok:false, error }` |
| `loadContent(name, text)` | `catalog:loadContent` | Parse + cache text | same |
| `reset()` | `catalog:reset` | Forget catalog, delete cache files | – |
| `getCatalog()` | `catalog:get` | The whole catalog | `Catalog` |
| `getRawData()` | `catalog:rawData` | The raw data tree (for details view) | `RawData` |
| `aiStatus()` | `ai:status` | Start Ollama if needed; is the model installed? | `{ running, selected, model }` |
| `aiPlan(query)` | `ai:plan` | **Run the whole pipeline + Java** (section 8) | `AiBuildResult` |
| `aiCancel()` | `ai:cancel` | Abort the running request | – |
| `aiPullModel()` | `ai:pullModel` | Download **the app's own** model | `{ ok }` / `{ ok:false, error }` |
| `aiCancelPull()` | `ai:cancelPull` | Abort the download | – |
| `copyText(text)` | `clipboard:write` | Copy to clipboard (strings only, max 5 MB) | – |
| `onAiProgress(cb)` | event `ai:progress` | "Understanding your request…", etc. | unsubscribe fn |
| `onAiPullProgress(cb)` | event `ai:pullProgress` | `{ status, completed, total }` | unsubscribe fn |

Design rules: the window never sends a model name, a program to run, or a URL. The
main process decides all of these. Copying goes through IPC because the browser clipboard
permission is denied.

---

## 7. The local AI engine (Ollama)

`src/main/ollama.ts`.

**Which Ollama:** `OLLAMA_URL = TC_OLLAMA_URL || http://127.0.0.1:11434`. From `start.bat`
it is the portable one on 11435; from the installer it is the normal one on 11434.

**`listModels()`**: `GET /api/tags`, 2.5 s timeout. Answers → `running: true` plus the
installed models (embedding models filtered out). No answer → `running: false`.

**`ensureOllamaRunning()`**, called before every status check and every request:

```
already answering?                        → 'running'
TC_OLLAMA_EXE set and file exists?        → start "<that exe> serve" (inherits OLLAMA_HOST/OLLAMA_MODELS)
else findOllama():
   %LOCALAPPDATA%\Programs\Ollama\ollama app.exe  → start the tray app      (preferred)
   …\ollama.exe or "where ollama"                 → start "ollama serve"
   nothing found                                  → 'not-installed'
then poll /api/tags every 0.5 s, up to 40 times (20 s)  → 'started' or 'failed'
```

Processes are started detached and hidden. Only these known executables are ever
started, never anything the user typed.

**`aiStatus()`** (`index.ts`): `ensureOllamaRunning` → `listModels` →
`{ running, selected: model installed ? 'qwen2.5-coder:1.5b' : null, model }`.

**Model download, `pullModel()`**: `POST /api/pull { model, stream: true }`. Ollama
answers with one JSON line per progress update (`pulling manifest`, `pulling <layer>` with
`completed/total` bytes, `verifying sha256 digest`, `writing manifest`, `success`). Each
line is forwarded to the window as `ai:pullProgress`. An `error` line or a stream that
ends before `success` is an error. The main process only ever asks for `LIMITS.model`.

**A chat call, `ollamaChat(model, signal)`**: returns the `ChatFn` used by the planner:

```
POST /api/chat
{ model, messages, format: <JSON schema>, stream: false,
  options: { temperature: 0, num_ctx: 8192 } }
```

- `format` = **structured output**: Ollama forces the reply to match the JSON schema. For
  the Choose step, the schema lists the allowed operation URLs as an `enum`, so the model
  *cannot* answer with an operation that isn't a candidate.
- `temperature: 0` makes answers repeatable.
- Timeout 5 minutes (the first call on a CPU-only PC also loads the model), and the call
  is cancellable (`ai:cancel`).
- 404 → "model not installed"; no connection → "is Ollama running?".

---

## 8. One request, step by step — the AI pipeline

### 8.0 Entry: `ai:plan` in `index.ts`

```
catalog loaded?              no → "Load a catalog first."
aiStatus(): Ollama running?  no → "Ollama is not running…"
            model installed? no → "No AI model installed…"
abort any previous request, create a new AbortController
planFlow(catalog, query, ollamaChat(model, signal), { onProgress → 'ai:progress', maxSteps: 3 })
ok → send progress "Writing Java code…" → planToJava(plan, …, depth 1)
return { ok, plan, notes, candidates, code }   or   { ok:false, error, candidates }
```

`planFlow` is in `src/shared/ai/planner.ts`. It takes a `ChatFn`, so the test suite can
run exactly the same pipeline outside the app.

```
query
  │
  ├─[A] off-topic guard ........................ code
  ├─[B] UNDERSTAND ............................. AI call 1
  ├─[C] step limit ............................. code
  ├─[D] per action: clean values ............... code
  │                 recipe book, else search ... code
  ├─[E] value fix-ups .......................... code
  ├─[F] CHOOSE (only if some action has >1 option) AI call 2
  ├─[G] build steps, merge repeats ............. code
  ├─[H] setup + cleanup steps .................. code
  ├─[I] wire outputs → inputs .................. code
  └─[J] explanation + result
```

### 8.1 [A] Off-topic guard: `looksLikeTeamcenter()`

Before any AI call: split the request into words. At least one must be (nearly) one of
55 Teamcenter words (`DOMAIN_WORDS`: item, part, dataset, file, bom, workflow,
revision, checkout, create, delete, upload, query…). "Nearly" = at most **one typo**
(`nearlyEqual`, optimal string alignment distance ≤ 1: insert, delete, replace or swap two
letters; only for words of 4+ letters). *"write me a poem about cats"* is rejected in about a
millisecond, with no AI call.

### 8.2 [B] UNDERSTAND (AI call 1)

System prompt (`UNDERSTAND_PROMPT`) tells the model to list the actions **in order**, and for
each one to give:

| Field | Meaning | Example |
|---|---|---|
| `action` | 2–5 words saying what to do, in Teamcenter terms, **never containing values** | `set properties` |
| `quote` | the user's exact words for this action | `change its description to Released for build` |
| `object_type` | the type the user named, as written | `Design Document` |
| `properties` | values to set, as `{ name, value }` (name → `object_name`, description → `object_desc`, template → `process_template`, search text → `search_value`) | `{ object_name: "Spec A" }` |
| `file` | a file name/path, if given | `report.pdf` |

The prompt includes a vocabulary list (create item, check out, add child line, run saved
query, start workflow…) and a worked example. It also includes rules such as "attaching a
file = attach dataset, then upload file" and "never invent values".

The reply must match `UNDERSTAND_SCHEMA` (structured output). `askJson()` parses it. If the
text isn't valid JSON it tries to cut out the `{…}` part, and if that also fails it asks
the model once more ("That was not valid JSON…").

**Why values are kept apart from actions:** the search in 8.5 uses only the action
words. If the name "Test part" were searched, it would pull in *TestManagement*
operations. Keeping values separate prevents that.

### 8.3 [C] Step limit

Actions without text are dropped and at most 8 are kept (`MAX_STEPS`). If there are more
than **3** (`LIMITS.maxSteps`), the request stops with a message that lists the steps and
asks the user to split the job. No partial answer is given.

### 8.4 [D] Per action: clean the values, then recipe book or search

**`cleanValues()`** keeps a value only if it **really appears in the request**
(case-insensitive, spaces normalised). Small models like to invent placeholders
("New Item", "object_name_value"). Such values are dropped here, so invented text never
reaches the Java.

**Recipe first** (`recipeFor()` in planner, `matchRecipe()` in `recipes.ts`), section 8.4.1.
If a recipe matches and its operations exist in this catalog, those operations are the
action's only options (`source: 'recipe'`), and **no search and no Choose call is needed**.

**Otherwise search**: `retrieveOperations(catalog, action, 4)` returns the top 4
(section 8.4.2). If there are no hits, the step is left out with a note.

#### 8.4.1 Recipe matching

A recipe is `{ id, triggers[], steps[], before?[], after?[] }`:

- `triggers`: phrases like "check out", "lock"; a phrase matches if **all** its words are
  in the action (words are singularised: queries→query, boxes→box).
- `steps`: operation names, in order. `"a|b"` = alternatives (first found wins);
  `"Lib/Service/name"` = qualified.
- `before`: setup calls needed earlier (e.g. open a BOM window).
- `after`: cleanup calls needed at the end (e.g. save and close the BOM window).

**Which recipe wins** when several match:

1. the one whose matching triggers **cover the most words** of the action. The verb
   decides: "remove child line" → *remove* recipe, not *add*;
2. then the **longest** trigger phrase ("expand all" beats "expand");
3. then the one mentioned **first** ("check out the new revision" → check out).

**User's words first:** `recipeFor(query, quote, action)` first tries the model's `quote`,
keeping only words that are really in the request. Only then does it try the model's
`action`. So *"Lock an object"* means check out even if the model paraphrased it as "set
properties". Because only the user's real words are used, an invented quote can't steer
anything.

**Resolving names** (`resolveOp`): each recipe name is looked up in **the user's own
catalog**: public operations only, `Core` preferred, then the newest version. Results are
cached per catalog. If a recipe's operation doesn't exist in this catalog, that recipe is
skipped and normal search takes over.

#### 8.4.2 Catalog search (BM25), `retrieve.ts`

A classic keyword ranking, fully offline and instant.

**Index** (built once per catalog, cached):
- Only the **newest version** of each operation (same internal flag, library, service and name) is indexed.
- Text per operation: name (weight **3**), service name (weight **2**), first 300
  characters of the description (weight **1**).
- Tokenising: split camelCase (`setProperties` → set, properties), lower-case, words of 2+
  letters, drop stop words (the, a, to, then, please…), light stemming
  (revisions → revision, properties → property, created → creat…).
- `idf(t) = ln(1 + (N − df + 0.5) / (df + 0.5))`.

**Query**: the action words (weight 1), plus **synonyms** at weight 0.5, which map everyday
words to Teamcenter vocabulary: part→item, document→dataset, change/edit/modify→set/update,
remove→delete, attach→relation/create, upload→write/ticket/commit/dataset,
download→read/ticket/dataset, approve→workflow/signoff, and more.

**Score** per operation:

```
BM25 = Σ  weight(t) · idf(t) · f·(k1+1) / (f + k1·(1 − b + b·len/avgLen))     k1 = 1.2, b = 0.75
× (1 + 1.5 · covered / nameWords)   name coverage: "set properties" strongly favours
                                    setProperties, whose name is made only of request words
× 1.25 if library is Core           everyday, general-purpose APIs
× 0.5  if internal                  internal APIs are a last resort
```

Multi-part text is split into clauses (`,` `;` `.` "then", "and", "after that"), and each
clause gets its own top hits first, so no step is crowded out. Real example from a
1,470-operation catalog, action "set properties":

```
Core-2010-09-DataManagement/setProperties           21.03
Core-2010-04-DataManagement/setLocalizedProperties  17.85
Core-2006-03-DataManagement/setDisplayProperties    17.51
Core-2009-10-DataManagement/setTableProperties      17.17
```

### 8.5 [E] Value fix-ups

- If a step's `object_type` equals a value the user gave (e.g. the name "Test part"), the
  model mixed up the fields, so the type is cleared.
- A type belongs to the **first** step that names it (usually the create). Later repeats
  are cleared, so a dataset isn't given the item's type "Accolade Part".

### 8.6 [F] CHOOSE (AI call 2, only when needed)

Only actions with more than one option are sent. The prompt (`CHOOSE_PROMPT`: "choose the
ONE option that performs that step's action; prefer general Core operations…") and the
user message list each such step with its values and options:

```
REQUEST: Export an object to PLM XML

step1 — export object. Options:
   - GlobalMultiSite-2010-04-ImportExport/exportObjectsToPLMXML: <description, 160 chars>
   - Multisite-2014-10-ImportExportTCXML/remoteExport: …
   - …
```

The schema is `{ step1: { enum: [the 4 urls] }, … }`, so the reply can only be one of
them. If the model gives nothing usable, the first (best-scoring) option is kept. When
every action came from a recipe or had one option, **this call is skipped** entirely.

### 8.7 [G] Build the steps

Each action becomes a `PlanStep { id, url, action, values, source }`. If an action chose
**the same operation as the previous step**, the two are merged: the actions are joined
with "+", and the properties are combined. For example, "set name" + "set description"
becomes one `setProperties`.

### 8.8 [H] Setup and cleanup (`addSetupAndCleanup`)

For every step that came from a recipe:
- each `before` operation is inserted **just before** that step, unless the same operation
  already appears earlier in the flow. A note "Added X before …" is added.
- each `after` operation is collected once and appended **at the end**, unless the user's
  own flow already has it after the last step that needs it. A note "Added X at the end" is added.

Then steps are numbered `s1, s2, …`.

### 8.9 [I] Wire (`wire`)

For each step (from the second on), find the **nearest earlier step** whose output can
feed one of its inputs:
1. first try **exact** type matches (e.g. `ItemRevision` → `ItemRevision`), searching backwards;
2. only if none are found anywhere, try **generic** object matches (`BusinessObject` accepts any object).

The `serviceData` output is never used for wiring. At most one connection per step. The
result looks like `{ from: 's2', fromPort: 'data', to: 's3', toPort: 'objects' }`.

### 8.10 [J] Result

```ts
{ ok: true,
  plan: { explanation: "Check out → set properties (description = \"Released for build\") → check in",
          steps: [...], connections: [...] },
  notes: ["Added createBOMWindows before …", "No operation in your catalog matches …"],
  candidates: [every operation url that was considered] }
```

---

## 9. Writing the Java program

### 9.1 `planToJava` (`codegen/fromPlan.ts`)

Turns each plan step into a `GenNode` (id, name, lib, serviceStub, year, include,
inputs/outputs ports, values) and each connection into a `GenEdge`. Then it calls
`generateJava(nodes, edges, makeFieldResolver(rawData), depth = 1)`.

### 9.2 `generateJava` (`codegen/java.ts`)

1. **Order**: `topoSort` puts the steps in dependency order. It is stable: among the
   steps that are ready, the earliest planned one goes first, so wires only move a step
   when they must.
2. **Service stubs**: one per library + service
   (`ReservationService reservationService = ReservationService.getService(connection);`).
   If two libraries have the same service name, the variable gets the library as a prefix.
3. **Per step**, a header comment `// --- Step n: name [Lib year / Service] ---` and
   `// SOA: <include>`, then **one variable per input port**, decided in this order:

   | Case | Generated line |
   |---|---|
   | The port is **wired** from an earlier step | `Type x = null; // TODO: map from <step>.<output> (<var>.<output>)` |
   | The user **gave a value** for it (`givenValue`) | `String x = "Spec A"; // from your request` |
   | Primitive type | `String x = ""; // TODO: set "comment"` (default: `""`, `0`, `false`, `null`) |
   | A structure | built by `buildValue` (below), or `Type x = null; // TODO` if it can't be built |

4. **The call**: `XResponse xResponse = service.x(args…);`, or `ServiceData …` when the
   operation has no output fields. A comment lists the outputs.
5. **Program frame**: header comment (flow, expansion depth, "verify class names"),
   imports, `public class GeneratedSoaFlow { public static void run(Connection connection,
   String user, String password) … }` with `SessionService.login(...)` before and
   `logout()` in a `finally` block.

**`buildValue`** builds a structure object:
- primitive → default value; type already being built (a cycle) → `null /* recursive type */`;
  deeper than `maxDepth` (1) → `null`; type with no fields → `null`;
- otherwise `Cls v = new Cls();` and one assignment per field (user value, default, or
  nested build);
- arrays: build one element and wrap it: `Cls[] arr = new Cls[] { v };`;
- a **name/values pair array** (a struct with `name` and `String[] values`) gets **one
  element per property** the user gave, marked `// from your request`;
- a `StringMap` field gets a `HashMap` filled with the user's properties.

**`givenValue`**, which user value goes into which field (String fields only):

| Field name (case-insensitive) | Value |
|---|---|
| `boName`, `type`, `itemType`, `objectType`, `typeName` | the object type |
| `name` | property `object_name` |
| `description` | property `object_desc` |
| `fileName` | the file |
| `values` (String[]) | property `search_value` → `new String[] { "…" }` |
| any other | property with the same name without `_` (`process_template` → `processTemplate`) |

**In the viewer**, `// TODO` lines are highlighted amber (still to fill in) and
`// from your request` green (taken from the user's words).

---

## 10. Worked examples (real traces)

All traces below are real output of the pipeline with `qwen2.5-coder:1.5b` and a
1,470-operation catalog.

### 10.1 Three steps, all from the recipe book (1 AI call, 7.7 s)

Request: *Check out an object, change its description to Released for build, then check it in*

**AI call 1 (Understand) replied:**

```json
{"steps":[
 {"action":"check out","quote":"Check out an object","object_type":"","properties":[],"file":""},
 {"action":"set properties","quote":"change its description to Released for build","object_type":"",
  "properties":[{"name":"description","value":"Released for build"}],"file":""},
 {"action":"check in","quote":"then check it in","object_type":"","properties":[],"file":""}]}
```

- Step limit: 3 actions, allowed.
- Values: "Released for build" appears in the request, so it is kept.
- Recipes: all three actions matched a recipe, so **no search, no Choose call**.
- Wiring: `checkin.objects` ← `setProperties.data` (generic object match). `checkout`
  produces no object outputs, so nothing is wired from it.

**Plan:**

```
s1 Core-2006-03-Reservation/checkout             (recipe)
s2 Core-2010-09-DataManagement/setProperties     (recipe)  description = "Released for build"
s3 Core-2006-03-Reservation/checkin              (recipe)
connections: s2.data → s3.objects
```

**Java** (excerpt):

```java
            // --- Step 3: checkin  [Core 2006-03 / Reservation] ---
            // SOA: Teamcenter.Soa.Core._2006_03.Reservation.checkin
            BusinessObject[] checkinObjects = null; // TODO: map from setProperties.data (setPropertiesResponse.data)
            ServiceData checkinResponse = reservationService.checkin(checkinObjects);
```

⚠️ This trace also shows a gap (section 17): the chat shows
`description = "Released for build"`, but the value does **not** reach the Java. The property
list inside `setProperties` is one level deeper than the depth-1 generator builds, and the
model named the property `description` instead of `object_desc`.

### 10.2 Setup and cleanup added automatically (1 AI call, 1.4 s)

Request: *Add a child line to the BOM* → understood as one action, `add child line`.
The recipe adds what Teamcenter needs around it:

```
s1 createBOMWindows                   (needed first)
s2 addOrUpdateChildrenToParentLine    add child line
s3 saveBOMWindows                     (cleanup)
s4 closeBOMWindows                    (cleanup)
notes: Added createBOMWindows before "add child line" (required, from the recipe book).
       Added saveBOMWindows at the end (required, from the recipe book).
       Added closeBOMWindows at the end (required, from the recipe book).
```

### 10.3 No recipe: search + Choose (2 AI calls, 4.5 s), and why review matters

Request: *Export an object to PLM XML*

- Understand: `export object`. The model also invented `object_type: "Item"` and
  `file: "PLM XML file"`, and **both were dropped** by `cleanValues`, because the user
  never wrote them.
- No recipe matched, so the search returned 4 candidates, including the right one,
  `exportObjectsToPLMXML`.
- Choose: the 1.5B model picked `exportObjectsToOfflinePackage`, **the wrong one**.

The design keeps the answer inside the real candidates, but a small model can still pick
the wrong candidate. That is why the chat shows every step (click it to read its
description) and why the Java is a starting point to review.

### 10.4 Rejected requests

| Request | Result | Time |
|---|---|---|
| *write me a poem about cats* | "That does not look like a Teamcenter request…" (no AI call) | 1 ms |
| *Create an item, revise it, set its name, then check it out* | "This request has 4 steps (create item → revise item → set properties → check out). The app handles up to 3 steps…" | 3.8 s (1 AI call) |

---

## 11. The screens

**CatalogLoader** (`CatalogLoader.tsx`): two tabs, *Upload file* (drop zone, or click to open
the file dialog) and *Local path* (type a path). On success it shows a card with libraries,
services, operations and version, and an *Open Studio →* button. It also shows the
trademark / "not affiliated with Siemens" note.

**Top bar** (`App.tsx`): counts of libraries, services and operations, plus *Change catalog*.

**AiStudio** (`AiStudio.tsx`): chat on the left, Java on the right.
- On open: `refresh()` → `window.tc.aiStatus()` (this may start Ollama), and it subscribes
  to `ai:progress`.
- `send(query)` adds a "turn" `{ id, query, result: null }`, calls `aiPlan`, then stores
  the result. A successful result becomes the **active** turn, shown on the right.
- **Copy all** and **Copy selection (n lines)** go through `window.tc.copyText`, and the
  button shows "Copied ✓".
- **Operation details drawer**: clicking a step's operation name shows its description,
  `include` ("SOA Dependency"), and the fully expanded **Request** and **Response**
  structures (`expandForDisplay` + `SchemaView`: a click-to-open tree, maps shown as
  key/value, enums listed, cycles marked ↻).

**AiChat** (`AiChat.tsx`) has four states:

| State | Shows |
|---|---|
| Checking | "Starting the local AI (Ollama)…" |
| Ollama not running | Explanation, link to ollama.com, *Check again* |
| Model missing | **ModelDownload** starts automatically; progress bar; *Cancel*; the terminal alternative |
| Ready | Welcome text + 4 example chips, then the conversation |

Each answer lists the steps: `action → operationName` (a button that opens details),
a **recipe** badge for recipe-book steps, the user's values under the step, and the notes.
Older answers can be clicked to show their code again. Enter sends; Shift+Enter adds a new
line; the input is disabled until the AI is ready.

**ModelDownload** (`ModelDownload.tsx`): turns Ollama's status texts into plain words
("Preparing download…", "Downloading AI model…", "Checking the download…", "Installing…"),
and shows a percentage and MB; the bar is indeterminate when there is no byte count.
When the download finishes it calls `onDone` → status refresh → the chat becomes ready.

**JavaCodeView** (`JavaCodeView.tsx`): a CodeMirror 6 editor, read-only; Java syntax
highlighting (One Dark theme); click a line number to select that line (including its line
break), Shift+click to extend to a range of lines; Ctrl+C copies; Ctrl+F searches (panel on top);
other occurrences of the selected text are highlighted; TODO / "from your request" marks.
The editor is created once, and a new answer replaces its text and scrolls to the top.

---

## 12. The recipe book and its encryption

- **What it holds**: 31 recipes, only operation **names**, their order, trigger phrases,
  and setup/cleanup names. They were written in our own words from general Teamcenter
  know-how; there is no Siemens sample code or documentation text. Every name is looked up
  in the user's catalog at run time.
- **Stored encrypted** in `src/shared/ai/recipeData.ts` so it isn't readable on GitHub
  or inside the installed app:
  - algorithm AES-256-GCM, key in `recipeCrypto.ts`;
  - format `base64( iv[12 bytes] | authTag[16] | ciphertext )`, with a new random IV on every encrypt;
  - GCM's auth tag means **any change to the data makes decryption fail** (tamper detection).
- **Decrypted lazily**: `getRecipes()` decrypts on first use and keeps the list in memory.
- **Honest limit**: the key is in this open-source code, so this hides the recipes from
  normal users but is not strong protection against a determined developer.
- **Editing** (the readable file `recipes/recipes.json` is git-ignored):

  ```
  npm run recipes:decrypt   → recipes/recipes.json
  … edit …
  npm run recipes:encrypt   → src/shared/ai/recipeData.ts   (validates it's a JSON array)
  npm run check:recipes     → make sure matching still works
  ```

---

## 13. Security design

| Protection | Where |
|---|---|
| Window **sandboxed**, context isolation, no Node.js in the page, no `<webview>` | `createWindow` (`index.ts`) |
| Page can only use `window.tc` (a fixed list of functions) | `preload/index.ts` |
| No DevTools and no app menu in the released app | `devTools: isDev`, `Menu.setApplicationMenu(null)` |
| All browser permissions denied; clipboard through its own IPC (text only, 5 MB max) | `whenReady`, `clipboard:write` |
| No navigation; new windows denied; only `https:` links, opened in the system browser | `will-navigate`, `setWindowOpenHandler` |
| Packaged app exits on `--remote-debugging`, `--inspect`, `--js-flags` | top of `index.ts` |
| **Electron fuses**: RunAsNode off, `NODE_OPTIONS` off, inspect arguments off, cookie encryption on, **embedded asar integrity check on**, only load app from asar, so a modified app refuses to start | `package.json` → `build.electronFuses` |
| AI and model only via `127.0.0.1`; the page can't choose the model or the URL | `ollama.ts`, `ai:pullModel` |
| Only known Ollama executables are started | `ensureOllamaRunning` |
| AI can only answer with real candidate operations (JSON-schema enum) | Choose step |
| Values the user didn't write are dropped | `cleanValues` |
| `structure.js` is parsed as JSON, never executed | `parseStructureJs` |
| `start.bat` downloads are pinned and SHA-256 checked; nothing installed system-wide | `start.bat` |
| Recipe book encrypted and tamper-detected | `recipeCrypto.ts` |

**Privacy:** see [PRIVACY.md](../PRIVACY.md). The only files the app writes are
`catalog.js` and `catalog-meta.json` in `%APPDATA%\tc-soa-studio\`. Requests and code are
not stored.

---

## 14. Building and releasing

**Build** (`electron-vite`, `electron.vite.config.ts`):

```
src/main/index.ts        → out/main/index.js
src/preload/index.ts     → out/preload/index.cjs     (CommonJS: required for sandboxed preloads)
src/renderer/index.html  → out/renderer/…            (React + Vite; alias @shared → src/shared)
```

**Installer** (`npm run dist` = build + `electron-builder --win`):
- NSIS installer for x64, not one-click: the user can choose the folder; desktop and Start
  menu shortcuts; the MIT license is shown during install.
- Packs only `out/main`, `out/preload`, `out/renderer` and `package.json` into `app.asar`, and
  copies `LICENSE.txt`, `THIRD_PARTY_NOTICES.md` and `PRIVACY.md` next to the program.
  (`bundled/`, `runtime/`, `eval/` and the docs are not included.)
- Fuses (section 13) are applied at packaging time.
- Output: `dist/TC SOA Studio Setup <version>.exe`.

**Release steps** (details and security checks in [RELEASE_CHECKLIST.md](../RELEASE_CHECKLIST.md)):
bump `version` in `package.json` → update `CHANGELOG.md` → `npm run typecheck` +
`npm run check:recipes` → `npm run dist` → record the installer's SHA-256 in the
changelog → commit, tag `vX.Y.Z`, push → create the GitHub release with the installer attached.

**Not yet done:** code signing. Unsigned installers trigger SmartScreen, and on PCs
with Smart App Control they are blocked. That is why `start.bat` exists as Method 2.

---

## 15. Testing and measuring accuracy

**Fast recipe checks** (`npm run check:recipes`, `eval/recipes.check.ts`): 63 action
phrases, each with the recipe it must pick (e.g. "remove child line" → remove recipe,
"check out the new revision" → check out). No AI needed; this runs in about a second.

**AI test suite** (`npm run eval -- --models qwen2.5-coder:1.5b --only Basic,Medium`,
`eval/run.ts`):
- 80 requests at 4 levels (Basic, Medium, Hard, Advanced) plus held-out rounds,
  written in our own words from common real-world tasks (`eval/cases.ts`). Each lists
  the expected operations in order (with acceptable alternatives), the exact values that
  must come through, and optional extra operations that are also correct.
- It runs the **same `planFlow`** as the app, with a real Ollama model.
- **Score** = expected operations found **in order** + exact values found
  − 1 per unneeded extra step. Out-of-scope requests (`expectNone`) score 1 if refused.
- Results go to `eval/results/<model>.json` and the table `eval/RESULTS.md`.

**Held-out rule:** before each improvement round, a new batch of tests is written and
**not tuned on**. That batch gives the honest real-world number.

**Current numbers** (Basic + Medium, what the app is limited to): the app's model
`qwen2.5-coder:1.5b` scores **91%** at about 2 s per request. The larger 7B reference model
scores 96% over all 80 tests but is roughly 5× slower and 5× bigger. Full table:
[eval/RESULTS.md](../eval/RESULTS.md).

**Type check**: `npm run typecheck` (node side and web side separately).

---

## 16. All settings and limits in one place

| Setting | Value | Where |
|---|---|---|
| AI model | `qwen2.5-coder:1.5b` (Apache-2.0, ~1 GB) | `shared/edition.ts` |
| Max actions per request | 3 (hard cap 8 before the limit check) | `edition.ts`, `planner.ts` `MAX_STEPS` |
| Candidates per action | 4 | `planner.ts` `OPTIONS_PER_STEP` |
| Java structure depth | 1 | `edition.ts` `codegenDepth` |
| AI temperature / context | 0 / 8192 tokens | `ollama.ts` |
| Chat timeout | 5 minutes | `ollama.ts` |
| Status check timeout | 2.5 s | `ollama.ts` |
| Ollama start wait | 40 × 0.5 s = 20 s (app); 30 tries, about 30–90 s (`start.bat`) | `ollama.ts`, `start.bat` |
| Ollama address | 127.0.0.1:11434, or 11435 from `start.bat` | `TC_OLLAMA_URL` |
| Search weights | name 3, service 2, description 1 (300 chars); Core ×1.25; internal ×0.5; BM25 k1 1.2, b 0.75 | `retrieve.ts` |
| Description in Choose prompt | 160 characters | `planner.ts` |
| Clipboard max | 5,000,000 characters | `index.ts` |
| Window | 1500 × 950 | `index.ts` |
| Portable versions | Node.js 22.23.3, Ollama 0.34.4 | `start.bat` |
| First-run free disk check | 6 GB | `start.bat` |

---

## 17. Known gaps

- **Values inside nested structures don't reach the Java.** With depth 1, fields one level
  deeper (e.g. the property list inside `setProperties`) are left `null`. The chat shows
  the value, but the Java doesn't contain it (example 10.1). The model also sometimes uses
  the plain word (`description`) instead of the Teamcenter name (`object_desc`).
- **Imports are incomplete.** The program imports `Connection`, `ModelObject`,
  `ServiceData` and `SessionService`. Service classes and request/response structure classes
  are written by simple name and still need their imports from your SDK.
- **Class names are inferred** from the catalog; verify package and class names against
  your Teamcenter SDK.
- **The small model can pick the wrong candidate** when there is no recipe (example 10.3).
  Always read the steps.
- **Wired inputs are `TODO`.** The code says which earlier output to use, but the mapping
  is not written for you.
- Up to 3 steps per request; ID values (e.g. "000321") are not always extracted.
- Not built: running against a live Teamcenter server, follow-up edits to a flow, saving flows.
- Installer not code-signed yet.

---

## 18. Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| "Local AI is not running" | Ollama not installed (installer version) or didn't start | Install from ollama.com, or use `start.bat`; click *Check again* |
| Model download stuck / fails | No internet, or disk full | Cancel, check the connection and space, try again; or `ollama pull qwen2.5-coder:1.5b` |
| First answer very slow | The model is loaded into memory on the first call (CPU-only PCs) | Wait; later answers take a few seconds |
| "does not look like a Teamcenter request" | No Teamcenter word in the request | Mention the object: item, dataset, BOM, workflow… |
| "This request has N steps…" | More than 3 actions | Split into smaller requests |
| "No operation in your catalog matches…" | That action isn't in your catalog version | Rephrase with Teamcenter words, or check the catalog |
| Wrong operation chosen | Small model, no recipe for this action | Rephrase using the vocabulary in 8.2; check the step's details |
| `start.bat`: checksum mismatch | Damaged or altered download | Run again (it re-downloads); if the *included* Node.js zip is reported, get the app again |
| `start.bat`: "missing curl or tar" | Windows older than 10 1803 | Update Windows or use the installer |
| Windows blocks the installer | Unsigned (Smart App Control) | Use `start.bat` (Method 2) |
| App shows the loader every start | Cache couldn't be written or is corrupt | Load the catalog again; check `%APPDATA%\tc-soa-studio\` |

---

## 19. How to extend it

- **Add or change a recipe**: `npm run recipes:decrypt`, edit `recipes/recipes.json`
  (`triggers`, `steps`, optional `before`/`after`), `npm run recipes:encrypt`, add a line to
  `eval/recipes.check.ts`, and run `npm run check:recipes`. Write it in your own words.
- **Teach the search a word**: add to `SYNONYMS` in `retrieve.ts` (everyday word → catalog words).
- **Accept another Teamcenter word in the off-topic guard**: `DOMAIN_WORDS` in `planner.ts`.
- **Add a test**: add a case to `eval/cases.ts` (`ops` in order, `values`, `optional`,
  or `expectNone`), then run `npm run eval`. Keep new rounds held-out.
- **Map another value into Java**: `givenValue` in `codegen/java.ts`.
- **Change the model or limits**: `shared/edition.ts`. Re-run the test suite and check the model's
  license allows commercial use.
- **Upgrade the portable Node.js/Ollama**: change the version and SHA-256 at the top of
  `start.bat`, and replace the zip in `bundled/` (Node.js).
