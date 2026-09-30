# TC SOA Studio — Privacy & Data Handling

For customers' IT, security and privacy teams. Applies to the free edition, version 0.1.0.

## Summary

**No data leaves the computer.** TC SOA Studio has no server, no user accounts, no
telemetry and no cloud AI. The AI model runs locally through Ollama on the same machine.

## What data the app handles

| Data | Where it comes from | Where it goes |
|---|---|---|
| Teamcenter API catalog (`structure.js`) | Loaded by the user from their own licensed copy | Copied once into the app's private folder on this PC (see below). Never uploaded. |
| The user's requests (plain-English text) | Typed into the chat | Sent only to Ollama at `127.0.0.1:11434` (the same PC). Kept in memory for the session; **not saved to disk**. |
| AI answers and generated Java | Produced on this PC | Shown on screen; copied to the clipboard only when the user clicks Copy. **Not saved to disk.** |

## Network connections

| Destination | Why | Data sent |
|---|---|---|
| `http://127.0.0.1:11434` (Ollama, local) | Run the AI model | The user's request text and the relevant catalog operation names/descriptions |
| *(none other)* | — | — |

The app itself makes **no internet connections**. Two things happen automatically on this PC:

- **Starting Ollama:** if Ollama is installed but not running, the app starts it (its own
  program in `%LOCALAPPDATA%\Programs\Ollama`, or `ollama serve`).
- **Downloading the AI model:** if `qwen2.5-coder:1.5b` is not installed, the app asks the
  local Ollama to download it **once** from Ollama's model library, with progress and a
  Cancel button. This sends no user data — only a request for the public model files.
  `start.bat` does the same with its own portable Ollama; it also downloads portable
  Ollama from its official GitHub release, checked against its SHA-256 checksum, into the `runtime` folder next to it.

## Files the app writes

All in the app's private folder: `%APPDATA%\tc-soa-studio\` (the Windows user profile).

| File | Contents | Sensitive? |
|---|---|---|
| `catalog.js` | Copy of the user's `structure.js` (so it only has to be loaded once) | Siemens API reference data the customer is licensed to have; no personal data |
| `catalog-meta.json` | File name and version of the loaded catalog | No |
| Electron's standard cache folders | Browser engine cache for the app's own screens | No |

No passwords, tokens, keys, prompts, answers or personal data are stored. There is no
logging of requests.

**To remove all data:** click **Change catalog** (deletes `catalog.js`), or uninstall the
app and delete `%APPDATA%\tc-soa-studio\`.

## AI model

- Model: **qwen2.5-coder:1.5b** (Apache-2.0 license), run by **Ollama** on the same PC.
- The model is not trained or changed by the app; nothing is sent to its authors.
- The AI **cannot take actions**: it only returns a plan, restricted by a JSON schema to real
  operation names from the customer's own catalog, and checked by the app's code.
  The generated Java is **shown, never executed**.

## Security measures in the released app

- Renderer runs **sandboxed** with context isolation; no Node.js access from the UI.
- No DevTools, no developer menu, all browser permissions denied, navigation blocked.
- Debugger / inspector switches are refused.
- Electron security fuses: run-as-Node off, Node options/inspect off, **app-code integrity
  check on** (a modified app refuses to start), load app only from its package.
- No secrets or credentials exist in the application.
