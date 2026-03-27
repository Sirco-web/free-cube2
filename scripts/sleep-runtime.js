export function createSleepRuntime({
  sleepState,
  block,
  weatherTypes,
  clamp,
  ensureUI,
  getUi,
  getMode,
  getWorld,
  getPlayer,
  getMobs,
  getInput,
  getInventoryOpen,
  getChatOpen,
  getMobDef,
  getRandomWeatherDurationSeconds,
  getWorldTimePreset,
  packBlockPositionKey,
  canSleepNow,
  setPlayerSpawnPoint,
  setWeatherState,
  pushChatLine,
  closeChat,
  setInventoryOpen,
  setWorldTime
}) {
  function hasNearbySleepThreat() {
    const player = getPlayer();
    if (!player) return false;
    for (const mob of getMobs()) {
      if (!mob || mob.health <= 0 || !getMobDef(mob.type).hostile) continue;
      const dx = mob.x - player.x;
      const dz = mob.z - player.z;
      if (dx * dx + dz * dz <= 12 * 12) {
        return true;
      }
    }
    return false;
  }

  function setSleepOverlay(visible, progress = 0, text = "Stay in bed a few seconds to skip the night.") {
    ensureUI();
    const ui = getUi();
    ui.sleepOverlayEl.style.display = visible ? "flex" : "none";
    ui.sleepProgressEl.style.width = `${Math.floor(clamp(progress, 0, 1) * 100)}%`;
    ui.sleepCopyEl.textContent = text;
  }

  function stopSleeping(restorePointerLock = true) {
    sleepState.active = false;
    sleepState.timer = 0;
    sleepState.bedKey = "";
    sleepState.bedPosition = null;
    setSleepOverlay(false);
    const input = getInput();
    if (restorePointerLock && getMode() === "playing" && !getInventoryOpen() && !getChatOpen() && input) {
      input.pointerLockEnabled = true;
      input.requestPointerLock();
    }
  }

  function finishSleeping() {
    const world = getWorld();
    const player = getPlayer();
    setWorldTime(getWorldTimePreset("day") || 0);
    setWeatherState(weatherTypes.CLEAR, getRandomWeatherDurationSeconds(weatherTypes.CLEAR));
    if (sleepState.bedPosition && player) {
      player.setPosition(
        sleepState.bedPosition.x + 0.5,
        sleepState.bedPosition.y + 1.001,
        sleepState.bedPosition.z + 0.5
      );
      player.ensureSafePosition(world);
    }
    stopSleeping(true);
    pushChatLine("You slept through the night.", "sys");
    if (world) {
      world.saveDirty = true;
    }
  }

  function updateSleeping(dt) {
    const world = getWorld();
    if (!sleepState.active) {
      return false;
    }
    if (sleepState.bedPosition && world?.peekBlock(sleepState.bedPosition.x, sleepState.bedPosition.y, sleepState.bedPosition.z) !== block.BED) {
      stopSleeping(true);
      pushChatLine("Your sleep was interrupted.", "err");
      return false;
    }
    sleepState.timer += dt;
    setSleepOverlay(true, sleepState.timer / sleepState.duration);
    if (sleepState.timer >= sleepState.duration) {
      finishSleeping();
    }
    return true;
  }

  function tryUseBed(target) {
    const player = getPlayer();
    if (!target || target.type !== block.BED || !player) {
      return false;
    }

    setPlayerSpawnPoint({
      x: target.x + 0.5,
      y: target.y + 1.001,
      z: target.z + 0.5,
      bedKey: packBlockPositionKey(target.x, target.y, target.z),
      source: "bed"
    }, true);

    if (!canSleepNow()) {
      pushChatLine("You can only sleep at night or during a thunderstorm.", "err");
      return true;
    }
    if (hasNearbySleepThreat()) {
      pushChatLine("You may not rest now, there are monsters nearby.", "err");
      return true;
    }

    sleepState.active = true;
    sleepState.timer = 0;
    sleepState.bedKey = packBlockPositionKey(target.x, target.y, target.z);
    sleepState.bedPosition = { x: target.x, y: target.y, z: target.z };
    player.setPosition(target.x + 0.5, target.y + 1.001, target.z + 0.5);
    player.vx = 0;
    player.vy = 0;
    player.vz = 0;
    const input = getInput();
    input?.resetState?.(true);
    if (input) {
      input.pointerLockEnabled = false;
    }
    if (document.exitPointerLock) {
      document.exitPointerLock();
    }
    closeChat(false);
    if (getInventoryOpen()) {
      setInventoryOpen(false);
    }
    setSleepOverlay(true, 0);
    pushChatLine("Sleeping...", "sys");
    return true;
  }

  return {
    stopSleeping,
    tryUseBed,
    updateSleeping
  };
}
