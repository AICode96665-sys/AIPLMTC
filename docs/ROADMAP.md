# Roadmap

Ideas reviewed and kept for a later version, with what was decided. Newest first within each
section. See [HOW_IT_WORKS.md](HOW_IT_WORKS.md) for how the app works today.

## Planned for the next version

| Idea | Why | Notes |
|---|---|---|
| **File upload/download uses operations the catalog says not to call** (found 2026-10-01) | The recipes for attaching/uploading and downloading a file use `getDatasetWriteTickets`, `commitDatasetFiles` and `getFileReadTickets` (Core 2006-03 FileManagement). Their catalog descriptions say they were "unintentionally published" and "customers should not invoke" them; there is no warning-free version in the catalog. 12 of 1,470 public operations carry such a warning. | Options: (a) show the catalog's warning in the chat step, the details panel and as a Java comment (deterministic, cheap); (b) make the search and recipes avoid warned operations where an alternative exists; (c) for file transfer, write a TODO pointing to the client-side file transfer helper in the user's SDK (not an SOA operation, so not in the catalog). To decide. |
| **Raise the steps-per-request limit (3 → 5 or 6)** | Users hit "please split your request" often. The app's model scores 93% on Hard and 89% on Advanced tests (mostly 4–8-step requests) when the limit isn't applied. A flow can already grow to 6 steps with follow-ups, so 3 per request is inconsistent. | Change `LIMITS.maxSteps` in `src/shared/edition.ts`, re-run the full test suite with the limit applied. No "approve stages" dialog: follow-ups ("then …") already cover that. Product decision pending. |
| **One positioning sentence in the README** | Makes the difference to "yet another coding chatbot" clear. | e.g. *"An AI assistant that understands your own Teamcenter SOA catalog and gives you a step-by-step plan you can check, then the Java."* Don't use "Copilot" (trademark); don't claim a separate "validation layer" (the checks are spread through the pipeline). |
| **Status summary above the Java** | Faster than scanning for TODOs. | e.g. "5 values filled · 2 inputs to map · 1 to check". |
| **Pick IDs out of the request with code** | IDs like "000321" are not always extracted by the model. | Deterministic extraction before the AI step; needs tests for ambiguous cases ("revision A", "part 2"). |
| **Pass the saved-query name to the find-query step** | "Run the saved query Item Name with value Bracket*": the value is filled in, the query name is left as TODO. | Value-mapping gap in the Java generator. |
| **Neutral style for "already in your flow"** | It's a note, not an error, but shows in the red error box. | Small UI change. |

## Later

| Idea | Notes |
|---|---|
| Change or remove a step by follow-up ("change step 2 to …", "remove the last step") | Follow-ups can only add steps today. |
| Save / open flows | Flows are kept only while the app is open. |
| Complete Java imports | Service and structure classes are written by simple name; imports must be added from the SDK. |
| More wire mappings | Only simple ones are written (same type, first of a list). Result structures, ServiceData and maps stay TODO by design. |
| Code signing for the installer | Needed to avoid SmartScreen / Smart App Control blocks. Needs a certificate (cost). |

## Decided against (for now)

| Idea | Why not |
|---|---|
| "Recipe vs AI" indicator, "Why?" and "Change operation" panels | Internal details stay in the back end; the chat shows the steps only. (Built once, then removed.) |
| "Not a follow-up? Make this a separate flow" link | Clutter; a request written in full without "this / it / then" already starts a new flow. |
| "Break into stages? Approve" dialog for long requests | Follow-ups do the same more naturally. |
| Visual flow graph / canvas | Removed earlier as not needed. |
| Editable Java in the app | The code is copied into the engineer's own IDE, where it is compiled. |
| Live execution against a Teamcenter server, dry run | A different product: needs a server, logins, Siemens client libraries, and would break "nothing leaves your PC". Business decision. |

## Done (from these reviews)

- Explain this operation: short summary and recipe-based notes in the operation details panel.
- Values reach nested Java structures; simple step-to-step connections written as code.
- Back-end check that overrules weak AI operation picks; "thinking" progress in the chat.
- Follow-up requests ("check out this object", "after check out, …", "add … to this code").
- README opens with "AI coding assistant for Teamcenter SOA" and "How it works".
