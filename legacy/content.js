(function() {
  let indicator = null;
  let isRecording = false;

  function getXPath(element) {
    if (element.id) {
      return `//*[@id="${element.id}"]`;
    }
    if (element === document.body) {
      return '/html/body';
    }

    let ix = 0;
    const siblings = element.parentNode.childNodes;
    for (let i = 0; i < siblings.length; i++) {
      const sibling = siblings[i];
      if (sibling === element) {
        return getXPath(element.parentNode) + '/' + element.tagName.toLowerCase() + '[' + (ix + 1) + ']';
      }
      if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
        ix++;
      }
    }
    return null;
  }

  function getCSSSelector(el) {
    if (el.id) return `#${CSS.escape(el.id)}`;
    if (el === document.body) return 'body';
    
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
    return path.join(' > ');
  }

  function getSelectors(el) {
    return {
      id: el.id || '',
      name: el.getAttribute('name') || '',
      css: getCSSSelector(el),
      xpath: getXPath(el)
    };
  }

  function playRecordingSound() {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.1);

      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.1);
      
      setTimeout(() => {
        if (audioCtx.state !== 'closed') audioCtx.close();
      }, 150);
    } catch (e) {
      console.warn("Audio feedback failed", e);
    }
  }

  function record(command, element, value = '') {
    if (isRecording) playRecordingSound();
    const selectors = getSelectors(element);
    chrome.runtime.sendMessage({
      type: "RECORD_ACTION",
      action: {
        command: command,
        target: selectors.xpath,
        allSelectors: selectors,
        value: value,
        timestamp: new Date().toISOString()
      }
    });
  }

  // --- Floating Indicator Logic ---

  function showIndicator() {
    if (document.getElementById('my-recorder-indicator')) return;

    indicator = document.createElement('div');
    indicator.id = 'my-recorder-indicator';
    indicator.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px; padding: 10px 16px; background: white; border-radius: 999px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1); border: 1px solid #e2e8f0; font-family: sans-serif;">
        <span style="display: flex; height: 10px; width: 10px; position: relative;">
          <span style="animation: ping 1s cubic-bezier(0, 0, 0.2, 1) infinite; position: absolute; display: inline-flex; height: 100%; width: 100%; border-radius: 999px; background-color: #ef4444; opacity: 0.75;"></span>
          <span style="position: relative; display: inline-flex; border-radius: 999px; height: 10px; width: 10px; background-color: #ef4444;"></span>
        </span>
        <span style="color: #1e293b; font-size: 13px; font-weight: 600;">My Recorder is recording...</span>
        <button id="recorder-stop-btn" style="background: #ef4444; color: white; border: none; padding: 6px 14px; border-radius: 999px; font-size: 11px; font-weight: 700; cursor: pointer; transition: background 0.2s; text-transform: uppercase;">Stop</button>
      </div>
      <style>
        @keyframes ping {
          75%, 100% { transform: scale(2); opacity: 0; }
        }
        #recorder-stop-btn:hover { background: #dc2626 !important; }
      </style>
    `;

    Object.assign(indicator.style, {
      position: 'fixed',
      bottom: '16px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '999999',
      transition: 'all 0.3s ease'
    });

    document.body.appendChild(indicator);

    document.getElementById('recorder-stop-btn').onclick = (e) => {
      e.stopPropagation();
      chrome.runtime.sendMessage({ type: "TOGGLE_RECORDING" });
    };
  }

  function hideIndicator() {
    const el = document.getElementById('my-recorder-indicator');
    if (el) el.remove();
  }

  // --- Event Listeners ---

  document.addEventListener('click', (e) => {
    if (e.target.closest('#my-recorder-indicator')) return;
    if (e.target.tagName.toLowerCase() === 'select') return;
    record('click', e.target);
  }, true);

  document.addEventListener('input', (e) => {
    if (e.target.closest('#my-recorder-indicator')) return;
    const tagName = e.target.tagName.toLowerCase();
    if (tagName === 'input' || tagName === 'textarea') {
      record('type', e.target, e.target.value);
    }
  }, true);

  document.addEventListener('change', (e) => {
    if (e.target.closest('#my-recorder-indicator')) return;
    const tagName = e.target.tagName.toLowerCase();
    if (tagName === 'select') {
      record('select', e.target, e.target.value);
    } else if (e.target.type === 'checkbox' || e.target.type === 'radio') {
      record('click', e.target, e.target.checked.toString());
    }
  }, true);

  // --- Initialization & Messaging ---

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "STATE_UPDATED") {
      isRecording = message.isRecording;
      if (isRecording) showIndicator();
      else hideIndicator();
    }
  });

  // Initial Check
  chrome.runtime.sendMessage({ type: "GET_STATE" }, (response) => {
    if (response && response.isRecording) {
      isRecording = true;
      showIndicator();
    }
  });

  console.log("Katalon-Style Recorder (Enhanced with Indicator) Loaded");
})();
