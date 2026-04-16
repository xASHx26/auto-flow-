import {
  ChevronRight,
  ChevronDown,
  Circle,
  Download,
  Image as ImageIcon,
  Pause,
  Play,
  Plus,
  Settings,
  Square,
  Terminal,
  Trash2,
  Variable,
  FileCode,
  FilePlus,
  Edit2,
  X,
  Copy,
  Check,
  Camera,
  GripVertical,
  FileText,
  Film,
  FolderOpen,
  Eye,
  EyeOff,
  Clock,
  Package,
} from "lucide-react";
import { useEffect, useState } from "react";

// ─────────────────────────────────────────────
// Playwright / Selenium code generators
// ─────────────────────────────────────────────

/**
 * Build the best Playwright locator for an action.
 * Priority: elementType > text/label > placeholder > target selector
 */
// Escape a string for embedding inside double-quoted Python/JS string literals
function esc(s) {
  return (s || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function quoted(s) {
  return `"${esc(s)}"`;
}

function stripSelectorPrefix(value, prefix) {
  if (!value) return "";
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

function formatSelectorForComment(key, value) {
  if (!value) return "";
  if (/^(id|name|css|xpath|link|url)=/.test(value)) return value;
  if (key === "linkText") return `link=${value}`;
  return `${key}=${value}`;
}

function parseTimeoutMs(val) {
  if (!val) return 10000;
  const str = String(val).toLowerCase().trim();
  const num = parseFloat(str);
  if (isNaN(num)) return 10000;
  if (str.endsWith("min") || str.endsWith("m")) return num * 60000;
  if (str.endsWith("ms")) return num;
  if (str.endsWith("s")) return num * 1000;
  return num; // assume ms default
}

function getRecordedId(action) {
  const allSelectors = action.allSelectors || {};
  const raw =
    allSelectors.id ||
    ((action.target || "").startsWith("id=") ? action.target : "");
  return stripSelectorPrefix(raw, "id=");
}

function getRecordedCssSelector(action) {
  const allSelectors = action.allSelectors || {};
  const raw =
    allSelectors.css ||
    ((action.target || "").startsWith("css=") ? action.target : "");
  return stripSelectorPrefix(raw, "css=");
}

function buildCssLocator(selector) {
  return `page.locator(${quoted(selector)})`;
}

function buildRecordedInputLocator(action, inputType) {
  const css = getRecordedCssSelector(action);
  if (css) return buildCssLocator(css);
  const id = getRecordedId(action);
  if (id) return buildCssLocator(`#${id}`);
  const value = (action.value || "").trim();
  if (value) return buildCssLocator(`input[type="${inputType}"][value="${value}"]`);
  return "";
}

function buildRecordedLabelLocator(action) {
  const id = getRecordedId(action);
  return id ? buildCssLocator(`label[for="${id}"]`) : "";
}

// Build the best Playwright locator — ALWAYS prefer semantic (text/label/placeholder/role)
function buildPlaywrightLocator(action, lang) {
  const { target, text, placeholder, elementType } = action;
  const py    = lang === "py";
  const q     = quoted;
  const label = (text || "").trim();
  const ph    = (placeholder || "").trim();

  // 1. ElementType-driven semantic locators (highest priority)
  if (elementType === "dropdownOption" && label)
    return py ? `page.get_by_role("option", name=${q(label)})` : `page.getByRole("option", { name: ${q(label)} })`;
  if ((elementType === "radio" || elementType === "checkbox") && label)
    return py
      ? (elementType === "radio"
          ? `page.get_by_role("radio", name=${q(label)}, exact=True)`
          : `page.get_by_label(${q(label)})`)
      : (elementType === "radio"
          ? `page.getByRole("radio", { name: ${q(label)}, exact: true })`
          : `page.getByLabel(${q(label)})`);
  if (elementType === "button" && label)
    return py ? `page.get_by_role("button", name=${q(label)})` : `page.getByRole("button", { name: ${q(label)} })`;
  if (elementType === "link" && label)
    return py ? `page.get_by_role("link", name=${q(label)})` : `page.getByRole("link", { name: ${q(label)} })`;

  // 2. Placeholder (input fields)
  if (ph)
    return py ? `page.get_by_placeholder(${q(ph)})` : `page.getByPlaceholder(${q(ph)})`;

  // 3. Generic visible text (any element with a label/text)
  if (label)
    return py ? `page.get_by_text(${q(label)}, exact=True)` : `page.getByText(${q(label)}, { exact: true })`;

  // 4. target=label= strategy from manually added steps
  if (target && target.startsWith("label="))
    return py ? `page.get_by_label(${q(target.slice(6))})` : `page.getByLabel(${q(target.slice(6))})`;

  // 5. Last-resort: raw selectors (id / css / xpath / name)
  if (!target) return py ? `page.locator("body")` : `page.locator("body")`;
  if (target.startsWith("id="))    return `page.locator(${q("#" + target.slice(3))})`;
  if (target.startsWith("name=")) return `page.locator(${q(`[name="${target.slice(5)}"]`)})`;
  if (target.startsWith("css="))   return `page.locator(${q(target.slice(4))})`;
  if (target.startsWith("xpath=")) return `page.locator(${q(target.slice(6))})`;
  if (target.startsWith("link="))
    return py ? `page.get_by_role("link", name=${q(target.slice(5))})` : `page.getByRole("link", { name: ${q(target.slice(5))} })`;
  return `page.locator(${q(target)})`;
}

/**
 * Build a comment line listing all available selectors for a step.
 * e.g. "# Selectors: id=#firstName | name=firstName | css=#firstName | xpath=//*[@id='firstName']"
 */
function buildSelectorComment(action, lang) {
  const py = lang === "py" || lang === "sel";
  const prefix = py ? "    # " : "    // ";
  const { allSelectors, target } = action;
  const parts = [];
  if (allSelectors && Object.keys(allSelectors).length > 0) {
    Object.entries(allSelectors).forEach(([k, v]) => {
      const selector = formatSelectorForComment(k, v);
      if (selector) parts.push(selector);
    });
  } else if (target) {
    parts.push(target);
  }
  if (parts.length === 0) return "";
  return `${prefix}Selectors: ${parts.join(" | ")}`;
}

// Build a Selenium (By.X, "selector") locator — prefer text/label, fallback to id/xpath/css
function buildSeleniumLocator(action) {
  const { target, text, placeholder, elementType, value } = action;
  const t  = (text || "").trim();
  const ph = (placeholder || "").trim();

  // Semantic first
  if (elementType === "radio" && t)
    return `By.XPATH, "//label[normalize-space(.)='${esc(t)}']/preceding-sibling::input | //input[@type='radio'][following-sibling::label[normalize-space(.)='${esc(t)}']]"` ;
  if (elementType === "radio" && value)
    return `By.XPATH, "//input[@type='radio'][@value='${esc(value)}']"` ;
  if (elementType === "checkbox" && t)
    return `By.XPATH, "//label[normalize-space(.)='${esc(t)}']"` ;
  if (elementType === "dropdownOption" && (t || value))
    return `By.XPATH, "//*[@role='option' and normalize-space(.)='${esc(t || value)}']"` ;
  if (elementType === "button" && t)
    return `By.XPATH, "//button[normalize-space(.)='${esc(t)}']"` ;
  if (elementType === "link" && t)
    return `By.LINK_TEXT, "${esc(t)}"`;
  if (ph)
    return `By.XPATH, "//input[@placeholder='${esc(ph)}']"` ;
  if (t)
    return `By.XPATH, "//*[normalize-space(.)='${esc(t)}']"` ;
  // Fallback raw selectors
  if (!target) return `By.TAG_NAME, "body"`;
  if (target.startsWith("id="))    return `By.ID, "${esc(target.slice(3))}"`;
  if (target.startsWith("name=")) return `By.NAME, "${esc(target.slice(5))}"`;
  if (target.startsWith("css="))  return `By.CSS_SELECTOR, "${esc(target.slice(4))}"`;
  if (target.startsWith("link=")) return `By.LINK_TEXT, "${esc(target.slice(5))}"`;
  if (target.startsWith("xpath=")) return `By.XPATH, "${esc(target.slice(6))}"`;
  return `By.XPATH, "${esc(target)}"`;
}

function generatePlaywrightPythonSync(testCase, variables, settings = {}) {
  const varLines = Object.entries(variables || {})
    .map(([k, v]) => `    "${esc(k)}": "${esc(v)}",`).join("\n");
  const hasSS   = (testCase.actions || []).some(a => a.command === "captureScreenshot");
  const base    = (testCase.name || "test").replace(/\s+/g, "_");
  const hasVideo = settings.recordVideo;
  const hasTrace = settings.enableTracing;
  const hasVerify = (testCase.actions || []).some(
    a => a.command === "verifyElementPresent" || a.command === "verifyText"
  );

  // assertion helper block — injected only when there is at least one verify step
  const assertHelpers = hasVerify ? `
import sys

# ── Assertion tracker ─────────────────────────────────────────
_assertions = []

def assert_visible(locator, step_n, description=""):
    label = description or repr(locator)
    try:
        from playwright.sync_api import expect
        expect(locator).to_be_visible(timeout=5000)
        print(f"[OK]   PASS  Step {step_n}: [{label}] is visible")
        _assertions.append((step_n, label, True, ""))
    except Exception as e:
        print(f"[FAIL] FAIL  Step {step_n}: [{label}] NOT visible", file=sys.stderr)
        _assertions.append((step_n, label, False, str(e)))

def assert_contains_text(locator, text, step_n, description=""):
    label = description or repr(locator)
    try:
        from playwright.sync_api import expect
        expect(locator).to_contain_text(text, timeout=5000)
        print(f"[OK]   PASS  Step {step_n}: [{label}] contains '{text}'")
        _assertions.append((step_n, label, True, ""))
    except Exception as e:
        print(f"[FAIL] FAIL  Step {step_n}: [{label}] missing text '{text}'", file=sys.stderr)
        _assertions.append((step_n, label, False, str(e)))

def print_summary():
    total  = len(_assertions)
    passed = sum(1 for _, _, ok, _ in _assertions if ok)
    failed = total - passed
    print("\\n" + "-" * 60)
    print(f"  RESULT   Total: {total}   [OK] Passed: {passed}   [FAIL] Failed: {failed}")
    print("-" * 60)
    for step_n, label, ok, msg in _assertions:
        status = "[OK] PASS" if ok else "[FAIL] FAIL"
        print(f"  Step {step_n:>2}  {status}  {label}")
        if not ok:
            print(f"           -> {msg[:120]}")
    print("-" * 60)
    if failed:
        print(f"\\n[!]  {failed} assertion(s) failed.\\n")
        sys.exit(1)
    else:
        print(f"\\n[*] All {total} assertion(s) passed!\\n")
` : "";

  let code =
`# ==============================================================\n# Test: ${testCase.name}\n# Generated by Automation Pro Recorder\n# ==============================================================\n# Requirements:\n#   pip install playwright\n#   playwright install chromium\n#\n# Usage:\n#   python ${base}_playwright_sync.py\n# ==============================================================\n\nimport os\nfrom playwright.sync_api import sync_playwright, expect\n${assertHelpers}\nVARIABLES = {\n${varLines || "    # No variables defined"}\n}\n\nSCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))\nSCREENSHOTS_DIR = os.path.join(SCRIPT_DIR, "screenshots")\n\n\ndef run(pw):\n${(hasSS || hasVideo || hasTrace) ? "    os.makedirs(SCREENSHOTS_DIR, exist_ok=True)\n" : ""}    browser = pw.chromium.launch(headless=False)\n    context = browser.new_context(${hasVideo ? `record_video_dir=SCREENSHOTS_DIR` : ""})\n${hasTrace ? "    context.tracing.start(screenshots=True, snapshots=True, sources=True)\n" : ""}    page = context.new_page()\n    page.set_default_timeout(10000)\n\n`;

  (testCase.actions || []).forEach((a, i) => {
    const loc = buildPlaywrightLocator(a, "py");
    const val = esc(a.value || "");
    const n   = i + 1;
    const isAssert = !!a.isAssertion;
    const assertCodeText = isAssert && loc && a.command !== "open" && a.command !== "captureScreenshot" && a.command !== "pause" && a.command !== "verifyText" && a.command !== "verifyElementPresent" ? ` (Assertion)` : "";
    const cmt = `    # Step ${n}: ${a.command}${a.text ? ` [${a.text}]` : ""}${a.placeholder ? ` [placeholder: ${a.placeholder}]` : ""}${assertCodeText}`;
    const sel = buildSelectorComment(a, "py");
    const sc  = sel ? `${sel}\n` : "";
    const ss  = `os.path.join(SCREENSHOTS_DIR, "step_${n}_screenshot.png")`;
    const label = esc(a.text || a.placeholder || a.target || "");

    let assertCode = "";
    if (isAssert && loc && a.command !== "open" && a.command !== "captureScreenshot" && a.command !== "pause" && a.command !== "verifyText" && a.command !== "verifyElementPresent") {
      assertCode = `    try:\n        expect(${loc}).to_be_visible(timeout=5000)\n        print(f"✅ Step ${n}: Assertion passed!")\n    except AssertionError as e:\n        print(f"❌ Step ${n}: Assertion failed! ({e})")\n        raise\n`;
    }

    if (a.command === "open") {
      code += `${cmt}\n${sc}${assertCode}    page.goto("${esc(a.target)}", wait_until="domcontentloaded", timeout=30000)\n\n`;
    } else if (a.command === "click") {
      if (a.elementType === "radio") {
        const rName = esc(a.text || a.value || "");
        const inputLoc = buildRecordedInputLocator(a, "radio");
        const labelLoc = buildRecordedLabelLocator(a);
        if (inputLoc && labelLoc) {
          code += `${cmt}\n${sc}${assertCode}    _radio_${n} = ${inputLoc}\n    if not _radio_${n}.is_checked():\n        ${labelLoc}.click()\n\n`;
        } else if (inputLoc) {
          code += `${cmt}\n${sc}${assertCode}    ${inputLoc}.check(force=True)\n\n`;
        } else {
          code += `${cmt}\n${sc}${assertCode}    page.get_by_role("radio", name="${rName}", exact=True).check(force=True)\n\n`;
        }
      } else if (a.elementType === "checkbox") {
        const m = a.value === "off" ? "uncheck" : "check";
        const inputLoc = buildRecordedInputLocator(a, "checkbox");
        const labelLoc = buildRecordedLabelLocator(a);
        const stateCheck = a.value === "off" ? `_checkbox_${n}.is_checked()` : `not _checkbox_${n}.is_checked()`;
        if (inputLoc && labelLoc) {
          code += `${cmt}\n${sc}${assertCode}    _checkbox_${n} = ${inputLoc}\n    if ${stateCheck}:\n        ${labelLoc}.click()\n\n`;
        } else if (inputLoc) {
          code += `${cmt}\n${sc}${assertCode}    ${inputLoc}.${m}(force=True)\n\n`;
        } else {
          code += `${cmt}\n${sc}${assertCode}    page.get_by_label("${esc(a.text || "")}").${m}(force=True)\n\n`;
        }
      } else if (a.elementType === "dropdownOption") {
        code += `${cmt}\n${sc}${assertCode}    page.get_by_role("option", name="${esc(a.text || a.value || "")}").click()\n\n`;
      } else {
        code += `${cmt}\n${sc}${assertCode}    ${loc}.click()\n\n`;
      }
    } else if (a.command === "type") {
      code += `${cmt}\n${sc}${assertCode}    ${loc}.fill("${val}")\n\n`;
    } else if (a.command === "select") {
      code += `${cmt}\n${sc}${assertCode}    ${loc}.select_option(label="${val}")\n\n`;
    } else if (a.command === "sendKeys") {
      const key = val === "KEY_ENTER" ? "Enter" : val;
      code += `${cmt}\n${sc}${assertCode}    ${loc}.press("${key}")\n\n`;
    } else if (a.command === "pause") {
      const ms = parseTimeoutMs(a.value);
      code += `${cmt}\n${assertCode}    page.wait_for_timeout(${ms})  # ${ms / 1000}s\n\n`;
    } else if (a.command === "captureScreenshot") {
      code += `${cmt}  # capture mode: ${a.value || "always"}\n${assertCode}    page.screenshot(path=${ss})\n\n`;
    } else if (a.command === "verifyText") {
      code += `${cmt}\n${sc}    assert_contains_text(${loc}, "${val}", ${n}, "${label}")\n\n`;
    } else if (a.command === "verifyElementPresent") {
      code += `${cmt}\n${sc}    assert_visible(${loc}, ${n}, "${label}")\n\n`;
    } else if (a.command === "selectWindow") {
      code += `${cmt}\n${assertCode}    page = context.pages[-1]  # newest tab\n\n`;
    } else if (a.command === "refresh") {
      code += `${cmt}\n${assertCode}    page.reload()\n\n`;
    } else {
      code += `${cmt}\n${sc}${assertCode}    # TODO: handle "${a.command}"\n\n`;
    }
  });

  code +=
`${hasTrace ? "    context.tracing.stop(path=os.path.join(SCREENSHOTS_DIR, \"trace.zip\"))\n" : ""}    context.close()\n    browser.close()\n\n\nwith sync_playwright() as pw:\n    run(pw)\n${hasVerify ? "\nprint_summary()\n" : ""}`;
  return code;
}

function generatePlaywrightPythonAsync(testCase, variables, settings = {}) {
  const varLines = Object.entries(variables || {})
    .map(([k, v]) => `    "${esc(k)}": "${esc(v)}",`).join("\n");
  const hasSS = (testCase.actions || []).some(a => a.command === "captureScreenshot");
  const base  = (testCase.name || "test").replace(/\s+/g, "_");
  const hasVideo = settings.recordVideo;
  const hasTrace = settings.enableTracing;

  let code =
`# ==============================================================\n# Test: ${testCase.name}\n# Generated by Automation Pro Recorder\n# ==============================================================\n# Requirements:\n#   pip install playwright\n#   playwright install chromium\n#\n# Usage:\n#   python ${base}_playwright_async.py\n# ==============================================================\n\nimport asyncio\nimport os\nfrom playwright.async_api import async_playwright, expect\n\nVARIABLES = {\n${varLines || "    # No variables defined"}\n}\n\nSCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))\nSCREENSHOTS_DIR = os.path.join(SCRIPT_DIR, "screenshots")\n\n\nasync def run(pw):\n${(hasSS || hasVideo || hasTrace) ? "    os.makedirs(SCREENSHOTS_DIR, exist_ok=True)\n" : ""}    browser = await pw.chromium.launch(headless=False)\n    context = await browser.new_context(${hasVideo ? `record_video_dir=SCREENSHOTS_DIR` : ""})\n${hasTrace ? "    await context.tracing.start(screenshots=True, snapshots=True, sources=True)\n" : ""}    page = await context.new_page()\n    page.set_default_timeout(10000)\n\n`;

  (testCase.actions || []).forEach((a, i) => {
    const loc = buildPlaywrightLocator(a, "py");
    const val = esc(a.value || "");
    const n   = i + 1;
    const isAssert = !!a.isAssertion;
    const assertCodeText = isAssert && loc && a.command !== "open" && a.command !== "captureScreenshot" && a.command !== "pause" && a.command !== "verifyText" && a.command !== "verifyElementPresent" ? ` (Assertion)` : "";
    const cmt = `    # Step ${n}: ${a.command}${a.text ? ` [${a.text}]` : ""}${a.placeholder ? ` [placeholder: ${a.placeholder}]` : ""}${assertCodeText}`;
    const sel = buildSelectorComment(a, "py");
    const sc  = sel ? `${sel}\n` : "";
    const ss  = `os.path.join(SCREENSHOTS_DIR, "step_${n}_screenshot.png")`;

    let assertCode = "";
    if (isAssert && loc && a.command !== "open" && a.command !== "captureScreenshot" && a.command !== "pause" && a.command !== "verifyText" && a.command !== "verifyElementPresent") {
      assertCode = `    try:\n        await expect(${loc}).to_be_visible(timeout=5000)\n        print(f"✅ Step ${n}: Assertion passed!")\n    except AssertionError as e:\n        print(f"❌ Step ${n}: Assertion failed! ({e})")\n        raise\n`;
    }

    if (a.command === "open") {
      code += `${cmt}\n${sc}    await page.goto("${esc(a.target)}", wait_until="domcontentloaded", timeout=30000)\n\n`;
    } else if (a.command === "click") {
      if (a.elementType === "radio") {
        const rName = esc(a.text || a.value || "");
        const inputLoc = buildRecordedInputLocator(a, "radio");
        const labelLoc = buildRecordedLabelLocator(a);
        if (inputLoc && labelLoc) {
          code += `${cmt}\n${sc}    _radio_${n} = ${inputLoc}\n    if not (await _radio_${n}.is_checked()):\n        await ${labelLoc}.click()\n\n`;
        } else if (inputLoc) {
          code += `${cmt}\n${sc}    await ${inputLoc}.check(force=True)\n\n`;
        } else {
          code += `${cmt}\n${sc}    await page.get_by_role("radio", name="${rName}", exact=True).check(force=True)\n\n`;
        }
      } else if (a.elementType === "checkbox") {
        const m = a.value === "off" ? "uncheck" : "check";
        const inputLoc = buildRecordedInputLocator(a, "checkbox");
        const labelLoc = buildRecordedLabelLocator(a);
        const stateCheck = a.value === "off" ? `await _checkbox_${n}.is_checked()` : `not (await _checkbox_${n}.is_checked())`;
        if (inputLoc && labelLoc) {
          code += `${cmt}\n${sc}${assertCode}    _checkbox_${n} = ${inputLoc}\n    if ${stateCheck}:\n        await ${labelLoc}.click()\n\n`;
        } else if (inputLoc) {
          code += `${cmt}\n${sc}${assertCode}    await ${inputLoc}.${m}(force=True)\n\n`;
        } else {
          code += `${cmt}\n${sc}${assertCode}    await page.get_by_label("${esc(a.text || "")}").${m}(force=True)\n\n`;
        }
      } else if (a.elementType === "dropdownOption") {
        code += `${cmt}\n${sc}${assertCode}    await page.get_by_role("option", name="${esc(a.text || a.value || "")}").click()\n\n`;
      } else {
        code += `${cmt}\n${sc}${assertCode}    await ${loc}.click()\n\n`;
      }
    } else if (a.command === "type") {
      code += `${cmt}\n${sc}${assertCode}    await ${loc}.fill("${val}")\n\n`;
    } else if (a.command === "select") {
      code += `${cmt}\n${sc}${assertCode}    await ${loc}.select_option(label="${val}")\n\n`;
    } else if (a.command === "sendKeys") {
      const key = val === "KEY_ENTER" ? "Enter" : val;
      code += `${cmt}\n${sc}${assertCode}    await ${loc}.press("${key}")\n\n`;
    } else if (a.command === "pause") {
      const ms = parseInt(a.value) || 1000;
      code += `${cmt}\n    await page.wait_for_timeout(${ms})  # ${ms / 1000}s\n\n`;
    } else if (a.command === "captureScreenshot") {
      code += `${cmt}  # capture mode: ${a.value || "always"}\n    await page.screenshot(path=${ss})\n\n`;
    } else if (a.command === "verifyText") {
      code += `${cmt}\n${sc}    await expect(${loc}).to_contain_text("${val}")\n\n`;
    } else if (a.command === "verifyElementPresent") {
      code += `${cmt}\n${sc}    await expect(${loc}).to_be_visible()\n\n`;
    } else if (a.command === "selectWindow") {
      code += `${cmt}\n    page = context.pages[-1]  # newest tab\n\n`;
    } else if (a.command === "refresh") {
      code += `${cmt}\n    await page.reload()\n\n`;
    } else {
      code += `${cmt}\n${sc}    # TODO: handle "${a.command}"\n\n`;
    }
  });

  code +=
`${hasTrace ? "    await context.tracing.stop(path=os.path.join(SCREENSHOTS_DIR, \"trace.zip\"))\n" : ""}    await context.close()\n    await browser.close()\n\n\nasync def main():\n    async with async_playwright() as pw:\n        await run(pw)\n\n\nasyncio.run(main())\n`;
  return code;
}

function generatePlaywrightJS(testCase, variables, settings = {}) {
  const varLines = Object.entries(variables || {})
    .map(([k, v]) => `  "${esc(k)}": "${esc(v)}",`).join("\n");
  const _hasSS = (testCase.actions || []).some(a => a.command === "captureScreenshot");
  const base  = (testCase.name || "test").replace(/\s+/g, "_");
  const hasVideo = settings.recordVideo;
  const hasTrace = settings.enableTracing;
  const _traceDir  = settings.tracePath  || 'screenshots';
  const _videoDir  = settings.videoPath  || 'screenshots';
  const _needsFs = true;

  let code =
`// ==============================================================\n// Test: ${testCase.name}\n// Generated by Automation Pro Recorder\n// ==============================================================\n// Requirements:\n//   npm install @playwright/test\n//   npx playwright install chromium\n//\n// Usage:\n//   node ${base}_playwright.js\n// ==============================================================\n\nconst { chromium, expect } = require('@playwright/test');\nconst path = require('path');\n${_needsFs ? "const fs = require('fs');\n" : ""}\nconst VARIABLES = {\n${varLines || "  // No variables defined"}\n};\n\nconst SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');\n\n(async () => {\n${_needsFs ? "  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });\n" : ""}  const browser = await chromium.launch({ headless: false });\n  const context = await browser.newContext(${hasVideo ? `{ recordVideo: { dir: SCREENSHOTS_DIR } }` : ""});\n${hasTrace ? "  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });\n" : ""}  let page = await context.newPage();\n  page.setDefaultTimeout(10000);\n\n  try {\n`;

  (testCase.actions || []).forEach((a, i) => {
    const loc = buildPlaywrightLocator(a, "js");
    const val = esc(a.value || "");
    const n   = i + 1;
    const cmt = `    // Step ${n}: ${a.command}${a.text ? ` [${a.text}]` : ""}${a.placeholder ? ` [placeholder: ${a.placeholder}]` : ""}`;
    const sel = buildSelectorComment(a, "js");
    const sc  = sel ? `${sel}\n` : "";
    const ss  = `path.join(SCREENSHOTS_DIR, 'step_${n}_screenshot.png')`;

    if (a.command === "open") {
      code += `${cmt}\n${sc}    await page.goto("${esc(a.target)}", { waitUntil: "domcontentloaded", timeout: 30000 });\n\n`;
    } else if (a.command === "click") {
      if (a.elementType === "radio") {
        const rName = esc(a.text || a.value || "");
        const inputLoc = buildRecordedInputLocator(a, "radio");
        const labelLoc = buildRecordedLabelLocator(a);
        if (inputLoc && labelLoc) {
          code += `${cmt}\n${sc}    const radio${n} = ${inputLoc};\n    if (!(await radio${n}.isChecked())) {\n      await ${labelLoc}.click();\n    }\n\n`;
        } else if (inputLoc) {
          code += `${cmt}\n${sc}    await ${inputLoc}.check({ force: true });\n\n`;
        } else {
          code += `${cmt}\n${sc}    await page.getByRole('radio', { name: "${rName}", exact: true }).check({ force: true });\n\n`;
        }
      } else if (a.elementType === "checkbox") {
        const m = a.value === "off" ? "uncheck" : "check";
        const inputLoc = buildRecordedInputLocator(a, "checkbox");
        const labelLoc = buildRecordedLabelLocator(a);
        const stateCheck = a.value === "off" ? `await checkbox${n}.isChecked()` : `!(await checkbox${n}.isChecked())`;
        if (inputLoc && labelLoc) {
          code += `${cmt}\n${sc}    const checkbox${n} = ${inputLoc};\n    if (${stateCheck}) {\n      await ${labelLoc}.click();\n    }\n\n`;
        } else if (inputLoc) {
          code += `${cmt}\n${sc}    await ${inputLoc}.${m}({ force: true });\n\n`;
        } else {
          code += `${cmt}\n${sc}    await page.getByLabel("${esc(a.text || "")}").${m}({ force: true });\n\n`;
        }
      } else if (a.elementType === "dropdownOption") {
        code += `${cmt}\n${sc}    await page.getByRole('option', { name: "${esc(a.text || a.value || "")}" }).click();\n\n`;
      } else {
        code += `${cmt}\n${sc}    await ${loc}.click();\n\n`;
      }
    } else if (a.command === "type") {
      code += `${cmt}\n${sc}    await ${loc}.fill("${val}");\n\n`;
    } else if (a.command === "select") {
      code += `${cmt}\n${sc}    await ${loc}.selectOption({ label: "${val}" });\n\n`;
    } else if (a.command === "sendKeys") {
      const key = val === "KEY_ENTER" ? "Enter" : val;
      code += `${cmt}\n${sc}    await ${loc}.press("${key}");\n\n`;
    } else if (a.command === "pause") {
      const ms = parseTimeoutMs(a.value);
      code += `${cmt}\n    await page.waitForTimeout(${ms}); // ${ms / 1000}s\n\n`;
    } else if (a.command === "captureScreenshot") {
      code += `${cmt}  // capture mode: ${a.value || "always"}\n    await page.screenshot({ path: ${ss} });\n\n`;
    } else if (a.command === "verifyText") {
      code += `${cmt}\n${sc}    await expect(${loc}).toContainText("${val}");\n\n`;
    } else if (a.command === "verifyElementPresent") {
      code += `${cmt}\n${sc}    await expect(${loc}).toBeVisible();\n\n`;
    } else if (a.command === "selectWindow") {
      code += `${cmt}\n    page = context.pages()[context.pages().length - 1]; // newest tab\n\n`;
    } else if (a.command === "refresh") {
      code += `${cmt}\n    await page.reload();\n\n`;
    } else {
      code += `${cmt}\n${sc}    // TODO: handle "${a.command}"\n\n`;
    }
  });

  code +=
`  } catch (err) {
    console.error('Test failed:', err.message);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'error_screenshot.png') });
    throw err;
  } finally {
    ${hasTrace ? `await context.tracing.stop({ path: path.join(SCREENSHOTS_DIR, 'trace.zip') });\n    ` : ""}await context.close();
    await browser.close();
  }
})();
`;
  return code;
}

function generateSeleniumPython(testCase, variables) {
  const varLines = Object.entries(variables || {})
    .map(([k, v]) => `    "${esc(k)}": "${esc(v)}",`).join("\n");
  const _hasSS = (testCase.actions || []).some(a => a.command === "captureScreenshot");
  const base  = (testCase.name || "test").replace(/\s+/g, "_");

  let py =
`# ==============================================================\n# Test: ${testCase.name}\n# Generated by Automation Pro Recorder\n# ==============================================================\n# Requirements:\n#   pip install selenium webdriver-manager\n#   (Google Chrome must be installed)\n#\n# Usage:\n#   python ${base}_selenium.py\n# ==============================================================\n\nimport os\nimport time\nfrom selenium import webdriver\nfrom selenium.webdriver.common.by import By\nfrom selenium.webdriver.common.keys import Keys\nfrom selenium.webdriver.support.ui import WebDriverWait, Select\nfrom selenium.webdriver.support import expected_conditions as EC\nfrom selenium.webdriver.chrome.service import Service\nfrom webdriver_manager.chrome import ChromeDriverManager\n\nVARIABLES = {\n${varLines || "    # No variables defined"}\n}\n\nSCREENSHOTS_DIR = "screenshots"\nos.makedirs(SCREENSHOTS_DIR, exist_ok=True)\n\noptions = webdriver.ChromeOptions()\ndriver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)\ndriver.implicitly_wait(5)\nwait = WebDriverWait(driver, 10)\n\ntry:\n`;

  (testCase.actions || []).forEach((a, i) => {
    const loc = buildSeleniumLocator(a);
    const val = esc(a.value || "");
    const n   = i + 1;
    const cmt = `    # Step ${n}: ${a.command}${a.text ? ` [${a.text}]` : ""}${a.placeholder ? ` [placeholder: ${a.placeholder}]` : ""}`;
    const sel = buildSelectorComment(a, "sel");
    const sc  = sel ? `${sel}\n` : "";
    const ss  = `os.path.join(SCREENSHOTS_DIR, "step_${n}_screenshot.png")`;

    if (a.command === "open") {
      py += `${cmt}\n${sc}    driver.get("${esc(a.target)}")\n\n`;
    } else if (a.command === "click") {
      if (a.elementType === "radio") {
        py += `${cmt}\n${sc}    wait.until(EC.element_to_be_clickable((${loc}))).click()\n\n`;
      } else if (a.elementType === "checkbox") {
        const cbId = (a.target || "").startsWith("id=") ? a.target.slice(3) : null;
        if (cbId) {
          py += `${cmt}\n${sc}    _cb = wait.until(EC.presence_of_element_located((By.ID, "${esc(cbId)}")))`;
          py += a.value === "off"
            ? `\n    if _cb.is_selected(): _cb.click()  # uncheck\n\n`
            : `\n    if not _cb.is_selected(): _cb.click()  # check\n\n`;
        } else {
          py += `${cmt}\n${sc}    wait.until(EC.element_to_be_clickable((${loc}))).click()\n\n`;
        }
      } else if (a.elementType === "dropdownOption") {
        py += `${cmt}\n${sc}    wait.until(EC.element_to_be_clickable((${loc}))).click()\n\n`;
      } else {
        py += `${cmt}\n${sc}    wait.until(EC.element_to_be_clickable((${loc}))).click()\n\n`;
      }
    } else if (a.command === "type") {
      py += `${cmt}\n${sc}    _el = wait.until(EC.presence_of_element_located((${loc})))\n    _el.clear()\n    _el.send_keys("${val}")\n\n`;
    } else if (a.command === "select") {
      py += `${cmt}\n${sc}    Select(wait.until(EC.presence_of_element_located((${loc})))).select_by_visible_text("${val}")\n\n`;
    } else if (a.command === "sendKeys") {
      if (val === "KEY_ENTER") {
        py += `${cmt}\n${sc}    wait.until(EC.presence_of_element_located((${loc}))).send_keys(Keys.ENTER)\n\n`;
      } else {
        py += `${cmt}\n${sc}    wait.until(EC.presence_of_element_located((${loc}))).send_keys("${val}")\n\n`;
      }
    } else if (a.command === "pause") {
      const secs = parseTimeoutMs(a.value) / 1000;
      py += `${cmt}\n    time.sleep(${secs})\n\n`;
    } else if (a.command === "captureScreenshot") {
      py += `${cmt}  # capture mode: ${a.value || "always"}\n    driver.save_screenshot(${ss})\n\n`;
    } else if (a.command === "verifyText") {
      py += `${cmt}\n${sc}    _el = wait.until(EC.presence_of_element_located((${loc})))\n    assert "${val}" in _el.text, f'Expected "${val}" in text'\n\n`;
    } else if (a.command === "verifyElementPresent") {
      py += `${cmt}\n${sc}    wait.until(EC.visibility_of_element_located((${loc})))\n\n`;
    } else if (a.command === "selectWindow") {
      py += `${cmt}\n    driver.switch_to.window(driver.window_handles[-1])\n\n`;
    } else if (a.command === "refresh") {
      py += `${cmt}\n    driver.refresh()\n\n`;
    } else {
      py += `${cmt}\n${sc}    # TODO: handle "${a.command}"\n\n`;
    }
  });

  py +=
`except Exception as _e:\n    print(f"Test failed: {_e}")\n    driver.save_screenshot(os.path.join(SCREENSHOTS_DIR, "error_screenshot.png"))\n    raise\n\nfinally:\n    print("Test completed.")\n    time.sleep(2)\n    driver.quit()\n`;
  return py;
}

// ─────────────────────────────────────────────
// Download helper — respects askForLocation setting
// ─────────────────────────────────────────────
function downloadWithSettings(code, filename, settings = {}) {
  const mime = filename.endsWith('.json') ? 'application/json' : 'text/plain';
  const blob = new Blob([code], { type: mime });
  const url  = URL.createObjectURL(blob);
  if (settings.askForLocation && typeof chrome !== 'undefined' && chrome.downloads) {
    chrome.downloads.download({ url, filename, saveAs: true }, () => {
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    });
  } else {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}

// ─────────────────────────────────────────────
// Markdown AI-Prompt Generator
// ─────────────────────────────────────────────

function generateMarkdownPrompt(testCase, variables, screenshots = [], settings = {}) {
  const now = new Date();
  const base = (testCase.name || "test").replace(/\s+/g, "_");
  const actions = testCase.actions || [];
  const hasVars = variables && Object.keys(variables).length > 0;
  const hasTrace = settings.enableTracing;
  const hasVideo = settings.recordVideo;

  // build a map: step index → screenshot
  const ssMap = {};
  screenshots.forEach((s) => {
    const m = /step_(\d+)_screenshot/i.exec(s.name || "");
    if (m) ssMap[parseInt(m[1], 10)] = s;
  });

  const locatorPriorityGuide = `
## 🧭 Locator Priority (use in this order)

| Priority | Strategy | Playwright (Python) | Notes |
|----------|----------|---------------------|-------|
| ✅ 1st | **Label / ARIA name** | \`get_by_label("...")\` | Most human-readable |
| ✅ 2nd | **Role + name** | \`get_by_role("button", name="...")\` | Semantic & robust |
| ✅ 3rd | **Placeholder** | \`get_by_placeholder("...")\` | For text inputs |
| ✅ 4th | **Visible text** | \`get_by_text("...", exact=True)\` | When no label exists |
| ⚠️ 5th | **ID / CSS** | \`page.locator("#id")\` | Brittle, use as fallback |
| ⚠️ Last | **XPath** | \`page.locator("xpath=...")\` | Last resort only |
`;

  let md = `# 🤖 AI Execution Prompt — ${testCase.name}

> **Generated by:** Automation Pro Recorder  
> **Date:** ${now.toLocaleString()}  
> **Steps:** ${actions.length}  
> **Variables:** ${hasVars ? Object.keys(variables).length : "None"}

---

## 📋 Task for AI Agent

You are a browser automation AI. Execute the following test case step-by-step using Playwright (Python sync API).
Use **text/label-based locators as the primary strategy**. Only fall back to ID, CSS, or XPath if semantic locators are unavailable.
After each step, verify the action was successful before proceeding to the next.

### Setup

\`\`\`python
import os
from playwright.sync_api import sync_playwright, expect

SCREENSHOTS_DIR = "screenshots"
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

def run(pw):
    browser = pw.chromium.launch(headless=False)
    context = browser.new_context(${hasVideo ? `record_video_dir=SCREENSHOTS_DIR` : ""})
${hasTrace ? "    context.tracing.start(screenshots=True, snapshots=True, sources=True)\n" : ""}    page = context.new_page()
    page.set_default_timeout(10000)
    # Steps below...

with sync_playwright() as pw:
    run(pw)
\`\`\`
`;

  if (hasVars) {
    md += `\n### Variables\n\n| Key | Value |\n|-----|-------|\n`;
    Object.entries(variables).forEach(([k, v]) => {
      md += `| \`${k}\` | \`${v}\` |\n`;
    });
    md += `\n`;
  }

  md += `\n${locatorPriorityGuide}\n---\n\n## 🪜 Step-by-Step Execution Guide\n\n`;

  actions.forEach((a, i) => {
    const n = i + 1;
    const label = a.text ? `[${a.text}]` : "";
    const cmdLabel = `${a.command}${label ? " " + label : ""}`;

    // Collect all selectors
    const sels = {};
    if (a.text)        sels["text/label"]  = a.text;
    if (a.placeholder) sels["placeholder"] = a.placeholder;
    if (a.allSelectors) {
      const as = a.allSelectors;
      if (as.id)    sels["id"]    = as.id.replace(/^id=/, "");
      if (as.name)  sels["name"]  = as.name.replace(/^name=/, "");
      if (as.css)   sels["css"]   = as.css.replace(/^css=/, "");
      const xpaths = Object.entries(as)
        .filter(([k]) => k.startsWith("xpath"))
        .map(([, v]) => v.replace(/^xpath=/, ""));
      if (xpaths.length) sels["xpath"] = xpaths[0];
    } else if (a.target) {
      // fallback raw target
      const t = a.target;
      if (t.startsWith("id="))    sels["id"]    = t.slice(3);
      else if (t.startsWith("css="))  sels["css"]   = t.slice(4);
      else if (t.startsWith("xpath=")) sels["xpath"] = t.slice(6);
      else if (t.startsWith("name=")) sels["name"]  = t.slice(5);
      else                         sels["target"] = t;
    }

    // Status badge (for report variant)
    const statusAction = a.status;
    let statusBadge = "";
    if (statusAction === "success") statusBadge = " ✅";
    else if (statusAction === "fail") statusBadge = " ❌";
    else if (statusAction === "warning") statusBadge = " ⚠️";

    md += `### Step ${n} — \`${cmdLabel}\`${statusBadge}\n\n`;

    // Selector table
    if (Object.keys(sels).length > 0) {
      md += `| Selector Type | Value | Priority |\n|---------------|-------|----------|\n`;
      if (sels["text/label"])  md += `| 🏷️ **text / label** | \`${sels["text/label"]}\` | ✅ Primary |\n`;
      if (sels["placeholder"]) md += `| 📝 **placeholder** | \`${sels["placeholder"]}\` | ✅ Primary |\n`;
      if (sels["id"])    md += `| id | \`${sels["id"]}\` | ⚠️ Fallback |\n`;
      if (sels["name"])  md += `| name | \`${sels["name"]}\` | ⚠️ Fallback |\n`;
      if (sels["css"])   md += `| css | \`${sels["css"]}\` | ⚠️ Fallback |\n`;
      if (sels["xpath"]) md += `| xpath | \`${sels["xpath"]}\` | ⚠️ Last resort |\n`;
      if (sels["target"]) md += `| raw | \`${sels["target"]}\` | ⚠️ Fallback |\n`;
      md += `\n`;
    }

    // Code block
    if (a.command === "open") {
      md += `**Action:** Navigate to URL\n\n\`\`\`python\npage.goto("${a.target || ""}", wait_until="domcontentloaded", timeout=30000)\n\`\`\`\n\n`;
    } else if (a.command === "click") {
      const primaryLoc = buildPlaywrightLocator(a, "py");
      if (a.elementType === "radio") {
        const inputLoc = buildRecordedInputLocator(a, "radio");
        const labelLoc = buildRecordedLabelLocator(a);
        md += `**Action:** Click radio button\n\n`;
        md += `\`\`\`python\n# PRIMARY (label-based):\n`;
        if (a.text) md += `page.get_by_label("${esc(a.text)}").check()\n`;
        if (inputLoc && labelLoc) md += `\n# ROBUST (check state first):\n_radio_${n} = ${inputLoc}\nif not _radio_${n}.is_checked():\n    ${labelLoc}.click()\n`;
        md += `\`\`\`\n\n`;
      } else if (a.elementType === "checkbox") {
        const m = a.value === "off" ? "uncheck" : "check";
        const inputLoc = buildRecordedInputLocator(a, "checkbox");
        const labelLoc = buildRecordedLabelLocator(a);
        md += `**Action:** ${m === "check" ? "Check" : "Uncheck"} checkbox\n\n`;
        md += `\`\`\`python\n# PRIMARY (label-based):\n`;
        if (a.text) md += `page.get_by_label("${esc(a.text)}").${m}()\n`;
        if (inputLoc && labelLoc) {
          const stateCheck = m === "check" ? `not _checkbox_${n}.is_checked()` : `_checkbox_${n}.is_checked()`;
          md += `\n# ROBUST (check state first):\n_checkbox_${n} = ${inputLoc}\nif ${stateCheck}:\n    ${labelLoc}.click()\n`;
        }
        md += `\`\`\`\n\n`;
      } else if (a.elementType === "dropdownOption") {
        md += `**Action:** Click dropdown option\n\n\`\`\`python\n# PRIMARY (role-based):\npage.get_by_role("option", name="${esc(a.text || a.value || "")}").click()\n\`\`\`\n\n`;
      } else {
        md += `**Action:** Click element\n\n\`\`\`python\n# PRIMARY:\n${primaryLoc}.click()\n`;
        if (sels["id"]) md += `\n# FALLBACK:\npage.locator("#${sels["id"]}").click()\n`;
        md += `\`\`\`\n\n`;
      }
    } else if (a.command === "type") {
      const loc = buildPlaywrightLocator(a, "py");
      md += `**Action:** Type text\n\n\`\`\`python\n# PRIMARY:\n${loc}.fill("${esc(a.value || "")}")\n`;
      if (sels["id"]) md += `\n# FALLBACK:\npage.locator("#${sels["id"]}").fill("${esc(a.value || "")}")\n`;
      md += `\`\`\`\n\n`;
    } else if (a.command === "select") {
      const loc = buildPlaywrightLocator(a, "py");
      md += `**Action:** Select option\n\n\`\`\`python\n${loc}.select_option(label="${esc(a.value || "")}")\n\`\`\`\n\n`;
    } else if (a.command === "captureScreenshot") {
      md += `**Action:** Capture screenshot _(mode: ${a.value || "always"})_\n\n\`\`\`python\npage.screenshot(path=os.path.join(SCREENSHOTS_DIR, "step_${n}_screenshot.png"))\n\`\`\`\n\n`;
      // embed screenshot if available
      const ss = ssMap[n];
      if (ss && ss.data) {
        md += `**Screenshot:**\n\n![Step ${n} Screenshot](${ss.data})\n\n`;
      }
    } else if (a.command === "verifyText") {
      const loc = buildPlaywrightLocator(a, "py");
      md += `**Action:** Verify text\n\n\`\`\`python\nexpect(${loc}).to_contain_text("${esc(a.value || "")}")\n\`\`\`\n\n`;
    } else if (a.command === "verifyElementPresent") {
      const loc = buildPlaywrightLocator(a, "py");
      md += `**Action:** Verify element visible\n\n\`\`\`python\nexpect(${loc}).to_be_visible()\n\`\`\`\n\n`;
    } else if (a.command === "pause") {
      const ms = parseInt(a.value) || 1000;
      md += `**Action:** Wait ${ms}ms\n\n\`\`\`python\npage.wait_for_timeout(${ms})  # ${ms / 1000}s\n\`\`\`\n\n`;
    } else if (a.command === "sendKeys") {
      const key = (a.value || "") === "KEY_ENTER" ? "Enter" : (a.value || "");
      const loc = buildPlaywrightLocator(a, "py");
      md += `**Action:** Press key \`${key}\`\n\n\`\`\`python\n${loc}.press("${key}")\n\`\`\`\n\n`;
    } else if (a.command === "refresh") {
      md += `**Action:** Reload page\n\n\`\`\`python\npage.reload()\n\`\`\`\n\n`;
    } else {
      md += `**Action:** \`${a.command}\` _(handle manually)_\n\n`;
    }

    md += `---\n\n`;
  });

  md += `## 🏁 Teardown\n\n\`\`\`python\n${hasTrace ? `context.tracing.stop(path=os.path.join(SCREENSHOTS_DIR, "trace.zip"))\n` : ""}context.close()\nbrowser.close()\n\`\`\`\n\n`;
  md += `---\n\n> **AI Agent Note:** If a primary locator fails, try the next fallback in the priority table. `
       + `Always verify state (\`is_checked\`, \`is_visible\`) before interacting. `
       + `Take a screenshot after every major action for debugging.\n`;

  return md;
}

// ─────────────────────────────────────────────
// Export Modal Component
// ─────────────────────────────────────────────

const EXPORT_TABS = [
  { id: "pw_py_sync", label: "Playwright Python", sub: "sync" },
  { id: "pw_py_async", label: "Playwright Python", sub: "async" },
  { id: "pw_js", label: "Playwright JS" },
  { id: "selenium_py", label: "Selenium Python" },
  { id: "json", label: "JSON" },
  { id: "md", label: "AI Prompt MD" },
];

function ExportModal({ testCase, variables, settings, onClose }) {
  const [activeTab, setActiveTab] = useState("pw_py_sync");
  const [copied, setCopied] = useState(false);

  const getCode = () => {
    if (activeTab === "pw_py_sync") return generatePlaywrightPythonSync(testCase, variables, settings);
    if (activeTab === "pw_py_async") return generatePlaywrightPythonAsync(testCase, variables, settings);
    if (activeTab === "pw_js") return generatePlaywrightJS(testCase, variables, settings);
    if (activeTab === "selenium_py") return generateSeleniumPython(testCase, variables);
    if (activeTab === "json") return JSON.stringify({ testCase, variables }, null, 2);
    if (activeTab === "md") return generateMarkdownPrompt(testCase, variables, [], settings);
    return "";
  };

  const getFilename = () => {
    const base = (testCase.name || "test").replace(/\s+/g, "_");
    if (activeTab === "pw_py_sync") return `${base}_playwright_sync.py`;
    if (activeTab === "pw_py_async") return `${base}_playwright_async.py`;
    if (activeTab === "pw_js") return `${base}_playwright.js`;
    if (activeTab === "selenium_py") return `${base}_selenium.py`;
    if (activeTab === "json") return `${base}.json`;
    if (activeTab === "md") return `${base}_ai_prompt.md`;
    return `${base}.txt`;
  };

  const download = () => {
    downloadWithSettings(getCode(), getFilename(), settings);
  };

  const downloadMd = () => {
    const md = generateMarkdownPrompt(testCase, variables, [], settings);
    const fn = `${(testCase.name || "test").replace(/\s+/g, "_")}_ai_prompt.md`;
    downloadWithSettings(md, fn, settings);
  };

  const copy = async () => {
    await navigator.clipboard.writeText(getCode());
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const code = getCode();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#1e1e1e] border border-gray-700 rounded-xl shadow-2xl w-[780px] max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-[#252525]">
          <div>
            <h2 className="text-sm font-bold text-white">Export Test Case</h2>
            <p className="text-[10px] text-gray-500 mt-0.5">{testCase.name} · {(testCase.actions || []).length} steps</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={copy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-bold bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors"
            >
              {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
              {copied ? "Copied!" : "Copy"}
            </button>
            <button
              onClick={downloadMd}
              title="Download as AI-prompt Markdown"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-bold bg-emerald-700 text-white hover:bg-emerald-600 transition-colors"
            >
              <FileText size={12} />
              MD
            </button>
            <button
              onClick={download}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-bold bg-blue-600 text-white hover:bg-blue-500 transition-colors"
            >
              <Download size={12} />
              Download
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex bg-[#1a1a1a] border-b border-gray-700 px-2 gap-0.5 pt-1 overflow-x-auto shrink-0">
          {EXPORT_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center px-3 py-1.5 text-[10px] font-bold uppercase rounded-t transition-all border-b-2 whitespace-nowrap ${
                activeTab === tab.id
                  ? "bg-[#1e1e1e] text-blue-400 border-blue-500"
                  : "text-gray-500 border-transparent hover:text-gray-300 hover:bg-white/5"
              }`}
            >
              <span>{tab.label}</span>
              {tab.sub && <span className="text-[8px] opacity-60 normal-case">{tab.sub}</span>}
            </button>
          ))}
        </div>

        {/* Code Preview */}
        <div className="flex-1 overflow-auto p-0">
          <pre className="text-[11px] font-mono text-gray-300 p-4 leading-relaxed whitespace-pre-wrap break-words">
            {code}
          </pre>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// PDF Report Generator
// ─────────────────────────────────────────────

function buildHTMLReport(testCase, screenshots, actions) {
  const now = new Date();
  const passed = actions.filter((a) => a.status === "success").length;
  const failed = actions.filter(
    (a) => a.status === "fail" || a.status === "warning"
  ).length;
  const total = actions.length;

  const stepsHtml = actions
    .map((a, i) => {
      const sc = a.status === "success" ? "#10b981" : a.status === "fail" ? "#ef4444" : a.status === "warning" ? "#f59e0b" : "#6b7280";
      const si = a.status === "success" ? "✓" : a.status === "fail" ? "✗" : a.status === "warning" ? "⚠" : "–";
      return `<tr>
        <td style="color:${sc};text-align:center;font-weight:bold;padding:6px 8px;">${si}</td>
        <td style="padding:6px 8px;text-align:center;color:#9ca3af;">${i + 1}</td>
        <td style="padding:6px 8px;color:#60a5fa;font-weight:bold;text-transform:uppercase;">${a.command}</td>
        <td style="padding:6px 8px;color:#d1d5db;font-family:monospace;font-size:10px;word-break:break-all;">${a.target || ""}</td>
        <td style="padding:6px 8px;color:#c084fc;">${a.text || ""}</td>
        <td style="padding:6px 8px;color:#34d399;font-family:monospace;">${a.value || ""}</td>
      </tr>`;
    })
    .join("");

  const ssHtml = screenshots
    .map(
      (s) =>
        `<div style="page-break-inside:avoid;margin:16px 0;border:1px solid #374151;border-radius:8px;overflow:hidden;">
          <div style="background:#1f2937;padding:6px 12px;font-size:11px;color:#9ca3af;">${s.name} &nbsp;·&nbsp; ${s.mode || "always"}</div>
          <img src="${s.data}" style="width:100%;display:block;"/>
        </div>`
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Test Report – ${testCase.name}</title>
<style>
* { box-sizing:border-box; margin:0; padding:0; }
body { font-family:system-ui,sans-serif; background:#111827; color:#f9fafb; padding:24px; }
.print-btn { position:fixed;top:20px;right:20px;background:#3b82f6;color:white;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-weight:bold;font-size:13px; }
.header { text-align:center;margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid #374151; }
h1 { font-size:22px;color:#3b82f6;margin-bottom:6px; }
h2 { font-size:14px;color:#9ca3af;font-weight:normal; }
.meta { font-size:11px;color:#6b7280;margin-top:6px; }
.stats { display:flex;gap:12px;justify-content:center;margin-bottom:24px; }
.stat { padding:10px 20px;border-radius:8px;text-align:center;font-weight:bold; }
.stat-num { font-size:24px;display:block; }
.stat-label { font-size:10px;opacity:.8; }
.stat-t { background:#1f2937;border:1px solid #374151;color:#9ca3af; }
.stat-p { background:#064e3b;border:1px solid #10b981;color:#34d399; }
.stat-f { background:#450a0a;border:1px solid #ef4444;color:#f87171; }
table { width:100%;border-collapse:collapse;margin-bottom:24px;font-size:11px; }
th { background:#1f2937;padding:8px;text-align:left;color:#6b7280;font-size:9px;font-weight:bold;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #374151; }
tr:nth-child(even) { background:rgba(255,255,255,.02); }
.ss-title { font-size:14px;font-weight:bold;color:#9ca3af;margin-bottom:12px;border-bottom:1px solid #374151;padding-bottom:6px; }
@media print {
  body { background:white;color:black; }
  .print-btn { display:none; }
  th { background:#f3f4f6;color:#374151; }
}
</style></head><body>
<button class="print-btn" onclick="window.print()">🖨 Save as PDF</button>
<div class="header"><h1>🤖 Automation Report</h1><h2>${testCase.name}</h2><div class="meta">Generated: ${now.toLocaleString()} &nbsp;|&nbsp; Steps: ${total}</div></div>
<div class="stats">
  <div class="stat stat-t"><span class="stat-num">${total}</span><span class="stat-label">Total</span></div>
  <div class="stat stat-p"><span class="stat-num">${passed}</span><span class="stat-label">Passed</span></div>
  <div class="stat stat-f"><span class="stat-num">${failed}</span><span class="stat-label">Failed</span></div>
</div>
<table><thead><tr><th>✓</th><th>#</th><th>Command</th><th>Target</th><th>Label</th><th>Value</th></tr></thead>
<tbody>${stepsHtml}</tbody></table>
${screenshots.length > 0 ? `<div class="ss-title">📸 Screenshots (${screenshots.length})</div>${ssHtml}` : ""}
</body></html>`;
}

// ─────────────────────────────────────────────
// Report Prompt Modal
// ─────────────────────────────────────────────

function ReportModal({ testCase, screenshots, actions, settings, onClose, onClearScreenshots }) {
  const generate = () => {
    const html = buildHTMLReport(testCase, screenshots, actions);
    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 600);
    onClearScreenshots();
    onClose();
  };

  const exportMdReport = () => {
    // Merge run-time status into actions, and pass screenshots (with base64 data) for embedding
    const actionsWithStatus = actions.map((a, i) => ({ ...a }));
    // Build a test-case copy that includes the run-time statuses
    const enrichedTC = { ...testCase, actions: actionsWithStatus };
    const md = generateMarkdownPrompt(enrichedTC, {}, screenshots, settings);
    const blob = new Blob([md], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(testCase.name || "test").replace(/\s+/g, "_")}_report.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const skip = () => {
    const keep = confirm("Keep the screenshots in the Screenshots panel?\n\nOK = Keep  |  Cancel = Delete");
    if (!keep) onClearScreenshots();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-[#1e1e2e] border border-violet-800/50 rounded-2xl shadow-2xl w-[440px] p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 bg-violet-600/20 rounded-xl">
            <FileText size={22} className="text-violet-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Playback Complete!</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">Generate a PDF report with screenshots?</p>
          </div>
        </div>

        {/* Screenshot preview strip */}
        {screenshots.length > 0 && (
          <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
            {screenshots.map((s, i) => (
              <div key={i} className="flex-shrink-0 relative">
                <img src={s.data} className="h-16 w-28 object-cover rounded border border-gray-700" />
                <span className="absolute bottom-0.5 left-0.5 right-0.5 text-[7px] bg-black/70 text-gray-300 text-center rounded px-1 truncate">{s.name}</span>
              </div>
            ))}
          </div>
        )}

        <div className="text-[11px] text-gray-500 mb-5">
          {screenshots.length} screenshot{screenshots.length !== 1 ? "s" : ""} captured &nbsp;·&nbsp; {actions.length} steps
        </div>

        <div className="flex gap-2 justify-end flex-wrap">
          <button
            onClick={skip}
            className="px-4 py-2 rounded-lg text-[11px] font-bold text-gray-400 hover:bg-white/5 transition-colors"
          >
            Skip
          </button>
          <button
            onClick={exportMdReport}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-bold bg-emerald-700 hover:bg-emerald-600 text-white transition-colors"
          >
            <FileText size={13} />
            Export MD Report
          </button>
          <button
            onClick={generate}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-bold bg-violet-600 hover:bg-violet-500 text-white transition-colors"
          >
            <FileText size={13} />
            Generate PDF Report
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Add Step Modal
// ─────────────────────────────────────────────

const COMMANDS = [
  { value: "open",                label: "open",               desc: "Navigate to URL" },
  { value: "click",               label: "click",              desc: "Click an element" },
  { value: "type",                label: "type",               desc: "Type text into field" },
  { value: "select",              label: "select",             desc: "Select dropdown option" },
  { value: "sendKeys",            label: "sendKeys",           desc: "Send keyboard key" },
  { value: "pause",               label: "pause",              desc: "Wait (ms)" },
  { value: "verifyText",          label: "verifyText",         desc: "Assert element contains text" },
  { value: "verifyElementPresent",label: "verifyElementPresent",desc: "Assert element is visible" },
  { value: "refresh",             label: "refresh",            desc: "Reload the page" },
  { value: "selectWindow",        label: "selectWindow",       desc: "Switch to newest tab" },
];

const SELECTOR_STRATEGIES = [
  { prefix: "id=",        label: "id" },
  { prefix: "css=",       label: "css" },
  { prefix: "xpath=",     label: "xpath" },
  { prefix: "name=",      label: "name" },
  { prefix: "link=",      label: "link text" },
  { prefix: "label=",     label: "by label" },
  { prefix: "",           label: "custom / full" },
];

const SEND_KEYS_OPTIONS = [
  "KEY_ENTER", "KEY_TAB", "KEY_ESCAPE", "KEY_SPACE", "KEY_BACKSPACE",
  "KEY_DELETE", "KEY_UP", "KEY_DOWN", "KEY_LEFT", "KEY_RIGHT",
  "KEY_HOME", "KEY_END", "KEY_PAGE_UP", "KEY_PAGE_DOWN",
];

function AddStepModal({ onClose, onAdd, initialStep, isDuplicate }) {
  const parseTarget = (targetText) => {
    if (!targetText) return { strat: "id=", val: "" };
    for (const s of SELECTOR_STRATEGIES) {
      if (s.prefix && targetText.startsWith(s.prefix)) {
        return { strat: s.prefix, val: targetText.substring(s.prefix.length) };
      }
    }
    return { strat: "", val: targetText };
  };

  const initCmd = initialStep?.command || "click";
  const tgt = parseTarget(initialStep?.target);

  const [command, setCommand]         = useState(initCmd);
  const [strategy, setStrategy]       = useState(initCmd === "open" ? "id=" : tgt.strat || "id=");
  const [targetVal, setTargetVal]     = useState(initCmd === "open" ? initialStep?.target || "" : tgt.val || "");
  const [textLabel, setTextLabel]     = useState(initialStep?.text || initialStep?.placeholder || "");
  const [value, setValue]             = useState(initialStep?.value || "");
  const [error, setError]             = useState("");

  const isOpen    = command === "open";
  const isPause   = command === "pause";
  const isSendKey = command === "sendKeys";
  const isRefresh = command === "refresh";
  const isWindow  = command === "selectWindow";
  const noTarget  = isRefresh || isWindow;

  // For "open" command the target IS the URL, no strategy prefix
  const buildTarget = () => {
    if (isOpen) return targetVal.trim();
    if (noTarget) return "";
    return strategy + targetVal.trim();
  };

  const handleAdd = () => {
    setError("");
    const tgt = buildTarget();
    if (isOpen && !tgt) { setError("URL is required."); return; }
    if (!noTarget && !isOpen && !targetVal.trim()) { setError("Target value is required."); return; }
    if (isSendKey && !value) { setError("Please select a key."); return; }
    if (isPause && (!value || isNaN(parseInt(value)))) { setError("Pause value (ms) must be a number."); return; }

    const action = {
      ...(initialStep || {}),
      command,
      target: tgt,
      value: value.trim(),
      text: textLabel.trim(),
      placeholder: initialStep?.placeholder || "",
      elementType: initialStep?.elementType || "",
      timestamp: new Date().toISOString(),
      status: null,
      allSelectors: initialStep?.allSelectors || (tgt ? { [strategy || "custom"]: tgt } : {}),
      isAssertion: Boolean(initialStep?.isAssertion),
    };
    onAdd(action);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm">
      <div className="bg-[#1e1e2e] border border-blue-700/40 rounded-2xl shadow-2xl w-[520px] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-700/60 bg-[#252535]">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-blue-600/20 rounded-lg">
              {isDuplicate ? <Copy size={15} className="text-blue-400" /> : <Plus size={15} className="text-blue-400" />}
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">{isDuplicate ? "Duplicate Step" : "Add Step"}</h2>
              <p className="text-[10px] text-gray-500 mt-0.5">{isDuplicate ? "Duplicate and edit step" : "Create a new automation step manually"}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-700 rounded-lg text-gray-500 hover:text-white transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">

          {/* Command picker */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Command</label>
            <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
              {COMMANDS.map((cmd) => (
                <button
                  key={cmd.value}
                  onClick={() => { setCommand(cmd.value); setTargetVal(""); setValue(""); setError(""); }}
                  className={`flex flex-col items-start px-3 py-2 rounded-lg border text-left transition-all ${
                    command === cmd.value
                      ? "bg-blue-600/20 border-blue-500 text-blue-300"
                      : "bg-[#2a2a3a] border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200"
                  }`}
                >
                  <span className="text-[11px] font-bold font-mono">{cmd.label}</span>
                  <span className="text-[9px] opacity-60 mt-0.5">{cmd.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Target */}
          {!noTarget && (
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                {isOpen ? "URL" : "Target"}
              </label>
              {isOpen ? (
                <input
                  className="w-full bg-[#2a2a3a] border border-gray-700 focus:border-blue-500 rounded-lg px-3 py-2 text-[12px] text-gray-200 outline-none font-mono placeholder-gray-600 transition-colors"
                  placeholder="https://example.com"
                  value={targetVal}
                  onChange={(e) => setTargetVal(e.target.value)}
                />
              ) : (
                <div className="flex gap-2">
                  {/* Selector strategy */}
                  <select
                    className="shrink-0 bg-[#2a2a3a] border border-gray-700 focus:border-blue-500 rounded-lg px-2 py-2 text-[11px] text-blue-300 font-bold outline-none cursor-pointer transition-colors"
                    value={strategy}
                    onChange={(e) => setStrategy(e.target.value)}
                  >
                    {SELECTOR_STRATEGIES.map((s) => (
                      <option key={s.prefix} value={s.prefix}>{s.label}</option>
                    ))}
                  </select>
                  {/* Target value */}
                  <input
                    className="flex-1 bg-[#2a2a3a] border border-gray-700 focus:border-blue-500 rounded-lg px-3 py-2 text-[12px] text-gray-200 outline-none font-mono placeholder-gray-600 transition-colors"
                    placeholder={strategy === "id=" ? "myInputId" : strategy === "css=" ? ".my-class" : strategy === "xpath=" ? "//input[@id='x']" : strategy === "name=" ? "fieldName" : strategy === "link=" ? "Click here" : strategy === "label=" ? "Email address" : "selector value"}
                    value={targetVal}
                    onChange={(e) => setTargetVal(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          {/* Value */}
          {!isOpen && !isRefresh && !isWindow && (
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                Value <span className="normal-case text-gray-600 font-normal ml-1">{isPause ? "(milliseconds)" : isSendKey ? "(key)" : ""}</span>
              </label>
              {isSendKey ? (
                <select
                  className="w-full bg-[#2a2a3a] border border-gray-700 focus:border-blue-500 rounded-lg px-3 py-2 text-[12px] text-blue-300 font-bold outline-none cursor-pointer transition-colors"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                >
                  <option value="">— select key —</option>
                  {SEND_KEYS_OPTIONS.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              ) : (
                <input
                  className="w-full bg-[#2a2a3a] border border-gray-700 focus:border-blue-500 rounded-lg px-3 py-2 text-[12px] text-gray-200 outline-none font-mono placeholder-gray-600 transition-colors"
                  placeholder={isPause ? "1000" : command === "select" ? "Option text" : command === "type" ? "text to type" : command === "verifyText" ? "expected text" : "value"}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              )}
            </div>
          )}

          {/* Text / Label (optional) */}
          {!isOpen && !isRefresh && !isWindow && !isPause && (
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                Text / Label <span className="normal-case text-gray-600 font-normal ml-1">(optional — used for locator priority)</span>
              </label>
              <input
                className="w-full bg-[#2a2a3a] border border-gray-600 focus:border-purple-500 rounded-lg px-3 py-2 text-[12px] text-purple-300 outline-none placeholder-gray-600 transition-colors"
                placeholder="e.g. Submit, Email address, Next button…"
                value={textLabel}
                onChange={(e) => setTextLabel(e.target.value)}
              />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              ⚠ {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-700/60 bg-[#1a1a2a]">
          <div className="text-[10px] text-gray-600">
            Step will be added at the <span className="text-gray-400 font-bold">end</span> of the list
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-[11px] font-bold text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-bold bg-blue-600 hover:bg-blue-500 text-white transition-colors shadow-lg shadow-blue-500/20"
            >
              {isDuplicate ? <Copy size={13} /> : <Plus size={13} />}
              {isDuplicate ? "Duplicate Step" : "Add Step"}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

const Toolbar = ({
  isRecording,
  isPlaying,
  onToggleRecord,
  onPlay,
  onStopPlayback,
  onExport,
  onAddRow,
  onAddScreenshot,
  onAddSleep,
  onAssert,
  isAssertMode,
  onOpenVideo,
  onSettings,
  playbackDelay,
  onDelayChange,
}) => {
  return (
  <div className="h-10 bg-[#2b2b2b] border-b border-gray-700 flex items-center px-3 gap-2 justify-between">
    <div className="flex items-center gap-2">
      <button
        onClick={onToggleRecord}
        disabled={isPlaying}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-bold transition-all border ${
          isRecording
            ? "bg-red-600 border-red-500 text-white animate-pulse"
            : isPlaying
              ? "bg-gray-700 text-gray-500 border-gray-600 cursor-not-allowed"
              : "bg-[#3c3c3c] border-gray-600 text-gray-200 hover:bg-[#4c4c4c]"
        }`}
      >
        <Circle size={10} fill={isRecording ? "white" : "none"} />
        {isRecording ? "STOP" : "RECORD"}
      </button>
      <div className="h-5 w-px bg-gray-700 mx-0.5" />
      <div className="flex items-center gap-0.5">
        {isPlaying ? (
          <button
            onClick={onStopPlayback}
            className="p-1 px-2 bg-red-600/20 border border-red-600/50 rounded text-red-500 hover:bg-red-600 hover:text-white transition-all flex items-center gap-1.5 text-[10px] font-bold"
          >
            <Square size={12} fill="currentColor" />
            STOP
          </button>
        ) : (
          <button
            onClick={onPlay}
            disabled={isRecording}
            className={`p-1 px-2 rounded text-gray-400 hover:text-white transition-colors flex items-center gap-1.5 text-[10px] font-bold ${
              isRecording ? "opacity-30 cursor-not-allowed" : "hover:bg-gray-700"
            }`}
          >
            <Play size={14} fill="currentColor" />
            PLAY
          </button>
        )}
        <button className="p-1 px-2 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors">
          <Pause size={14} fill="currentColor" />
        </button>
        <button
          onClick={() => onAddRow()}
          className="p-1 px-2 hover:bg-gray-700 rounded text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1.5 text-[10px] font-bold"
          title="Add Manual Step"
        >
          <Plus size={14} />
          ADD STEP
        </button>
        {/* Screenshot step button */}
        <button
          onClick={onAddScreenshot}
          className="p-1 px-2 hover:bg-violet-700/30 border border-violet-700/40 rounded text-violet-400 hover:text-violet-300 transition-colors flex items-center gap-1.5 text-[10px] font-bold"
          title="Add Screenshot Step — drag to reorder"
        >
          <Camera size={13} />
          SCREENSHOT
        </button>
        {/* Sleep step button */}
        <button
          onClick={onAddSleep}
          className="p-1 px-2 hover:bg-amber-700/30 border border-amber-700/40 rounded text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-1.5 text-[10px] font-bold"
          title="Add Sleep Step — drag to reorder"
        >
          <Clock size={13} />
          SLEEP
        </button>
        {/* Assert Mode button — Playwright codegen style (only during recording) */}
        {isRecording && (
          <button
            onClick={onAssert}
            className={`p-1 px-2 rounded flex items-center gap-1.5 text-[10px] font-bold border transition-all ${
              isAssertMode
                ? "bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_8px_rgba(6,182,212,0.4)]"
                : "hover:bg-cyan-700/20 border-cyan-700/40 text-cyan-500 hover:text-cyan-300"
            }`}
            title={isAssertMode ? "Assert mode ON — click any element on the page" : "Assert visible element (Playwright codegen style)"}
          >
            {isAssertMode ? <Eye size={13} /> : <EyeOff size={13} />}
            ASSERT
          </button>
        )}
      </div>
      <div className="h-5 w-px bg-gray-700 mx-1" />
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold text-gray-500 uppercase">Speed:</span>
        <input
          type="range" min="0" max="5000" step="500"
          value={playbackDelay}
          onChange={(e) => onDelayChange(parseInt(e.target.value))}
          className="w-24 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
        />
        <span className="text-[10px] text-gray-400 w-8">{(playbackDelay / 1000).toFixed(1)}s</span>
      </div>
    </div>

    <div className="flex items-center gap-1 relative">
      <button
        onClick={onExport}
        className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
        title="Export code (all formats)"
      >
        <FileCode size={16} />
      </button>
      <button 
        onClick={onSettings}
        className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
        title="Settings — configure trace/video paths, ask for location"
      >
        <Settings size={16} />
      </button>
      <div className="h-5 w-px bg-gray-700 mx-1" />
      <div className="flex items-center gap-2 text-[9px] font-bold text-gray-500 bg-black/10 px-2.5 py-1 rounded border border-gray-700">
        <span
          className={`w-1.5 h-1.5 rounded-full ${isRecording ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" : isPlaying ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-gray-600"}`}
        />
        {isRecording ? "RECORDING" : isPlaying ? "PLAYING" : "IDLE"}
      </div>
    </div>
  </div>
  );
};

const Sidebar = ({ testCases, selectedIndex, onSelect, onSave, onLoad }) => (
  <div className="w-64 bg-[#181818] border-r border-gray-700 flex flex-col shrink-0">
    <div className="px-3 py-2 border-b border-gray-700 flex items-center justify-between bg-[#212121]">
      <h2 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
        Test Explorer
      </h2>
      <div className="flex items-center gap-1">
        <button
          onClick={onLoad}
          className="p-0.5 hover:bg-gray-700 rounded text-emerald-400"
          title="Load tests from JSON file"
        >
          <Download size={12} />
        </button>
        <button
          onClick={onSave}
          className="p-0.5 hover:bg-gray-700 rounded text-amber-400"
          title="Save all tests to JSON file"
        >
          <FileText size={12} />
        </button>
        <button
          onClick={() => {
            const name = prompt("Enter test case name:", "New Test Case");
            if (name) onSelect(-1, name);
          }}
          className="p-0.5 hover:bg-gray-700 rounded text-blue-400"
        >
          <FilePlus size={12} />
        </button>
      </div>
    </div>
    <div className="flex-1 overflow-y-auto">
      {testCases.map((test, idx) => (
        <div
          key={idx}
          onClick={() => onSelect(idx)}
          className={`px-3 py-1.5 flex items-center gap-2 cursor-pointer group transition-colors border-b border-gray-800/50 ${
            selectedIndex === idx
              ? "bg-blue-600/20 text-blue-400 border-l-2 border-l-blue-500"
              : "hover:bg-[#252525] text-gray-400"
          }`}
        >
          <ChevronRight
            size={12}
            className={selectedIndex === idx ? "text-blue-400" : "text-gray-600"}
          />
          <span className="text-xs truncate flex-1">{test.name}</span>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelect(idx, "RENAME");
              }}
              className="p-1 hover:text-white"
            >
              <Edit2 size={10} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelect(idx, "DELETE");
              }}
              className="p-1 hover:text-red-400"
            >
              <Trash2 size={10} />
            </button>
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ─────────────────────────────────────────────
// Step Grid — drag-to-reorder + screenshot steps
// ─────────────────────────────────────────────

const CAPTURE_MODES = [
  { value: "always", label: "Pass or Fail" },
  { value: "pass",   label: "Pass only" },
  { value: "fail",   label: "Fail only" },
];

// Short display label for the Command column
function cmdLabel(command) {
  switch (command) {
    case "verifyElementPresent": return "VERIFY";
    case "verifyText":           return "VERIFY TEXT";
    case "captureScreenshot":    return "SCREENSHOT";
    case "selectWindow":         return "WINDOW";
    case "sendKeys":             return "KEYS";
    default:                     return (command || "").toUpperCase();
  }
}

function StepGrid({ actions, playingIndex, onUpdate, onDelete, onReorder, onDuplicate }) {
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);

  const onDragStart = (e, idx) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragOver = (e, idx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setOverIdx(idx);
  };
  const onDrop = (e, idx) => {
    e.preventDefault();
    if (dragIdx !== null && dragIdx !== idx) onReorder(dragIdx, idx);
    setDragIdx(null);
    setOverIdx(null);
  };
  const onDragEnd = () => { setDragIdx(null); setOverIdx(null); };

  return (
    <div className="flex-1 overflow-auto bg-[#1c1c1c]">

    <table className="w-full border-collapse text-[11px] table-fixed">
      <thead className="sticky top-0 bg-[#252525] z-10">
        <tr className="border-b border-gray-700 shadow-sm">
          <th className="w-6 py-3 border-r border-gray-700 text-gray-600 text-center">☰</th>
          <th className="w-8 py-3 border-r border-gray-700 text-gray-500 font-bold text-center uppercase tracking-tighter">#</th>
          <th className="w-[14%] px-3 text-left font-bold text-gray-400 border-r border-gray-700 uppercase tracking-tighter">Command</th>
          <th className="w-[22%] px-3 text-left font-bold text-gray-400 border-r border-gray-700 uppercase tracking-tighter">Target</th>
          <th className="w-[20%] px-3 text-left font-bold text-purple-400 border-r border-gray-700 uppercase tracking-tighter">Text / Label</th>
          <th className="px-3 text-left font-bold text-gray-400 uppercase tracking-tighter">Value</th>
        </tr>
      </thead>
      <tbody>
        {actions.length === 0 ? (
          <tr>
            <td colSpan="6" className="py-20 text-center text-gray-600 italic">No steps recorded. Drag screenshot steps here.</td>
          </tr>
        ) : (
          actions.map((action, idx) => {
            const isScreenshot = action.command === "captureScreenshot";
            const isPause = action.command === "pause";
            return (
            <tr
              key={idx}
              draggable
              onDragStart={(e) => onDragStart(e, idx)}
              onDragOver={(e) => onDragOver(e, idx)}
              onDrop={(e) => onDrop(e, idx)}
              onDragEnd={onDragEnd}
              className={`group border-b transition-all duration-150 ${
                overIdx === idx ? "border-t-2 border-blue-400" : "border-gray-800"
              } ${
                dragIdx === idx ? "opacity-30" : ""
              } ${
                isScreenshot
                  ? "bg-violet-500/10 border-violet-800/40"
                  : isPause
                    ? "bg-amber-500/10 border-amber-800/40"
                    : idx === playingIndex
                      ? "bg-emerald-500/10 border-emerald-500/50 relative z-20"
                    : action.status === "success"
                      ? "bg-emerald-500/20"
                      : action.status === "warning"
                        ? "bg-amber-500/20 border-amber-500/50"
                        : action.status === "fail"
                          ? "bg-red-500/20 border-red-500/50"
                          : action.command === "open"
                            ? "bg-blue-500/5"
                            : "hover:bg-gray-800/40"
              }`}
            >
              {/* Drag handle */}
              <td className="py-2 text-center cursor-grab active:cursor-grabbing text-gray-700 hover:text-gray-500 border-r border-gray-800">
                <GripVertical size={11} className="mx-auto" />
              </td>

              {/* # */}
              <td
                className={`py-2 text-center bg-black/10 border-r border-gray-800 tabular-nums ${
                  isScreenshot
                    ? "text-violet-400"
                    : idx === playingIndex
                      ? "text-emerald-400 font-black"
                      : action.status === "success"
                        ? "text-emerald-400"
                        : action.status === "warning"
                          ? "text-amber-400"
                          : action.status === "fail"
                            ? "text-red-400"
                            : "text-gray-600 font-medium"
                }`}
              >
                {idx + 1}
                {action.errorScreenshot && (
                  <button
                    onClick={() => window.open(action.errorScreenshot)}
                    className="ml-1 text-amber-500 hover:text-amber-400"
                    title="View Error Screenshot"
                  >
                    <ImageIcon size={10} />
                  </button>
                )}
              </td>

              {/* Command — read-only */}
              <td className="px-0 border-r border-gray-800 overflow-hidden">
                <span
                  className={`block w-full px-2 py-2 font-bold uppercase select-text cursor-default truncate ${
                    action.command === "verifyElementPresent" || action.command === "verifyText"
                      ? "text-cyan-400"
                      : isScreenshot ? "text-violet-400"
                      : isPause ? "text-amber-400"
                      : idx === playingIndex ? "text-emerald-400" : "text-blue-400"
                  }`}
                  title={action.command}
                >
                  {isScreenshot ? (
                    <span className="flex items-center gap-1.5"><Camera size={11} />SCREENSHOT</span>
                  ) : isPause ? (
                    <span className="flex items-center gap-1.5"><Clock size={11} />SLEEP</span>
                  ) : cmdLabel(action.command)}
                </span>
              </td>

              {/* Target — editable with selector dropdown */}
              <td className="px-0 border-r border-gray-800 relative">
                <input
                  list={`target-list-${idx}`}
                  className="bg-transparent w-full px-3 py-2 outline-none focus:bg-blue-500/10 text-gray-200 font-medium truncate"
                  value={action.target}
                  onChange={(e) => onUpdate(idx, { target: e.target.value })}
                  placeholder="id=, css=, xpath=..."
                />
                <datalist id={`target-list-${idx}`}>
                  {action.allSelectors &&
                    Object.entries(action.allSelectors).map(([type, val]) => (
                      <option key={type} value={val}>
                        {type.replace("_", " ").toUpperCase()}
                      </option>
                    ))}
                </datalist>
              </td>

              {/* Text / Label — read-only, shows semantic label */}
              <td className="px-0 border-r border-gray-800 relative">
                <span
                  className="block w-full px-3 py-2 text-purple-300 font-medium truncate select-text cursor-default"
                  title={action.text || action.placeholder || ""}
                >
                  {action.text || action.placeholder || <span className="text-gray-700 italic text-[10px]">—</span>}
                </span>
              </td>


              {/* Value — smart per elementType */}
              <td className="px-0 group">
                <div className="flex items-center w-full h-full">

                  {isScreenshot ? (
                    /* Screenshot: capture mode select */
                    <select
                      className="flex-1 min-w-0 bg-transparent px-3 py-2 outline-none text-violet-400 font-bold font-mono cursor-pointer hover:bg-violet-500/10 transition-colors"
                      value={action.value || "always"}
                      onChange={(e) => onUpdate(idx, { value: e.target.value })}
                    >
                      {CAPTURE_MODES.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>

                  ) : isPause ? (
                    <div className="flex flex-1 items-center gap-1">
                      <input
                        type="number"
                        className="flex-1 min-w-0 bg-transparent px-3 py-2 outline-none focus:bg-amber-500/10 text-amber-500 font-bold font-mono"
                        value={parseFloat(action.value) || ""}
                        placeholder="10"
                        onChange={(e) => {
                          const num = e.target.value;
                          const currentUnit = (String(action.value || "10 s").match(/[a-zA-Z]+$/)?.[0] || "ms").toLowerCase();
                          if (!num) return onUpdate(idx, { value: "" });
                          onUpdate(idx, { value: `${num} ${currentUnit}` });
                        }}
                      />
                      <select
                        className="flex-shrink-0 bg-transparent outline-none text-amber-500 font-bold font-mono cursor-pointer hover:bg-amber-500/10 transition-colors"
                        value={(String(action.value || "10 s").match(/[a-zA-Z]+$/)?.[0] || "ms").toLowerCase()}
                        onChange={(e) => {
                          const unit = e.target.value;
                          const num = parseFloat(action.value) || 10;
                          onUpdate(idx, { value: `${num} ${unit}` });
                        }}
                      >
                        <option value="ms">ms</option>
                        <option value="s">s</option>
                        <option value="min">min</option>
                      </select>
                    </div>
                  ) : action.elementType === "checkbox" ? (
                    /* Checkbox: on / off select */
                    <select
                      className="flex-1 min-w-0 bg-transparent px-3 py-2 outline-none text-emerald-500 font-bold font-mono cursor-pointer hover:bg-emerald-500/10 transition-colors"
                      value={action.value === "off" ? "off" : "on"}
                      onChange={(e) => onUpdate(idx, { value: e.target.value })}
                    >
                      <option value="on">on</option>
                      <option value="off">off</option>
                    </select>

                  ) : (action.elementType === "dropdownOption" || action.elementType === "select") && action.options?.length > 0 ? (
                    /* Dropdown with extracted options — editable combobox */
                    <>
                      <input
                        list={`value-opts-${idx}`}
                        className="flex-1 min-w-0 bg-transparent px-3 py-2 outline-none focus:bg-emerald-500/10 text-emerald-500 font-medium font-mono"
                        value={action.value || ""}
                        placeholder="select or type..."
                        onChange={(e) => onUpdate(idx, { value: e.target.value })}
                      />
                      <datalist id={`value-opts-${idx}`}>
                        {action.options.map((opt, i) => (
                          <option key={i} value={opt} />
                        ))}
                      </datalist>
                      <span className="flex-shrink-0 text-[8px] font-bold text-emerald-600 bg-emerald-950 border border-emerald-800 px-1.5 py-0.5 rounded mr-1">
                        {action.options.length} opts
                      </span>
                    </>

                  ) : (
                    /* Default: plain editable */
                    <input
                      className="flex-1 min-w-0 bg-transparent px-3 py-2 outline-none focus:bg-blue-500/10 text-emerald-500 font-medium font-mono"
                      value={action.value || ""}
                      placeholder="---"
                      onChange={(e) => onUpdate(idx, { value: e.target.value })}
                    />
                  )}

                  {/* Toggle Assertion — never overlapping */}
                  <button
                    onClick={() => onUpdate(idx, { isAssertion: !action.isAssertion })}
                    className={`flex-shrink-0 p-1.5 mr-1 rounded transition-all opacity-0 group-hover:opacity-100 ${
                      action.isAssertion ? "text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 opacity-100" : "text-gray-500/40 hover:bg-gray-700 hover:text-white"
                    } ${action.command === "captureScreenshot" || action.command === "pause" ? "hidden" : ""}`}
                    title={action.isAssertion ? "Assertion enabled (Fails test on error)" : "Make step an assertion"}
                  >
                    {action.isAssertion ? <Eye size={12} /> : <EyeOff size={12} />}
                  </button>

                  {/* Duplicate */}
                  <button
                    onClick={() => onDuplicate(idx)}
                    className="flex-shrink-0 p-1.5 mr-1 text-blue-500/40 rounded opacity-0 group-hover:opacity-100 transition-all hover:bg-blue-500 hover:text-white"
                    title="Duplicate step"
                  >
                    <Copy size={12} />
                  </button>

                  {/* Delete — always separate, never overlapping */}
                  <button
                    onClick={() => onDelete(idx)}
                    className="flex-shrink-0 p-1.5 mr-1 text-red-500/40 rounded opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white"
                    title="Delete step"
                  >
                    <Trash2 size={12} />
                  </button>

                </div>
              </td>

            </tr>
            );
          })
        )}
      </tbody>
    </table>
    </div>
  );
}

const UtilityPanel = ({
  activeTab,
  onTabSelect,
  logs,
  variables,
  screenshots,
  onUpdateVariable,
  onDeleteVariable,
  onAddVariable,
}) => (
  <div className="h-40 border-t border-gray-700 bg-[#1c1c1c] flex flex-col">
    <div className="flex bg-[#252525] border-b border-gray-700 px-1">
      {[
        { id: "log", icon: Terminal, label: "Log" },
        { id: "screenshots", icon: ImageIcon, label: "Screenshots" },
        { id: "variables", icon: Variable, label: "Variables" },
      ].map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabSelect(tab.id)}
          className={`flex items-center gap-1.5 px-4 py-1.5 text-[10px] font-bold uppercase transition-all border-b-2 mt-1 mx-0.5 rounded-t ${
            activeTab === tab.id
              ? "bg-[#1c1c1c] text-blue-400 border-blue-500"
              : "text-gray-500 border-transparent hover:text-gray-300 hover:bg-white/5"
          }`}
        >
          <tab.icon size={10} />
          {tab.label}
        </button>
      ))}
    </div>
    <div className="flex-1 overflow-y-auto p-2 font-mono text-[10px]">
      {activeTab === "log" && (
        <div className="space-y-0.5">
          {logs.map((log, i) => (
            <div
              key={i}
              className={`flex gap-2 ${log.type === "error" ? "text-red-400" : log.type === "success" ? "text-emerald-500" : "text-gray-500"}`}
            >
              <span className="opacity-40">[{log.time}]</span>
              <span>{log.message}</span>
            </div>
          ))}
        </div>
      )}

      {activeTab === "screenshots" && (
        <div className="grid grid-cols-4 gap-2">
          {screenshots.length === 0 ? (
            <div className="col-span-4 text-center py-8 text-gray-700 italic">
              No screenshots captured.
            </div>
          ) : (
            screenshots.map((s, i) => (
              <div
                key={i}
                className="relative group rounded border border-gray-700 overflow-hidden bg-black"
              >
                <img
                  src={s.data}
                  className="w-full h-20 object-cover opacity-80 hover:opacity-100 transition-opacity cursor-pointer"
                  onClick={() => window.open(s.data)}
                />
                <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1 py-0.5 text-[8px] truncate">
                  {s.name}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === "variables" && (
        <div className="space-y-1">
          <table className="w-full text-left">
            <thead>
              <tr className="text-gray-600 border-b border-gray-800">
                <th className="pb-1 px-2">Key</th>
                <th className="pb-1 px-2">Value</th>
                <th className="pb-1 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(variables).map(([key, val]) => (
                <tr key={key} className="group border-b border-gray-900/50">
                  <td className="px-1">
                    <input
                      className="bg-transparent w-full px-1 py-0.5 text-blue-400 outline-none hover:bg-white/5"
                      value={key}
                      onChange={(e) => onUpdateVariable(key, e.target.value, val)}
                    />
                  </td>
                  <td className="px-1">
                    <input
                      className="bg-transparent w-full px-1 py-0.5 text-emerald-500 outline-none hover:bg-white/5"
                      value={val}
                      onChange={(e) => onUpdateVariable(key, key, e.target.value)}
                    />
                  </td>
                  <td>
                    <button
                      onClick={() => onDeleteVariable(key)}
                      className="p-1 opacity-0 group-hover:opacity-100 text-red-500 hover:bg-red-500/10 rounded"
                    >
                      <Trash2 size={10} />
                    </button>
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan="3" className="pt-2">
                  <button
                    onClick={onAddVariable}
                    className="text-blue-400 flex items-center gap-1 hover:text-blue-300"
                  >
                    <Plus size={10} /> ADD VARIABLE
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  </div>
);

// ──────────────────────────────────────────────
// Main App
// ──────────────────────────────────────────────

// Reusable toggle switch
function Toggle({ checked, onChange, colorClass = 'bg-blue-600' }) {
  return (
    <div className="mt-0.5 relative shrink-0" onClick={onChange} style={{ cursor: 'pointer' }}>
      <div className={`w-10 h-5 rounded-full transition-colors duration-200 ${checked ? colorClass : 'bg-gray-700'}`} />
      <div className={`absolute left-1 top-1 bg-white w-3 h-3 rounded-full shadow transition-transform duration-200 ${checked ? 'translate-x-5' : ''}`} />
    </div>
  );
}

// Settings Modal
function SettingsModal({ settings, onSave, onClose }) {
  const [localSettings, setLocalSettings] = useState(settings);

  const toggle = (key) => setLocalSettings(prev => ({ ...prev, [key]: !prev[key] }));
  const setPath = (key, val) => setLocalSettings(prev => ({ ...prev, [key]: val }));

  const save = () => { onSave(localSettings); onClose(); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-[#1a1a2e] border border-gray-700/60 rounded-2xl shadow-2xl w-[520px] max-h-[90vh] overflow-y-auto flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700/60 bg-[#1e1e30]/80">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-600/30 to-violet-600/30 rounded-xl border border-white/5">
              <Settings size={18} className="text-blue-300" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Recorder Settings</h2>
              <p className="text-[10px] text-gray-500 mt-0.5">Configure trace, video, and export behaviour</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-700/60 rounded-lg text-gray-500 hover:text-white transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="p-6 space-y-6 text-gray-200">

          {/* ── Section: Playwright Options ── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Package size={12} className="text-blue-400" />
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Code Generation Options</span>
            </div>
            <div className="space-y-3">

              {/* Enable Tracing */}
              <div className="flex items-start gap-3 p-3 rounded-xl bg-blue-950/30 border border-blue-800/30 hover:border-blue-700/50 transition-colors">
                <Toggle checked={localSettings.enableTracing} onChange={() => toggle('enableTracing')} colorClass="bg-blue-600" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-bold text-blue-200">Enable Tracing</span>
                    <span className="px-1.5 py-0.5 bg-blue-800/50 text-blue-300 text-[9px] rounded font-mono">trace.zip</span>
                  </div>
                  <p className="text-[10px] text-gray-500 leading-snug mt-1">
                    Injects <code className="text-blue-400 bg-black/20 px-1 rounded">context.tracing.start()</code> / <code className="text-blue-400 bg-black/20 px-1 rounded">tracing.stop()</code> into generated scripts. Open with <code className="text-gray-400">npx playwright show-trace trace.zip</code>.
                  </p>
                </div>
              </div>

              {/* Enable Video */}
              <div className="flex items-start gap-3 p-3 rounded-xl bg-violet-950/30 border border-violet-800/30 hover:border-violet-700/50 transition-colors">
                <Toggle checked={localSettings.recordVideo} onChange={() => toggle('recordVideo')} colorClass="bg-violet-600" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-bold text-violet-200">Enable Video Recording</span>
                    <span className="px-1.5 py-0.5 bg-violet-800/50 text-violet-300 text-[9px] rounded font-mono">.webm</span>
                  </div>
                  <p className="text-[10px] text-gray-500 leading-snug mt-1">
                    Adds <code className="text-violet-400 bg-black/20 px-1 rounded">record_video_dir=...</code> to the context. Playwright saves a <code className="text-gray-400">.webm</code> video per run.
                  </p>
                </div>
              </div>

            </div>
          </div>

          {/* ── Section: Export Behaviour ── */}
          <div className="border-t border-gray-800/60 pt-5">
            <div className="flex items-center gap-2 mb-3">
              <Download size={12} className="text-emerald-400" />
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Export Behaviour</span>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-xl bg-emerald-950/20 border border-emerald-800/30 hover:border-emerald-700/40 transition-colors">
              <Toggle checked={localSettings.askForLocation || false} onChange={() => toggle('askForLocation')} colorClass="bg-emerald-600" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-bold text-emerald-200">Ask for Save Location</span>
                  <span className="px-1.5 py-0.5 bg-emerald-800/50 text-emerald-300 text-[9px] rounded font-mono">chrome.downloads</span>
                </div>
                <p className="text-[10px] text-gray-500 leading-snug mt-1">
                  Show a native <em>Save As</em> dialog every time a file is exported from this extension. Uses <code className="text-emerald-400 bg-black/20 px-1 rounded">chrome.downloads.download(&#123; saveAs: true &#125;)</code>. Applies to script exports (TRACE, VIDEO, code modal) and JSON saves.
                </p>
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="flex gap-2 justify-end px-6 py-4 border-t border-gray-800/60 bg-[#16162a]/60">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-[11px] font-bold text-gray-400 hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={save}
            className="px-5 py-2 rounded-lg text-[11px] font-bold bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white transition-all shadow-lg shadow-blue-500/20"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playingIndex, setPlayingIndex] = useState(-1);
  const [actions, setActions] = useState([]);
  const [testCases, setTestCases] = useState([
    { name: "Default Test Case", actions: [] },
  ]);
  const [selectedTestCase, setSelectedTestCase] = useState(0);
  const [activeTab, setActiveTab] = useState("log");
  const [variables, setVariables] = useState({});
  const [screenshots, setScreenshots] = useState([]);
  const [playbackDelay, setPlaybackDelay] = useState(1000);
  const [showExport, setShowExport] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showAddStep, setShowAddStep] = useState(false);
  const [duplicateStepIdx, setDuplicateStepIdx] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({
    enableTracing: false,
    recordVideo: false,
    tracePath: 'screenshots',
    videoPath: 'screenshots',
    askForLocation: false,
  });
  const [reportScreenshots, setReportScreenshots] = useState([]);
  const [isAssertMode, setIsAssertMode] = useState(false);
  const [logs, setLogs] = useState([
    {
      time: new Date().toLocaleTimeString(),
      message: "Playwright Recorder initialized.",
      type: "info",
    },
  ]);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: "GET_STATE" }, (response) => {
      if (response) {
        setIsRecording(response.isRecording);
        setPlayingIndex(response.currentStepIndex ?? -1);
        setVariables(response.variables || {});
        setScreenshots(response.screenshots || []);
        setPlaybackDelay(response.playbackDelay || 1000);
        
        chrome.storage.local.get(["extensionSettings"], (d) => {
          if (d.extensionSettings) setSettings(d.extensionSettings);
        });

        if (response.testCases && response.testCases.length > 0) {
          setTestCases(response.testCases);
          setSelectedTestCase(response.selectedTestCase || 0);
          setActions(
            response.testCases[response.selectedTestCase || 0].actions || [],
          );
        } else {
          setActions(response.actions || []);
          setTestCases([
            { name: "Default Test Case", actions: response.actions || [] },
          ]);
        }
        setIsPlaying(response.isPlaying || false);
      }
    });

    const listener = (message) => {
      // Inline addLog locally to ensure it is defined before use
      const currentAddLog = (msg, t = "info") => {
        setLogs((prev) => [{ time: new Date().toLocaleTimeString(), message: msg, type: t }, ...prev].slice(0, 50));
      };

      if (message.type === "ACTION_RECORDED") {
        setActions(message.allActions);
        // Keep testCases in sync so switching test cases shows current steps
        if (message.testCaseIndex !== undefined) {
          setTestCases(prev => prev.map((tc, i) =>
            i === message.testCaseIndex
              ? { ...tc, actions: message.allActions }
              : tc
          ));
        }
        currentAddLog(
          `Recorded: ${message.action.command} on ${message.action.target}${message.action.text ? ` [${message.action.text}]` : ""}`,
          "success",
        );
      } else if (message.type === "STATE_UPDATED") {
        setIsRecording(message.isRecording);
      } else if (message.type === "ACTIONS_CLEARED") {
        setActions([]);
        currentAddLog("All steps cleared.", "info");
      } else if (message.type === "PLAYBACK_STEP_CHANGED") {
        setPlayingIndex(message.index);
        setIsPlaying(true);
      } else if (message.type === "PLAYBACK_FINISHED") {
        setIsPlaying(false);
        setPlayingIndex(-1);
        currentAddLog("Playback finished successfully.", "success");
        // Prompt for PDF report if screenshots were captured
        const ss = message.screenshots || [];
        if (ss.length > 0) {
          setReportScreenshots(ss);
          setShowReport(true);
        }
      } else if (message.type === "PLAYBACK_STOPPED") {
        setIsPlaying(false);
        setPlayingIndex(-1);
        currentAddLog("Playback aborted due to assertion failure.", "error");
        const ss = message.screenshots || [];
        if (ss.length > 0) {
          setReportScreenshots(ss);
          setShowReport(true);
        }
      } else if (message.type === "LOG_ENTRY") {
        currentAddLog(message.log.message, message.log.type);
      } else if (message.type === "VARIABLES_UPDATED") {
        setVariables(message.variables);
      } else if (message.type === "SCREENSHOT_CAPTURED") {
        setScreenshots((prev) => [...prev, message.screenshot]);
      } else if (message.type === "STEP_STATUS_UPDATED") {
        setActions((prev) => {
          const newActions = [...prev];
          if (newActions[message.index]) {
            newActions[message.index].status = message.status;
          }
          return newActions;
        });
      } else if (message.type === "ASSERT_MODE_ENDED") {
        // Content script finished picking — reset the toolbar button
        setIsAssertMode(false);
        currentAddLog("Assertion step added.", "success");
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const addLog = (message, type = "info") => {
    setLogs((prev) =>
      [{ time: new Date().toLocaleTimeString(), message, type }, ...prev].slice(0, 50),
    );
  };

  const toggleAssertMode = () => {
    const next = !isAssertMode;
    setIsAssertMode(next);
    chrome.runtime.sendMessage({ type: "TOGGLE_ASSERT_MODE", enabled: next });
    if (next) addLog("Assert mode ON — click an element on the page to add a visibility check.", "info");
    else       addLog("Assert mode cancelled.", "info");
  };

  const toggleRecording = () => {
    chrome.runtime.sendMessage({ type: "TOGGLE_RECORDING" }, (response) => {
      setIsRecording(response.isRecording);
      addLog(
        `Recording ${response.isRecording ? "started" : "stopped"}.`,
        response.isRecording ? "success" : "info",
      );
    });
  };

  const onPlay = () => {
    const resetActions = actions.map((a) => ({ ...a, status: null }));
    setActions(resetActions);
    // Clear screenshots in UI for fresh run
    setScreenshots([]);
    setReportScreenshots([]);
    chrome.runtime.sendMessage({ type: "CLEAR_SCREENSHOTS" });
    chrome.storage.local.set({ actions: resetActions }, () => {
      chrome.runtime.sendMessage(
        { type: "START_PLAYBACK", actions: resetActions },
        (response) => {
          if (response && response.success) {
            setIsPlaying(true);
            addLog("Playback started...", "info");
          } else {
            addLog(`Playback failed: ${response?.error || "Unknown error"}`, "error");
          }
        },
      );
    });
  };

  const onStopPlayback = () => {
    chrome.runtime.sendMessage({ type: "STOP_PLAYBACK" }, () => {
      setIsPlaying(false);
      setPlayingIndex(-1);
      addLog("Playback stopped.", "warning");
    });
  };

  const updateAction = (index, updates) => {
    chrome.runtime.sendMessage(
      { type: "UPDATE_ACTION", index, updates },
      (res) => {
        if (res.success) {
          setActions(res.actions);
          // Also sync testCases so ExportModal sees the latest action data
          // (e.g. isAssertion flag set by eye toggle)
          setTestCases((prev) =>
            prev.map((tc, i) =>
              i === selectedTestCase ? { ...tc, actions: res.actions } : tc
            )
          );
        }
      },
    );
  };

  const deleteAction = (index) => {
    chrome.runtime.sendMessage({ type: "DELETE_ACTION", index }, (res) => {
      if (res.success) setActions(res.actions);
    });
  };

  const handleTestCaseSelect = (idx, actionType) => {
    if (idx === -1) {
      const newCases = [...testCases, { name: actionType, actions: [] }];
      setTestCases(newCases);
      syncTestCases(newCases, newCases.length - 1);
      return;
    }

    if (actionType === "DELETE") {
      if (testCases.length === 1) {
        alert("Cannot delete the last test case.");
        return;
      }
      if (!confirm(`Delete "${testCases[idx].name}"?`)) return;
      const newCases = testCases.filter((_, i) => i !== idx);
      const nextIdx = Math.min(idx, newCases.length - 1);
      syncTestCases(newCases, nextIdx);
      return;
    }

    if (actionType === "RENAME") {
      const newName = prompt("New name:", testCases[idx].name);
      if (newName) {
        const newCases = testCases.map((tc, i) => i === idx ? { ...tc, name: newName } : tc);
        syncTestCases(newCases, idx);
      }
      return;
    }

    // Read fresh from storage to avoid stale React state
    chrome.storage.local.get(["testCases"], (data) => {
      const fresh = data.testCases || testCases;
      setTestCases(fresh);
      setSelectedTestCase(idx);
      setActions(fresh[idx]?.actions || []);
    });
    chrome.storage.local.set({ selectedTestCase: idx });
    chrome.runtime.sendMessage({ type: "SELECT_TEST_CASE", index: idx });
  };

  const syncTestCases = (newCases, selectedIdx) => {
    setTestCases(newCases);
    setSelectedTestCase(selectedIdx);
    setActions(newCases[selectedIdx].actions || []);
    chrome.storage.local.set({
      testCases: newCases,
      selectedTestCase: selectedIdx,
    });
    chrome.runtime.sendMessage({
      type: "SYNC_TEST_CASES",
      testCases: newCases,
      selectedTestCase: selectedIdx,
    });
  };

  const addManualStep = (newAction) => {
    const updatedActions = [...actions, newAction];
    setActions(updatedActions);
    syncTestCases(
      testCases.map((tc, i) =>
        i === selectedTestCase ? { ...tc, actions: updatedActions } : tc
      ),
      selectedTestCase
    );
    addLog(`Step added: ${newAction.command}${newAction.target ? ` → ${newAction.target}` : ""}.`, "info");
  };

  const handleModalAdd = (newStep) => {
    if (duplicateStepIdx !== null) {
      const updated = [...actions];
      updated.splice(duplicateStepIdx + 1, 0, newStep);
      setActions(updated);
      syncTestCases(
        testCases.map((tc, i) =>
          i === selectedTestCase ? { ...tc, actions: updated } : tc
        ),
        selectedTestCase
      );
      addLog(`Step duplicated: ${newStep.command}`, "info");
      setDuplicateStepIdx(null);
    } else {
      addManualStep(newStep);
      setShowAddStep(false);
    }
  };

  const addScreenshotStep = () => {
    const newAction = {
      command: "captureScreenshot",
      target: "",
      value: "always",
      text: "Screenshot",
      elementType: "screenshot",
      placeholder: "",
      timestamp: new Date().toISOString(),
      status: null,
      allSelectors: {},
    };
    const updatedActions = [...actions, newAction];
    setActions(updatedActions);
    syncTestCases(
      testCases.map((tc, i) =>
        i === selectedTestCase ? { ...tc, actions: updatedActions } : tc
      ),
      selectedTestCase
    );
    addLog("Screenshot step added — drag to reorder.", "info");
  };

  const addSleepStep = () => {
    const newAction = {
      command: "pause",
      target: "",
      value: "10 s",
      text: "Sleep",
      elementType: "sleep",
      placeholder: "",
      timestamp: new Date().toISOString(),
      status: null,
      allSelectors: {},
      isAssertion: false,
    };
    addManualStep(newAction);
  };

  const reorderAction = (fromIdx, toIdx) => {
    const newActions = [...actions];
    const [moved] = newActions.splice(fromIdx, 1);
    newActions.splice(toIdx, 0, moved);
    setActions(newActions);
    syncTestCases(
      testCases.map((tc, i) =>
        i === selectedTestCase ? { ...tc, actions: newActions } : tc
      ),
      selectedTestCase
    );
  };

  const updateVariable = (oldKey, newKey, value) => {
    const newVariables = { ...variables };
    if (oldKey !== newKey) delete newVariables[oldKey];
    newVariables[newKey] = value;
    setVariables(newVariables);
    chrome.storage.local.set({ variables: newVariables });
    chrome.runtime.sendMessage({ type: "UPDATE_VARIABLES", variables: newVariables });
  };

  const deleteVariable = (key) => {
    const newVariables = { ...variables };
    delete newVariables[key];
    setVariables(newVariables);
    chrome.storage.local.set({ variables: newVariables });
    chrome.runtime.sendMessage({ type: "UPDATE_VARIABLES", variables: newVariables });
  };

  const addVariable = () => {
    const newKey = `var_${Date.now().toString().slice(-4)}`;
    updateVariable(newKey, newKey, "value");
  };

  const handleDelayChange = (val) => {
    setPlaybackDelay(val);
    chrome.storage.local.set({ playbackDelay: val });
  };

  const handleExportTrace = () => {
    const tc = testCases[selectedTestCase];
    if (!tc?.actions?.length) { addLog("No steps to export.", "error"); return; }
    const code = generatePlaywrightPythonSync(tc, variables, { ...settings, enableTracing: true });
    const base = (tc.name || "test").replace(/\s+/g, "_");
    downloadWithSettings(code, `${base}_trace.py`, settings);
    addLog("Trace-enabled script exported.", "success");
  };

  const handleExportVideo = () => {
    const tc = testCases[selectedTestCase];
    if (!tc?.actions?.length) { addLog("No steps to export.", "error"); return; }
    const code = generatePlaywrightPythonSync(tc, variables, { ...settings, recordVideo: true });
    const base = (tc.name || "test").replace(/\s+/g, "_");
    downloadWithSettings(code, `${base}_video.py`, settings);
    addLog("Video-enabled script exported.", "success");
  };

  const handleOpenVideo = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "video/webm,video/mp4,video/avi,.webm,.mp4,.avi";
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      window.open(url, "_blank");
      addLog(`Opened video: ${file.name}`, "info");
    };
    input.click();
  };

  // ── Save / Load test cases as JSON ──────────────────────────────────────
  const saveTestsToFile = () => {
    const data = JSON.stringify({ testCases, variables }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `recorder_tests_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    addLog("Tests saved to JSON file.", "success");
  };

  const loadTestsFromFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const parsed = JSON.parse(ev.target.result);
          const cases = parsed.testCases || [];
          const vars = parsed.variables || {};
          if (cases.length === 0) { addLog("Invalid JSON: no test cases found.", "error"); return; }
          const newIdx = 0;
          syncTestCases(cases, newIdx);
          setVariables(vars);
          chrome.storage.local.set({ variables: vars });
          chrome.runtime.sendMessage({ type: "UPDATE_VARIABLES", variables: vars });
          addLog(`Loaded ${cases.length} test case(s) from file.`, "success");
        } catch (err) {
          addLog("Failed to parse JSON file.", "error");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const clearScreenshots = () => {
    setScreenshots([]);
    setReportScreenshots([]);
    chrome.runtime.sendMessage({ type: "CLEAR_SCREENSHOTS" });
  };

  const handleSaveSettings = (newSettings) => {
    setSettings(newSettings);
    chrome.storage.local.set({ extensionSettings: newSettings });
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#1c1c1c] text-gray-200">
      {(showAddStep || duplicateStepIdx !== null) && (
        <AddStepModal
          onClose={() => { setShowAddStep(false); setDuplicateStepIdx(null); }}
          onAdd={handleModalAdd}
          initialStep={duplicateStepIdx !== null ? actions[duplicateStepIdx] : undefined}
          isDuplicate={duplicateStepIdx !== null}
        />
      )}

      {showSettings && (
        <SettingsModal 
          settings={settings}
          onSave={handleSaveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showExport && (
        <ExportModal
          testCase={testCases[selectedTestCase]}
          variables={variables}
          settings={settings}
          onClose={() => setShowExport(false)}
        />
      )}

      {showReport && (
        <ReportModal
          testCase={testCases[selectedTestCase]}
          screenshots={reportScreenshots}
          actions={actions}
          settings={settings}
          onClose={() => setShowReport(false)}
          onClearScreenshots={clearScreenshots}
        />
      )}

      <Toolbar
        isRecording={isRecording}
        isPlaying={isPlaying}
        onToggleRecord={toggleRecording}
        onPlay={onPlay}
        onStopPlayback={onStopPlayback}
        onExport={() => setShowExport(true)}
        onAddRow={() => setShowAddStep(true)}
        onAddScreenshot={addScreenshotStep}
        onAddSleep={addSleepStep}
        onAssert={toggleAssertMode}
        isAssertMode={isAssertMode}
        onOpenVideo={handleOpenVideo}
        playbackDelay={playbackDelay}
        onDelayChange={handleDelayChange}
        onSettings={() => setShowSettings(true)}
      />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          testCases={testCases}
          selectedIndex={selectedTestCase}
          onSelect={handleTestCaseSelect}
          onSave={saveTestsToFile}
          onLoad={loadTestsFromFile}
        />

        <div className="flex-1 flex flex-col overflow-hidden border-l border-gray-800">
          <StepGrid
            actions={actions}
            playingIndex={playingIndex}
            onUpdate={updateAction}
            onDelete={deleteAction}
            onReorder={reorderAction}
            onDuplicate={(idx) => setDuplicateStepIdx(idx)}
          />
          <UtilityPanel
            activeTab={activeTab}
            onTabSelect={setActiveTab}
            logs={logs}
            variables={variables}
            screenshots={screenshots}
            onUpdateVariable={updateVariable}
            onDeleteVariable={deleteVariable}
            onAddVariable={addVariable}
          />
        </div>
      </div>
    </div>
  );
}
