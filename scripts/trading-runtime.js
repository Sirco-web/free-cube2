export function createTradingRuntime({
  state,
  block,
  item,
  effectDefs,
  enchantmentDefs,
  clamp,
  getMode,
  getInventoryOpen,
  getChatOpen,
  getInput,
  getUi,
  getWorld,
  getPlayer,
  ensureVillageMobData,
  getVillagerProfessionLabel,
  getItemName,
  countInventoryItem,
  getInventorySpaceForItem,
  removeInventoryItem,
  addToInventory,
  spawnItemEntity,
  applyPlayerEffect,
  addEnchantmentLevel,
  addPlayerStat,
  unlockPlayerAchievement,
  queueToast,
  setHotbarImages,
  renderInventoryUI,
  closeChat,
  setInventoryOpen
}) {
  function isVillagerTradeValid(mob = state.activeVillager) {
    const player = getPlayer();
    if (!mob || mob.health <= 0 || mob.type !== "villager" || !player) return false;
    const dx = mob.x - player.x;
    const dz = mob.z - player.z;
    return dx * dx + dz * dz <= 6.5 * 6.5;
  }

  function describeTradeReward(reward) {
    if (!reward || typeof reward !== "object") return "Unknown reward";
    if (reward.kind === "item") {
      return `${reward.count} ${getItemName(reward.itemType)}`;
    }
    if (reward.kind === "enchant") {
      return `${enchantmentDefs[reward.enchant]?.label || reward.enchant} +${reward.levels} (${reward.slot})`;
    }
    if (reward.kind === "effect") {
      return `${effectDefs[reward.effect]?.label || reward.effect} ${reward.level} for ${Math.ceil(reward.duration || 0)}s`;
    }
    return "Unknown reward";
  }

  function getTradeOfferState(offer) {
    const costs = Array.isArray(offer?.costs) ? offer.costs : [];
    const usedUp = (offer?.uses || 0) >= (offer?.maxUses || 0);
    const missing = costs.map((cost) => ({
      ...cost,
      have: countInventoryItem(cost.itemType),
      missing: Math.max(0, cost.count - countInventoryItem(cost.itemType))
    }));
    const inventoryBlocked = offer?.reward?.kind === "item" && getInventorySpaceForItem(offer.reward.itemType) < (offer.reward.count || 1);
    const canTrade = !usedUp && !inventoryBlocked && missing.every((entry) => entry.missing <= 0);
    let status = "Ready to trade";
    if (usedUp) status = "Restocks after work";
    else if (inventoryBlocked) status = "Inventory full";
    else if (!canTrade) status = "Missing materials";
    return { canTrade, usedUp, inventoryBlocked, missing, status };
  }

  function renderVillagerTradeUi() {
    const ui = getUi();
    const world = getWorld();
    if (!ui?.tradeEl) return;
    if (!state.open || !isVillagerTradeValid()) {
      ui.tradeEl.style.display = "none";
      ui.root.classList.toggle("menu-open", getInventoryOpen() || getMode() === "menu" || getMode() === "paused" || getChatOpen());
      return;
    }
    ensureVillageMobData(state.activeVillager, world);
    ui.tradeEl.style.display = "block";
    ui.root.classList.add("menu-open");
    ui.tradeTitleEl.textContent = `${getVillagerProfessionLabel(state.activeVillager.profession)} Villager`;
    ui.tradeSubEl.textContent = `State: ${state.activeVillager.villagerState || "mingle"} | Restocks when this villager works at ${getItemName(state.activeVillager.jobTarget?.type || block.CRAFTING_TABLE)}.`;
    ui.tradeStatusEl.textContent = `Emeralds: ${countInventoryItem(item.EMERALD)} | Willingness: ${Math.round(clamp(state.activeVillager.willingness || 0, 0, 1) * 100)}%`;
    ui.tradeListEl.innerHTML = "";

    for (let index = 0; index < (state.activeVillager.offers || []).length; index += 1) {
      const offer = state.activeVillager.offers[index];
      const offerState = getTradeOfferState(offer);
      const row = document.createElement("div");
      row.className = "fc-trade-offer";
      const costsHtml = offerState.missing.map((cost) => `<span class="fc-trade-chip${cost.missing > 0 ? " missing" : ""}">${getItemName(cost.itemType)} ${cost.have}/${cost.count}</span>`).join("");
      row.innerHTML = `
        <div class="fc-trade-main">
          <div class="fc-trade-name">${offer.label || "Trade"}</div>
          <div class="fc-trade-costs">${costsHtml}<span class="fc-trade-chip reward">Reward: ${describeTradeReward(offer.reward)}</span></div>
          <div class="fc-trade-meta">Uses ${offer.uses || 0}/${offer.maxUses || 0}</div>
        </div>
        <div class="fc-trade-actions">
          <button class="fc-btn small${offerState.canTrade ? "" : " disabled"}" type="button" data-trade-offer="${index}" ${offerState.canTrade ? "" : "disabled"}>Trade</button>
          <div class="fc-trade-status${offerState.canTrade ? "" : " bad"}">${offerState.status}</div>
        </div>
      `;
      ui.tradeListEl.appendChild(row);
    }
  }

  function closeTrade(lockMouse = true) {
    state.open = false;
    state.activeVillager = null;
    const ui = getUi();
    if (ui?.tradeEl) {
      ui.tradeEl.style.display = "none";
    }
    const input = getInput();
    if (!getInventoryOpen() && !getChatOpen() && getMode() === "playing" && lockMouse && input) {
      input.pointerLockEnabled = true;
      input.requestPointerLock();
    } else if (!getInventoryOpen() && !getChatOpen() && getMode() !== "menu" && getMode() !== "paused") {
      ui?.root?.classList?.remove?.("menu-open");
    }
  }

  function openVillagerTrade(mob) {
    const player = getPlayer();
    const world = getWorld();
    const input = getInput();
    if (!mob || mob.type !== "villager" || !player || !world) return false;
    ensureVillageMobData(mob, world);
    state.activeVillager = mob;
    state.open = true;
    closeChat(false);
    if (getInventoryOpen()) {
      setInventoryOpen(false);
    }
    if (input) {
      input.pointerLockEnabled = false;
    }
    if (document.exitPointerLock) {
      document.exitPointerLock();
    }
    renderVillagerTradeUi();
    return true;
  }

  function executeVillagerTrade(index) {
    const world = getWorld();
    const player = getPlayer();
    if (!state.open || !isVillagerTradeValid()) return false;
    const offer = state.activeVillager.offers?.[index];
    if (!offer) return false;
    const offerState = getTradeOfferState(offer);
    if (!offerState.canTrade) {
      queueToast("Trade unavailable", offerState.status, 3.6, "bad");
      renderVillagerTradeUi();
      return false;
    }

    for (const cost of offer.costs || []) {
      removeInventoryItem(cost.itemType, cost.count);
    }

    let granted = false;
    if (offer.reward?.kind === "item") {
      const left = addToInventory(offer.reward.itemType, offer.reward.count || 1, false);
      if (left > 0 && player) {
        const eye = player.getEyePosition();
        spawnItemEntity(offer.reward.itemType, left, eye.x, eye.y - 0.2, eye.z, 0, 1.8, 0, 0.1);
      }
      granted = true;
    } else if (offer.reward?.kind === "effect") {
      granted = applyPlayerEffect(offer.reward.effect, offer.reward.level || 1, offer.reward.duration || 30, true);
    } else if (offer.reward?.kind === "enchant") {
      granted = addEnchantmentLevel(offer.reward.slot, offer.reward.enchant, offer.reward.levels || 1, true);
    }

    if (!granted) {
      queueToast("Trade failed", "That reward could not be granted.", 3.6, "bad");
      return false;
    }

    offer.uses = Math.min(offer.maxUses || 0, (offer.uses || 0) + 1);
    state.activeVillager.willingness = clamp((state.activeVillager.willingness || 0) + 0.22, 0, 1);
    addPlayerStat("villagerTrades", 1);
    unlockPlayerAchievement("village_social");
    queueToast("Trade complete", offer.label || "Villager trade", 3.4, "sys");
    if (world) {
      world.saveDirty = true;
    }
    setHotbarImages();
    renderVillagerTradeUi();
    return true;
  }

  return {
    closeTrade,
    executeVillagerTrade,
    isVillagerTradeValid,
    openVillagerTrade,
    renderVillagerTradeUi
  };
}
