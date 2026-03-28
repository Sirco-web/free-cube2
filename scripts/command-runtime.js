export function createCommandRuntime({
  state,
  block,
  blockInfo,
  defaultGamerules,
  effectDefs,
  enchantmentDefs,
  gameMode,
  gameVersion,
  worldHeight,
  clamp,
  getTimeSecondsFromMinecraftTicks,
  getWorldTimePreset,
  normalizeWorldTimeSeconds,
  normalizeWeatherType,
  sanitizeEffectKey,
  normalizeItemName,
  resolveItemTypeByName,
  getPlacedBlockType,
  getItemName,
  isCollidable,
  isMultiplayerGuest,
  addToInventory,
  getSelectedHeldItemType,
  getSelectedHeldCount,
  addEnchantmentLevel,
  applyPlayerEffect,
  setWeatherState,
  setPlayerSpawnPoint,
  setWorldSpawn,
  setWorldBlockWithChecks,
  getNearestVillageCenter,
  isKnownMobType,
  summonMobNearPlayer,
  setBossBar,
  pushChatLine,
  clearChatLines,
  logMobRenderDiagnostics,
  setSettingsUI,
  setHotbarImages,
  respawnPlayer
}) {
  function parseCommandBoolean(value) {
    const lower = String(value || "").trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(lower)) return true;
    if (["false", "0", "no", "off"].includes(lower)) return false;
    return null;
  }

  function parseCommandTicks(value, fallbackSeconds = null) {
    if (!Number.isFinite(Number(value))) {
      return fallbackSeconds;
    }
    return Math.max(1, getTimeSecondsFromMinecraftTicks(Number(value)));
  }

  function parseCommandCoordinate(value, base) {
    const raw = String(value ?? "").trim();
    if (!raw) return null;
    if (raw === "~") return Number(base);
    if (raw.startsWith("~")) {
      const offset = raw.slice(1);
      if (!offset) return Number(base);
      const parsedOffset = Number(offset);
      return Number.isFinite(parsedOffset) ? Number(base) + parsedOffset : null;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function parseCommandPositionArgs(args, fallbackPosition = null) {
    const player = state.player;
    const base = fallbackPosition || player || { x: 0, y: 0, z: 0 };
    if (!Array.isArray(args) || args.length < 3) {
      return null;
    }
    const x = parseCommandCoordinate(args[0], base.x);
    const y = parseCommandCoordinate(args[1], base.y);
    const z = parseCommandCoordinate(args[2], base.z);
    if (![x, y, z].every(Number.isFinite)) {
      return null;
    }
    return {
      x,
      y: clamp(y, 1, worldHeight - 2),
      z
    };
  }

  function resolveBlockTypeByName(name) {
    const key = normalizeItemName(name);
    if (!key) return null;
    if (key === "air") {
      return block.AIR;
    }
    const itemType = resolveItemTypeByName(name);
    if (blockInfo[itemType]) {
      return itemType;
    }
    const placedBlock = getPlacedBlockType(itemType);
    if (placedBlock && placedBlock !== block.AIR) {
      return placedBlock;
    }
    return null;
  }

  function handleKillCommand(selector = "@p") {
    const player = state.player;
    const world = state.world;
    const target = String(selector || "@p").toLowerCase();
    if (target === "@p" || target === "@a" || target === "player") {
      if (!player) {
        return "";
      }
      player.health = 0;
      respawnPlayer();
      return "Player respawned.";
    }
    if (target === "@e") {
      const removed = state.mobs.length + state.items.length;
      state.mobs = [];
      state.items = [];
      state.renderEntities.length = 0;
      if (state.glRenderer) {
        state.glRenderer.entities = state.renderEntities;
      }
      if (world) {
        world.saveDirty = true;
      }
      return `Removed ${removed} entities.`;
    }
    return "";
  }

  function runCommand(line) {
    const world = state.world;
    const player = state.player;
    const settings = state.settings;
    const weather = state.weather;
    const gamerules = state.gamerules;
    const parts = String(line || "").trim().split(/\s+/).filter(Boolean);
    const cmd = (parts.shift() || "").toLowerCase();
    const args = parts;

    if (!cmd || cmd === "help") {
      pushChatLine("Commands: /help, /give, /gm, /tp, /time, /weather, /gamerule, /setblock, /fill, /kill, /spawnpoint, /setworldspawn, /locate, /summon, /effect, /enchant, /rd, /sysinfo, /clear", "sys");
      pushChatLine("Examples: /time set night, /weather thunder 6000, /setblock ~ ~-1 ~ bed, /fill ~-2 ~ ~-2 ~2 ~ ~2 glass", "sys");
      return;
    }

    if (cmd === "clear") {
      clearChatLines();
      return;
    }

    if (isMultiplayerGuest() && !["help", "clear", "rd", "renderdistance", "sysinfo"].includes(cmd)) {
      pushChatLine("Only the host can run world-changing commands in multiplayer.", "err");
      return;
    }

    if (!world || !player) {
      pushChatLine("No active world.", "err");
      return;
    }

    if (cmd === "gm" || cmd === "gamemode") {
      const modeArg = (args[0] || "").toLowerCase();
      settings.gameMode = modeArg.startsWith("c") ? gameMode.CREATIVE : gameMode.SURVIVAL;
      setSettingsUI();
      setHotbarImages();
      world.saveDirty = true;
      pushChatLine(`Game mode: ${settings.gameMode}`, "sys");
      return;
    }

    if (cmd === "rd" || cmd === "renderdistance") {
      const rd = clamp(Number(args[0]) || settings.renderDistanceChunks, 2, 12);
      settings.renderDistanceChunks = rd;
      setSettingsUI();
      state.glRenderer?.setRenderDistance(rd);
      state.canvasRenderer?.setRenderDistance(rd);
      world.saveDirty = true;
      pushChatLine(`Render distance set to ${rd}`, "sys");
      return;
    }

    if (cmd === "give") {
      const itemType = resolveItemTypeByName(args[0]);
      const count = clamp(Number(args[1]) || 1, 1, 64);
      if (!itemType || itemType === block.AIR) {
        pushChatLine("Usage: /give <item> [count]", "err");
        return;
      }
      const left = addToInventory(itemType, count);
      const received = count - left;
      if (received > 0) {
        pushChatLine(`Given ${received} ${getItemName(itemType)}.`, "sys");
      } else {
        pushChatLine("Inventory full.", "err");
      }
      return;
    }

    if (cmd === "effect") {
      const effectKey = sanitizeEffectKey(args[0]);
      const level = clamp(Math.floor(Number(args[1]) || 1), 1, 10);
      const durationSeconds = Math.max(1, Number(args[2]) || 30);
      if (!effectKey || !effectDefs[effectKey]) {
        pushChatLine("Usage: /effect <speed|strength|regeneration|jump_boost|resistance|poison> [level] [seconds]", "err");
        return;
      }
      applyPlayerEffect(effectKey, level, durationSeconds, true);
      world.saveDirty = true;
      return;
    }

    if (cmd === "enchant") {
      const slotArg = String(args[0] || "held").trim().toLowerCase();
      const slotKey = slotArg === "armor" ? "armor" : "held";
      const enchantKey = String(args[1] || "").trim().toLowerCase();
      const levels = clamp(Math.floor(Number(args[2]) || 1), 1, 5);
      if (!enchantmentDefs[enchantKey]) {
        pushChatLine("Usage: /enchant <held|armor> <sharpness|efficiency|unbreaking|protection> [levels]", "err");
        return;
      }
      if (slotKey === "held" && (!getSelectedHeldItemType() || getSelectedHeldCount() <= 0)) {
        pushChatLine("Hold an item first.", "err");
        return;
      }
      if (slotKey === "armor" && !player.armorCounts.some((count) => count > 0)) {
        pushChatLine("Equip armor first.", "err");
        return;
      }
      if (!addEnchantmentLevel(slotKey, enchantKey, levels, true)) {
        pushChatLine("That enchantment could not be applied.", "err");
        return;
      }
      world.saveDirty = true;
      return;
    }

    if (cmd === "tp" || cmd === "teleport") {
      const pos = parseCommandPositionArgs(args, player);
      if (!pos) {
        pushChatLine("Usage: /tp x y z", "err");
        return;
      }
      player.setPosition(pos.x, pos.y, pos.z);
      player.ensureSafePosition(world);
      world.saveDirty = true;
      pushChatLine(`Teleported to ${pos.x.toFixed(1)} ${pos.y.toFixed(1)} ${pos.z.toFixed(1)}`, "sys");
      return;
    }

    if (cmd === "time") {
      const sub = (args[0] || "").toLowerCase();
      if (sub === "set") {
        const preset = getWorldTimePreset(args[1]);
        if (preset !== null) {
          state.worldTime = preset;
        } else if (Number.isFinite(Number(args[1]))) {
          state.worldTime = normalizeWorldTimeSeconds(getTimeSecondsFromMinecraftTicks(Number(args[1])));
        } else {
          pushChatLine("Usage: /time set <day|noon|night|midnight|ticks>", "err");
          return;
        }
        world.saveDirty = true;
        pushChatLine(`Time set to ${state.getDayCycleInfo(state.worldTime).phase}.`, "sys");
        return;
      }
      if (sub === "add") {
        if (!Number.isFinite(Number(args[1]))) {
          pushChatLine("Usage: /time add <ticks>", "err");
          return;
        }
        state.worldTime = normalizeWorldTimeSeconds(state.worldTime + getTimeSecondsFromMinecraftTicks(Number(args[1])));
        world.saveDirty = true;
        pushChatLine(`Time advanced. It is now ${state.getDayCycleInfo(state.worldTime).phase}.`, "sys");
        return;
      }
      pushChatLine("Usage: /time <set|add> ...", "err");
      return;
    }

    if (cmd === "weather") {
      const type = normalizeWeatherType(args[0], "");
      if (!type) {
        pushChatLine("Usage: /weather <clear|rain|thunder> [durationTicks]", "err");
        return;
      }
      const durationSeconds = parseCommandTicks(args[1], null);
      setWeatherState(type, durationSeconds, true);
      return;
    }

    if (cmd === "gamerule") {
      const ruleName = String(args[0] || "");
      const parsedValue = parseCommandBoolean(args[1]);
      if (!(ruleName in defaultGamerules) || parsedValue === null) {
        pushChatLine("Usage: /gamerule <doDaylightCycle|doWeatherCycle|keepInventory> <true|false>", "err");
        return;
      }
      gamerules[ruleName] = parsedValue;
      world.saveDirty = true;
      pushChatLine(`Gamerule ${ruleName} = ${parsedValue}.`, "sys");
      return;
    }

    if (cmd === "spawnpoint") {
      const position = parseCommandPositionArgs(args, player);
      const point = position
        ? { ...position, source: "command" }
        : { x: player.x, y: player.y, z: player.z, source: "command" };
      setPlayerSpawnPoint(point, true);
      return;
    }

    if (cmd === "setworldspawn") {
      const position = parseCommandPositionArgs(args, player);
      const point = position
        ? { ...position, source: "world" }
        : { x: player.x, y: player.y, z: player.z, source: "world" };
      setWorldSpawn(point, true);
      return;
    }

    if (cmd === "setblock") {
      const position = parseCommandPositionArgs(args.slice(0, 3), player);
      const blockType = resolveBlockTypeByName(args[3]);
      const blockName = blockType === block.AIR ? "Air" : getItemName(blockType);
      if (!position || blockType === null) {
        pushChatLine("Usage: /setblock x y z <block>", "err");
        return;
      }
      if (blockType === block.BED && !isCollidable(world.peekBlock(position.x, position.y - 1, position.z))) {
        pushChatLine("Beds need a solid block underneath.", "err");
        return;
      }
      if (!setWorldBlockWithChecks(position.x, position.y, position.z, blockType, true)) {
        pushChatLine("That block could not be changed.", "err");
        return;
      }
      pushChatLine(`Set block at ${Math.floor(position.x)} ${Math.floor(position.y)} ${Math.floor(position.z)} to ${blockName}.`, "sys");
      return;
    }

    if (cmd === "fill") {
      const from = parseCommandPositionArgs(args.slice(0, 3), player);
      const to = parseCommandPositionArgs(args.slice(3, 6), player);
      const blockType = resolveBlockTypeByName(args[6]);
      const blockName = blockType === block.AIR ? "Air" : getItemName(blockType);
      if (!from || !to || blockType === null) {
        pushChatLine("Usage: /fill x1 y1 z1 x2 y2 z2 <block>", "err");
        return;
      }
      const minX = Math.floor(Math.min(from.x, to.x));
      const maxX = Math.floor(Math.max(from.x, to.x));
      const minY = Math.floor(Math.min(from.y, to.y));
      const maxY = Math.floor(Math.max(from.y, to.y));
      const minZ = Math.floor(Math.min(from.z, to.z));
      const maxZ = Math.floor(Math.max(from.z, to.z));
      const total = (maxX - minX + 1) * (maxY - minY + 1) * (maxZ - minZ + 1);
      if (total > 4096) {
        pushChatLine("Fill is limited to 4096 blocks at a time.", "err");
        return;
      }
      let changed = 0;
      for (let y = minY; y <= maxY; y += 1) {
        for (let z = minZ; z <= maxZ; z += 1) {
          for (let x = minX; x <= maxX; x += 1) {
            if (blockType === block.BED && !isCollidable(world.peekBlock(x, y - 1, z))) {
              continue;
            }
            if (setWorldBlockWithChecks(x, y, z, blockType, false)) {
              changed += 1;
            }
          }
        }
      }
      if (changed <= 0) {
        pushChatLine("Fill did not change any blocks.", "err");
        return;
      }
      pushChatLine(`Filled ${changed} block${changed === 1 ? "" : "s"} with ${blockName}.`, "sys");
      return;
    }

    if (cmd === "locate") {
      const sub = String(args[0] || "").toLowerCase();
      if (sub !== "village") {
        pushChatLine("Usage: /locate village", "err");
        return;
      }
      const center = getNearestVillageCenter(player.x, player.z, world.seed, 256);
      if (!center) {
        pushChatLine("No village found nearby.", "err");
        return;
      }
      pushChatLine(`Nearest village: ${Math.floor(center.x)} ${Math.floor(center.z)}`, "sys");
      return;
    }

    if (cmd === "kill") {
      const result = handleKillCommand(args[0] || "@p");
      if (!result) {
        pushChatLine("Usage: /kill [@p|@e]", "err");
        return;
      }
      pushChatLine(result, "sys");
      return;
    }

    if (cmd === "heal") {
      player.health = player.maxHealth;
      player.hunger = player.maxHunger;
      world.saveDirty = true;
      pushChatLine("Healed.", "sys");
      return;
    }

    if (cmd === "damage") {
      const amt = clamp(Number(args[0]) || 1, 0, 20);
      player.health = Math.max(0, player.health - amt);
      player.hurtCooldown = 0.35;
      world.saveDirty = true;
      pushChatLine(`Damaged for ${amt}.`, "sys");
      return;
    }

    if (cmd === "sysinfo") {
      const info = {
        version: gameVersion,
        renderer: state.useWebGL ? "WebGL2" : "Canvas",
        seed: world.seed,
        time: state.worldTime.toFixed(1),
        weather: weather.type,
        mobs: state.mobs.length,
        items: state.items.length,
        chunks: world?.chunks?.size,
        furnaces: state.furnaceStates.size
      };
      console.log("SYSINFO", info);
      logMobRenderDiagnostics("sysinfo");
      pushChatLine(`SYSINFO: ${info.renderer}, weather=${info.weather}, mobs=${info.mobs}, items=${info.items}, chunks=${info.chunks}`, "sys");
      return;
    }

    if (cmd === "summon") {
      const type = (args[0] || "zombie").toLowerCase();
      const count = clamp(Number(args[1]) || 1, 1, 16);
      if (!isKnownMobType(type)) {
        pushChatLine(`Unknown mob: ${type}`, "err");
        return;
      }
      let summoned = 0;
      for (let i = 0; i < count; i += 1) {
        if (summonMobNearPlayer(type)) {
          summoned += 1;
        }
      }
      pushChatLine(
        summoned > 0
          ? `Summoned ${summoned}${summoned !== count ? `/${count}` : ""} ${type}(s).`
          : `Could not summon ${type}.`,
        summoned > 0 ? "sys" : "err"
      );
      return;
    }

    if (cmd === "boss") {
      const sub = (args[0] || "").toLowerCase();
      if (sub === "off" || sub === "hide") {
        setBossBar(false);
        pushChatLine("Boss bar hidden.", "sys");
        return;
      }
      const name = args.slice(0, -1).join(" ").trim() || "Boss";
      const hp = Number(args[args.length - 1]);
      const health01 = Number.isFinite(hp) ? hp : 1;
      setBossBar(true, name, health01);
      pushChatLine(`Boss bar: "${name}" ${(clamp(health01, 0, 1) * 100).toFixed(0)}%`, "sys");
      return;
    }

    pushChatLine(`Unknown command: /${cmd} (try /help)`, "err");
  }

  return {
    runCommand
  };
}
