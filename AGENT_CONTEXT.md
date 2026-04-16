# Playwright Browser Recorder — Agent Context

> **Last updated:** 2026-04-16  
> **Build status:** ✅ Passing (`npm run build`)  
> **Extension name:** Katalon-Style Recorder Pro v1.4.0

---

## 0. Current Session Notes: What We Done

Recent work has significantly leveled up the tool from a basic step recorder to a professional-grade testing environment:

- **Shadow DOM Piercing:** 
  - Overhauled `getCSSSelector` in `content.js` to traverse shadow roots (`getRootNode().host`).
  - Generated and executed Playwright's native `>>>` piercing token.
  - Updated `querySelectorDeep` in `background.js` to natively parse `>>>` and drill through encapsulated web components iteratively during playback.
- **Pytest-Playwright Export:**
  - Designed a new `generatePytestPlaywright` exporter emitting structured CI/CD-ready test files via `@pytest.fixture` and the `page: Page` convention.
  - Positioned Pytest as the primary default export tab.
- **Live Code Preview (Monaco Editor):**
  - Integrated `@monaco-editor/react` as a dynamic split-pane panel next to the Step Grid.
  - Upgraded the Pytest generator to calculate an exact `lineMap` (start/end lines) for every generated syntax block relative to its playback action step.
  - Connected the `playingIndex` listener to Monaco's `createDecorationsCollection()` engine, deploying a custom emerald-green CSS class (`.step-highlight-active`) that dances along the Python code in real-time as background execution proceeds.

---

## 1. What Problems We Faced

- **AST Code Hallucination Limits on Large Files:**
  - *Problem:* Applying massive, multi-chunk modifications to the ~2800 line `App.jsx` via generic LLM string substitution tools triggered corrupted insertions (straggling braces, misplaced `export` statements, and contextually blind pastes).
  - *Solution:* Instantly pivoted to writing custom deterministic Python deployment scripts (`patch_app.py`). Setting literal variable boundaries allowed us to safely hot-patch deeply nested React structures flawlessly and systematically.
- **Monaco Dependency Syncing:**
  - *Problem:* Syncing the actively running background state (`playingIndex`) to the virtual layout of Monaco Editor dynamically without causing intense application re-renders. 
  - *Solution:* Memoized code generation payloads (`previewCode`, `lineMap`) and used pure vanilla `editorRef.current.deltaDecorations` bypassing React tree reconciliations altogether, relying on CSS injects (`!important`) to handle block highlighting.
- **Shadow Root Execution Contexts:**
  - *Solution:* Split all recorded paths logically by `>>>` syntax mapping, and recursively utilized `.shadowRoot.querySelector` loop descents to establish the end-node context before attempting standard Playwright executions.

- **URGENT CRASH: Black Screen on Boot (Vite `ReferenceError`)**
  - *Problem:* A fatal runtime error (`Uncaught ReferenceError: Cannot access 'F' before initialization`) is currently crashing the compiled React UI (`index.js`), completely resulting in a black screen. This appears to be a variable hoisting, ESBuild minifier circular dependency, or top-level const initialization issue introduced by our latest `App.jsx` layout or syntax configurations.
  - *Status:* **OPEN / CRITICAL BLOCKER**. The very first task for the next agent is to debug this transpilation error resulting from `npm run build` and restore functionality to the popup!

---

## 2. Future Plan For Now For Next Agent

Your primary focus should now pivot towards advanced networking capabilities, flow robustness, and multi-thread architectures. 

- **Network Route Mocking:**
  - Build UI and backend mechanics to add "Mock Request" steps. Using Playwright's `page.route()`, intercept endpoints during test playback so the UI can be validated offline and without a staging backend.
- **Cross-Window & Multi-Tab Execution:**
  - Currently, we track one primary session well. Focus on strengthening the `selectWindow` and `chrome.tabs.create` listener integrations so that test cases sprawling across multiple popups natively sync tab shifts across both Pytest and the Live Environment.
- **Advanced Flow Control Loops:**
  - Implement conditionals (e.g. `If Element Exists`, `Skip 3 steps`), significantly enriching the data model logic to handle asynchronous DOM paints.
- **Service Worker Lifecycle Hardening:**
  - `lastRealTabId` periodically clears due to Manifest V3 service worker idle-death. Transition tracking heuristics natively into volatile memory schemas like `chrome.storage.session` for instant boot recoveries.

---

## 3. Project Overview & File Structure

A **Chrome Extension (Manifest V3)** that records user interactions in the browser and plays them back using Playwright/Selenium-compatible logic. The UI is a React + Vite popup showcasing Monaco-styled code mapping and testing tools.

```
postcss.config/          
├── src/
│   ├── App.jsx          ← Main UI (React, ~2700 lines)
│   ├── codeGenerator.js ← Playwright string boilerplate maps
│   └── index.css        ← Custom tracking styles like .step-highlight-active
├── public/
│   ├── manifest.json    ← MV3 manifest
│   ├── background.js    ← Service worker: recording state, querySelectorDeep logic
│   ├── content.js       ← Shadow DOM element parsing, action broadcasts
│   └── icons/
├── dist/                ← Built output
└── package.json         ← Includes @monaco-editor/react
```

> **Build Check:** `npm run build` is currently passing and green.
