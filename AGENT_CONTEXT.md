# Playwright Browser Recorder — Agent Context

> **Last updated:** 2026-04-13  
> **Build status:** ✅ Passing (`npm run build`)  
> **Extension name:** Katalon-Style Recorder Pro v1.3.0

---

## 0. Current Session Notes

Recent work:
- **Toolbar**: Trace and Video buttons are now distinct split-button groups:
  - `[TRACE | ↓]` — left side exports the trace-enabled Python script; right side (Download icon) also triggers export
  - `[VIDEO | 📂]` — left side exports the video-enabled Python script; right side (FolderOpen icon) opens a recorded `.webm`/`.mp4` from disk
- **SettingsModal** fully redesigned with 3 sections:
  1. **Code Generation Options** — Enable Tracing (`trace.zip`) toggle (blue) + Enable Video Recording (`.webm`) toggle (violet), each with inline code snippets
  2. **Output Paths** — Trace folder path + Video folder path, both with "● active" badge when the corresponding toggle is on
  3. **Export Behaviour** — "Ask for Save Location" toggle wired to `chrome.downloads.download({ saveAs: true })`
- **ExportModal** `download()` and `downloadMd()` now call `downloadWithSettings()` so the global `askForLocation` preference is always respected
- `Toggle` extracted as reusable component before `SettingsModal`
- Build: ✅ passing

---

## 1. Project Overview

A **Chrome Extension (Manifest V3)** that records user interactions in the browser and plays them back using Playwright/Selenium-compatible logic. The UI is a React + Vite popup that looks like a Katalon/Selenium IDE with a step grid.

### Key Capabilities
- **Record** clicks, types, selects, radio, checkbox, custom dropdowns, keyboard, date pickers
- **Playback** with text-based element matching and native-value-setter for React-controlled inputs
- **Screenshot steps** — taken conditionally (pass/fail/always) and embedded in a PDF report
- **Export** to Playwright Python Sync/Async, Playwright JS, Selenium Python
- **Multiple test cases** with a sidebar explorer — switching preserves all recorded steps
- **Variables** panel for parameterization
- **Drag-to-reorder** all steps including screenshot steps

---

## 2. File Structure

```
postcss.config/          ← project root (confusingly named)
├── src/
│   └── App.jsx          ← Main UI (React, ~1560 lines)
├── public/
│   ├── manifest.json    ← Chrome Extension MV3 manifest
│   ├── background.js    ← Service worker: recording state, playback engine (~955 lines)
│   ├── content.js       ← Injected into every page: event listeners, recording (~595 lines)
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── dist/                ← Built output (load THIS folder in chrome://extensions)
├── index.html           ← Vite entry (opens App.jsx as popup)
├── vite.config.js
├── tailwind.config.js
└── package.json
```

> **Loading the extension:** Go to `chrome://extensions` → Developer mode → Load unpacked → select the `dist/` folder.  
> After every build (`npm run build`) you must **reload** the extension in chrome://extensions.

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Chrome Extension Popup                      │
│  App.jsx (React)                                             │
│  ┌─────────────┐ ┌───────────────┐ ┌──────────────────────┐ │
│  │  Toolbar    │ │  StepGrid     │ │  UtilityPanel        │ │
│  │  (record,   │ │  (drag rows,  │ │  (Log, Screenshots,  │ │
│  │   play,     │ │   edit steps, │ │   Variables tabs)    │ │
│  │   add step, │ │   screenshot  │ │                      │ │
│  │   export)   │ │   rows)       │ │                      │ │
│  └─────────────┘ └───────────────┘ └──────────────────────┘ │
│  ┌──────────┐  ┌────────────────┐  ┌──────────────────────┐ │
│  │ Sidebar  │  │ ExportModal    │  │ ReportModal          │ │
│  │(test     │  │(Playwright/    │  │(PDF report after     │ │
│  │ cases)   │  │ Selenium code) │  │ playback)            │ │
│  └──────────┘  └────────────────┘  └──────────────────────┘ │
└──────────────────────────┬──────────────────────────────────┘
                           │ chrome.runtime.sendMessage
          ┌────────────────▼────────────────┐
          │         background.js            │
          │  (Service Worker)                │
          │  - Recording state               │
          │  - OPEN action injection         │
          │  - Playback engine               │
          │  - lastStepStatus tracking       │
          │  - chrome.scripting.executeScript│
          └────────────────┬────────────────┘
                           │ executeScript injection
          ┌────────────────▼────────────────┐
          │          content.js              │
          │  (injected into target page)     │
          │  - Click/change/keydown events   │
          │  - Date picker polling           │
          │  - Element classification        │
          │  - Selector generation           │
          │  - Radio/checkbox/dropdown logic │
          └─────────────────────────────────┘
```

---

## 4. Data Model — Action Object

Every recorded step is stored as an **action** object:

```js
{
  command: "click" | "type" | "select" | "open" | "sendKeys" | 
           "pause" | "captureScreenshot" | "selectWindow",
  target: "id=someId" | "name=field" | "xpath=//*[@id='x']" | "css=.class" | "https://...",
  value: "typed text" | "selected option text" | "on" | "off" | "pass" | "fail" | "always",
  text: "visible label or button text",        // used for playback matching
  placeholder: "input placeholder",
  elementType: "radio" | "checkbox" | "select" | "dropdownOption" | 
               "button" | "link" | "navigation" | "screenshot" | "",
  options: ["option1", "option2"],             // for dropdowns, extracted at record time
  allSelectors: {
    id: "id=...",
    name: "name=...",
    xpath: "//*[@id='...']",
    xpath_relative: "xpath=//*[@id='...']",
    css: "css=...",
    placeholder: "xpath=//input[@placeholder='...']",
    linkText: "link=..."
  },
  timestamp: "2026-04-13T07:00:00.000Z",
  status: null | "success" | "warning" | "fail"   // set during playback
}
```

### Special: Open/Navigation Step
```js
{
  command: "open",
  target: "https://example.com/page",
  elementType: "navigation",
  text: "Page title (from tab.title)",
  allSelectors: { url: "https://..." },
  value: "", placeholder: "", status: null
}
```
> ⚠️ The `open` step is now **injected directly by background.js** when `TOGGLE_RECORDING` fires — it is NOT sent by content.js. This avoids race conditions and duplicate URLs across tabs.

### Special: Screenshot Step
```js
{
  command: "captureScreenshot",
  elementType: "screenshot",
  value: "always" | "pass" | "fail",    // capture mode
  text: "Screenshot",
  target: "",
  status: null | "success"
}
```

---

## 5. Chrome Messages Reference

All communication uses `chrome.runtime.sendMessage`. Key message types:

| Type | Direction | Description |
|---|---|---|
| `GET_STATE` | Popup → BG | Fetch full state on load |
| `TOGGLE_RECORDING` | Popup → BG | Start/stop recording |
| `STOP_RECORDING` | Content → BG | HUD stop button |
| `RECORD_ACTION` | Content → BG | New step recorded |
| `ACTION_RECORDED` | BG → Popup | Step added to UI (includes `testCaseIndex`) |
| `START_PLAYBACK` | Popup → BG | Begin playback |
| `STOP_PLAYBACK` | Popup → BG | Abort playback |
| `PLAYBACK_STEP_CHANGED` | BG → Popup | Highlight current step |
| `PLAYBACK_FINISHED` | BG → Popup | Done (includes `screenshots` array) |
| `STEP_STATUS_UPDATED` | BG → Popup | Update row color (success/warning/fail) |
| `SCREENSHOT_CAPTURED` | BG → Popup | New screenshot thumbnail |
| `UPDATE_ACTION` | Popup → BG | Edit a step cell |
| `DELETE_ACTION` | Popup → BG | Remove a step |
| `SYNC_ACTIONS` | Popup → BG | Sync reordered/added steps |
| `SYNC_TEST_CASES` | Popup → BG | Sync all test cases (also resets `lastLoggedUrl`) |
| `SELECT_TEST_CASE` | Popup → BG | Switch active test case (also resets `lastLoggedUrl`) |
| `LOG_ENTRY` | BG → Popup | Add log message |
| `VARIABLES_UPDATED` | BG → Popup | Variable map changed |
| `UPDATE_VARIABLES` | Popup → BG | Save variables |
| `STATE_UPDATED` | BG → Content | Recording on/off (shows HUD). `isInitial` is always `false` now — OPEN step is handled by BG directly |
| `GET_ELEMENT_INFO` | BG → Content | Right-click inspector |
| `EXECUTE_STEP` | BG → Content | Run a single playback step |
| `CLEAR_SCREENSHOTS` | Popup → BG | Wipe screenshots array |

---

## 6. Recording — OPEN Step Injection (background.js)

### Critical Design: Background Directly Injects the OPEN action

When `TOGGLE_RECORDING` is received and `newState = true`:

1. **Find the real content tab** using `lastRealTabId` (the most recently activated non-extension tab, tracked by `onActivated`/`onFocusChanged`). Falls back to querying all active tabs if `lastRealTabId` is null or stale.
2. **Build the open action** directly in background.js from `tab.url` + `tab.title`.
3. **Write to storage** in one atomic call: `{ isRecording: true, testCases: updatedCases }`.
4. **Broadcast `ACTION_RECORDED`** to the popup (includes `testCaseIndex`).
5. **Call `broadcastState(true, false)`** with `isInitial: false` — content.js only shows the HUD indicator; it does NOT call `recordOpen()`.

### Key Variables for Tab Tracking
```js
let activeTabId    = null;  // most recently activated tab (any window)
let lastRealTabId  = null;  // most recently activated NON-extension tab
let lastLoggedUrl  = "";    // dedup guard for webNavigation-based recordOpen()
let recorderWindowId = null; // window ID of the recorder popup
```

### `onActivated` / `onFocusChanged`
Both listeners update `activeTabId`. Additionally, if the tab URL is NOT a `chrome-extension://` or `chrome://` URL, they also update `lastRealTabId`. This ensures that clicking the recorder popup does NOT corrupt the tracked content tab.

### `broadcastState(isRecording, isInitial)`
Sends `STATE_UPDATED` to ALL tabs. `isInitial` is now always passed as `false` when starting recording — the OPEN step is added by background.js, not triggered by content.js.

---

## 7. Playback Engine (background.js)

### Key Variables
```js
let isPlaying = false;
let currentStepIndex = 0;
let playbackActions = [];
let playbackTabId = null;
let lastStepStatus = "success";  // tracks last NON-screenshot step result
let screenshots = [];            // accumulated during playback
```

### Execution Flow
1. `START_PLAYBACK` received → create/find tab → `executeStep()`
2. Per step:
   - `captureScreenshot` → check `captureMode` vs `lastStepStatus` → take screenshot if needed → `scheduleNextStep()`
   - `open` → `chrome.tabs.update` → wait for load → `scheduleNextStep()`
   - `pause` → `setTimeout` → `scheduleNextStep()`
   - Everything else → `chrome.scripting.executeScript` with inline function
3. Inline function in executeScript:
   - Tries multiple strategies: `radio`, `checkbox`, `dropdownOption`, `select`, generic click/type
   - Heals broken selectors by trying all `allSelectors`
   - Returns `{ success, healed, strategy }`
4. On success → `updateStepStatus("success")` + update `lastStepStatus`
5. On failure → `updateStepStatus("warning")` + update `lastStepStatus` + continue (no hard stop)
6. `stopPlayback()` → sends `PLAYBACK_FINISHED` with `screenshots` array

### `type` Command Playback — Native Value Setter
React-controlled inputs intercept the standard `element.value =` setter and ignore it. The playback engine uses the **native HTMLInputElement value setter** to bypass this:

```js
const nativeSetter = Object.getOwnPropertyDescriptor(
  HTMLInputElement.prototype, 'value'
).set;
nativeSetter.call(element, value);
element.dispatchEvent(new Event('input', { bubbles: true }));
element.dispatchEvent(new Event('change', { bubbles: true }));
```

This ensures React's `onChange` handler fires correctly during playback.

### Screenshot Capture Logic
```js
const captureMode = action.value || "always";
const shouldCapture =
  captureMode === "always" ||
  (captureMode === "pass" && lastStepStatus === "success") ||
  (captureMode === "fail" && lastStepStatus !== "success");
```
> **Note:** `lastStepStatus` is NOT updated by screenshot steps themselves.

---

## 8. Recording Logic (content.js)

### Element Classification Priority
```
role="option"         → dropdownOption
role="combobox/listbox" → dropdown
input[type="radio"]   → radio
input[type="checkbox"] → checkbox
<select>              → select
button/role=button    → button
<a>                   → link
```

### What Gets Recorded and How

| Event | What happens |
|---|---|
| `click` (text inputs) | **Skipped** — change event handles it |
| `click` (radio/checkbox) | **Skipped** — change event handles it |
| `click` (date-like inputs) | Schedules **polling loop** (150ms × 6 = 900ms) to capture value set by React Datepicker after the calendar closes |
| `click` ([role="option"]) | Records `dropdownOption` + extracts all sibling options |
| `click` (other) | Records generic click |
| `change` (checkbox) | Records `value = "on"/"off"`, `elementType = "checkbox"` |
| `change` (radio) | Records `value = radio.value`, `text = radio.value`, `elementType = "radio"` |
| `change` (text/date/etc) | Records `type` command with current value |
| `change` (native select) | Records `select` command + all native option texts |
| `keydown` (Enter on input) | Records `sendKeys KEY_ENTER` |

### Date Picker Handling
`isDateLikeInput(el)` detects date-related fields by:
- `input[type="date/time/datetime-local/month/week"]`
- `id/name/placeholder/aria-label` containing: `date`, `dob`, `birth`, `calendar`, `picker`, `from`, `to`, `start`, `end`, `check-in`, `check-out`, `appointment`, `schedule`

On click of a date-like input, content.js:
1. Saves `_lastFocusedInput = element` as a fallback
2. Polls `element.value` every 150ms for up to 900ms
3. Records `type` command when a non-empty value appears

### `_lastFocusedInput` Fallback
When the user clicks inside a calendar popup (which shifts focus away from the input), the `_lastFocusedInput` global is used to identify which date field should receive the recorded value.

### Dropdown Option Extraction
When a `[role="option"]` is clicked, the recorder walks up the DOM tree trying many selectors to find the open listbox, then extracts all visible options as an array stored in `action.options`.

---

## 9. UI Components (App.jsx)

### Component Hierarchy
```
App
├── ExportModal       — code generation dialog
├── ReportModal       — post-playback PDF prompt
├── Toolbar           — record/play/add step/add screenshot/export/speed
├── Sidebar           — test case list with add/rename/delete
├── StepGrid          — main step table with drag-to-reorder
│   └── rows:
│       ├── Screenshot rows  — violet, captureMode select
│       ├── Playing row      — green highlight
│       ├── Success row      — dim green
│       ├── Warning row      — amber
│       └── Fail row         — red
└── UtilityPanel      — Log / Screenshots / Variables tabs
```

### StepGrid Columns
| Col | Width | Editable | Notes |
|---|---|---|---|
| ⠿ (grip) | 24px | drag handle | HTML5 drag API |
| # | 32px | no | row number, color = status |
| Command | 14% | **no** (read-only span) | violet for screenshots |
| Target | 22% | yes (input + datalist for selector strategies) | |
| Text/Label | 20% | **no** (read-only span) | purple header |
| Value | rest | **smart** — see below | |

### Value Cell Smart Rendering
```
captureScreenshot → <select> Pass/Fail/Always (violet)
checkbox          → <select> on/off (emerald)
dropdownOption/select + options[] → <input list=datalist> + opts badge (emerald)
default           → <input> plain editable
```

### State in App Component
```js
const [isRecording, setIsRecording]     // recording active
const [isPlaying, setIsPlaying]         // playback active
const [playingIndex, setPlayingIndex]   // row being executed
const [actions, setActions]             // current test case steps (kept in sync by ACTION_RECORDED)
const [testCases, setTestCases]         // all test cases [{name, actions}] — also synced live
const [selectedTestCase, setSelectedTestCase]
const [activeTab, setActiveTab]         // "log" | "screenshots" | "variables"
const [variables, setVariables]         // {key: value}
const [screenshots, setScreenshots]     // [{name, data, mode, timestamp}]
const [playbackDelay, setPlaybackDelay] // ms between steps (0–5000)
const [showExport, setShowExport]       // ExportModal visible
const [showReport, setShowReport]       // ReportModal visible
const [reportScreenshots, setReportScreenshots] // screenshots from last run
const [logs, setLogs]                   // [{time, message, type}]
```

### Test Case State Sync (Critical)

**Problem fixed:** `testCases` React state was never updated during recording — only `actions` was. Switching test cases would show stale (empty) step lists.

**Solution (two parts):**

1. **`ACTION_RECORDED` listener** now receives `testCaseIndex` and updates `testCases[idx]`:
   ```js
   setTestCases(prev => prev.map((tc, i) =>
     i === message.testCaseIndex ? { ...tc, actions: message.allActions } : tc
   ));
   ```

2. **`handleTestCaseSelect`** reads fresh data from `chrome.storage.local` instead of React state:
   ```js
   chrome.storage.local.get(["testCases"], (data) => {
     const fresh = data.testCases || testCases;
     setTestCases(fresh);
     setSelectedTestCase(idx);
     setActions(fresh[idx]?.actions || []);
   });
   ```

---

## 10. Code Export (ExportModal)

Three generator functions at the top of App.jsx:

| Function | Output |
|---|---|
| `generatePlaywrightPythonSync(testCase, variables)` | Playwright Python sync |
| `generatePlaywrightPythonAsync(testCase, variables)` | Playwright Python async |
| `generatePlaywrightJS(testCase, variables)` | Playwright JavaScript |
| `generateSeleniumPython(testCase, variables)` | Selenium Python (webdriver) |

The `buildPlaywrightLocator(action, lang)` function picks the best locator:
1. elementType-driven (`getByRole`, `getByLabel`)
2. Placeholder → `getByPlaceholder`
3. Target selector → `locator()` / `xpath=`

All four generators output **production-ready boilerplate**, including:
- Package requirement comments (e.g., `pip install playwright`, `npm install @playwright/test`)
- Automatic `screenshots/` directory creation logic (`os.makedirs` / `fs.mkdirSync`)
- Inline screenshot capture statements accurately mapped to step iterations
- Strict typing, checking (`.check()`), and semantic dropdown (`select_option()`) syntax

---

## 11. PDF Report (buildHTMLReport)

After playback, if screenshots exist, a `ReportModal` appears. Clicking **Generate PDF Report**:
1. Calls `buildHTMLReport(testCase, screenshots, actions)`
2. Opens a new tab, writes HTML, calls `window.print()`
3. Chrome's print dialog allows "Save as PDF"

Report contains:
- Header (test name, date, step count)
- Stats strip (Total / Passed / Failed)
- Full step table with status icons
- All screenshots with capture mode label

---

## 12. Known Problems / Technical Debt

1. **Re-recording required** — Existing steps recorded before the `options` array feature won't have dropdown options pre-populated.
2. **Shadow DOM** — Custom web components with shadow roots may not be captured by the recorder's event listeners.
3. **Drag-and-drop** — Uses HTML5 drag API. Drop target highlights with `border-t-2 border-blue-400` but no "insert line" indicator between rows.
4. **Iframes** — Multi-frame recording & playback is not currently handled automatically.
5. **`lastRealTabId` not persisted** — On service worker restart (after browser idle), `lastRealTabId` resets to `null`. The first recording after a restart falls back to `chrome.tabs.query({ active: true })`.

---

## 13. Build & Reload Workflow

```bash
# Install deps (first time only)
cd "c:\Users\siam\Videos\pdfs\postcss.config"
npm install

# Build
npm run build

# Then in Chrome:
# chrome://extensions → Reload extension
```

The `dist/` folder is what Chrome loads. `public/` files (manifest, background.js, content.js, icons) are copied verbatim by Vite.

---

## 14. Common Next Tasks

- **Implement SettingsModal** — Toggles for trace.zip and video recording.
- **Add assertion steps** — New command type `assertText` / `assertVisible` with a special UI row.
- **Add conditional steps** — `if element exists → skip n steps`.
- **Keyboard shortcut to add screenshot** — e.g. `Ctrl+Shift+S` while popup is open.
- **Automated Testing** — Develop tests for the extension's execution engine.
- **Persist `lastRealTabId`** — Save to `chrome.storage.session` so it survives service worker restarts without a full `chrome.storage.local` read.

---

## 15. Tech Stack

| Tool | Version | Purpose |
|---|---|---|
| React | 18 | UI framework |
| Vite | 5 | Bundler |
| TailwindCSS | 3 | Styling (JIT) |
| lucide-react | latest | Icons |
| Chrome Extension MV3 | — | Extension APIs |
| chrome.scripting | — | Injecting playback code |
| chrome.storage.local | — | Persisting state |
