export class BrowserInput {
  constructor(engine) {
    this.engine = engine;
    this.canvas = engine.canvas;
    this.lookX = 0;
    this.lookY = 0;
    this.wheel = 0;
    this.locked = false;
    this.buttonsDown = [false, false, false];
    this.buttonsPressed = new Set();
    this.pressedKeys = new Set();
    this.downKeys = new Set();
    this.actionUnlockAt = 0;
    this.pointerLockEnabled = false;
    this._lostPointerLock = false;
    this._hidden = false;

    this.canvas.style.cursor = "pointer";
    this.canvas.setAttribute("tabindex", "0");

    this.resetLocalState = () => {
      this.lookX = 0;
      this.lookY = 0;
      this.wheel = 0;
      this.buttonsDown = [false, false, false];
      this.buttonsPressed.clear();
      this.pressedKeys.clear();
      this.downKeys.clear();
    };

    this.resetState = (resetEngine = false) => {
      this.resetLocalState();
      if (resetEngine && this.engine?.input?.reset) {
        this.engine.input.reset();
      }
    };

    this.onMouseMove = (event) => {
      if (!this.locked) {
        return;
      }
      this.lookX += event.movementX || 0;
      this.lookY += event.movementY || 0;
    };

    this.onMouseDown = (event) => {
      if (this.locked || event.target === this.canvas) {
        event.preventDefault();
      }
      this.buttonsDown[event.button] = true;
      this.buttonsPressed.add(event.button);

      if (!this.locked && this.pointerLockEnabled && event.button === 0) {
        this.requestPointerLock();
      }
    };

    this.onMouseUp = (event) => {
      this.buttonsDown[event.button] = false;
    };

    this.onWheel = (event) => {
      event.preventDefault();
      this.wheel += event.deltaY > 0 ? 1 : -1;
    };

    this.onKeyDown = (event) => {
      const target = event.target;
      const tag = target && target.tagName ? String(target.tagName).toUpperCase() : "";
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) {
        return;
      }
      this.pressedKeys.add(event.key);
      this.downKeys.add(event.key);
      if ([" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault();
      }
    };

    this.onKeyUp = (event) => {
      this.downKeys.delete(event.key);
    };

    this.onBlur = () => {
      this.resetState(true);
    };

    this.onVisibilityChange = () => {
      this._hidden = !!document.hidden;
      if (this._hidden) {
        this.resetState(true);
      }
    };

    this.onPointerLockChange = () => {
      const wasLocked = this.locked;
      this.locked = document.pointerLockElement === this.canvas;
      this.canvas.style.cursor = this.locked ? "none" : "pointer";
      if (wasLocked && !this.locked) {
        this.resetState(true);
      }
      if (wasLocked && !this.locked && this.pointerLockEnabled) {
        // ESC often exits pointer lock without sending a key event.
        this._lostPointerLock = true;
      }
      if (this.locked) {
        this.actionUnlockAt = performance.now() + 120;
      }
    };

    this.onContextMenu = (event) => {
      event.preventDefault();
    };

    document.addEventListener("mousemove", this.onMouseMove);
    this.canvas.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    document.addEventListener("pointerlockchange", this.onPointerLockChange);
    this.canvas.addEventListener("contextmenu", this.onContextMenu);
  }

  requestPointerLock() {
    if (!this.canvas.requestPointerLock) {
      return;
    }
    try {
      const result = this.canvas.requestPointerLock();
      if (result && typeof result.catch === "function") {
        result.catch(() => {});
      }
    } catch (error) {
      console.debug("Pointer lock request failed:", error.message);
    }
  }

  isDown(key) {
    return this.downKeys.has(key) || this.engine.input.isDown(key);
  }

  getMousePosition() {
    return {
      x: this.engine.input.mouse.x,
      y: this.engine.input.mouse.y
    };
  }

  consumeLook() {
    const look = { x: this.lookX, y: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return look;
  }

  consumeWheel() {
    const wheel = this.wheel;
    this.wheel = 0;
    return wheel;
  }

  consumePress(...keys) {
    for (const key of keys) {
      if (this.pressedKeys.has(key)) {
        this.pressedKeys.delete(key);
        return true;
      }
    }
    return false;
  }

  consumeMousePress(button) {
    if (this.buttonsPressed.has(button)) {
      this.buttonsPressed.delete(button);
      return true;
    }
    return false;
  }

  consumeLostPointerLock() {
    if (this._lostPointerLock) {
      this._lostPointerLock = false;
      return true;
    }
    return false;
  }
}
