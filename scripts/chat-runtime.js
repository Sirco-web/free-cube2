export function createChatRuntime({
  state,
  ensureUI,
  getUi,
  getInput,
  getMode,
  runCommand
}) {
  function pushChatLine(text, cls = "") {
    state.lines.push({ text, cls, ttl: 10 });
    if (state.lines.length > 12) {
      state.lines = state.lines.slice(state.lines.length - 12);
    }
    state.needsRender = true;
  }

  function renderChatLines() {
    const ui = getUi();
    if (!ui || !state.needsRender) {
      return;
    }

    state.needsRender = false;
    ui.chatLogEl.innerHTML = "";
    for (const line of state.lines) {
      const el = document.createElement("div");
      el.className = "fc-chat-line" + (line.cls ? ` ${line.cls}` : "");
      el.textContent = line.text;
      ui.chatLogEl.appendChild(el);
    }
  }

  function updateChat(dt) {
    if (state.open) {
      renderChatLines();
      return;
    }

    let changed = false;
    for (const line of state.lines) {
      line.ttl -= dt;
    }
    const nextLines = state.lines.filter((line) => line.ttl > 0);
    if (nextLines.length !== state.lines.length) {
      state.lines = nextLines;
      changed = true;
    }
    if (changed) {
      state.needsRender = true;
    }
    renderChatLines();
  }

  function openChat(prefill = "") {
    ensureUI();
    const ui = getUi();
    const input = getInput();
    state.open = true;
    if (input) {
      input.pointerLockEnabled = false;
    }
    if (document.exitPointerLock) {
      document.exitPointerLock();
    }
    ui.chatInputWrap.style.display = "block";
    ui.chatInput.value = prefill;
    ui.chatInput.focus();
    ui.chatInput.setSelectionRange(ui.chatInput.value.length, ui.chatInput.value.length);
    renderChatLines();
  }

  function closeChat(lockMouse = true) {
    const ui = getUi();
    if (!ui) {
      return;
    }
    state.open = false;
    ui.chatInputWrap.style.display = "none";
    ui.chatInput.value = "";
    const input = getInput();
    if (lockMouse && getMode() === "playing" && input) {
      input.pointerLockEnabled = true;
      input.requestPointerLock();
    }
  }

  function clearChatLines() {
    state.lines = [];
    state.needsRender = true;
    renderChatLines();
  }

  function submitChat(text) {
    const msg = String(text || "").trim();
    if (!msg) return;
    if (msg.startsWith("/")) {
      runCommand(msg.slice(1));
    } else {
      pushChatLine(`You: ${msg}`);
    }
  }

  return {
    clearChatLines,
    closeChat,
    openChat,
    pushChatLine,
    renderChatLines,
    submitChat,
    updateChat
  };
}
