let recorderWindowId = null;

// Initialize storage state
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ isRecording: false, actions: [] });
  console.log("Katalon-Style Recorder initialized.");
});

function broadcastState(isRecording) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { type: "STATE_UPDATED", isRecording }).catch(() => {});
    });
  });
}

// Handle extension icon click to open standalone window
chrome.action.onClicked.addListener(() => {
  if (recorderWindowId !== null) {
    chrome.windows.get(recorderWindowId, (window) => {
      if (chrome.runtime.lastError || !window) {
        createRecorderWindow();
      } else {
        chrome.windows.update(recorderWindowId, { focused: true });
      }
    });
  } else {
    createRecorderWindow();
  }
});

function createRecorderWindow() {
  chrome.windows.create({
    url: 'popup.html',
    type: 'popup',
    width: 450,
    height: 700
  }, (window) => {
    recorderWindowId = window.id;
  });
}

// Reset window ID when closed
chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === recorderWindowId) {
    recorderWindowId = null;
  }
});

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "GET_STATE") {
    chrome.storage.local.get(["isRecording", "actions"], (data) => {
      sendResponse(data);
    });
    return true; // Keep channel open for async response
  }

  if (request.type === "TOGGLE_RECORDING") {
    chrome.storage.local.get("isRecording", (data) => {
      const newState = !data.isRecording;
      chrome.storage.local.set({ isRecording: newState }, () => {
        sendResponse({ isRecording: newState });
        broadcastState(newState);
      });
    });
    return true;
  }

  if (request.type === "RECORD_ACTION") {
    chrome.storage.local.get(["isRecording", "actions"], (data) => {
      if (data.isRecording) {
        const updatedActions = [...data.actions, request.action];
        chrome.storage.local.set({ actions: updatedActions }, () => {
          // Broadcast to popup for real-time update
          chrome.runtime.sendMessage({ 
            type: "ACTION_RECORDED", 
            action: request.action,
            allActions: updatedActions
          }).catch(err => {
            // Silently fail if popup is not open
          });
          console.log("Action recorded:", request.action);
        });
      }
    });
  }

  if (request.type === "DELETE_ACTION") {
    chrome.storage.local.get("actions", (data) => {
      const updatedActions = data.actions.filter((_, idx) => idx !== request.index);
      chrome.storage.local.set({ actions: updatedActions }, () => {
        sendResponse({ success: true, actions: updatedActions });
      });
    });
    return true;
  }

  if (request.type === "UPDATE_ACTION") {
    chrome.storage.local.get("actions", (data) => {
      const actions = data.actions || [];
      if (actions[request.index]) {
        actions[request.index] = { ...actions[request.index], ...request.updates };
        chrome.storage.local.set({ actions }, () => {
          sendResponse({ success: true, actions });
        });
      }
    });
    return true;
  }

  if (request.type === "CLEAR_ACTIONS") {
    chrome.storage.local.set({ actions: [] }, () => {
      sendResponse({ success: true });
      chrome.runtime.sendMessage({ type: "ACTIONS_CLEARED" }).catch(() => {});
    });
    return true;
  }
});
