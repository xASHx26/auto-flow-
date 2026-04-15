(function () {
  let isRecording = false;
  let lastRightClickedElement = null;

  // ── Deduplication: prevent same action recorded twice within 80ms ──────────
  let _lastRecordKey = "";
  let _lastRecordTime = 0;
  function isDuplicate(key) {
    const now = Date.now();
    if (key === _lastRecordKey && now - _lastRecordTime < 80) return true;
    _lastRecordKey = key;
    _lastRecordTime = now;
    return false;
  }

  // ── Date input tracking (for React Datepicker & similar) ─────────────────
  const DATE_INPUT_TYPES = ["date", "time", "datetime-local", "month", "week"];
  let _lastDateInput = null;      // last focused date-like input element
  let _lastDateInputValue = "";   // its value at the time of focus
  let _lastFocusedInput = null;   // ANY last focused input (fallback for calendar clicks)

  function isDateLikeInput(el) {
    if (!el || el.tagName?.toLowerCase() !== "input") return false;
    const type = (el.type || "").toLowerCase();
    if (DATE_INPUT_TYPES.includes(type)) return true;
    if (type !== "text") return false;
    const classStr = el.classList.toString().toLowerCase();
    const placeholder = (el.getAttribute("placeholder") || "").toLowerCase();
    const ariaLabel  = (el.getAttribute("aria-label")  || "").toLowerCase();
    const idStr      = (el.id || "").toLowerCase();
    const nameStr    = (el.name || "").toLowerCase();
    return (
      classStr.includes("date") ||
      classStr.includes("picker") ||
      el.closest('[class*="datepicker"], [class*="date-picker"], [class*="react-date"]') !== null ||
      placeholder.includes("date") || placeholder.includes("birth") ||
      ariaLabel.includes("date")  || ariaLabel.includes("birth")  ||
      idStr.includes("date")      || nameStr.includes("date")
    );
  }

  // ── Element-type classifier ───────────────────────────────────────────────
  function getElementType(el) {
    if (!el || el === window) return "";
    const tag = el.tagName?.toLowerCase();
    const type = (el.type || "").toLowerCase();
    const role = (el.getAttribute("role") || "").toLowerCase();

    if (role === "option" || el.closest('[role="option"]')) return "dropdownOption";
    if (role === "combobox" || role === "listbox")           return "dropdown";
    if (tag === "input" && type === "radio")                  return "radio";
    if (tag === "input" && type === "checkbox")               return "checkbox";
    if (tag === "select")                                      return "select";
    if (tag === "button" || role === "button")                return "button";
    if (tag === "a")                                          return "link";
    return "";
  }

  // ── Detect calendar/datepicker popup elements (skip recording these clicks) ─
  function isInsideCalendar(el) {
    if (!el) return false;
    const calClasses = [
      "react-datepicker", "flatpickr-calendar", "datepicker",
      "pikaday", "DayPicker", "rdp-", "calendar",
      "picker__", "vc-", "v-date-picker", "dp__",
    ];
    let cur = el;
    for (let depth = 0; cur && depth < 10; depth++, cur = cur.parentElement) {
      const cls = cur.className;
      if (typeof cls === "string") {
        for (const c of calClasses) {
          if (cls.includes(c)) return true;
        }
      }
      const role = cur.getAttribute?.("role") || "";
      if (role === "dialog" && cur.querySelector('[class*="calendar"], [class*="datepicker"]')) {
        return true;
      }
    }
    return false;
  }

  // ── Selector builders ─────────────────────────────────────────────────────
  function getXPath(element) {
    if (element.id) return `//*[@id="${element.id}"]`;
    if (element === document.body) return "/html/body";
    let ix = 0;
    const siblings = element.parentNode?.childNodes || [];
    for (let i = 0; i < siblings.length; i++) {
      const sibling = siblings[i];
      if (sibling === element) {
        const parentPath = getXPath(element.parentNode);
        const tag = element.tagName.toLowerCase();
        return `${parentPath}/${tag}[${ix + 1}]`;
      }
      if (sibling.nodeType === 1 && sibling.tagName === element.tagName) ix++;
    }
    return "";
  }

  function getCSSSelector(el) {
    if (el.id) return `#${CSS.escape(el.id)}`;
    if (el === document.body) return "body";
    const path = [];
    while (el && el.nodeType === Node.ELEMENT_NODE) {
      let selector = el.nodeName.toLowerCase();
      if (el.id) {
        selector += `#${CSS.escape(el.id)}`;
        path.unshift(selector);
        break;
      } else {
        let sibling = el;
        let nth = 1;
        while (sibling.previousElementSibling) {
          sibling = sibling.previousElementSibling;
          if (sibling.nodeName.toLowerCase() === selector) nth++;
        }
        if (nth !== 1) selector += `:nth-of-type(${nth})`;
      }
      path.unshift(selector);
      el = el.parentNode;
    }
    return path.join(" > ");
  }

  function getSelectors(el) {
    const selectors = {};
    if (el.id)                   selectors.id   = `id=${el.id}`;
    if (el.name)                 selectors.name = `name=${el.name}`;
    const xpath = getXPath(el);
    if (xpath) {
      selectors.xpath          = xpath;
      selectors.xpath_relative = `xpath=${xpath}`;
    }
    const css = getCSSSelector(el);
    if (css)                     selectors.css  = `css=${css}`;
    const ph = el.getAttribute?.("placeholder");
    if (ph)                      selectors.placeholder = `xpath=//input[@placeholder='${ph}']`;
    if (el.tagName === "A" && el.innerText?.trim())
      selectors.linkText = `link=${el.innerText.trim()}`;
    return selectors;
  }

  // ── Label / text helpers ──────────────────────────────────────────────────
  function getLabelText(el) {
    if (!el) return "";
    if (el.getAttribute("aria-label")) return el.getAttribute("aria-label").trim();
    const lby = el.getAttribute("aria-labelledby");
    if (lby) { const lEl = document.getElementById(lby); if (lEl) return lEl.innerText.trim(); }
    if (el.id) {
      const lbl = document.querySelector(`label[for="${el.id}"]`);
      if (lbl) return lbl.innerText.trim();
    }
    const parent = el.closest("label");
    if (parent) {
      const clone = parent.cloneNode(true);
      clone.querySelectorAll("input,select,textarea").forEach(n => n.remove());
      const t = clone.innerText.trim();
      if (t) return t;
    }
    return el.getAttribute?.("placeholder")?.trim() || "";
  }

  function getElementText(el) {
    if (!el) return "";
    const tag = el.tagName?.toLowerCase();
    if (tag === "input" || tag === "select" || tag === "textarea") return getLabelText(el);
    const t = (el.innerText || el.textContent || "").trim();
    return t.length > 120 ? t.substring(0, 120) : t;
  }

  // ── Recording sound ───────────────────────────────────────────────────────
  function playRecordingSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.start(); osc.stop(ctx.currentTime + 0.1);
      setTimeout(() => { if (ctx.state !== "closed") ctx.close(); }, 150);
    } catch (e) {}
  }

  // ── Core record function ──────────────────────────────────────────────────
  function record(command, element, value = "", extraMeta = {}) {
    if (!isRecording) return;

    let selectors = {};
    if (element === window) {
      selectors = { xpath: "window" };
    } else {
      selectors = getSelectors(element);
    }

    const primaryTarget = selectors.id || selectors.name || selectors.xpath_relative || selectors.xpath || selectors.css || value;

    // Dedup key = command + primary selector + value
    const dedupKey = `${command}|${primaryTarget}|${value}`;
    if (isDuplicate(dedupKey)) return;

    let text = extraMeta.text !== undefined ? extraMeta.text : getElementText(element);
    let placeholder = (element !== window && element?.getAttribute)
      ? (element.getAttribute("placeholder") || "")
      : "";
    let elementType = extraMeta.elementType !== undefined ? extraMeta.elementType : getElementType(element);
    let options = extraMeta.options || undefined; // extracted option list

    playRecordingSound();

    chrome.runtime.sendMessage({
      type: "RECORD_ACTION",
      action: {
        command,
        target: primaryTarget,
        allSelectors: selectors,
        value,
        text,
        placeholder,
        elementType,
        options,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // ── Shadow DOM HUD ────────────────────────────────────────────────────────
  function showIndicator() {
    if (document.getElementById("recorder-hud-host")) return;
    const host = document.createElement("div");
    host.id = "recorder-hud-host";
    Object.assign(host.style, {
      position: "fixed", bottom: "20px", left: "20px",
      zIndex: "2147483647", pointerEvents: "none",
    });
    const shadow = host.attachShadow({ mode: "open" });
    const container = document.createElement("div");
    container.style.pointerEvents = "auto";
    container.innerHTML = `
      <style>
        .hud-bar { display:flex; align-items:center; gap:10px; padding:8px 16px;
          background:#1c1c1c; color:white; border-radius:8px; border:1px solid #3c3c3c;
          box-shadow:0 4px 12px rgba(0,0,0,0.5); font-family:system-ui,-apple-system,sans-serif;
          font-size:11px; font-weight:600; user-select:none; }
        .status-dot { width:8px; height:8px; background:#ef4444; border-radius:50%; animation:pulse 1s infinite; }
        @keyframes pulse { 0%{box-shadow:0 0 0 0 rgba(239,68,68,0.7)} 70%{box-shadow:0 0 0 6px rgba(239,68,68,0)} 100%{box-shadow:0 0 0 0 rgba(239,68,68,0)} }
        .divider { width:1px; height:16px; background:#3c3c3c; }
        #stop-btn { background:transparent; border:none; color:#ef4444; cursor:pointer;
          padding:2px 4px; font-weight:800; text-transform:uppercase; }
        #stop-btn:hover { opacity:0.8; }
      </style>
      <div class="hud-bar">
        <div class="status-dot"></div><span>RECORDING...</span>
        <div class="divider"></div><button id="stop-btn">Stop</button>
      </div>`;
    shadow.appendChild(container);
    document.body.appendChild(host);
    shadow.getElementById("stop-btn").onclick = (e) => {
      e.stopPropagation();
      chrome.runtime.sendMessage({ type: "STOP_RECORDING" });
    };
  }

  function hideIndicator() {
    const el = document.getElementById("recorder-hud-host");
    if (el) el.remove();
  }

  document.addEventListener("contextmenu", (e) => {
    lastRightClickedElement = e.target;
  }, true);

  // ── CLICK listener ────────────────────────────────────────────────────────
  document.addEventListener("click", (e) => {
    const path = e.composedPath();
    if (path.some(el => el.id === "recorder-hud-host")) return;

    const target = path[0];
    const tag = target.tagName?.toLowerCase();
    const type = (target.type || "").toLowerCase();

    // Skip all text-like inputs (date/time too — change event handles them)
    const TEXT_INPUT_TYPES = ["text","password","email","search","number","tel","url",
      "date","time","datetime-local","month","week","color","range"];
    if ((tag === "input" && TEXT_INPUT_TYPES.includes(type)) || tag === "textarea") return;

    // ✅ FIX 1: Skip radio/checkbox from click — change event handles them (prevents double-record)
    if (tag === "input" && (type === "radio" || type === "checkbox")) return;

    // ✅ FIX 2: Skip calendar/datepicker popup elements
    // BUT: poll for value update so we capture whatever React Datepicker sets
    // programmatically. Try multiple fallbacks for the associated input.
    if (isInsideCalendar(target)) {
      // Fallback chain: tracked date input → active element → last focused input
      const snapInput =
        _lastDateInput ||
        (isDateLikeInput(document.activeElement) ? document.activeElement : null) ||
        (_lastFocusedInput && isDateLikeInput(_lastFocusedInput) ? _lastFocusedInput : null) ||
        _lastFocusedInput; // last resort: any focused input near a calendar

      if (snapInput) {
        const prevVal = _lastDateInputValue;
        let attempts = 0;
        const poll = () => {
          if (!isRecording) return;
          const newVal = snapInput.value;
          if (newVal && newVal !== prevVal) {
            _lastDateInputValue = newVal; // prevent double-recording
            record("type", snapInput, newVal, {
              text: getLabelText(snapInput),
              placeholder: snapInput.getAttribute("placeholder") || "",
            });
          } else if (attempts < 6) {
            // Poll up to 6 × 150 ms = 900 ms total after initial 200 ms
            attempts++;
            setTimeout(poll, 150);
          }
        };
        setTimeout(poll, 200);
      }
      return;
    }

    // ✅ FIX 3: Smart custom dropdown option detection
    const optionEl = target.closest('[role="option"]') || (target.getAttribute("role") === "option" ? target : null);
    if (optionEl) {
      const optText = (optionEl.innerText || optionEl.textContent || "").trim();

          // Extract ALL sibling options from the open listbox/menu
      const listbox =
        optionEl.closest('[role="listbox"]') ||
        optionEl.closest('[role="menu"]') ||
        optionEl.closest('[class*="menu"]') ||
        optionEl.closest('[class*="options"]') ||
        optionEl.closest('[class*="dropdown"]') ||
        optionEl.closest('ul') ||
        document.querySelector('[role="listbox"]:not([aria-hidden="true"])') ||
        document.querySelector('[class*="menu--is-open"], [class*="menu-list"], [class*="options-container"]') ||
        document.querySelector('[class*="dropdown-menu"][style*="display: block"]');

      let allOptions = [];
      if (listbox) {
        // Try role=option first, then any li/div children that look like options
        const optEls = listbox.querySelectorAll('[role="option"]');
        allOptions = Array.from(optEls.length ? optEls : listbox.querySelectorAll('li, [class*="option"]'))
          .map(o => (o.innerText || o.textContent || "").trim())
          .filter(Boolean);
      }

      record("click", optionEl, optText, {
        text: optText,
        elementType: "dropdownOption",
        options: allOptions.length > 0 ? allOptions : undefined,
      });
      return;
    }

    // Generic click
    record("click", target);
  }, true);

  // ── CHANGE listener ───────────────────────────────────────────────────────
  document.addEventListener("change", (e) => {
    const path = e.composedPath();
    if (path.some(el => el.id === "recorder-hud-host")) return;

    const target = path[0];
    const tag = target.tagName?.toLowerCase();
    const type = (target.type || "").toLowerCase();

    if (tag === "input" || tag === "textarea") {
      if (type === "checkbox") {
        const labelText = getLabelText(target);
        record("click", target, target.checked ? "on" : "off", {
          text: labelText, elementType: "checkbox",
        });
      } else if (type === "radio") {
        record("click", target, target.value, {
          text: target.value,
          elementType: "radio",
        });
      } else {
        let value = target.value;
        record("type", target, value, {
          text: getLabelText(target),
          placeholder: target.getAttribute("placeholder") || "",
        });
      }
    } else if (tag === "select") {
      const selectedOption = target.options[target.selectedIndex];
      const optionText = selectedOption ? selectedOption.text : "";
      const allOptions = Array.from(target.options)
        .map(o => o.text.trim())
        .filter(Boolean);
      record("select", target, optionText, {
        text: getLabelText(target),
        elementType: "select",
        options: allOptions.length > 0 ? allOptions : undefined,
      });
    }
  }, true);



  // ── FOCUSIN: track last focused input (date-like AND generic fallback) ─────
  document.addEventListener("focusin", (e) => {
    const el = e.target;
    const tag = el.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea") {
      _lastFocusedInput = el; // always track the last focused input
    }
    if (!isDateLikeInput(el)) return;
    _lastDateInput = el;
    _lastDateInputValue = el.value;
  }, true);

  // ── FOCUSOUT: backup capture for native date inputs ──────────────────────
  // Catches cases where change event doesn't fire (e.g. keyboard entry in date field)
  document.addEventListener("focusout", (e) => {
    if (!isRecording) return;
    const el = e.target;
    if (!isDateLikeInput(el)) return;
    const newVal = el.value;
    if (newVal && newVal !== _lastDateInputValue) {
      _lastDateInputValue = newVal;
      record("type", el, newVal, {
        text: getLabelText(el),
        placeholder: el.getAttribute("placeholder") || "",
      });
    }
  }, true);

  // ── KEYDOWN listener ──────────────────────────────────────────────────────
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const path = e.composedPath();
      if (path.some(el => el.id === "recorder-hud-host")) return;
      const target = path[0];
      const tag = target.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") {
        if (target.value && isRecording) record("type", target, target.value);
        record("sendKeys", target, "KEY_ENTER");
      }
    }
  }, true);

  // ── Open recording ────────────────────────────────────────────────────────
  function recordOpen() {
    chrome.runtime.sendMessage({
      type: "RECORD_ACTION",
      action: {
        command: "open",
        target: window.location.href,
        allSelectors: { url: window.location.href },
        value: "",
        text: document.title || window.location.href,
        placeholder: "",
        elementType: "navigation",
        timestamp: new Date().toISOString(),
      },
    });
  }

  // ── Message listener ──────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "STATE_UPDATED") {
      isRecording = message.isRecording;
      if (isRecording) { showIndicator(); if (message.isInitial) recordOpen(); }
      else hideIndicator();
    }

    if (message.type === "GET_ELEMENT_INFO") {
      if (lastRightClickedElement) {
        const selectors = getSelectors(lastRightClickedElement);
        sendResponse({
          success: true,
          text: lastRightClickedElement.innerText || lastRightClickedElement.value || "",
          labelText: getElementText(lastRightClickedElement),
          selectors,
        });
      } else {
        sendResponse({ success: false, error: "No element focused" });
      }
    }

    if (message.type === "EXECUTE_STEP") {
      const { command, target, value, text, elementType } = message.action;

      // ── For radio: always search by label text across ALL radios ──────────
      if (command === "click" && elementType === "radio" && (text || value)) {
        const allRadios = document.querySelectorAll('input[type="radio"]');
        let matched = null;

        // Priority 1: exact value attribute match (most reliable)
        if (value) {
          for (const r of allRadios) {
            if (r.value === value) { matched = r; break; }
          }
        }

        // Priority 2: label text match (case-insensitive)
        if (!matched && text) {
          for (const r of allRadios) {
            const lbl = getLabelText(r);
            if (lbl === text || lbl.toLowerCase() === text.toLowerCase()) {
              matched = r; break;
            }
          }
        }

        // Priority 3: text matches value attribute (for new recordings where text=value)
        if (!matched && text) {
          for (const r of allRadios) {
            if (r.value === text) { matched = r; break; }
          }
        }

        // Priority 4: fallback to target selector
        if (!matched) matched = findElement(target);

        if (matched) {
          matched.scrollIntoView({ behavior: "smooth", block: "center" });
          matched.click();
          matched.dispatchEvent(new Event("change", { bubbles: true }));
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: "Radio not found: value=" + value + " text=" + text });
        }
        return true;
      }


      // ── For checkbox: find by label text ──────────────────────────────────
      if (command === "click" && elementType === "checkbox" && text) {
        const allBoxes = document.querySelectorAll('input[type="checkbox"]');
        let matched = null;
        for (const cb of allBoxes) {
          const lbl = getLabelText(cb);
          if (lbl === text || lbl.toLowerCase() === text.toLowerCase()) {
            matched = cb; break;
          }
        }
        if (!matched) matched = findElement(target);
        if (matched) {
          matched.scrollIntoView({ behavior: "smooth", block: "center" });
          matched.click();
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: "Checkbox not found by label: " + text });
        }
        return true;
      }

      const element = findElement(target);

      if (!element && command !== "open") {
        sendResponse({ success: false, error: "Element not found: " + target });
        return;
      }

      try {
        if (command === "click") {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
          element.click();
          element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
          element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        } else if (command === "type") {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
          element.focus();
          element.value = value;
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
        } else if (command === "select") {
          // value = visible option text
          if (element.options) {
            const opt = Array.from(element.options).find(o => o.text === value || o.value === value);
            if (opt) element.value = opt.value;
            else element.value = value;
          }
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
        }
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    }
    return true;
  });

  function findElement(target) {
    if (!target) return null;
    const parts = target.split("=");
    const strategy = parts.length > 1 ? parts[0] : "xpath";
    const selector = parts.slice(1).join("=");
    try {
      if (strategy === "xpath") {
        const r = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        return r.singleNodeValue;
      } else if (strategy === "css")  return document.querySelector(selector);
      else if (strategy === "id")     return document.getElementById(selector);
      else if (strategy === "name")   return document.querySelector(`[name="${selector}"]`);
    } catch (e) {}
    try {
      const r = document.evaluate(target, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      return r.singleNodeValue;
    } catch (e) {}
    return null;
  }

  chrome.runtime.sendMessage({ type: "GET_STATE" }, (response) => {
    if (response && response.isRecording) { isRecording = true; showIndicator(); }
  });
})();
