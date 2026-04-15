document.addEventListener('DOMContentLoaded', () => {
  const toggleBtn = document.getElementById('toggle-btn');
  const clearBtn = document.getElementById('clear-btn');
  const exportBtn = document.getElementById('export-json-btn');
  const gridBody = document.getElementById('grid-body');
  const gridEmpty = document.getElementById('grid-empty');
  const statusBadge = document.getElementById('status-badge');
  const tabLog = document.getElementById('tab-log');

  let currentActions = [];

  function updateUI(state) {
    const { isRecording, actions } = state;
    currentActions = actions || [];

    // Update Button & Status
    if (isRecording) {
      toggleBtn.classList.add('active');
      toggleBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12"></rect></svg> Stop';
      statusBadge.querySelector('.status-text').textContent = 'Recording';
      statusBadge.className = 'status-indicator recording';
    } else {
      toggleBtn.classList.remove('active');
      toggleBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"></circle></svg> Record';
      statusBadge.querySelector('.status-text').textContent = 'Idle';
      statusBadge.className = 'status-indicator';
    }

    renderGrid(currentActions);
  }

  function renderGrid(actions) {
    if (!actions || actions.length === 0) {
      gridBody.innerHTML = '';
      gridEmpty.style.display = 'flex';
      return;
    }

    gridEmpty.style.display = 'none';
    gridBody.innerHTML = '';

    actions.forEach((action, index) => {
      const row = document.createElement('tr');
      const selectors = action.allSelectors || { xpath: action.target };
      
      // Build Target options
      let selectorOptions = '';
      if (selectors.id) selectorOptions += `<option value="${selectors.id}" ${action.target === selectors.id ? 'selected' : ''}>ID: ${selectors.id}</option>`;
      if (selectors.css) selectorOptions += `<option value="${selectors.css}" ${action.target === selectors.css ? 'selected' : ''}>CSS: ${selectors.css}</option>`;
      if (selectors.xpath) selectorOptions += `<option value="${selectors.xpath}" ${action.target === selectors.xpath ? 'selected' : ''}>XPath: ${selectors.xpath}</option>`;
      
      // If the current target isn't in allSelectors (e.g. manually edited), add it as an option
      const currentTargetValues = Object.values(selectors);
      if (!currentTargetValues.includes(action.target)) {
        selectorOptions = `<option value="${action.target}" selected>Manual: ${action.target}</option>` + selectorOptions;
      }

      row.innerHTML = `
        <td style="color: var(--text-muted); text-align: center;">${index + 1}</td>
        <td>
          <input type="text" class="grid-input cmd-input" value="${action.command}" data-index="${index}">
        </td>
        <td>
          <select class="grid-select target-select" data-index="${index}">
            ${selectorOptions}
          </select>
        </td>
        <td>
          <input type="text" class="grid-input val-input" value="${action.value || ''}" data-index="${index}">
        </td>
      `;
      gridBody.appendChild(row);
    });

    attachGridListeners();
  }

  function attachGridListeners() {
    // Command changes
    document.querySelectorAll('.cmd-input').forEach(input => {
      input.onchange = (e) => {
        const index = e.target.dataset.index;
        updateAction(index, { command: e.target.value });
      };
    });

    // Target changes
    document.querySelectorAll('.target-select').forEach(select => {
      select.onchange = (e) => {
        const index = e.target.dataset.index;
        updateAction(index, { target: e.target.value });
      };
    });

    // Value changes
    document.querySelectorAll('.val-input').forEach(input => {
      input.onchange = (e) => {
        const index = e.target.dataset.index;
        updateAction(index, { value: e.target.value });
      };
    });
  }

  function updateAction(index, updates) {
    chrome.runtime.sendMessage({ 
      type: "UPDATE_ACTION", 
      index: parseInt(index), 
      updates: updates 
    }, (response) => {
      addLog(`[INFO] Step ${parseInt(index)+1} updated: ${JSON.stringify(updates)}`, 'info');
    });
  }

  function addLog(text, type = 'info') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
    tabLog.appendChild(entry);
    tabLog.scrollTop = tabLog.scrollHeight;
  }

  // Initial Check
  chrome.runtime.sendMessage({ type: "GET_STATE" }, (response) => {
    if (response) updateUI(response);
  });

  // Toolbar Actions
  toggleBtn.onclick = () => {
    chrome.runtime.sendMessage({ type: "TOGGLE_RECORDING" }, (response) => {
      chrome.runtime.sendMessage({ type: "GET_STATE" }, (state) => {
        updateUI(state);
      });
    });
  };

  clearBtn.onclick = () => {
    if (confirm('Clear all steps?')) {
      chrome.runtime.sendMessage({ type: "CLEAR_ACTIONS" }, () => {
        renderGrid([]);
        addLog('All steps cleared.', 'warning');
      });
    }
  };

  exportBtn.onclick = () => {
    chrome.storage.local.get("actions", (data) => {
      const blob = new Blob([JSON.stringify(data.actions, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `automation_suite_${new Date().getTime()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      addLog('Suite exported as JSON.', 'success');
    });
  };

  // Tab Switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    };
  });

  // Play button placeholder
  document.getElementById('play-btn').onclick = () => {
    addLog('Play feature is coming in the next update!', 'warning');
  };

  // Real-time updates
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "ACTION_RECORDED") {
      currentActions = message.allActions;
      renderGrid(currentActions);
      addLog(`Recorded: ${message.action.command} on ${message.action.target}`, 'success');
    } else if (message.type === "ACTIONS_CLEARED") {
      renderGrid([]);
    }
  });
});
