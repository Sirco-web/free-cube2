export function createWebglRuntime({
  state,
  gameTitle,
  autoRepairDelayMs,
  TextureArrayAtlas,
  ensureUI,
  getUi,
  getEngine,
  setMiningProgress,
  closeChat,
  closeTrade,
  clearInventoryCursor,
  resetInventoryDragState,
  updateInventoryCursorVisual,
  ensureActiveRenderer,
  invalidateAllChunkMeshes,
  setHotbarImages,
  updateHud,
  setSettingsUI,
  renderChatLines
}) {
  function setupWebGL() {
    const engine = getEngine();
    const canvas = engine.canvas;
    if (engine.gl && typeof WebGL2RenderingContext !== "undefined" && engine.gl instanceof WebGL2RenderingContext) {
      state.gl = engine.gl;
      console.log("Reusing Sirco WebGL2 context from engine.");
      return true;
    }
    const opts = {
      alpha: false,
      antialias: false,
      depth: true,
      stencil: false,
      powerPreference: "high-performance",
      desynchronized: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false
    };
    let context = null;
    try {
      context = canvas.getContext("webgl2", opts);
    } catch (error) {
      console.warn("WebGL2 context threw:", error.message);
    }
    if (!context) {
      try {
        context = canvas.getContext("webgl2");
      } catch (error) {
        console.warn("WebGL2 context threw (no opts):", error.message);
      }
    }
    if (!context) {
      const hasWebGL2 = typeof WebGL2RenderingContext !== "undefined";
      let hasWebGL1 = false;
      try {
        hasWebGL1 = !!(canvas.getContext("webgl") || canvas.getContext("experimental-webgl"));
      } catch (error) {
        hasWebGL1 = false;
      }
      console.warn("WebGL2 unavailable. Falling back to Canvas renderer.", { hasWebGL2, hasWebGL1, userAgent: navigator.userAgent });
      return false;
    }

    state.gl = context;
    engine.gl = state.gl;
    engine.ctx2d = null;
    if (window.SircoEngine?.Renderer2D) {
      engine.renderer2D = new window.SircoEngine.Renderer2D(state.gl, engine.resources);
    }

    try {
      const dbg = state.gl.getExtension("WEBGL_debug_renderer_info");
      const vendor = dbg ? state.gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : state.gl.getParameter(state.gl.VENDOR);
      const renderer = dbg ? state.gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : state.gl.getParameter(state.gl.RENDERER);
      console.log("WebGL2:", {
        vendor,
        renderer,
        maxTexSize: state.gl.getParameter(state.gl.MAX_TEXTURE_SIZE),
        maxTexLayers: state.gl.getParameter(state.gl.MAX_ARRAY_TEXTURE_LAYERS)
      });
    } catch (error) {
      console.warn("WebGL2 info query failed:", error.message);
    }
    return true;
  }

  function setRuntimeErrorOverlay(visible, title = "Graphics Error", message = "", detail = "") {
    ensureUI();
    const ui = getUi();
    ui.errorOverlayEl.style.display = visible ? "flex" : "none";
    ui.errorTitleEl.textContent = title;
    ui.errorMessageEl.textContent = message || "The renderer stopped responding.";
    ui.errorDetailEl.textContent = detail || "";
    if (visible) {
      ui.root.classList.add("menu-open");
    } else if (!state.inventoryOpen && !ui.menuEl.classList.contains("show") && ui.autoRepairCenterEl.style.display !== "flex") {
      ui.root.classList.remove("menu-open");
    }
  }

  function setAutoRepairUi(visible, detail = "", banner = "Auto Repair") {
    ensureUI();
    const ui = getUi();
    ui.autoRepairBannerEl.style.display = visible ? "flex" : "none";
    ui.autoRepairCenterEl.style.display = visible ? "flex" : "none";
    ui.autoRepairBannerCopyEl.textContent = banner || "Auto Repair";
    ui.autoRepairDetailEl.textContent = detail || "Diagnosing the problem.";
    if (visible) {
      ui.root.classList.add("menu-open");
    } else if (!state.inventoryOpen && !ui.menuEl.classList.contains("show") && ui.errorOverlayEl.style.display !== "flex") {
      ui.root.classList.remove("menu-open");
    }
  }

  function resetRuntimeInteractionState() {
    state.input?.resetState?.(true);
    if (state.input) {
      state.input.pointerLockEnabled = false;
    }
    if (document.exitPointerLock) {
      document.exitPointerLock();
    }
    state.currentTarget = null;
    state.currentEntityTarget = null;
    state.mining.key = null;
    state.mining.progress = 0;
    setMiningProgress(0);
  }

  function normalizeRuntimeFaultText(value, fallback = "") {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (value && typeof value.message === "string" && value.message.trim()) {
      return value.message.trim();
    }
    return fallback;
  }

  function normalizeRuntimeFaultDetail(value, fallback = "") {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (value?.stack) {
      return String(value.stack).split("\n").slice(0, 4).join(" | ");
    }
    return fallback;
  }

  function shouldIgnoreRuntimeFault(message = "", filename = "") {
    if (!message) {
      return true;
    }
    if (/ResizeObserver loop/i.test(message) || /Script error/i.test(message)) {
      return true;
    }
    if (!filename) {
      return false;
    }
    if (filename.startsWith(window.location.origin) || filename.startsWith("/") || /freecube2|sirco/i.test(filename)) {
      return false;
    }
    return true;
  }

  function reportRuntimeFault(kind, title, message, detail = "", options = {}) {
    const nextMessage = normalizeRuntimeFaultText(message, "The game hit an unexpected problem.");
    const nextDetail = normalizeRuntimeFaultDetail(detail, "");
    const now = performance.now();
    const sameFault = state.runtimeFault?.active && state.runtimeFault.kind === kind && state.runtimeFault.message === nextMessage;
    if (sameFault) {
      state.runtimeFault.detail = nextDetail || state.runtimeFault.detail;
      state.runtimeFault.waitingForRestore = !!options.waitingForRestore;
      return state.runtimeFault;
    }
    state.runtimeFault = {
      active: true,
      kind,
      title: normalizeRuntimeFaultText(title, "Game Error"),
      message: nextMessage,
      detail: nextDetail,
      detectedAt: now,
      attempts: 0,
      waitingForRestore: !!options.waitingForRestore
    };
    state.runtimeRepairPromise = null;
    resetRuntimeInteractionState();
    setRuntimeErrorOverlay(false);
    setAutoRepairUi(false);
    console.error(`[AutoRepair] ${kind}: ${nextMessage}`, nextDetail || "");
    return state.runtimeFault;
  }

  async function performAutoRepair() {
    const engine = getEngine();
    if (!state.runtimeFault?.active) {
      return true;
    }

    setRuntimeErrorOverlay(false);
    setAutoRepairUi(true, "Resetting controls and UI...");
    resetRuntimeInteractionState();
    closeChat(false);
    closeTrade(false);
    if (state.inventoryOpen) {
      getUi().inventoryEl.style.display = "none";
      state.inventoryOpen = false;
    }
    state.inventoryContext = "inventory";
    state.activeFurnaceKey = null;
    clearInventoryCursor();
    resetInventoryDragState();
    updateInventoryCursorVisual();
    state.renderEntities.length = 0;
    state.targetScanTimer = 0;

    await new Promise((resolve) => setTimeout(resolve, 0));

    if (state.useWebGL) {
      if (!engine.gl || engine.gl.isContextLost?.()) {
        throw new Error("WebGL context is still unavailable.");
      }
      state.gl = engine.gl;
      engine.ctx2d = null;
      if (!state.atlas) {
        state.atlas = new TextureArrayAtlas(state.gl, state.textures);
      }
      state.atlas.settings = state.settings;
      setAutoRepairUi(true, "Rebuilding GPU textures and chunk meshes...");
      await state.atlas.build();
      if (state.world && state.player) {
        ensureActiveRenderer();
        invalidateAllChunkMeshes();
      }
      state.webglContextLost = false;
      state.webglContextRestored = false;
    } else if (state.world && state.player) {
      setAutoRepairUi(true, "Refreshing renderer state...");
      ensureActiveRenderer();
    }

    if (state.world && state.player) {
      setHotbarImages();
      updateHud(0);
    }
    setSettingsUI();
    renderChatLines();
    setAutoRepairUi(false);
    state.runtimeFault = null;

    if (state.mode === "playing" && !state.inventoryOpen && !state.chatOpen && !document.hidden) {
      state.input.pointerLockEnabled = true;
      state.input.requestPointerLock();
    }
    return true;
  }

  function beginAutoRepair(force = false) {
    if (!state.runtimeFault?.active || state.runtimeRepairPromise) {
      return state.runtimeRepairPromise;
    }
    if (!force && state.runtimeFault.waitingForRestore && state.webglContextLost && !state.webglContextRestored) {
      setAutoRepairUi(true, "Waiting for the browser to restore WebGL...");
      return null;
    }

    state.runtimeFault.attempts += 1;
    state.runtimeFault.waitingForRestore = false;
    state.runtimeRepairPromise = performAutoRepair()
      .catch((error) => {
        const repairDetail = normalizeRuntimeFaultDetail(error, state.runtimeFault?.detail || "");
        console.error("[AutoRepair] Repair failed:", error);
        setAutoRepairUi(false);
        setRuntimeErrorOverlay(
          true,
          state.runtimeFault?.title || "Auto Repair Failed",
          state.runtimeFault?.message || `${gameTitle} hit a problem it could not repair automatically.`,
          repairDetail || "Reload the game to rebuild the renderer and world state."
        );
      })
      .finally(() => {
        state.runtimeRepairPromise = null;
      });
    return state.runtimeRepairPromise;
  }

  function updateRuntimeFaultState() {
    if (!state.runtimeFault?.active) {
      return false;
    }

    const now = performance.now();
    if (now - state.runtimeFault.detectedAt < autoRepairDelayMs) {
      return true;
    }

    if (state.runtimeFault.waitingForRestore && state.webglContextLost && !state.webglContextRestored) {
      setAutoRepairUi(true, "Waiting for the browser to restore WebGL...");
      return true;
    }

    setAutoRepairUi(true, state.runtimeRepairPromise ? "Rebuilding systems..." : "Diagnosing the problem...");
    if (!state.runtimeRepairPromise) {
      beginAutoRepair();
    }
    return true;
  }

  function handleWebGLContextLost(event = null) {
    if (event?.preventDefault) {
      event.preventDefault();
    }
    if (state.webglContextLost) {
      return;
    }
    state.webglContextLost = true;
    state.webglContextRestored = false;
    reportRuntimeFault(
      "webgl-context-lost",
      "WebGL Context Lost",
      `The renderer stopped responding, so ${gameTitle} paused graphics before the browser's default context-loss screen could take over.`,
      "Auto Repair will try to recover the renderer as soon as the browser restores WebGL.",
      { waitingForRestore: true }
    );
  }

  function handleWebGLContextRestored() {
    state.webglContextRestored = true;
    console.warn(`WebGL context restored. Starting ${gameTitle} auto repair.`);
    if (state.runtimeFault?.active && state.runtimeFault.kind === "webgl-context-lost") {
      state.runtimeFault.waitingForRestore = false;
      state.runtimeFault.detectedAt = Math.min(state.runtimeFault.detectedAt, performance.now() - autoRepairDelayMs);
      beginAutoRepair(true);
      return;
    }
    reportRuntimeFault(
      "webgl-context-restored",
      "Graphics Repair",
      `The browser restored WebGL and ${gameTitle} is rebuilding the renderer.`,
      "Auto Repair is refreshing textures, meshes, and shaders now."
    );
    beginAutoRepair(true);
  }

  function handleWindowRuntimeError(event) {
    const message = normalizeRuntimeFaultText(event?.error, normalizeRuntimeFaultText(event?.message, ""));
    const filename = typeof event?.filename === "string" ? event.filename : "";
    if (shouldIgnoreRuntimeFault(message, filename)) {
      return;
    }
    const detail = normalizeRuntimeFaultDetail(event?.error, filename ? `${filename}:${event?.lineno || 0}` : "");
    reportRuntimeFault("runtime-error", "Runtime Error", message, detail);
    event?.preventDefault?.();
  }

  function handleWindowRuntimeRejection(event) {
    const reason = event?.reason;
    const message = normalizeRuntimeFaultText(reason, "Unhandled promise rejection");
    if (shouldIgnoreRuntimeFault(message, "")) {
      return;
    }
    const detail = normalizeRuntimeFaultDetail(reason, "");
    reportRuntimeFault("runtime-rejection", "Runtime Error", message, detail);
    event?.preventDefault?.();
  }

  return {
    beginAutoRepair,
    handleWebGLContextLost,
    handleWebGLContextRestored,
    handleWindowRuntimeError,
    handleWindowRuntimeRejection,
    reportRuntimeFault,
    setAutoRepairUi,
    setRuntimeErrorOverlay,
    setupWebGL,
    updateRuntimeFaultState
  };
}
