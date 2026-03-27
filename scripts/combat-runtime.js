export function createCombatRuntime({
  state,
  BLOCK,
  ITEM,
  GAME_MODE,
  MAX_REACH,
  MOB_LOOT_TABLES,
  clamp,
  random3,
  getSelectedHeldItemType,
  getHeldEnchantmentLevel,
  isCreativeMode,
  addPlayerStat,
  damageSelectedHeldItem,
  getMobDef,
  unlockPlayerAchievement,
  spawnItemEntity,
  setHotbarImages,
  renderInventoryUI,
  clearInventoryCursor,
  setMiningProgress,
  getRespawnPoint,
  pushChatLine,
  damageArmorFromHit,
  getArmorEnchantmentLevel,
  rayIntersectAABB
}) {
  function getMobTargetAABB(mob) {
    return {
      minX: mob.x - mob.radius,
      maxX: mob.x + mob.radius,
      minY: mob.y,
      maxY: mob.y + mob.height,
      minZ: mob.z - mob.radius,
      maxZ: mob.z + mob.radius
    };
  }

  function getHeldAttackDamage(itemType = getSelectedHeldItemType()) {
    if (isCreativeMode()) return 999;
    let damage = 1;
    switch (itemType) {
      case ITEM.WOODEN_SWORD:
        damage = 4;
        break;
      case ITEM.WOODEN_AXE:
        damage = 3;
        break;
      case ITEM.WOODEN_PICKAXE:
        damage = 2;
        break;
      case ITEM.WOODEN_SHOVEL:
        damage = 1.5;
        break;
      case ITEM.IRON_SWORD:
        damage = 6;
        break;
      case ITEM.IRON_AXE:
        damage = 5;
        break;
      case ITEM.IRON_PICKAXE:
        damage = 3.5;
        break;
      case ITEM.IRON_SHOVEL:
        damage = 2.5;
        break;
      case ITEM.DIAMOND_SWORD:
        damage = 7;
        break;
      case ITEM.DIAMOND_AXE:
        damage = 6;
        break;
      case ITEM.DIAMOND_PICKAXE:
        damage = 4.5;
        break;
      case ITEM.DIAMOND_SHOVEL:
        damage = 3;
        break;
      default:
        damage = 1;
    }
    damage += getHeldEnchantmentLevel("sharpness") * 1.25;
    damage += state.player?.getEffectLevel?.("strength") * 3 || 0;
    return damage;
  }

  function addXp(amount) {
    const player = state.player;
    const world = state.world;
    if (!player) return;
    const xp = Math.max(0, Number(amount) || 0);
    if (xp <= 0) return;
    player.xp += xp;
    while (player.xp >= 1) {
      player.xp -= 1;
      player.xpLevel += 1;
    }
    if (world) {
      world.saveDirty = true;
    }
    state.hud.last = null;
  }

  function findTargetMob(blockTarget = null) {
    const player = state.player;
    const mobs = state.mobs;
    if (!player || !mobs || mobs.length === 0) return null;
    const origin = player.getEyePosition();
    const direction = player.getLookVector();
    const maxDistance = clamp(blockTarget ? blockTarget.distance - 0.05 : MAX_REACH, 0, MAX_REACH);
    if (maxDistance <= 0.01) return null;

    let best = null;
    let bestDistance = maxDistance;
    for (const mob of mobs) {
      if (!mob || mob.health <= 0) continue;
      const hit = rayIntersectAABB(origin, direction, bestDistance, getMobTargetAABB(mob));
      if (hit === null) continue;
      bestDistance = hit;
      best = { mob, distance: hit };
    }
    return best;
  }

  function removeMob(mob) {
    const index = state.mobs.indexOf(mob);
    if (index >= 0) {
      state.mobs.splice(index, 1);
    }
  }

  function dropMobLoot(mob) {
    const player = state.player;
    const world = state.world;
    if (!mob || !player) return;
    const table = MOB_LOOT_TABLES[mob.type];
    if (!table?.length) return;

    const seed = (world?.seed || 0) + Math.floor(mob.x * 17) + Math.floor(mob.z * 29);
    const dropY = mob.y + Math.min(0.9, mob.height * 0.45);
    for (let index = 0; index < table.length; index += 1) {
      const entry = table[index];
      const min = Math.max(0, Math.floor(entry?.min || 0));
      const max = Math.max(min, Math.floor(entry?.max || min));
      const roll = random3(Math.floor(mob.x * 3) + index, Math.floor(mob.y * 5) + index * 3, Math.floor(mob.z * 7) + index * 5, seed + 101 + index * 17);
      const count = min + Math.floor(roll * (max - min + 1));
      if (!entry?.itemType || count <= 0) continue;
      const vx = (random3(Math.floor(mob.x * 3) + index, Math.floor(mob.y * 5), Math.floor(mob.z * 7), seed + 11 + index * 23) - 0.5) * 2.4;
      const vz = (random3(Math.floor(mob.z * 3) + index, Math.floor(mob.y * 5), Math.floor(mob.x * 7), seed + 19 + index * 29) - 0.5) * 2.4;
      spawnItemEntity(entry.itemType, count, mob.x, dropY, mob.z, vx, 3.2, vz, 0.45);
    }
  }

  function attackTargetMob() {
    const player = state.player;
    const world = state.world;
    if (!state.currentEntityTarget?.mob || !player) return false;
    const mob = state.currentEntityTarget.mob;
    const damage = getHeldAttackDamage();
    const killed = mob.takeDamage(damage, player.x, player.z);
    addPlayerStat("damageDealt", damage);
    if (!isCreativeMode()) {
      damageSelectedHeldItem(1);
    }
    player.breakCooldown = Math.max(player.breakCooldown, isCreativeMode() ? 0.08 : 0.24);
    if (killed) {
      dropMobLoot(mob);
      addXp(getMobDef(mob.type).hostile ? 0.35 : 0.18);
      addPlayerStat("mobsKilled", 1);
      if (getMobDef(mob.type).hostile) {
        unlockPlayerAchievement("monster_hunter");
      }
      removeMob(mob);
    }
    if (world) {
      world.saveDirty = true;
    }
    return true;
  }

  function applyDamage(amount, reason = "") {
    const player = state.player;
    const world = state.world;
    if (!player) return;
    if (state.settings.gameMode === GAME_MODE.CREATIVE) return;
    if (player.hurtCooldown > 0) return;
    const base = Math.max(0, Number(amount) || 0);
    const armorPoints = player.getArmorPoints();
    const protectionReduction = getArmorEnchantmentLevel("protection") * 0.04;
    const resistanceReduction = player.getEffectLevel("resistance") * 0.08;
    const reduction = clamp(armorPoints * 0.04 + protectionReduction + resistanceReduction, 0, 0.85);
    const dmg = Math.max(0, Math.ceil(base * (1 - reduction)));
    if (dmg <= 0) return;
    player.health = Math.max(0, player.health - dmg);
    player.hurtCooldown = 0.45;
    damageArmorFromHit(dmg);
    addPlayerStat("damageTaken", dmg);
    if (world) {
      world.saveDirty = true;
    }
    if (reason) {
      pushChatLine(`Ouch (${reason})`, "sys");
    }
  }

  function clearPlayerInventory() {
    const player = state.player;
    if (!player) return;
    player.initializeInventory();
    clearInventoryCursor();
    state.inventoryCraftTypes.fill(0);
    state.inventoryCraftCounts.fill(0);
    state.tableCraftTypes.fill(0);
    state.tableCraftCounts.fill(0);
    setHotbarImages();
    if (state.inventoryOpen) {
      renderInventoryUI();
    }
  }

  function respawnPlayer() {
    const player = state.player;
    const world = state.world;
    const spawn = getRespawnPoint();
    player.setPosition(spawn.x, spawn.y, spawn.z);
    if (state.gamerules.keepInventory === false) {
      clearPlayerInventory();
    }
    player.health = player.maxHealth;
    player.hunger = player.maxHunger;
    player.hurtCooldown = 0;
    player.regenTimer = 0;
    player.starveTimer = 0;
    player.lavaDamageTimer = 0;
    player.fallDistance = 0;
    player.pendingFallDamage = 0;
    state.mining.key = null;
    state.mining.progress = 0;
    setMiningProgress(0);
    if (world) {
      world.saveDirty = true;
    }
    pushChatLine("Respawned.", "sys");
  }

  function updatePlayerVitals(dt) {
    const player = state.player;
    const world = state.world;
    if (!player) return;
    player.hurtCooldown = Math.max(0, player.hurtCooldown - dt);
    let effectsChanged = false;
    const effectTimers = player.effectTickTimers || (player.effectTickTimers = {});

    for (const [key, effect] of Object.entries(player.effects || {})) {
      if (!effect || effect.time <= 0 || effect.level <= 0) {
        delete player.effects[key];
        delete effectTimers[key];
        effectsChanged = true;
        continue;
      }
      effect.time = Math.max(0, effect.time - dt);
      effect.maxTime = Math.max(effect.maxTime || 0, effect.time);
      effectsChanged = true;
      if (effect.time <= 0) {
        delete player.effects[key];
        delete effectTimers[key];
        continue;
      }
      if (state.settings.gameMode === GAME_MODE.CREATIVE) {
        continue;
      }
      if (key === "regeneration" || key === "poison") {
        effectTimers[key] = (effectTimers[key] || 0) + dt;
        const interval = key === "regeneration"
          ? Math.max(0.6, 2.2 - effect.level * 0.3)
          : Math.max(0.7, 1.9 - effect.level * 0.22);
        while (effectTimers[key] >= interval) {
          effectTimers[key] -= interval;
          if (key === "regeneration" && player.health < player.maxHealth) {
            player.health = Math.min(player.maxHealth, player.health + Math.max(1, Math.floor(effect.level)));
          } else if (key === "poison" && player.health > 1) {
            player.health = Math.max(1, player.health - 1);
            player.hurtCooldown = Math.max(player.hurtCooldown, 0.12);
          }
        }
      }
    }

    for (const key of Object.keys(effectTimers)) {
      if (!player.effects[key]) {
        delete effectTimers[key];
      }
    }
    if (effectsChanged && world) {
      world.saveDirty = true;
    }

    if (state.mode !== "playing") {
      return;
    }

    if (state.settings.gameMode === GAME_MODE.CREATIVE) {
      player.health = player.maxHealth;
      player.hunger = player.maxHunger;
      player.regenTimer = 0;
      player.starveTimer = 0;
      player.lavaDamageTimer = 0;
      return;
    }

    if (player.inLava) {
      player.lavaDamageTimer += dt;
      if (player.lavaDamageTimer >= 0.8) {
        player.lavaDamageTimer = 0;
        applyDamage(2, "lava");
      }
    } else {
      player.lavaDamageTimer = 0;
    }

    if (player.isSprinting) {
      player.hunger = Math.max(0, player.hunger - dt * 0.55);
    }

    if (player.hunger >= 18 && player.health < player.maxHealth) {
      player.regenTimer += dt;
      if (player.regenTimer >= 4.2) {
        player.regenTimer = 0;
        player.health = Math.min(player.maxHealth, player.health + 1);
        player.hunger = Math.max(0, player.hunger - 1);
        if (world) {
          world.saveDirty = true;
        }
      }
    } else {
      player.regenTimer = 0;
    }

    if (player.hunger <= 0) {
      player.starveTimer += dt;
      if (player.starveTimer >= 3.4) {
        player.starveTimer = 0;
        applyDamage(1, "starving");
      }
    } else {
      player.starveTimer = 0;
    }

    if (player.health <= 0) {
      respawnPlayer();
    }
  }

  function renderHearts(el, value) {
    const hearts = 10;
    const fullHearts = clamp(Math.floor(value / 2), 0, hearts);
    const hasHalf = value % 2 === 1 && fullHearts < hearts;
    el.innerHTML = "";
    for (let i = 0; i < hearts; i += 1) {
      const d = document.createElement("div");
      d.className = "fc-heart";
      if (i < fullHearts) d.classList.add("full");
      else if (i === fullHearts && hasHalf) d.classList.add("half");
      else d.classList.add("empty");
      el.appendChild(d);
    }
  }

  function renderArmor(el, value) {
    const icons = 10;
    const full = clamp(Math.floor(value / 2), 0, icons);
    const hasHalf = value % 2 === 1 && full < icons;
    el.innerHTML = "";
    for (let i = 0; i < icons; i += 1) {
      const d = document.createElement("div");
      d.className = "fc-armor-icon";
      if (i < full) d.classList.add("full");
      else if (i === full && hasHalf) d.classList.add("half");
      else d.classList.add("empty");
      el.appendChild(d);
    }
  }

  function renderHunger(el, value) {
    const foods = 10;
    const full = clamp(Math.floor(value / 2), 0, foods);
    const hasHalf = value % 2 === 1 && full < foods;
    el.innerHTML = "";
    for (let i = 0; i < foods; i += 1) {
      const d = document.createElement("div");
      d.className = "fc-food";
      if (i < full) d.classList.add("full");
      else if (i === full && hasHalf) d.classList.add("half");
      else d.classList.add("empty");
      el.appendChild(d);
    }
  }

  return {
    addXp,
    applyDamage,
    attackTargetMob,
    clearPlayerInventory,
    dropMobLoot,
    findTargetMob,
    getHeldAttackDamage,
    getMobTargetAABB,
    removeMob,
    renderArmor,
    renderHearts,
    renderHunger,
    respawnPlayer,
    updatePlayerVitals
  };
}
