# TC SOA Studio — Project Context

How the project works inside, why it is built this way, how its quality is measured, and
the rules it follows. Read this before changing the AI or the code generator.

**Full step-by-step guide** (every stage, every file, real traces):
[docs/HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md).

Related: [README.md](README.md) (install and use) · [PRIVACY.md](PRIVACY.md) ·
[RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) · [FINDINGS.md](FINDINGS.md) (how the API
reference data is structured).

---

## 1. What it is

**TC SOA Studio** is a Windows desktop app for engineers who write programs against the
**Siemens Teamcenter SOA API** (Teamcenter is a PLM system for parts, documents, bills of
materials, workflows, …).

You describe what the program should do in plain English (typos and Hinglish work too):

> *"Create an item named Bracket, then get its properties"*

The app works out the **steps**, picks the right **Teamcenter operations** from *your own*
API catalog, checks them, and writes a **Java program** (log in → calls in order → log out)
with your values filled in. Everything runs **on your PC**: the AI model runs locally through
[Ollama](https://ollama.com), and nothing is sent anywhere.

*Works with Siemens Teamcenter. Not affiliated with or endorsed by Siemens.*

---

## 2. Key design decisions

| Decision | Why |
|---|---|
| **Read the API reference from `structure.js`**, the data file behind Siemens' online API reference (~1,470 operations), instead of scraping pages | Reliable and fast (see FINDINGS.md). |
| **Bring your own catalog**: users load their own `structure.js`; nothing is bundled | Siemens' data is copyrighted; users already have it under their Teamcenter license. |
| **Electron + React + TypeScript**, generating **Java** | Teamcenter users work on Windows desktops; Java is the most common SOA client language. |
| **Local AI (Ollama)**, not a cloud AI | Privacy for company data, no per-request cost, works offline. |
| **AI-first UI**: chat on the left, generated Java on the right | The AI plus the code generator is the whole product. |
| **Multi-stage pipeline** instead of one big prompt | A single prompt picked wrong operations (e.g. the name "Test part" pulled in *TestManagement* operations). Narrow jobs let a small model do well. |
| **Recipe book** of built-in Teamcenter know-how | The catalog does not say *how* tasks are done (e.g. a BOM edit = open window → add → save → close). |
| **Scored test suite with held-out tests** | To measure real accuracy honestly, not just on tuned tests. |
| **Small, commercially licensed model** `qwen2.5-coder:1.5b` (Apache-2.0) | Best of 4 tested small models on Basic+Medium tasks (91%, ~2 s). `qwen2.5:3b` is under a *non-commercial* license, so it is not used. The app always uses this one model (no model picker). |
| **Up to 3 steps per request** | Matches what the small model handles reliably; larger jobs can be split. |
| **Hardened release** (sandbox, fuses, integrity check) | See §7. |

---

## 3. Architecture

```
┌───────────────────────────── Electron app ─────────────────────────────┐
│  MAIN process (Node.js)          PRELOAD            RENDERER (React UI)   │
│  src/main/                       src/preload/       src/renderer/         │
│  - loads structure.js            safe bridge:       - catalog loader      │
│  - runs the AI pipeline          window.tc.*        - AI chat (left)      │
│  - generates Java                (IPC calls)        - Java viewer (right) │
│  - enforces limits, hardening                                             │
└──────────────┬───────────────────────────────────────────────────────────┘
               │ HTTP to 127.0.0.1 only (port 11434, or 11435 for start.bat)
        ┌──────▼──────┐
        │   Ollama    │  runs the AI model on the same PC
        └─────────────┘
```

```
src/
  main/
    index.ts        App start, hardened window, all IPC handlers (catalog, AI, clipboard)
    ollama.ts       Local AI engine: list models, license check, chat with a JSON schema
  preload/
    index.ts        The window.tc API the UI may call
  shared/           Used by main and renderer
    types.ts, buildCatalog.ts, expand.ts, index.ts   Catalog parsing (structure.js)
    ports.ts        Operation inputs/outputs ("ports") + type-compatibility rules
    text.ts         HTML → plain text for operation descriptions
    edition.ts      Limits: fixed model, max steps per request, code depth
    ai/
      retrieve.ts   Catalog search (BM25 keyword ranking + Teamcenter synonyms)
      recipes.ts    Recipe matching + name resolution (loads the encrypted recipe book)
      recipeData.ts The recipe book (31 recipes), encrypted — generated, do not edit
      recipeCrypto.ts  AES-256-GCM encrypt/decrypt for the recipe book
      planner.ts    The AI pipeline (understand → recipes/search → choose → wire)
      status.ts     Types shared by UI and main
    codegen/
      java.ts       Flow → Java program
      fromPlan.ts   AI plan → Java
  renderer/src/
    App.tsx         Top bar, screens
    components/     AiStudio (main screen), AiChat, JavaCodeView (CodeMirror),
                    CatalogLoader, SchemaView
eval/
  cases.ts          80 test requests with expected operations and values
  run.ts            Runs them against local models → eval/RESULTS.md
  recipes.check.ts  63 quick recipe-matching checks (no AI needed)
```

---

## 4. How one request is processed

```
User types in the chat
   │
   ▼
[0] Off-topic guard (code)        Any Teamcenter-like word present (typos allowed)?
   │                              "Write me a poem" → rejected, no AI call.
   ▼
[1] UNDERSTAND (AI call #1)       Request → list of actions, each with:
   │                                action  "check out"            (Teamcenter words)
   │                                quote   "Check out an object"  (the user's own words)
   │                                values  object_type / properties / file
   ▼
[1b] Step limit (code)            More than 3 actions → "please split it into smaller requests"
   ▼
[2] RECIPE or SEARCH (code)       Per action: recipe book (matched on the user's quote first,
   │                              then on the action) — else catalog search on the action
   │                              words only (top 4; values never used in search)
   ▼
[3] CHOOSE (AI call #2, if needed) Pick 1 of the 4 candidates (JSON-schema enum →
   │                              only real operation names are possible)
   ▼
[4] Setup / cleanup (code)        e.g. "add child line" needs createBOMWindows before and
   │                              saveBOMWindows + closeBOMWindows after
   ▼
[5] WIRE (code)                   Connect outputs to later inputs by type rules
   ▼
[6] JAVA (code, main process)     Program with the user's values filled in
   ▼
Chat shows the steps (clickable) · viewer shows the Java
```

Only steps 1 and 3 use the AI; the rest is deterministic code, which is why a
1.5-billion-parameter model is enough.

---

## 5. Logic of each part

### 5.1 Catalog
`structure.js` holds `const data = {...}`: template → library → release (`_2008_06`) →
service → operation, plus type definitions. `buildCatalog` flattens it into operations
(name, library, service, year, description, input, output). The loaded catalog is copied
into the app's private folder so it only has to be loaded once.

### 5.2 Search (`retrieve.ts`)
BM25 keyword ranking over operation name (weight 3), service (2) and description (1);
camelCase splitting and light stemming; **synonyms** for everyday words (part → item,
upload → write/ticket/commit, …); boosts for name coverage and the Core library; internal
APIs down-weighted; only the newest version of each operation indexed; multi-clause
requests split so each clause gets candidates.

### 5.3 Understanding and value checks (`planner.ts`)
The model returns JSON (enforced by a schema): `action`, `quote`, `object_type`,
`properties`, `file`. Then code checks the values:
- a value is kept **only if it literally appears in the request** (small models invent placeholders),
- a "type" equal to a given name is dropped (models confuse the two),
- a type is kept only on the first step that names it.

### 5.4 Recipe book (`recipes.ts`, stored encrypted)

The recipes are stored **encrypted** (AES-256-GCM) in `recipeData.ts`; `recipeCrypto.ts`
holds the key and `getRecipes()` decrypts them in memory on first use. The readable copy is
`recipes/recipes.json` (git-ignored) — `npm run recipes:decrypt` / `recipes:encrypt`. This
keeps casual readers from browsing the recipes on GitHub or inside the app; because the key
is in the open-source code, it is not protection against a determined developer.

31 recipes (items & properties, check out/in, relations, folders & projects, BOM structure,
where-used, saved queries, workflow / release / change, files). Each has trigger phrases,
operation names in order, and optional setup/cleanup steps.

Matching: all words of a trigger must be present (plurals normalized); the recipe covering
**the most words** wins (so the verb decides: "remove child line" → remove); then the longer
phrase; then the one mentioned first. The **user's own words** are matched before the
model's paraphrase. Each recipe step is looked up in the user's catalog (Core preferred,
newest version); if missing, normal search takes over.

### 5.5 Choose, merge, wire
Searched steps with several candidates get a JSON-schema `enum` of real names. Neighbouring
actions that pick the same operation are merged. Wiring connects each step to the nearest
earlier step with a matching output type (exact first, then generic object types); no
match is normal (the caller holds the objects).

### 5.6 Java generation (`java.ts`)
SessionService login → service stubs → one block per step (planned order kept) → logout
in `finally`. Request objects are built to the configured depth (1 level). User values are
filled in by field name (`boName`/`type`, `name`, `description`, `fileName`, string maps,
name/value property structs, workflow template, saved-query values) and marked
`// from your request`; everything else is `// TODO`. Class names are inferred from the
catalog; verify them against your Teamcenter SDK.

### 5.7 Local AI engine (`ollama.ts`)
Talks to the local Ollama only: `127.0.0.1:11434` normally, or the portable Ollama that
`start.bat` runs from `runtime\ollama` on `127.0.0.1:11435` (passed in as `TC_OLLAMA_URL` /
`TC_OLLAMA_EXE`; `start.bat` also sets `OLLAMA_HOST` and `OLLAMA_MODELS=runtime\models`, and
uses a portable Node.js from `runtime\node`, all pinned and SHA-256 checked). Structured
outputs (JSON schema), temperature 0.
The app always uses the fixed model from `edition.ts` (Apache-2.0), with no model picker. On every status check the app first calls `ensureOllamaRunning()` (starts the installed Ollama tray app or `ollama serve` if the server isn't answering). If the model is missing, the app starts the download automatically (the **Download AI model** component with `autoStart`); it asks Ollama to pull it (`/api/pull`, streamed progress, cancellable); only the app's own model name can be requested.

---

## 6. Quality

**Test suite** (`eval/`): 80 requests at 4 levels (Basic, Medium, Hard, Advanced), written
in our own words from common real-world Teamcenter tasks. Score = correct operations in
the right order + exact values, minus 1 per unneeded step.

**Held-out rule:** before each improvement round, write a fresh batch of tests and do not
tune on it; that batch is the honest real-world number.

Results (Basic + Medium, 35 tests, what the app is limited to):

| Model | License | Score | Avg time | Size |
|---|---|---|---|---|
| **qwen2.5-coder:1.5b** (used) | Apache-2.0 | **89%** | 1.8 s | 1.0 GB |
| gemma3:4b | Gemma terms | 92% | 13.6 s | 3.3 GB |
| phi4-mini | MIT | 85% | 4.7 s | 2.5 GB |
| llama3.2:3b | Llama Community | 79% | 4.0 s | 2.0 GB |
| qwen2.5-coder:7b | Apache-2.0 | 94% | 10.5 s | 4.7 GB |

Main improvements over time: pipeline redesign → recipe book → fixing an over-refusal bug
→ matching recipes on the user's own words (held-out accuracy of the 7B reference model:
63% → 83% → 80% → 97% over four rounds).

Commands: `npm run check:recipes` (fast) · `npm run eval -- --models qwen2.5-coder:1.5b --only Basic,Medium`.

---

## 7. Security and privacy

- **No data leaves the PC**; no server, accounts, telemetry or cloud AI (details: PRIVACY.md).
- Renderer **sandboxed** with context isolation; no Node.js in the UI; DevTools and app menu
  off in the release build; all browser permissions denied (copying goes through a
  `clipboard:write` IPC); navigation blocked; only `https:` links, opened in the system browser.
- The packaged app refuses debugger switches (`--remote-debugging-port`, `--inspect`).
- **Electron fuses:** RunAsNode off, NODE_OPTIONS off, inspect args off, embedded asar
  **integrity check on**, load app only from asar. A modified app refuses to start.
- The installer contains only the built app (no source, tests or node_modules).
- `npm audit`: 0 vulnerabilities at release (Electron 44, Vite 7).

## 8. Legal rules

1. No Siemens data ships: users load their own `structure.js`.
2. Recipes and tests are written in our own words from general and public knowledge.
3. Siemens SDK sample code is never copied or used.
4. Only commercially licensed AI models are used.
5. "Works with Teamcenter"; no Siemens logos; "not affiliated with Siemens" notice.

## 9. Commands

```bash
npm install
npm run dev            # run in development mode
npm run build          # production build
npm run dist           # Windows installer → dist/
npm run typecheck
npm run check:recipes
npm run eval -- --models qwen2.5-coder:1.5b --only Basic,Medium
```

The eval uses a catalog at `~/Downloads/structure.js` by default (`--catalog <path>` to change).

## 10. Known limits

- Up to 3 steps per request; long multi-step jobs must be split.
- Java class names are inferred; verify them against your Teamcenter SDK.
- ID values (e.g. "000321") are not always extracted.
- Not built: live execution against a Teamcenter server, follow-up edits to a flow,
  save/load of flows.

## 11. Glossary

| Term | Meaning |
|---|---|
| **SOA operation** | One Teamcenter API call, e.g. `createObjects`, `checkout`. |
| **Catalog / `structure.js`** | The list of all Teamcenter operations and their inputs/outputs. |
| **Ollama** | Free app that runs AI models on your own PC. |
| **Model size (1.5B, 7B)** | Billions of parameters: bigger = smarter but slower, needs more RAM. |
| **Recipe** | Built-in know-how: which operations do a task, in which order. |
| **Held-out test** | A test written before tuning, used to measure honest accuracy. |
| **Dataset** | Teamcenter object holding files (PDF, CAD…) attached to an item. |
| **BOM / BOM window** | Bill of materials; opened in a "window" to edit. |
| **Check out / check in** | Lock an object for editing / release the lock. |
| **Where-used** | Find the assemblies that use a part. |
