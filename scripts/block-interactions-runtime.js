export function createBlockInteractionsRuntime({
  state,
  block,
  worldHeight,
  hotbarSlots,
  hotbarBlocks,
  gameMode,
  redstoneRepeaterMinDelay,
  redstoneRepeaterMaxDelay,
  clamp,
  random3,
  ensureUI,
  getUi,
  getWorld,
  getPlayer,
  getInput,
  getSettings,
  getInventoryOpen,
  getMultiplayerSession,
  isFluidBlock,
  getSelectedHeldItemType,
  getSelectedHeldBlockType,
  getSelectedHeldCount,
  getItemFoodValue,
  isCreativeMode,
  damageSelectedHeldItem,
  consumeFromSelectedSlot,
  addPlayerStat,
  unlockPlayerAchievement,
  dropFurnaceContentsAt,
  canHarvestBlock,
  getBlockDrop,
  spawnItemEntity,
  setWorldBlockWithChecks,
  isMultiplayerGuest,
  isMultiplayerHost,
  isDedicatedMultiplayerSession,
  sendMultiplayerSignal,
  sendMultiplayerPeerMessage,
  broadcastMultiplayerPeerMessage,
  getToolBreakMultiplier,
  getHeldEnchantmentLevel,
  getRequiredToolForBlock,
  getBreakTime,
  isCollidable,
  renderInventoryUI,
  getActiveFurnaceState,
  setInventoryOpen,
  getOrCreateRedstoneStateAt,
  setRedstoneStateAtPosition,
  openVillagerTrade,
  tryUseBed,
  attackTargetMob,
  setHotbarImages,
  updateHotbarSelection,
  packBlockPositionKey
}) {
  function breakCurrentTarget() {
    const player = getPlayer();
    const world = getWorld();
    const settings = getSettings();
    const currentTarget = state.currentTarget;
    if (!currentTarget || !player || !world || player.breakCooldown > 0) return false;
    if (currentTarget.type === block.BEDROCK || isFluidBlock(currentTarget.type)) return false;
    const heldItemType = getSelectedHeldItemType();
    if (isMultiplayerGuest()) {
      if (isDedicatedMultiplayerSession()) {
        sendMultiplayerSignal({
          type: "break_block_request",
          x: currentTarget.x,
          y: currentTarget.y,
          z: currentTarget.z
        });
      } else {
        sendMultiplayerPeerMessage(getMultiplayerSession().hostPeerId, {
          type: "break_block_request",
          x: currentTarget.x,
          y: currentTarget.y,
          z: currentTarget.z
        });
      }
      if (!isCreativeMode()) {
        damageSelectedHeldItem(1);
      }
      player.breakCooldown = settings.gameMode === gameMode.CREATIVE ? 0.06 : 0.12;
      return true;
    }
    if (setWorldBlockWithChecks(currentTarget.x, currentTarget.y, currentTarget.z, block.AIR, true)) {
      addPlayerStat("blocksMined", 1);
      if (currentTarget.type === block.WOOD) {
        unlockPlayerAchievement("get_wood");
      }
      if (!isCreativeMode()) {
        if (currentTarget.type === block.FURNACE) {
          dropFurnaceContentsAt(currentTarget.x, currentTarget.y, currentTarget.z);
        }
        if (canHarvestBlock(heldItemType, currentTarget.type)) {
          const drop = getBlockDrop(currentTarget.type, currentTarget.x, currentTarget.y, currentTarget.z, world.seed);
          const jx = (random3(currentTarget.x, currentTarget.y, currentTarget.z, world.seed + 2001) - 0.5) * 2.2;
          const jz = (random3(currentTarget.z, currentTarget.y, currentTarget.x, world.seed + 2002) - 0.5) * 2.2;
          if (drop.itemType && drop.itemType !== block.AIR && (drop.count || 0) > 0) {
            spawnItemEntity(
              drop.itemType,
              drop.count,
              currentTarget.x + 0.5,
              currentTarget.y + 0.55,
              currentTarget.z + 0.5,
              jx,
              3.4,
              jz,
              0.55
            );
          }
        }
        damageSelectedHeldItem(1);
      }
      if (isMultiplayerHost()) {
        broadcastMultiplayerPeerMessage({
          type: "block_update",
          x: currentTarget.x,
          y: currentTarget.y,
          z: currentTarget.z,
          blockType: block.AIR
        });
      }
      player.breakCooldown = settings.gameMode === gameMode.CREATIVE ? 0.06 : 0.12;
      return true;
    }
    return false;
  }

  function setMiningProgress(progress) {
    ensureUI();
    const ui = getUi();
    if (!ui) {
      return;
    }
    const normalized = clamp(progress, 0, 1);
    ui.miningEl.style.display = normalized > 0.001 ? "block" : "none";
    ui.miningBar.style.width = `${Math.floor(normalized * 100)}%`;
  }

  function resetMining() {
    state.mining.key = null;
    state.mining.progress = 0;
    setMiningProgress(0);
  }

  function updateMining(dt) {
    const input = getInput();
    const player = getPlayer();
    const settings = getSettings();
    const currentTarget = state.currentTarget;
    if (!input || !player || !settings) {
      resetMining();
      return;
    }
    if (!input.locked || performance.now() < input.actionUnlockAt) {
      resetMining();
      return;
    }

    if (state.currentEntityTarget) {
      resetMining();
      return;
    }

    if (settings.gameMode === gameMode.CREATIVE) {
      resetMining();
      if (input.consumeMousePress(0)) {
        breakCurrentTarget();
      }
      return;
    }

    if (!currentTarget || !input.buttonsDown[0] || player.breakCooldown > 0) {
      resetMining();
      return;
    }

    if (currentTarget.type === block.BEDROCK || isFluidBlock(currentTarget.type)) {
      resetMining();
      return;
    }

    const key = `${currentTarget.x}|${currentTarget.y}|${currentTarget.z}`;
    if (state.mining.key !== key) {
      state.mining.key = key;
      state.mining.progress = 0;
      state.mining.type = currentTarget.type;
    }

    const heldItemType = getSelectedHeldItemType();
    const toolMultiplier = getToolBreakMultiplier(heldItemType, state.mining.type);
    const efficiencyBoost = 1 + getHeldEnchantmentLevel("efficiency") * 0.28;
    const canHarvest = canHarvestBlock(heldItemType, state.mining.type);
    const penalty = canHarvest ? 1 : getRequiredToolForBlock(state.mining.type) ? 3.2 : 1;
    const time = getBreakTime(state.mining.type) * penalty / Math.max(1, toolMultiplier * efficiencyBoost);
    state.mining.progress += dt / time;
    setMiningProgress(state.mining.progress);

    if (state.mining.progress >= 1) {
      breakCurrentTarget();
      resetMining();
    }
  }

  function tryPlaceBlock() {
    const player = getPlayer();
    const world = getWorld();
    const settings = getSettings();
    const currentTarget = state.currentTarget;
    if (!currentTarget || !player || !world || !settings || player.placeCooldown > 0) return;
    const place = currentTarget.place;
    if (!place || place.y <= 0 || place.y >= worldHeight) return;
    const existing = world.getBlock(place.x, place.y, place.z);
    if (existing !== block.AIR && !isFluidBlock(existing)) return;
    if (player.intersectsBlock(place.x, place.y, place.z)) return;
    const type = getSelectedHeldBlockType();
    if (!type || type === block.AIR) return;
    if (
      (type === block.TORCH || type === block.REDSTONE_WIRE || type === block.LEVER || type === block.REDSTONE_TORCH || type === block.REPEATER)
      && !isCollidable(world.getBlock(place.x, place.y - 1, place.z))
    ) return;
    if (type === block.BED && !isCollidable(world.getBlock(place.x, place.y - 1, place.z))) return;
    if (!isCreativeMode() && getSelectedHeldCount() <= 0) return;
    if (isMultiplayerGuest()) {
      if (isDedicatedMultiplayerSession()) {
        sendMultiplayerSignal({
          type: "place_block_request",
          x: place.x,
          y: place.y,
          z: place.z,
          blockType: type
        });
      } else {
        sendMultiplayerPeerMessage(getMultiplayerSession().hostPeerId, {
          type: "place_block_request",
          x: place.x,
          y: place.y,
          z: place.z,
          blockType: type
        });
      }
      if (!isCreativeMode()) {
        consumeFromSelectedSlot(1);
      }
      addPlayerStat("blocksPlaced", 1);
      player.placeCooldown = 0.14;
      return;
    }
    if (setWorldBlockWithChecks(place.x, place.y, place.z, type)) {
      if (!isCreativeMode()) {
        consumeFromSelectedSlot(1);
      }
      addPlayerStat("blocksPlaced", 1);
      if (isMultiplayerHost()) {
        broadcastMultiplayerPeerMessage({
          type: "block_update",
          x: place.x,
          y: place.y,
          z: place.z,
          blockType: type
        });
      }
      player.placeCooldown = 0.14;
    }
  }

  function consumeHeldFood() {
    const player = getPlayer();
    const world = getWorld();
    const itemType = getSelectedHeldItemType();
    const food = getItemFoodValue(itemType);
    if (!itemType || food <= 0 || isCreativeMode()) return false;
    if (!player || player.hunger >= player.maxHunger) return false;
    if (!consumeFromSelectedSlot(1)) return false;
    player.hunger = Math.min(player.maxHunger, player.hunger + food);
    player.regenTimer = 0;
    addPlayerStat("foodsEaten", 1);
    if (world) {
      world.saveDirty = true;
    }
    if (getInventoryOpen()) {
      renderInventoryUI();
    }
    return true;
  }

  function openFurnaceAtTarget(target) {
    if (!target || target.type !== block.FURNACE) return false;
    state.activeFurnaceKey = packBlockPositionKey(target.x, target.y, target.z);
    getActiveFurnaceState(true);
    setInventoryOpen(true, "furnace");
    return true;
  }

  function toggleLeverAt(target) {
    const world = getWorld();
    if (!world || !target || target.type !== block.LEVER || isMultiplayerGuest()) {
      return false;
    }
    const nextState = getOrCreateRedstoneStateAt(target.x, target.y, target.z, block.LEVER);
    if (!nextState) {
      return false;
    }
    setRedstoneStateAtPosition(target.x, target.y, target.z, block.LEVER, {
      ...nextState,
      powered: !nextState.powered
    });
    world.queueRedstoneDirtyAround(target.x, target.y, target.z);
    return true;
  }

  function cycleRepeaterDelayAt(target) {
    const world = getWorld();
    if (!world || !target || target.type !== block.REPEATER || isMultiplayerGuest()) {
      return false;
    }
    const nextState = getOrCreateRedstoneStateAt(target.x, target.y, target.z, block.REPEATER);
    if (!nextState) {
      return false;
    }
    const delay = nextState.delay >= redstoneRepeaterMaxDelay ? redstoneRepeaterMinDelay : nextState.delay + 1;
    setRedstoneStateAtPosition(target.x, target.y, target.z, block.REPEATER, {
      ...nextState,
      delay
    });
    world.queueRedstoneDirtyAround(target.x, target.y, target.z);
    return true;
  }

  function updateInteractions() {
    const input = getInput();
    const player = getPlayer();
    const currentTarget = state.currentTarget;
    const currentEntityTarget = state.currentEntityTarget;
    if (!input || !player || !input.locked || performance.now() < input.actionUnlockAt) return;
    if (input.consumeMousePress(1) && currentTarget) {
      if (isCreativeMode()) {
        let hotbarIndex = hotbarBlocks.indexOf(currentTarget.type);
        if (hotbarIndex < 0) {
          for (let index = 0; index < hotbarSlots; index += 1) {
            if ((player.hotbarCounts[index] || 0) > 0 && player.hotbarTypes[index] === currentTarget.type) {
              hotbarIndex = index;
              break;
            }
          }
        }
        if (hotbarIndex < 0) {
          hotbarIndex = player.selectedHotbarSlot;
          player.hotbarTypes[hotbarIndex] = currentTarget.type;
          player.hotbarCounts[hotbarIndex] = 1;
          setHotbarImages();
        }
        player.selectedHotbarSlot = hotbarIndex;
        updateHotbarSelection();
      } else {
        for (let index = 0; index < hotbarSlots; index += 1) {
          if (player.hotbarCounts[index] > 0 && player.hotbarTypes[index] === currentTarget.type) {
            player.selectedHotbarSlot = index;
            updateHotbarSelection();
            break;
          }
        }
      }
    }
    if (input.consumeMousePress(2)) {
      if (currentTarget?.type === block.LEVER && toggleLeverAt(currentTarget)) {
        return;
      }
      if (currentTarget?.type === block.REPEATER && cycleRepeaterDelayAt(currentTarget)) {
        return;
      }
      if (currentEntityTarget?.mob?.type === "villager" && openVillagerTrade(currentEntityTarget.mob)) {
        return;
      }
      if (currentTarget?.type === block.BED && tryUseBed(currentTarget)) {
        return;
      }
      if (currentTarget?.type === block.CRAFTING_TABLE) {
        setInventoryOpen(true, "table");
        return;
      }
      if (currentTarget?.type === block.FURNACE && openFurnaceAtTarget(currentTarget)) {
        return;
      }
      if (consumeHeldFood()) {
        return;
      }
    }
    if (input.buttonsDown[2]) {
      tryPlaceBlock();
    }
  }

  function updateCombat() {
    const input = getInput();
    if (!input || !input.locked || performance.now() < input.actionUnlockAt) return;
    if (!state.currentEntityTarget?.mob) return;
    if (input.consumeMousePress(0)) {
      attackTargetMob();
    }
  }

  return {
    breakCurrentTarget,
    setMiningProgress,
    tryPlaceBlock,
    updateCombat,
    updateInteractions,
    updateMining
  };
}
