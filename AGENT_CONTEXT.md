# Playwright Browser Recorder — Agent Context

> **Last updated:** 2026-04-16  
> **Build status:** ✅ Passing (`npm run build`)  
> **Extension name:** Katalon-Style Recorder Pro v1.4.0

---

## 0. Last Thing We Did (Resume Here)

**BUG: Broken Layout after `react-resizable-panels` Integration**

- ⚠️ **Immediate Next Step**: The UI layout is currently incorrect. The user wants the original layout restored (as seen in their old screenshots).
  - **Issue 1**: The `Test Explorer` sidebar collapses to a tiny sliver on the left.
  - **Issue 2**: The center `<PanelGroup direction="vertical">` is erroneously rendering side-by-side (horizontally) instead of top-and-bottom. The `UtilityPanel` is stuck on the right of the `StepGrid`.
  - **Target Layout**:
    1. **Left pane**: Test Explorer
    2. **Middle pane (Vertical)**: `StepGrid` on top, `UtilityPanel` on the bottom.
    3. **Right pane**: Live Code Preview
- 💡 **Clues**:
  - The drag handles were fixed in the last interaction (by correctly exporting `<PanelResizeHandle>`), so dragging logic works.
  - The flexbox directions might be missing. Ensure `<PanelGroup direction="vertical">` has `flex-direction: column` explicitly set (via Tailwind `flex-col` or similar) and `Panel` constraints are configured correctly so they do not collapse.

---

## 1. What We've Done (This Session)

### Network & Console Interception via Chrome Debugger API
- Added **`"debugger"` permission** to `manifest.json`.
- Integrated `chrome.debugger.attach()` in `background.js` during `START_PLAYBACK`.
- Enabled `Network` and `Runtime` (Console) CDP domains.
- Implemented real-time streaming of requests, responses (including bodies), and console logs to the React UI.
- Automated `chrome.debugger.detach()` on stop/finish.

### UI Enhancements
- **UtilityPanel**:
  - New **Console** tab: Lists logs with timestamps and severity-based coloring.
  - New **Network** tab: Comprehensive table of requests with method, status, URL, and expandable Payloads/Response Bodies.
  - Added real-time log counts to tab headers.
  - Integrated "Clear" buttons for easier debugging cycles.
- **Settings**: Added toggle for "Live Inspector Tracing".

### Export & Reporting
- Updated `ReportModal` to include **Console Logs** and **Network Intercepts** in the Markdown report export.
- Enhanced the report summary to display the total count of captured traces.

---

## 2. What We're Going to Do Next (Ordered Priority)

### 🔲 Network Route Mocking
- Build UI to add "Mock Request" steps.
- Use Playwright's `page.route()` in the background to intercept and return mock data for specific endpoints during playback.

### 🔲 Cross-Tab Execution & Tab Management
- Strengthen `selectWindow` and tab tracking logic.
- Ensure state consistency when recording/playing back across multiple windows.

### 🔲 Advanced Flow Control
- Implement `if element exists` / `skip N steps` logic to handle dynamic page states more gracefully.

---

## 3. Project Overview & File Structure

A **Chrome Extension (Manifest V3)** focusing on professional-grade Playwright/Selenium recording. Features a React editor with resizable panels, live CDP tracing, and Monaco-style code highlighting.

```
postcss.config/          
├── src/
│   ├── App.jsx          ← Main UI (React, ~3250 lines)
│   │                      • UtilityPanel: Log/Screenshots/Variables/Console/Network (Now Resizable)
│   │                      • PanelGroup / Panel / ResizeHandle (Layout management)
│   │                      • ReportModal: Integrated network/console trace reporting
│   ├── codeGenerator.js ← Playwright string boilerplate maps
│   └── index.css        ← Custom styles
├── public/
│   ├── manifest.json    ← MV3 manifest
│   ├── background.js    ← Service worker: CDP management, action recording, playback
│   ├── content.js       ← DOM parsing & shadow piercing
│   └── icons/
├── dist/                ← Built output
└── package.json         ← Deps: react-resizable-panels, lucide-react, etc.
```

---

## 4. Known Issues / Gotchas

| Issue | Status | Notes |
|---|---|---|
| Chrome debugger banner | Expected | "Automation Pro Recorder started debugging..." is native security behavior. |
| Large response bodies | Informational | Truncated to 5000 chars in UI; full body persists in MD export. |
| Layout sizing | Optimization | `defaultSize` handles initial render; may need refinement for very small screens. |

---

## 5. Build & Dev Commands

```bash
# Production Build (Crucial for testing the extension)
npm run build
```
