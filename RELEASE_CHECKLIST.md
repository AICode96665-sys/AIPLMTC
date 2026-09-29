# Release Checklist — TC SOA Studio

Run this before every release. Only items that apply to this app are listed: it has no
server, login, cloud AI or payments. If **live execution against a Teamcenter server** is
added later, add login, credential storage (Windows Credential Manager), TLS and network checks.

Status of release 0.1.0 (checked 2026-09-29):

## Build

| # | Check | How | 0.1.0 |
|---|---|---|---|
| 1 | Production build succeeds | `npm run build` | ✅ |
| 2 | Type check passes | `npm run typecheck` | ✅ |
| 3 | Recipe checks pass | `npm run check:recipes` (63 checks) | ✅ |
| 4 | AI quality not worse | `npm run eval -- --models qwen2.5-coder:1.5b --only Basic,Medium` (≈ 91% last time) | ⬜ run after AI changes |
| 5 | Dependencies scanned | `npm audit` → 0 vulnerabilities | ✅ |
| 6 | Electron is a supported, patched version | `package.json` → electron 44.4.5 | ✅ |
| 7 | Nothing but built code in the package | `npx @electron/asar list "dist/win-unpacked/resources/app.asar"` → only `out/…` + `package.json` | ✅ |

## Hardening

| # | Check | Expected | 0.1.0 |
|---|---|---|---|
| 8 | Renderer sandbox + context isolation | `sandbox: true`, `contextIsolation: true` in `src/main/index.ts` | ✅ |
| 9 | UI has no Node.js access | `typeof require`/`process` undefined in the page | ✅ |
| 10 | No DevTools / developer menu in release | `devTools: isDev`, `Menu.setApplicationMenu(null)` | ✅ |
| 11 | Debugger switches refused | start with `--remote-debugging-port=9555` → app exits, port closed | ✅ |
| 12 | Electron fuses | `npx @electron/fuses read --app "dist/win-unpacked/TC SOA Studio.exe"` → RunAsNode off, NodeOptions off, NodeCliInspect off, AsarIntegrity on, OnlyLoadAppFromAsar on | ✅ |
| 13 | Tamper test | change a string inside a copy of `app.asar` → app refuses to start | ✅ |
| 14 | Browser permissions denied | web clipboard/camera/etc. denied; Copy buttons work via IPC | ✅ |
| 15 | Navigation blocked; links open in the system browser | `will-navigate` prevented; `setWindowOpenHandler` | ✅ |
| 16 | No secrets in the app | search source + bundle for keys/tokens/passwords → none | ✅ |

## Behaviour

| # | Check | Expected | 0.1.0 |
|---|---|---|---|
| 17 | Normal start from installer | installs, starts, loads a catalog | ✅ (start verified) |
| 18 | Ollama not running / model missing | clear setup instructions, no crash | ✅ |
| 19 | Over-limit request (more than 3 steps) | neutral "split it into smaller requests" message | ✅ |
| 20 | Off-topic request | rejected instantly | ✅ |
| 21 | Bad `structure.js` | error message, app keeps working | ✅ |
| 22 | Local files contain no sensitive data | only catalog copy, catalog-meta, ai-settings (see PRIVACY.md) | ✅ |

## Legal & distribution

| # | Check | 0.1.0 |
|---|---|---|
| 23 | No Siemens data, SDK files or sample code shipped | ✅ |
| 24 | Only commercial-licensed AI model (qwen2.5-coder:1.5b, Apache-2.0) | ✅ |
| 25 | "Not affiliated with Siemens" notice in the app and README | ✅ |
| 26 | **Code signing** of the installer and exe (certificate in company name). **Required in practice:** Windows 11 Smart App Control blocked the unsigned 0.1.0 build on the developer PC | ⬜ **needs a certificate** |
| 27 | End-user license agreement (EULA) shown by the installer | ⬜ **needs legal text** |
| 28 | Lawyer review (Siemens API use, trademarks, EULA) | ⬜ |
| 29 | App icon (currently the default Electron icon) | ⬜ |
| 30 | Third-party open-source notices (Electron, React, CodeMirror, …) included | ⬜ |

## Build the installer

```bash
npm run dist        # → dist/TC SOA Studio Setup <version>.exe
```

Bump `version` in `package.json` before each release.
