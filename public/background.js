let recorderWindowId = null;
let isPlaying = false;
let currentStepIndex = 0;
let playbackActions = [];
let playbackTabId = null;
let activeTabId = null;
let lastLoggedUrl = "";
let heartbeatInterval = null;
let lastRecordedTabId = null;
let lastRealTabId = null;   // last non-extension tab the user actually visited
let variables = {};
let screenshots = [];
let testCases = [{ name: "Default Test Case", actions: [] }];
let selectedTestCase = 0;
let lastCreatedTabId = null;
let lastStepStatus = "success"; // tracks last non-screenshot step result
let assertModeTabId = null;    // tab currently in assert mode

// --- Inspector Capture Structures ---
let networkRequests = {}; 
let networkLogs = [];
let consoleLogs = [];

// Track tab creation to help find new windows during playback
chrome.tabs.onCreated.addListener((tab) => {
  if (isPlaying) lastCreatedTabId = tab.id;
});

// Initialize storage state and context menus
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ 
    isRecording: false, 
    actions: [], 
    variables: {}, 
    screenshots: [],
    testCases: [{ name: "Default Test Case", actions: [] }],
    selectedTestCase: 0
  });
  console.log("Katalon-Style Recorder initialized.");

  // Create context menus for assertions
  if (chrome.contextMenus) {
    chrome.contextMenus.create({
      id: "verifyText",
      title: "Verify Text",
      contexts: ["all"]
    });
    chrome.contextMenus.create({
      id: "verifyElementPresent",
      title: "Verify Element Present",
      contexts: ["all"]
    });
  }
});

// Handle context menu clicks
if (chrome.contextMenus) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (tab) {
      chrome.tabs.sendMessage(tab.id, { type: "GET_ELEMENT_INFO" }, (response) => {
        if (chrome.runtime.lastError) return; // Silent catch if recipient not found
        if (response && response.success) {
          chrome.storage.local.get("isRecording", (data) => {
            if (data.isRecording) {
              const action = {
                command: info.menuItemId, // verifyText or verifyElementPresent
                target: response.selectors.id || response.selectors.xpath_relative || response.selectors.xpath || "",
                allSelectors: response.selectors,
                value: info.menuItemId === "verifyText" ? response.text : "",
                timestamp: new Date().toISOString(),
                status: null
              };
              
              chrome.storage.local.get(["testCases", "selectedTestCase"], (data) => {
                const cases = data.testCases || [{ name: "Default Test Case", actions: [] }];
                const idx = data.selectedTestCase || 0;
                cases[idx].actions.push(action);
                chrome.storage.local.set({ testCases: cases }, () => {
                  chrome.runtime.sendMessage({ 
                    type: "ACTION_RECORDED", 
                    action, 
                    allActions: cases[idx].actions 
                  }).catch(() => {});
                });
              });
            }
          });
        }
      });
    }
  });
}

function broadcastState(isRecording, isInitial = false) {
  // Notify all tabs so HUD is shown/hidden on every page.
  // isInitial tells content.js this is a fresh recording start (used for
  // showing the HUD indicator). The OPEN step is now added directly by
  // background.js so content.js no longer needs to call recordOpen().
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { type: "STATE_UPDATED", isRecording, isInitial }).catch(() => {});
    });
  });
  chrome.runtime.sendMessage({ type: "STATE_UPDATED", isRecording }).catch(() => {});
}

// Keep-alive heartbeat to prevent Service Worker from going idle
function startHeartbeat() {
  stopHeartbeat();
  chrome.alarms.create("heartbeat", { periodInMinutes: 0.5 });
  heartbeatInterval = setInterval(() => {
    // Perform an active API call to keep the SW alive
    chrome.runtime.getPlatformInfo(() => {
      console.log("Heartbeat active...");
    });
  }, 20000);
}

function stopHeartbeat() {
  chrome.alarms.clear("heartbeat");
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = null;
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "heartbeat") {
    console.log("Heartbeat... SW is alive");
    chrome.storage.local.get(null, () => {});
  }
});

function broadcastPlaybackStep(index) {
  chrome.runtime.sendMessage({ type: "PLAYBACK_STEP_CHANGED", index }).catch(() => {});
}

// --- Navigation Capture Logic ---

function recordOpen(url, tabId) {
  if (tabId !== activeTabId) return; // Only record the active tab
  if (url === lastLoggedUrl || url.startsWith('chrome://')) return;

  chrome.storage.local.get(["isRecording", "testCases", "selectedTestCase"], (data) => {
    if (data.isRecording) {
      const openAction = {
        command: "open",
        target: url,
        allSelectors: { url: url },
        value: "",
        timestamp: new Date().toISOString()
      };
      
      const cases = data.testCases || [{ name: "Default Test Case", actions: [] }];
      const idx = data.selectedTestCase || 0;
      cases[idx].actions.push(openAction);
      
      lastLoggedUrl = url;
      
      chrome.storage.local.set({ testCases: cases }, () => {
        chrome.runtime.sendMessage({ 
          type: "ACTION_RECORDED", 
          action: openAction,
          allActions: cases[idx].actions
        }).catch(() => {});
        console.log("Automatic 'open' recorded:", url);
      });
    }
  });
}

// Track active tab. Also keep lastRealTabId = the most recently focused
// real content page (not the extension popup). This is used by TOGGLE_RECORDING
// to identify which page the user wants to start recording on.
chrome.tabs.onActivated.addListener((activeInfo) => {
  activeTabId = activeInfo.tabId;
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (chrome.runtime.lastError) return;
    if (tab && tab.url &&
        !tab.url.startsWith('chrome-extension://') &&
        !tab.url.startsWith('chrome://')) {
      lastRealTabId = activeInfo.tabId;
    }
  });
  chrome.storage.local.get("isRecording", (data) => {
    if (data.isRecording) broadcastState(true);
  });
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE || windowId === recorderWindowId) return;
  chrome.tabs.query({ active: true, windowId: windowId }, (tabs) => {
    if (!tabs[0]) return;
    activeTabId = tabs[0].id;
    if (tabs[0].url &&
        !tabs[0].url.startsWith('chrome-extension://') &&
        !tabs[0].url.startsWith('chrome://')) {
      lastRealTabId = tabs[0].id;
    }
  });
});

// Capture full page loads
chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId === 0) { // Only main frame
    recordOpen(details.url, details.tabId);
  }
});

// Capture SPA/YouTube navigation (PushState/History)
chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  if (details.frameId === 0) { 
    recordOpen(details.url, details.tabId);
  }
});

// Capture Hash/Reference navigation
chrome.webNavigation.onReferenceFragmentUpdated.addListener((details) => {
  if (details.frameId === 0) {
    recordOpen(details.url, details.tabId);
  }
});

// --- Playback Engine ---

async function checkTabExists(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    return !!tab;
  } catch (e) {
    return false;
  }
}

async function waitForTabComplete(tabId) {
  return new Promise((resolve, reject) => {
    const check = async (id, info) => {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(check);
        resolve();
      }
    };
    // Timeout safety
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(check);
      resolve(); 
    }, 10000);
    chrome.tabs.onUpdated.addListener(check);
  });
}

async function injectAlertSilencer(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        window.alert = () => { console.log("Alert auto-accepted"); };
        window.confirm = () => { console.log("Confirm auto-accepted"); return true; };
        window.prompt = () => { console.log("Prompt auto-filled"); return ""; };
      }
    });
  } catch (e) {}
}

function resolveVariables(text) {
  if (typeof text !== 'string') return text;
  return text.replace(/\$\{([^}]+)\}/g, (match, key) => {
    return variables[key] !== undefined ? variables[key] : match;
  });
}

async function executeStep() {
  if (!isPlaying || currentStepIndex >= playbackActions.length) {
    stopPlayback();
    return;
  }

  // Ensure playback tab still exists (unless we are about to select a new one)
  const exists = await checkTabExists(playbackTabId);
  if (!exists && action.command !== 'selectWindow' && action.command !== 'open') {
    // Grace period: check if a lastCreatedTabId is available as a fallback
    const fallbackExists = lastCreatedTabId ? await checkTabExists(lastCreatedTabId) : false;
    if (fallbackExists) {
       playbackTabId = lastCreatedTabId;
       console.log("Recovered playback on fallback tab:", playbackTabId);
    } else {
      console.error("Playback tab closed manually.");
      chrome.runtime.sendMessage({ 
        type: "LOG_ENTRY", 
        log: { message: "Tab closed. Stopping playback.", type: "error", time: new Date().toLocaleTimeString() }
      }).catch(() => {});
      stopPlayback();
      return;
    }
  }

  const action = { ...playbackActions[currentStepIndex] };
  action.target = resolveVariables(action.target);
  action.value = resolveVariables(action.value);
  
  broadcastPlaybackStep(currentStepIndex);

  try {
    if (action.command === 'captureScreenshot') {
      const captureMode = action.value || "always"; // "pass", "fail", "always"
      const shouldCapture =
        captureMode === "always" ||
        (captureMode === "pass"   && lastStepStatus === "success") ||
        (captureMode === "fail"   && lastStepStatus !== "success");

      if (shouldCapture) {
        const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
        const screenshot = {
          name: `Step_${currentStepIndex + 1}_${new Date().toLocaleTimeString()}`,
          data: dataUrl,
          mode: captureMode,
          timestamp: new Date().toISOString()
        };
        screenshots.push(screenshot);
        chrome.storage.local.set({ screenshots });
        chrome.runtime.sendMessage({ type: "SCREENSHOT_CAPTURED", screenshot }).catch(() => {});
      }
      updateStepStatus(currentStepIndex, "success");
      // Do NOT update lastStepStatus here — screenshot steps don't count
      scheduleNextStep();
    } else if (action.command === 'open') {
      await chrome.tabs.update(playbackTabId, { url: action.target });
      await waitForTabComplete(playbackTabId);
      await injectAlertSilencer(playbackTabId);
      updateStepStatus(currentStepIndex, "success");
      lastStepStatus = "success";
      scheduleNextStep();
    } else if (action.command === 'pause') {
      const ms = parseInt(action.value) || 1000;
      await new Promise(r => setTimeout(r, ms));
      updateStepStatus(currentStepIndex, "success");
      lastStepStatus = "success";
      scheduleNextStep();
    } else if (action.command === 'selectWindow') {
      const target = action.target || "";
      const title = target.startsWith("title=") ? target.replace("title=", "") : target;
      
      const findAndSelect = async () => {
        const tabs = await chrome.tabs.query({});
        // Try exact match or recent tab if target is empty
        const targetTab = target === "" && lastCreatedTabId 
          ? tabs.find(t => t.id === lastCreatedTabId)
          : tabs.find(t => t.title?.includes(title) || t.url?.includes(title));
        
        if (targetTab) {
          playbackTabId = targetTab.id;
          await chrome.tabs.update(playbackTabId, { active: true });
          await injectAlertSilencer(playbackTabId);
          updateStepStatus(currentStepIndex, "success");
          scheduleNextStep();
          return true;
        }
        return false;
      };

      // Retry loop: 5 seconds
      let found = await findAndSelect();
      if (!found) {
        const start = Date.now();
        while (Date.now() - start < 5000 && !found) {
          await new Promise(r => setTimeout(r, 500));
          found = await findAndSelect();
        }
      }

      if (!found) {
        throw new Error(`Window not found: ${title || "Most recent tab"}`);
      }
    } else {
      await injectAlertSilencer(playbackTabId);
      const results = await chrome.scripting.executeScript({
        target: { tabId: playbackTabId },
        func: async (action) => {
          const { command, target, value, text, elementType, allSelectors } = action;
          const wait = (ms) => new Promise(r => setTimeout(r, ms));

          // ── DOM helpers ────────────────────────────────────────────────────

          function findElement(target) {
            if (!target) return null;
            const parts = target.split("=");
            const strategy = parts.length > 1 ? parts[0] : "xpath";
            const selector = parts.slice(1).join("=");

            function querySelectorDeep(sel, root = document) {
              if (sel.includes('>>>')) {
                const parts = sel.split('>>>').map(p => p.trim());
                let current = root;
                for (let i = 0; i < parts.length; i++) {
                  current = querySelectorDeep(parts[i], current);
                  if (!current) return null;
                  if (i < parts.length - 1) {
                    if (!current.shadowRoot) return null;
                    current = current.shadowRoot;
                  }
                }
                return current;
              }

              let res = root.querySelector(sel);
              if (res) return res;
              for (const node of root.querySelectorAll('*')) {
                if (node.shadowRoot) {
                  res = querySelectorDeep(sel, node.shadowRoot);
                  if (res) return res;
                }
              }
              return null;
            }

            try {
              if (strategy === "xpath") {
                const res = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                return res.singleNodeValue;
              } else if (strategy === "css") return querySelectorDeep(selector);
              else if (strategy === "id") return querySelectorDeep(`#${selector}`);
              else if (strategy === "name") return querySelectorDeep(`[name="${selector}"]`);
              else if (strategy === "link") {
                return Array.from(document.querySelectorAll('a')).find(a => a.innerText.trim() === selector);
              }
            } catch (e) {}
            return null;
          }

          // ── getByText: find radio by VALUE attribute (most reliable) ───────
          function findRadioByValue(val) {
            const allRadios = document.querySelectorAll('input[type="radio"]');
            for (const r of allRadios) {
              if (r.value === val) return r;
            }
            return null;
          }

          // ── getByText: find checkbox by its visible label text ─────────────
          function findCheckboxByLabel(labelText) {
            const allBoxes = document.querySelectorAll('input[type="checkbox"]');
            for (const cb of allBoxes) {
              // Check aria-label
              if (cb.getAttribute('aria-label') === labelText) return cb;
              // Check <label for="id">
              if (cb.id) {
                const lbl = document.querySelector(`label[for="${cb.id}"]`);
                if (lbl && lbl.innerText.trim() === labelText) return cb;
              }
              // Check parent label
              const parentLbl = cb.closest('label');
              if (parentLbl) {
                const clone = parentLbl.cloneNode(true);
                clone.querySelectorAll('input').forEach(n => n.remove());
                if (clone.innerText.trim() === labelText) return cb;
              }
            }
            return null;
          }

          async function waitForElement(target, allSelectors = {}, timeout = 5000) {
            const start = Date.now();
            while (Date.now() - start < timeout) {
              let el = findElement(target);
              if (el) return { element: el, used: "primary" };
              if (allSelectors) {
                for (const [key, selector] of Object.entries(allSelectors)) {
                  if (selector === target) continue;
                  el = findElement(selector);
                  if (el) return { element: el, used: key };
                }
              }
              await wait(500);
            }
            return null;
          }

          // ── RADIO: always use value-based matching ─────────────────────────
          if (command === "click" && elementType === "radio") {
            // `value` holds what was recorded as the radio value; `text` is the label
            const radioVal = value; // use ONLY the explicit value, not text fallback
            let radio = radioVal ? findRadioByValue(radioVal) : null;

            if (!radio) {
              // Nothing found by value — try target selector as last resort
              const res = await waitForElement(target, allSelectors);
              const fallbackRadio = res?.element;
              if (fallbackRadio) {
                // Validate: the selector-found radio must match the expected value
                if (radioVal && fallbackRadio.value !== radioVal) {
                  throw new Error(`Radio value mismatch: expected "${radioVal}" but element has value="${fallbackRadio.value}"`);
                }
                radio = fallbackRadio;
              }
            }

            if (!radio) throw new Error(`Radio not found for value="${radioVal}"`);
            radio.scrollIntoView({ behavior: "smooth", block: "center" });
            await wait(100);
            radio.click();
            radio.dispatchEvent(new Event("change", { bubbles: true }));
            return { success: true, healed: false, strategy: "radio-value" };
          }

          // ── CHECKBOX: use label-text matching ─────────────────────────────
          if (command === "click" && elementType === "checkbox") {
            let cb = text ? findCheckboxByLabel(text) : null;
            if (!cb) {
              const res = await waitForElement(target, allSelectors);
              cb = res?.element;
            }
            if (!cb) throw new Error(`Checkbox not found for label="${text}"`);
            cb.scrollIntoView({ behavior: "smooth", block: "center" });
            await wait(100);
            // Only click if state needs to change (respect on/off value)
            const shouldBeChecked = value !== "off";
            if (cb.checked !== shouldBeChecked) {
              cb.click();
            }
            return { success: true, healed: false, strategy: "checkbox-label" };
          }


          // ── DROPDOWN OPTION (custom react-select, etc.): use innerText ─────
          if (command === "click" && elementType === "dropdownOption") {
            const optText = value || text;
            // 1) Try finding by visible text first (most reliable)
            const opts = Array.from(document.querySelectorAll('[role="option"], li, .select__option'));
            const opt = opts.find(o => (o.innerText || o.textContent || "").trim() === optText);
            if (opt) {
              opt.scrollIntoView({ behavior: "smooth", block: "center" });
              await wait(100);
              opt.click();
              return { success: true, healed: false, strategy: "dropdown-text" };
            }
            // 2) Fallback: find by selector but validate the text matches
            const res = await waitForElement(target, allSelectors);
            if (res?.element) {
              const elText = (res.element.innerText || res.element.textContent || "").trim();
              if (optText && elText !== optText) {
                throw new Error(`Dropdown option mismatch: expected "${optText}" but element text is "${elText}"`);
              }
              res.element.scrollIntoView({ behavior: "smooth", block: "center" });
              await wait(100);
              res.element.click();
              return { success: true, healed: true, strategy: "dropdown-selector" };
            }
            // 3) Nothing found at all
            throw new Error(`Dropdown option not found: "${optText}"`);
          }

          // ── All other commands: standard element + smart wait ─────────────
          const result = await waitForElement(target, allSelectors);
          if (command === "verifyElementPresent") {
            if (!result) throw new Error(`Verification Failed: Element not found: ${target}`);
            return { success: true, healed: result.used !== "primary", strategy: result.used };
          }
          if (!result && command !== "open" && command !== "pause") {
            throw new Error("Element not found: " + target);
          }

          const element = result?.element;
          if (command === "click") {
            element.scrollIntoView({ behavior: "smooth", block: "center" });
            element.click();
            element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
            element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
          } else if (command === "type") {
            element.scrollIntoView({ behavior: "smooth", block: "center" });
            element.focus();
            await wait(100);
            // Use native value setter to bypass React-controlled input wrapping
            try {
              const proto = element instanceof HTMLTextAreaElement
                ? window.HTMLTextAreaElement.prototype
                : window.HTMLInputElement.prototype;
              const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
              if (nativeSetter) {
                nativeSetter.call(element, value);
              } else {
                element.value = value;
              }
            } catch (_e) {
              element.value = value;
            }
            element.dispatchEvent(new Event("input",  { bubbles: true }));
            element.dispatchEvent(new Event("change", { bubbles: true }));
            await wait(150);
            element.dispatchEvent(new Event("blur",   { bubbles: true }));
          } else if (command === "sendKeys") {
            element.scrollIntoView({ behavior: "smooth", block: "center" });
            element.focus();
            if (value === "KEY_ENTER") {
              element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter", code: "Enter", keyCode: 13, which: 13 }));
              element.dispatchEvent(new KeyboardEvent("keypress", { bubbles: true, cancelable: true, key: "Enter", code: "Enter", keyCode: 13, which: 13 }));
              element.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, cancelable: true, key: "Enter", code: "Enter", keyCode: 13, which: 13 }));
              if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
                const form = element.form;
                if (form) {
                  if (form.requestSubmit) form.requestSubmit();
                  else form.submit();
                }
              }
            }
          } else if (command === "select") {
            const val = value.startsWith("label=") ? value.replace("label=", "") : value;
            if (element.options) {
              const option = Array.from(element.options).find(o => o.text === val || o.value === val);
              if (option) element.value = option.value;
              else element.value = val;
            }
            element.dispatchEvent(new Event("input", { bubbles: true }));
            element.dispatchEvent(new Event("change", { bubbles: true }));
          } else if (command === "verifyText") {
            const actualText = (element.innerText || element.value || "").trim();
            if (!actualText.includes(value.trim())) {
              throw new Error(`Verification Failed: Expected "${value}" but found "${actualText}"`);
            }
          } else if (command === "pause") {
            let ms = 10000;
            try {
              const val = String(value || "").toLowerCase().trim();
              let num = parseFloat(val);
              if (!isNaN(num)) {
                if (val.endsWith("min") || val.endsWith("m")) ms = num * 60000;
                else if (val.endsWith("ms")) ms = num;
                else if (val.endsWith("s")) ms = num * 1000;
                else ms = num;
              }
            } catch (e) {}
            await wait(ms);
          }
          return { success: true, healed: result?.used !== "primary", strategy: result?.used || "none" };
        },
        args: [action]
      });


      if (results && results[0] && results[0].result.success) {
        const { healed, strategy } = results[0].result;
        if (healed) {
          chrome.runtime.sendMessage({ 
            type: "LOG_ENTRY", 
            log: { message: `Step ${currentStepIndex + 1} healed using ${strategy.toUpperCase()}`, type: "success", time: new Date().toLocaleTimeString() }
          }).catch(() => {});
        }
        updateStepStatus(currentStepIndex, "success");
        lastStepStatus = "success";
        scheduleNextStep();
      } else {
        throw new Error("Execution failed");
      }
    }
  } catch (error) {
    const failedIndex = currentStepIndex; // Lock the index for the async callback
    console.error("Playback error at step", failedIndex + 1, ":", error);
    
    // Capture screenshot on failure/warning
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
      chrome.storage.local.get(["testCases", "selectedTestCase"], (data) => {
        const cases = data.testCases || [];
        const idx = data.selectedTestCase || 0;
        if (cases[idx] && cases[idx].actions[failedIndex]) {
          cases[idx].actions[failedIndex].errorScreenshot = dataUrl;
          chrome.storage.local.set({ testCases: cases });
        }
      });
    } catch (e) { 
      console.warn("Failed to capture error screenshot:", e); 
    }

    if (action.isAssertion) {
      updateStepStatus(failedIndex, "fail");
      lastStepStatus = "fail";
      chrome.runtime.sendMessage({ 
        type: "LOG_ENTRY", 
        log: { 
          message: `Assertion Failed at Step ${failedIndex + 1}: ${error.message}. Aborting test...`, 
          type: "error", 
          time: new Date().toLocaleTimeString() 
        }
      }).catch(() => {});
      isPlaying = false;
      stopHeartbeat();
      chrome.runtime.sendMessage({ type: "PLAYBACK_STOPPED", screenshots }).catch(() => {});
      return;
    }

    // Error Recovery: Mark as warning and continue instead of stopping
    updateStepStatus(failedIndex, "warning");
    lastStepStatus = "warning";
    chrome.runtime.sendMessage({ 
      type: "LOG_ENTRY", 
      log: { 
        message: `Step ${failedIndex + 1} issue: ${error.message}. Continuing...`, 
        type: "warning", 
        time: new Date().toLocaleTimeString() 
      }
    }).catch(() => {});
    scheduleNextStep();
  }
}

function updateStepStatus(index, status) {
  chrome.runtime.sendMessage({ type: "STEP_STATUS_UPDATED", index, status }).catch(() => {});
}

function scheduleNextStep() {
  if (!isPlaying) return;
  chrome.storage.local.get("playbackDelay", (data) => {
    const delay = data.playbackDelay !== undefined ? data.playbackDelay : 1000;
    currentStepIndex++;
    setTimeout(() => { executeStep(); }, delay);
  });
}

function stopPlayback() {
  isPlaying = false;
  currentStepIndex = -1;
  const pbTab = playbackTabId;
  playbackTabId = null;
  lastStepStatus = "success";
  stopHeartbeat();
  broadcastPlaybackStep(-1);
  chrome.runtime.sendMessage({ 
    type: "PLAYBACK_FINISHED", 
    screenshots, 
    networkLogs, 
    consoleLogs 
  }).catch(() => {});

  if (pbTab) {
    try {
      chrome.debugger.detach({ tabId: pbTab }, () => {
        const _e = chrome.runtime.lastError;
      });
    } catch(e) {}
  }
}

// Global CDP event handler
chrome.debugger.onEvent.addListener((source, method, params) => {
  if (!isPlaying || source.tabId !== playbackTabId) return;

  if (method === "Runtime.consoleAPICalled") {
    // Determine color/type mapped to UI
    let mappedType = "info";
    if (params.type === "error") mappedType = "error";
    else if (params.type === "warning") mappedType = "warning";
    
    // Extract text from remote objects
    const text = params.args 
       ? params.args.map(a => a.value !== undefined ? a.value : (a.description || "")).join(" ")
       : "";
       
    const logEntry = { type: mappedType, text: `[Console] ${text}`, time: new Date().toLocaleTimeString() };
    consoleLogs.push(logEntry);
    chrome.runtime.sendMessage({ type: "CDP_CONSOLE", log: logEntry }).catch(() => {});
  }

  if (method === "Network.requestWillBeSent") {
    // Only capture http/https, ignore data URIs / chrome extensions to save memory
    if (params.request.url && !params.request.url.startsWith("http")) return;

    networkRequests[params.requestId] = {
      url: params.request.url,
      method: params.request.method,
      requestPayload: params.request.hasPostData ? params.request.postData : null,
      status: "Loading...",
      mimeType: "",
      responseBody: null
    };
  }

  if (method === "Network.responseReceived") {
    const req = networkRequests[params.requestId];
    if (req) {
      req.status = params.response.status;
      if (params.response.mimeType) req.mimeType = params.response.mimeType;
    }
  }

  if (method === "Network.loadingFinished") {
    const req = networkRequests[params.requestId];
    if (req) {
      chrome.debugger.sendCommand(
        { tabId: source.tabId },
        "Network.getResponseBody",
        { requestId: params.requestId },
        (res) => {
           // If we fail to get body, just leave it null
           if (!chrome.runtime.lastError && res) {
             req.responseBody = res.body;
           }
           networkLogs.push(req);
           chrome.runtime.sendMessage({ type: "CDP_NETWORK", log: req }).catch(() => {});
           delete networkRequests[params.requestId];
        }
      );
    }
  }
});

// --- Window & Message management ---

chrome.action.onClicked.addListener(() => {
  if (recorderWindowId !== null) {
    chrome.windows.get(recorderWindowId, (window) => {
      if (chrome.runtime.lastError || !window) createRecorderWindow();
      else chrome.windows.update(recorderWindowId, { focused: true });
    });
  } else createRecorderWindow();
});

function createRecorderWindow() {
  chrome.windows.create({
    url: 'index.html',
    type: 'popup',
    width: 1100,
    height: 650
  }, (window) => {
    recorderWindowId = window.id;
  });
}

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === recorderWindowId) recorderWindowId = null;
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "GET_STATE") {
    chrome.storage.local.get(["isRecording", "testCases", "selectedTestCase", "variables", "screenshots"], (data) => {
      variables = data.variables || {};
      screenshots = data.screenshots || [];
      testCases = data.testCases || [{ name: "Default Test Case", actions: [] }];
      selectedTestCase = data.selectedTestCase || 0;
      sendResponse({ ...data, isPlaying, currentStepIndex });
    });
    return true;
  }

  if (request.type === "CLEAR_SCREENSHOTS") {
    screenshots = [];
    chrome.storage.local.set({ screenshots: [] });
    sendResponse({ success: true });
  }

  if (request.type === "START_PLAYBACK") {
    chrome.storage.local.get(["isRecording", "testCases", "selectedTestCase"], async (data) => {
      if (data.isRecording) {
        sendResponse({ success: false, error: "Cannot play while recording." });
        return;
      }
      
      const cases = data.testCases || [];
      const idx = data.selectedTestCase || 0;
      const steps = request.actions || (cases[idx] ? cases[idx].actions : []);
      
      if (steps.length === 0) {
        sendResponse({ success: false, error: "No actions to play." });
        return;
      }

      // Reset screenshots for each new playback run
      screenshots = [];
      chrome.storage.local.set({ screenshots: [] });

      playbackActions = steps;
      isPlaying = true;
      currentStepIndex = 0;
      startHeartbeat();

      const firstOpen = steps.find(s => s.command === 'open');
      const startUrl = firstOpen ? firstOpen.target : "about:blank";

      try {
        const tab = await chrome.tabs.create({ url: "about:blank" });
        playbackTabId = tab.id;
        
        networkRequests = {};
        networkLogs = [];
        consoleLogs = [];

        chrome.storage.local.get(["extensionSettings"], async (sData) => {
          const s = sData.extensionSettings || {};
          const enableCapture = s.enableNetworkConsole !== false; // Default true or based on target
          
          if (enableCapture) {
            try {
              await new Promise((resolve, reject) => {
                chrome.debugger.attach({ tabId: playbackTabId }, "1.3", () => {
                  if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
                  else resolve();
                });
              });
              await new Promise(r => chrome.debugger.sendCommand({ tabId: playbackTabId }, "Network.enable", {}, r));
              await new Promise(r => chrome.debugger.sendCommand({ tabId: playbackTabId }, "Runtime.enable", {}, r));
            } catch (e) {
              console.warn("Could not attach debugger for Network/Console tracing:", e.message);
            }
          }

          if (startUrl !== "about:blank") {
             await chrome.tabs.update(playbackTabId, { url: startUrl });
          }

          if (steps[0].command === 'open') {
            await waitForTabComplete(playbackTabId);
          }
          executeStep();
          sendResponse({ success: true });
        });

      } catch (err) {
        sendResponse({ success: false, error: err.message });
        stopPlayback();
      }
    });
    return true;
  }

  if (request.type === "STOP_PLAYBACK") {
    stopPlayback();
    sendResponse({ success: true });
  }

  if (request.type === "STOP_RECORDING") {
    chrome.storage.local.set({ isRecording: false }, () => {
      broadcastState(false);
      sendResponse({ success: true });
    });
    return true;
  }

  if (request.type === "TOGGLE_RECORDING") {
    chrome.storage.local.get("isRecording", (data) => {
      const newState = !data.isRecording;

      if (newState) {
        // Use lastRealTabId as the primary source — it tracks the most recently
        // focused real content page across ALL windows, updated by onActivated
        // and onFocusChanged (excluding the extension popup itself).
        // Fall back to querying active tabs only if we have no tracked tab.
        const getTabAndRecord = (tab) => {
          if (tab) {
            activeTabId   = tab.id;
            lastLoggedUrl = tab.url;
          }

          chrome.storage.local.get(["testCases", "selectedTestCase"], (tcData) => {
            const cases = tcData.testCases || [{ name: "Default Test Case", actions: [] }];
            const idx   = tcData.selectedTestCase || 0;

            const openAction = tab ? {
              command: "open",
              target: tab.url,
              allSelectors: { url: tab.url },
              value: "",
              text: tab.title || tab.url,
              placeholder: "",
              elementType: "navigation",
              timestamp: new Date().toISOString(),
              status: null,
            } : null;

            if (openAction) cases[idx].actions.push(openAction);

            chrome.storage.local.set({ isRecording: true, testCases: cases }, () => {
              sendResponse({ isRecording: true });
              if (openAction) {
                chrome.runtime.sendMessage({
                  type: "ACTION_RECORDED",
                  action: openAction,
                  allActions: cases[idx].actions,
                  testCaseIndex: idx,
                }).catch(() => {});
              }
              broadcastState(true, false);
            });
          });
        };

        if (lastRealTabId) {
          chrome.tabs.get(lastRealTabId, (tab) => {
            if (chrome.runtime.lastError || !tab ||
                tab.url.startsWith('chrome-extension://') ||
                tab.url.startsWith('chrome://')) {
              // Stale ID — fall back to querying
              chrome.tabs.query({ active: true }, (allActive) => {
                const real = allActive.find(t =>
                  t.url && !t.url.startsWith('chrome-extension://') &&
                  !t.url.startsWith('chrome://') && t.windowId !== recorderWindowId);
                getTabAndRecord(real || null);
              });
            } else {
              getTabAndRecord(tab);
            }
          });
        } else {
          chrome.tabs.query({ active: true }, (allActive) => {
            const real = allActive.find(t =>
              t.url && !t.url.startsWith('chrome-extension://') &&
              !t.url.startsWith('chrome://') && t.windowId !== recorderWindowId);
            getTabAndRecord(real || null);
          });
        }

      } else {
        chrome.storage.local.set({ isRecording: false }, () => {
          sendResponse({ isRecording: false });
          broadcastState(false);
        });
      }
    });
    return true;
  }

  if (request.type === "RECORD_ACTION") {
    chrome.storage.local.get(["isRecording", "testCases", "selectedTestCase"], (data) => {
      if (data.isRecording) {
        const cases = data.testCases || [{ name: "Default Test Case", actions: [] }];
        const idx = data.selectedTestCase || 0;
        cases[idx].actions.push(request.action);
        chrome.storage.local.set({ testCases: cases }, () => {
          chrome.runtime.sendMessage({ 
            type: "ACTION_RECORDED", 
            action: request.action,
            allActions: cases[idx].actions,
            testCaseIndex: idx,
          }).catch(() => {});
        });

      }
    });
  }

  if (request.type === "DELETE_ACTION") {
    chrome.storage.local.get(["testCases", "selectedTestCase"], (data) => {
      const cases = data.testCases || [];
      const idx = data.selectedTestCase || 0;
      if (cases[idx]) {
        cases[idx].actions = cases[idx].actions.filter((_, i) => i !== request.index);
        chrome.storage.local.set({ testCases: cases }, () => {
          sendResponse({ success: true, actions: cases[idx].actions });
        });
      }
    });
    return true;
  }

  if (request.type === "UPDATE_ACTION") {
    chrome.storage.local.get(["testCases", "selectedTestCase"], (data) => {
      const cases = data.testCases || [];
      const idx = data.selectedTestCase || 0;
      if (cases[idx] && cases[idx].actions[request.index]) {
        cases[idx].actions[request.index] = { ...cases[idx].actions[request.index], ...request.updates };
        chrome.storage.local.set({ testCases: cases }, () => {
          sendResponse({ success: true, actions: cases[idx].actions });
        });
      }
    });
    return true;
  }

  if (request.type === "UPDATE_VARIABLES") {
    variables = request.variables;
    chrome.storage.local.set({ variables });
    sendResponse({ success: true });
  }

  if (request.type === "SYNC_TEST_CASES") {
    chrome.storage.local.set({ 
      testCases: request.testCases, 
      selectedTestCase: request.selectedTestCase 
    });
    // Reset so the new/switched test case gets a clean "open" step next time recording starts
    lastLoggedUrl = "";
  }

  if (request.type === "TOGGLE_ASSERT_MODE") {
    const enabled = !!request.enabled;
    // Find the content tab to send the toggle to
    const targetTabId = lastRealTabId;
    if (targetTabId) {
      assertModeTabId = enabled ? targetTabId : null;
      chrome.tabs.sendMessage(targetTabId, { type: "TOGGLE_ASSERT_MODE", enabled }, () => {
        if (chrome.runtime.lastError) {
          // If the content script isn't ready, just ignore
          console.warn("Assert mode toggle failed:", chrome.runtime.lastError.message);
        }
      });
    }
    sendResponse({ success: true });
  }

  if (request.type === "ASSERT_MODE_ENDED") {
    assertModeTabId = null;
    // Forward to the popup so it resets its isAssertMode state
    chrome.runtime.sendMessage({ type: "ASSERT_MODE_ENDED" }).catch(() => {});
  }
  if (request.type === "SYNC_ACTIONS") {
    chrome.storage.local.get(["testCases", "selectedTestCase"], (data) => {
      const cases = data.testCases || [];
      const idx = data.selectedTestCase || 0;
      if (cases[idx]) {
        cases[idx].actions = request.actions;
        chrome.storage.local.set({ testCases: cases });
      }
    });
  }
  if (request.type === "SELECT_TEST_CASE") {
    chrome.storage.local.set({ selectedTestCase: request.index });
    // Reset lastLoggedUrl so the next recording session captures the current
    // page as a fresh "open" step, not as a duplicate of a previous test case.
    lastLoggedUrl = "";
  }
});

// Record tab switching
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  chrome.storage.local.get(["isRecording", "testCases", "selectedTestCase"], async (data) => {
    if (data.isRecording && activeInfo.tabId !== lastRecordedTabId) {
      try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        if (tab.url && !tab.url.startsWith('chrome-extension://')) {
          lastRecordedTabId = activeInfo.tabId;
          const cases = data.testCases || [];
          const idx = data.selectedTestCase || 0;
          const action = {
            command: "selectWindow",
            target: `title=${tab.title || tab.url}`,
            allSelectors: { title: tab.title, url: tab.url },
            value: "",
            timestamp: new Date().toISOString(),
          };
          cases[idx].actions.push(action);
          chrome.storage.local.set({ testCases: cases }, () => {
            chrome.runtime.sendMessage({ 
              type: "ACTION_RECORDED", 
              action, 
              allActions: cases[idx].actions 
            }).catch(() => {});
          });
        }
      } catch (e) {}
    }
  });
});
