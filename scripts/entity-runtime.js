export function createEntityRuntime(deps) {
  const {
    SEA_LEVEL,
    WORLD_HEIGHT,
    CHUNK_SIZE,
    DEFAULT_SETTINGS,
    GAME_MODE,
    PLAYER_EYE_HEIGHT,
    PLAYER_HEIGHT,
    PLAYER_RADIUS,
    INVENTORY_SLOTS,
    HOTBAR_SLOTS,
    ARMOR_SLOTS,
    BLOCK,
    BLOCK_INFO,
    ARMOR_SLOT_KEYS,
    clamp,
    lerp,
    random2,
    random3,
    isCollidable,
    isFluidBlock,
    getMobDef,
    getItemArmorPoints,
    getPlayerEffectLevel,
    getItemMaxStack,
    getItemArmorSlot,
    normalizeDurabilityValue,
    normalizeSpawnPoint,
    normalizePlayerStats,
    normalizeAchievementState,
    normalizePlayerEffects,
    normalizeEnchantmentState,
    createDefaultPlayerStats,
    createDefaultAchievementState,
    createDefaultEnchantmentState,
    getNearestVillageCenter,
    getVillageStructurePlan,
    getVillagerTradeTable
  } = deps;

class Player {
  constructor() {
    this.x = 0;
    this.y = SEA_LEVEL + 3;
    this.z = 0;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.yaw = Math.PI;
    this.pitch = -0.18;
    this.onGround = false;
    this.breakCooldown = 0;
    this.placeCooldown = 0;
    this.selectedHotbarSlot = 0;
    this.initializeInventory();
    this.maxHealth = 20;
    this.health = 20;
    this.maxHunger = 20;
    this.hunger = 20;
    this.xp = 0;
    this.xpLevel = 0;
    this.hurtCooldown = 0;
    this.regenTimer = 0;
    this.starveTimer = 0;
    this.inWater = false;
    this.inLava = false;
    this.lavaDamageTimer = 0;
    this.fallDistance = 0;
    this.pendingFallDamage = 0;
    this.isSprinting = false;
    this.sprintToggled = false;
    this.isCrouching = false;
    this.spawnPoint = null;
    this.stats = createDefaultPlayerStats();
    this.achievements = createDefaultAchievementState();
    this.effects = {};
    this.enchantments = createDefaultEnchantmentState();
  }

  initializeInventory() {
    this.inventoryTypes = new Uint8Array(INVENTORY_SLOTS);
    this.inventoryCounts = new Uint16Array(INVENTORY_SLOTS);
    this.inventoryDurability = new Uint16Array(INVENTORY_SLOTS);
    this.hotbarTypes = this.inventoryTypes.subarray(0, HOTBAR_SLOTS);
    this.hotbarCounts = this.inventoryCounts.subarray(0, HOTBAR_SLOTS);
    this.armorTypes = new Uint8Array(ARMOR_SLOTS);
    this.armorCounts = new Uint8Array(ARMOR_SLOTS);
    this.armorDurability = new Uint16Array(ARMOR_SLOTS);
  }

  getArmorPoints() {
    let total = 0;
    for (let i = 0; i < ARMOR_SLOTS; i += 1) {
      if ((this.armorCounts[i] || 0) > 0) {
        total += getItemArmorPoints(this.armorTypes[i] || 0);
      }
    }
    return total;
  }

  getEyePosition() {
    return {
      x: this.x,
      y: this.y + PLAYER_EYE_HEIGHT - (this.isCrouching ? 0.18 : 0),
      z: this.z
    };
  }

  getEffectLevel(name) {
    return getPlayerEffectLevel(this, name);
  }

  getLookVector() {
    const cosPitch = Math.cos(this.pitch);
    return {
      x: Math.sin(this.yaw) * cosPitch,
      y: Math.sin(this.pitch),
      z: Math.cos(this.yaw) * cosPitch
    };
  }

  getAABB(x = this.x, y = this.y, z = this.z) {
    return {
      minX: x - PLAYER_RADIUS,
      maxX: x + PLAYER_RADIUS,
      minY: y,
      maxY: y + PLAYER_HEIGHT,
      minZ: z - PLAYER_RADIUS,
      maxZ: z + PLAYER_RADIUS
    };
  }

  intersectsBlock(blockX, blockY, blockZ, x = this.x, y = this.y, z = this.z) {
    const aabb = this.getAABB(x, y, z);
    return (
      aabb.maxX > blockX &&
      aabb.minX < blockX + 1 &&
      aabb.maxY > blockY &&
      aabb.minY < blockY + 1 &&
      aabb.maxZ > blockZ &&
      aabb.minZ < blockZ + 1
    );
  }

  wouldCollide(world, x = this.x, y = this.y, z = this.z) {
    const aabb = this.getAABB(x, y, z);
    const minX = Math.floor(aabb.minX);
    const maxX = Math.floor(aabb.maxX - 0.00001);
    const minY = Math.floor(aabb.minY);
    const maxY = Math.floor(aabb.maxY - 0.00001);
    const minZ = Math.floor(aabb.minZ);
    const maxZ = Math.floor(aabb.maxZ - 0.00001);

    for (let blockX = minX; blockX <= maxX; blockX += 1) {
      for (let blockY = minY; blockY <= maxY; blockY += 1) {
        for (let blockZ = minZ; blockZ <= maxZ; blockZ += 1) {
          if (isCollidable(world.getBlock(blockX, blockY, blockZ)) && this.intersectsBlock(blockX, blockY, blockZ, x, y, z)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  isInFluid(world, targetType, x = this.x, y = this.y, z = this.z) {
    const aabb = this.getAABB(x, y, z);
    const minX = Math.floor(aabb.minX);
    const maxX = Math.floor(aabb.maxX - 0.00001);
    const minY = Math.floor(aabb.minY);
    const maxY = Math.floor(aabb.maxY - 0.00001);
    const minZ = Math.floor(aabb.minZ);
    const maxZ = Math.floor(aabb.maxZ - 0.00001);

    for (let bx = minX; bx <= maxX; bx += 1) {
      for (let by = minY; by <= maxY; by += 1) {
        for (let bz = minZ; bz <= maxZ; bz += 1) {
          if (world.getBlock(bx, by, bz) === targetType && this.intersectsBlock(bx, by, bz, x, y, z)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  isInWater(world, x = this.x, y = this.y, z = this.z) {
    return this.isInFluid(world, BLOCK.WATER, x, y, z);
  }

  isInLava(world, x = this.x, y = this.y, z = this.z) {
    return this.isInFluid(world, BLOCK.LAVA, x, y, z);
  }

  setPosition(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.inWater = false;
    this.inLava = false;
    this.lavaDamageTimer = 0;
  }

  hasGroundSupport(world, x = this.x, z = this.z) {
    const supportY = Math.floor(this.y - 0.08);
    const inset = PLAYER_RADIUS - 0.05;
    const samples = [
      [x - inset, z - inset],
      [x + inset, z - inset],
      [x - inset, z + inset],
      [x + inset, z + inset]
    ];
    for (const [sampleX, sampleZ] of samples) {
      if (isCollidable(world.getBlock(Math.floor(sampleX), supportY, Math.floor(sampleZ)))) {
        return true;
      }
    }
    return false;
  }

  applyLook(deltaX, deltaY, settings = DEFAULT_SETTINGS) {
    const sensitivity = settings.mouseSensitivity || DEFAULT_SETTINGS.mouseSensitivity;
    const invertY = settings.invertY ? -1 : 1;
    // PointerLock movementX is positive when moving mouse right.
    // In our coordinate setup, subtracting makes "mouse left -> turn left" like Minecraft.
    this.yaw -= deltaX * sensitivity;
    // Standard Minecraft feel: mouse up looks up, mouse down looks down.
    this.pitch = clamp(this.pitch - deltaY * sensitivity * 0.84 * invertY, -1.5, 1.5);
  }

  resolveAxisCollisions(world, axis, delta) {
    let aabb = this.getAABB();
    const minX = Math.floor(aabb.minX);
    const maxX = Math.floor(aabb.maxX - 0.00001);
    const minY = Math.floor(aabb.minY);
    const maxY = Math.floor(aabb.maxY - 0.00001);
    const minZ = Math.floor(aabb.minZ);
    const maxZ = Math.floor(aabb.maxZ - 0.00001);

    for (let blockX = minX; blockX <= maxX; blockX += 1) {
      for (let blockY = minY; blockY <= maxY; blockY += 1) {
        for (let blockZ = minZ; blockZ <= maxZ; blockZ += 1) {
          if (!isCollidable(world.getBlock(blockX, blockY, blockZ))) {
            continue;
          }
          if (!this.intersectsBlock(blockX, blockY, blockZ)) {
            continue;
          }

          if (axis === "x") {
            if (delta > 0) {
              this.x = blockX - PLAYER_RADIUS - 0.0001;
            } else {
              this.x = blockX + 1 + PLAYER_RADIUS + 0.0001;
            }
            this.vx = 0;
          } else if (axis === "z") {
            if (delta > 0) {
              this.z = blockZ - PLAYER_RADIUS - 0.0001;
            } else {
              this.z = blockZ + 1 + PLAYER_RADIUS + 0.0001;
            }
            this.vz = 0;
          } else if (axis === "y") {
            if (delta > 0) {
              this.y = blockY - PLAYER_HEIGHT - 0.0001;
            } else {
              this.y = blockY + 1 + 0.0001;
              this.onGround = true;
            }
            this.vy = 0;
          }

          aabb = this.getAABB();
        }
      }
    }
  }

  update(dt, input, world, settingsState = DEFAULT_SETTINGS) {
    this.breakCooldown = Math.max(0, this.breakCooldown - dt);
    this.placeCooldown = Math.max(0, this.placeCooldown - dt);

    if (input.consumePress("r", "R")) {
      this.sprintToggled = !this.sprintToggled;
    }

    const startedInWater = this.inWater;
    const startedInLava = this.inLava;
    this.inWater = this.isInWater(world);
    this.inLava = this.isInLava(world);
    const startY = this.y;
    const wasOnGround = this.onGround;

    const forward = (input.isDown("w") || input.isDown("W") ? 1 : 0) - (input.isDown("s") || input.isDown("S") ? 1 : 0);
    // Strafe should match Minecraft: A = left, D = right.
    const strafe = (input.isDown("a") || input.isDown("A") ? 1 : 0) - (input.isDown("d") || input.isDown("D") ? 1 : 0);
    const sinYaw = Math.sin(this.yaw);
    const cosYaw = Math.cos(this.yaw);
    const forwardX = sinYaw;
    const forwardZ = cosYaw;
    const rightX = cosYaw;
    const rightZ = -sinYaw;

    let moveX = rightX * strafe + forwardX * forward;
    let moveZ = rightZ * strafe + forwardZ * forward;
    const length = Math.hypot(moveX, moveZ);
    if (length > 0) {
      moveX /= length;
      moveZ /= length;
    }
    const isCreative = settingsState?.gameMode === GAME_MODE.CREATIVE;
    this.isCrouching = !isCreative && !this.inWater && !this.inLava && input.isDown("Shift");
    if (this.isCrouching) {
      this.sprintToggled = false;
    }

    const wantsSprint = isCreative
      ? !this.isCrouching && length > 0 && this.sprintToggled
      : !this.inWater && !this.inLava && !this.isCrouching && this.hunger > 0 && length > 0 && forward > 0 && this.sprintToggled;
    this.isSprinting = wantsSprint;

    const speedEffect = this.getEffectLevel("speed");
    const jumpBoostLevel = this.getEffectLevel("jump_boost");
    const speedMultiplier = 1 + speedEffect * 0.18;
    const speed = (isCreative ? (wantsSprint ? 10.5 : 6.8) : this.inLava ? 1.7 : this.inWater ? 2.8 : this.isCrouching ? 1.75 : wantsSprint ? 6.9 : 4.6) * speedMultiplier;

    let targetVX = moveX * speed;
    let targetVZ = moveZ * speed;
    if (!isCreative && this.isCrouching && wasOnGround && length > 0) {
      const aheadX = this.x + targetVX * dt * 2.2;
      const aheadZ = this.z + targetVZ * dt * 2.2;
      if (!this.hasGroundSupport(world, aheadX, this.z)) {
        targetVX = 0;
      }
      if (!this.hasGroundSupport(world, this.x, aheadZ)) {
        targetVZ = 0;
      }
      if (!this.hasGroundSupport(world, aheadX, aheadZ)) {
        targetVX = 0;
        targetVZ = 0;
      }
    }
    const accel = isCreative ? 12.5 : this.inLava ? 5.2 : this.inWater ? 7.5 : this.onGround ? 16 : 5;
    const blend = clamp(accel * dt, 0, 1);

    this.vx = lerp(this.vx, targetVX, blend);
    this.vz = lerp(this.vz, targetVZ, blend);

    if (length === 0 && (this.onGround || isCreative)) {
      this.vx = lerp(this.vx, 0, clamp(12 * dt, 0, 1));
      this.vz = lerp(this.vz, 0, clamp(12 * dt, 0, 1));
    }

    if (isCreative) {
      const vertical = (input.isDown(" ") ? 1 : 0) - (input.isDown("Shift") ? 1 : 0);
      const targetVY = vertical * speed;
      this.vy = lerp(this.vy, targetVY, clamp(12 * dt, 0, 1));
      if (vertical === 0) {
        this.vy = lerp(this.vy, 0, clamp(12 * dt, 0, 1));
      }
      this.onGround = false;
      this.inWater = false;
      this.fallDistance = 0;
    } else if (this.inLava) {
      const wantUp = input.isDown(" ");

      if (wantUp) {
        this.vy = lerp(this.vy, 2.4, clamp(4.8 * dt, 0, 1));
      } else {
        this.vy = lerp(this.vy, -1.2, clamp(2.2 * dt, 0, 1));
      }

      const drag = Math.pow(0.91, dt * 60);
      this.vx *= drag;
      this.vz *= drag;
      this.vy *= Math.pow(0.95, dt * 60);
      this.vy = clamp(this.vy, -3.2, 3.4);
      this.onGround = false;
    } else if (this.inWater) {
      // Fluid movement: buoyancy + drag + swim controls.
      const wantUp = input.isDown(" ");

      // Swim controls: sink by default, only rise while holding jump.
      if (wantUp) {
        this.vy = lerp(this.vy, 4.8, clamp(7.8 * dt, 0, 1));
      } else {
        this.vy = lerp(this.vy, -2.3, clamp(2.6 * dt, 0, 1));
      }

      // Water drag (keep it swimmy, not honey).
      const drag = Math.pow(0.955, dt * 60);
      this.vx *= drag;
      this.vy *= Math.pow(0.975, dt * 60);
      this.vz *= drag;
      this.vy = clamp(this.vy, -5.5, 5.5);
      this.onGround = false;
    } else {
      if (this.onGround && input.consumePress(" ")) {
        this.vy = 8.5 + jumpBoostLevel * 1.15;
        this.onGround = false;
        if (this.stats) {
          this.stats.jumps = Math.max(0, (this.stats.jumps || 0) + 1);
        }
      }

      this.vy -= 24 * dt;
      this.vy = Math.max(this.vy, -32);
      this.onGround = false;
    }

    this.x += this.vx * dt;
    this.resolveAxisCollisions(world, "x", this.vx * dt);

    this.z += this.vz * dt;
    this.resolveAxisCollisions(world, "z", this.vz * dt);

    this.y += this.vy * dt;
    this.resolveAxisCollisions(world, "y", this.vy * dt);
    this.inWater = isCreative ? false : this.isInWater(world);
    this.inLava = isCreative ? false : this.isInLava(world);

    const fallStep = Math.max(0, startY - this.y);
    if (isCreative) {
      this.fallDistance = 0;
      this.pendingFallDamage = 0;
    } else if (this.inWater || this.inLava) {
      this.fallDistance = 0;
    } else if (this.onGround) {
      if (!startedInWater && !startedInLava && this.fallDistance > 3.25) {
        this.pendingFallDamage = Math.max(this.pendingFallDamage, Math.floor(this.fallDistance - 3));
      }
      this.fallDistance = 0;
    } else if (this.vy < 0 && fallStep > 0) {
      this.fallDistance += fallStep;
    } else if (this.vy > 0.2) {
      this.fallDistance = 0;
    }

    if (this.y < -20) {
      const spawn = world.findSpawn(Math.floor(this.x), Math.floor(this.z));
      this.setPosition(spawn.x, spawn.y, spawn.z);
      this.fallDistance = 0;
    }
  }

  ensureSafePosition(world) {
    // Only rescue the player if they're stuck inside blocks or below the world.
    // Do not snap to terrain height, otherwise digging holes won't work.
    if (this.y < 0.001) {
      this.y = 0.001;
      this.vy = 0;
    }

    if (!this.wouldCollide(world, this.x, this.y, this.z)) {
      return;
    }

    // Try to push upward out of collision.
    const startY = this.y;
    for (let i = 0; i < 60; i += 1) {
      this.y = startY + i * 0.1;
      if (!this.wouldCollide(world, this.x, this.y, this.z)) {
        this.vy = 0;
        return;
      }
    }
  }

  serialize() {
    return {
      x: this.x,
      y: this.y,
      z: this.z,
      yaw: this.yaw,
      pitch: this.pitch,
      selectedHotbarSlot: this.selectedHotbarSlot,
      inventoryTypes: Array.from(this.inventoryTypes),
      inventoryCounts: Array.from(this.inventoryCounts),
      inventoryDurability: Array.from(this.inventoryDurability),
      armorTypes: Array.from(this.armorTypes),
      armorCounts: Array.from(this.armorCounts),
      armorDurability: Array.from(this.armorDurability),
      hotbarTypes: Array.from(this.hotbarTypes),
      hotbarCounts: Array.from(this.hotbarCounts),
      sprintToggled: this.sprintToggled,
      health: this.health,
      hunger: this.hunger,
      xp: this.xp,
      xpLevel: this.xpLevel,
      spawnPoint: this.spawnPoint ? { ...this.spawnPoint } : null,
      stats: { ...this.stats },
      achievements: { ...this.achievements },
      effects: { ...this.effects },
      enchantments: {
        held: { ...this.enchantments.held },
        armor: { ...this.enchantments.armor }
      }
    };
  }

  restore(data) {
    if (!data || typeof data !== "object") {
      return false;
    }

    if ([data.x, data.y, data.z, data.yaw, data.pitch].every((value) => Number.isFinite(value))) {
      this.x = data.x;
      this.y = data.y;
      this.z = data.z;
      this.yaw = data.yaw;
      this.pitch = data.pitch;
      this.selectedHotbarSlot = clamp(Number(data.selectedHotbarSlot) || 0, 0, HOTBAR_SLOTS - 1);
      this.initializeInventory();
      const savedTypes = Array.isArray(data.inventoryTypes) ? data.inventoryTypes : data.hotbarTypes;
      const savedCounts = Array.isArray(data.inventoryCounts) ? data.inventoryCounts : data.hotbarCounts;
      if (Array.isArray(savedTypes) && Array.isArray(savedCounts)) {
        for (let i = 0; i < Math.min(INVENTORY_SLOTS, savedTypes.length, savedCounts.length); i += 1) {
          const t = Number(savedTypes[i]) || 0;
          const c = Number(savedCounts[i]) || 0;
          if (t > 0 && c > 0) {
            this.inventoryTypes[i] = t;
            this.inventoryCounts[i] = clamp(Math.floor(c), 0, getItemMaxStack(t));
            if (Array.isArray(data.inventoryDurability)) {
              this.inventoryDurability[i] = normalizeDurabilityValue(t, Number(data.inventoryDurability[i]) || 0);
            }
          }
        }
      }
      if (Array.isArray(data.armorTypes) && Array.isArray(data.armorCounts)) {
        for (let i = 0; i < Math.min(ARMOR_SLOTS, data.armorTypes.length, data.armorCounts.length); i += 1) {
          const t = Number(data.armorTypes[i]) || 0;
          const c = Number(data.armorCounts[i]) || 0;
          if (t > 0 && c > 0 && getItemArmorSlot(t) === ARMOR_SLOT_KEYS[i]) {
            this.armorTypes[i] = t;
            this.armorCounts[i] = 1;
            if (Array.isArray(data.armorDurability)) {
              this.armorDurability[i] = normalizeDurabilityValue(t, Number(data.armorDurability[i]) || 0);
            }
          }
        }
      }
      this.maxHealth = 20;
      this.health = clamp(Number(data.health) || 20, 0, this.maxHealth);
      this.maxHunger = 20;
      this.hunger = clamp(Number(data.hunger) || 20, 0, this.maxHunger);
      this.xp = clamp(Number(data.xp) || 0, 0, 1);
      this.xpLevel = Math.max(0, Math.floor(Number(data.xpLevel) || 0));
      this.sprintToggled = !!data.sprintToggled;
      this.isCrouching = false;
      this.isSprinting = false;
      this.spawnPoint = normalizeSpawnPoint(data.spawnPoint, null);
      this.stats = normalizePlayerStats(data.stats);
      this.achievements = normalizeAchievementState(data.achievements);
      this.effects = normalizePlayerEffects(data.effects);
      this.enchantments = normalizeEnchantmentState(data.enchantments);
      return true;
    }

    return false;
  }
}

function entityAABB(x, y, z, radius, height) {
  return {
    minX: x - radius,
    maxX: x + radius,
    minY: y,
    maxY: y + height,
    minZ: z - radius,
    maxZ: z + radius
  };
}

function entityIntersectsBlock(x, y, z, radius, height, blockX, blockY, blockZ) {
  const aabb = entityAABB(x, y, z, radius, height);
  return (
    aabb.maxX > blockX &&
    aabb.minX < blockX + 1 &&
    aabb.maxY > blockY &&
    aabb.minY < blockY + 1 &&
    aabb.maxZ > blockZ &&
    aabb.minZ < blockZ + 1
  );
}

function entityWouldCollide(world, x, y, z, radius, height) {
  const aabb = entityAABB(x, y, z, radius, height);
  const minX = Math.floor(aabb.minX);
  const maxX = Math.floor(aabb.maxX - 0.00001);
  const minY = Math.floor(aabb.minY);
  const maxY = Math.floor(aabb.maxY - 0.00001);
  const minZ = Math.floor(aabb.minZ);
  const maxZ = Math.floor(aabb.maxZ - 0.00001);

  for (let bx = minX; bx <= maxX; bx += 1) {
    for (let by = minY; by <= maxY; by += 1) {
      for (let bz = minZ; bz <= maxZ; bz += 1) {
        if (isCollidable(world.getBlock(bx, by, bz)) && entityIntersectsBlock(x, y, z, radius, height, bx, by, bz)) {
          return true;
        }
      }
    }
  }
  return false;
}

function findWalkableY(world, x, z, hintY = SEA_LEVEL + 4, clearance = 2) {
  const blockX = Math.floor(x);
  const blockZ = Math.floor(z);
  const startY = clamp(Math.floor(hintY) + 3, 1, WORLD_HEIGHT - 3);
  const endY = Math.max(1, startY - 14);

  const canStandAt = (groundY) => {
    if (!isCollidable(world.getBlock(blockX, groundY, blockZ))) return false;
    for (let i = 1; i <= clearance; i += 1) {
      if (isCollidable(world.getBlock(blockX, groundY + i, blockZ))) return false;
    }
    return true;
  };

  for (let y = startY; y >= endY; y -= 1) {
    if (canStandAt(y)) {
      return y + 1.001;
    }
  }

  for (let y = WORLD_HEIGHT - 3; y >= 1; y -= 1) {
    if (canStandAt(y)) {
      return y + 1.001;
    }
  }
  return null;
}

function findLoadedWalkableY(world, x, z, hintY = SEA_LEVEL + 4, clearance = 2) {
  const blockX = Math.floor(x);
  const blockZ = Math.floor(z);
  const chunkX = Math.floor(blockX / CHUNK_SIZE);
  const chunkZ = Math.floor(blockZ / CHUNK_SIZE);
  if (!world.peekChunk(chunkX, chunkZ)) {
    return null;
  }

  const startY = clamp(Math.floor(hintY) + 3, 1, WORLD_HEIGHT - 3);
  const endY = Math.max(1, startY - 18);

  const canStandAt = (groundY) => {
    const ground = world.peekBlock(blockX, groundY, blockZ);
    if (!isCollidable(ground) || BLOCK_INFO[ground]?.transparent || isFluidBlock(ground)) {
      return false;
    }
    for (let i = 1; i <= clearance; i += 1) {
      const block = world.peekBlock(blockX, groundY + i, blockZ);
      if (block !== BLOCK.AIR && (isCollidable(block) || isFluidBlock(block))) {
        return false;
      }
    }
    return true;
  };

  for (let y = startY; y >= endY; y -= 1) {
    if (canStandAt(y)) {
      return y + 1.001;
    }
  }

  return null;
}

function rayIntersectAABB(origin, direction, maxDistance, aabb) {
  let tMin = 0;
  let tMax = maxDistance;
  const axes = [
    ["x", "minX", "maxX"],
    ["y", "minY", "maxY"],
    ["z", "minZ", "maxZ"]
  ];

  for (const [axis, minKey, maxKey] of axes) {
    const d = direction[axis];
    const o = origin[axis];
    const min = aabb[minKey];
    const max = aabb[maxKey];
    if (Math.abs(d) < 1e-6) {
      if (o < min || o > max) {
        return null;
      }
      continue;
    }
    const inv = 1 / d;
    let t0 = (min - o) * inv;
    let t1 = (max - o) * inv;
    if (t0 > t1) {
      const swap = t0;
      t0 = t1;
      t1 = swap;
    }
    tMin = Math.max(tMin, t0);
    tMax = Math.min(tMax, t1);
    if (tMax < tMin) {
      return null;
    }
  }

  return tMin >= 0 && tMin <= maxDistance ? tMin : null;
}

function getVillagePathKey(x, z) {
  return `${x},${z}`;
}

function findVillagePath(world, startX, startZ, goalX, goalZ, hintY = SEA_LEVEL + 4, maxRadius = 18) {
  const startCell = { x: Math.floor(startX), z: Math.floor(startZ) };
  const goalCell = { x: Math.floor(goalX), z: Math.floor(goalZ) };
  const startKey = getVillagePathKey(startCell.x, startCell.z);
  const goalKey = getVillagePathKey(goalCell.x, goalCell.z);
  if (startKey === goalKey) {
    const y = findLoadedWalkableY(world, startCell.x + 0.5, startCell.z + 0.5, hintY, 2)
      || findWalkableY(world, startCell.x + 0.5, startCell.z + 0.5, hintY, 2)
      || hintY;
    return [{ x: goalCell.x + 0.5, y, z: goalCell.z + 0.5 }];
  }

  const minX = Math.min(startCell.x, goalCell.x) - maxRadius;
  const maxX = Math.max(startCell.x, goalCell.x) + maxRadius;
  const minZ = Math.min(startCell.z, goalCell.z) - maxRadius;
  const maxZ = Math.max(startCell.z, goalCell.z) + maxRadius;
  const open = [startKey];
  const openSet = new Set([startKey]);
  const cameFrom = new Map();
  const gScore = new Map([[startKey, 0]]);
  const fScore = new Map([[startKey, Math.abs(goalCell.x - startCell.x) + Math.abs(goalCell.z - startCell.z)]]);
  const yCache = new Map();
  const parsedCache = new Map([[startKey, startCell], [goalKey, goalCell]]);

  const getCell = (key) => {
    if (parsedCache.has(key)) {
      return parsedCache.get(key);
    }
    const [x, z] = key.split(",").map(Number);
    const cell = { x, z };
    parsedCache.set(key, cell);
    return cell;
  };

  const getWalkY = (x, z, baseY) => {
    const key = getVillagePathKey(x, z);
    if (yCache.has(key)) {
      return yCache.get(key);
    }
    const walkY = findLoadedWalkableY(world, x + 0.5, z + 0.5, baseY, 2)
      || findWalkableY(world, x + 0.5, z + 0.5, baseY, 2);
    yCache.set(key, walkY ?? NaN);
    return walkY ?? NaN;
  };

  let iterations = 0;
  while (open.length > 0 && iterations < 420) {
    iterations += 1;
    open.sort((a, b) => (fScore.get(a) || Infinity) - (fScore.get(b) || Infinity));
    const currentKey = open.shift();
    openSet.delete(currentKey);
    if (currentKey === goalKey) {
      const path = [];
      let cursor = currentKey;
      while (cursor) {
        const cell = getCell(cursor);
        const y = getWalkY(cell.x, cell.z, hintY);
        if (Number.isFinite(y)) {
          path.push({ x: cell.x + 0.5, y, z: cell.z + 0.5 });
        }
        cursor = cameFrom.get(cursor) || "";
      }
      path.reverse();
      if (path.length <= 2) {
        return path;
      }
      const reduced = [path[0]];
      for (let i = 1; i < path.length - 1; i += 1) {
        const prev = path[i - 1];
        const curr = path[i];
        const next = path[i + 1];
        const dirA = `${Math.sign(curr.x - prev.x)},${Math.sign(curr.z - prev.z)}`;
        const dirB = `${Math.sign(next.x - curr.x)},${Math.sign(next.z - curr.z)}`;
        if (dirA !== dirB) {
          reduced.push(curr);
        }
      }
      reduced.push(path[path.length - 1]);
      return reduced;
    }

    const current = getCell(currentKey);
    const currentY = getWalkY(current.x, current.z, hintY);
    if (!Number.isFinite(currentY)) {
      continue;
    }

    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = current.x + dx;
      const nz = current.z + dz;
      if (nx < minX || nx > maxX || nz < minZ || nz > maxZ) continue;
      const nextY = getWalkY(nx, nz, currentY);
      if (!Number.isFinite(nextY) || Math.abs(nextY - currentY) > 1.35) continue;
      const nextKey = getVillagePathKey(nx, nz);
      const tentative = (gScore.get(currentKey) || 0) + 1 + Math.abs(nextY - currentY) * 0.35;
      if (tentative >= (gScore.get(nextKey) || Infinity)) continue;
      cameFrom.set(nextKey, currentKey);
      gScore.set(nextKey, tentative);
      fScore.set(nextKey, tentative + Math.abs(goalCell.x - nx) + Math.abs(goalCell.z - nz));
      if (!openSet.has(nextKey)) {
        open.push(nextKey);
        openSet.add(nextKey);
      }
    }
  }

  const fallbackY = findLoadedWalkableY(world, goalCell.x + 0.5, goalCell.z + 0.5, hintY, 2)
    || findWalkableY(world, goalCell.x + 0.5, goalCell.z + 0.5, hintY, 2)
    || hintY;
  return [{ x: goalCell.x + 0.5, y: fallbackY, z: goalCell.z + 0.5 }];
}

function restockVillagerOffers(mob) {
  if (!Array.isArray(mob?.offers)) return;
  for (const offer of mob.offers) {
    offer.uses = 0;
  }
}

function ensureVillageMobData(mob, world) {
  if (!mob || !world || (mob.type !== "villager" && mob.type !== "iron_golem")) {
    return null;
  }
  const center = Number.isFinite(mob.homeX) && Number.isFinite(mob.homeZ)
    ? { x: mob.homeX, z: mob.homeZ, seed: mob.villageSeed || world.seed }
    : getNearestVillageCenter(mob.x, mob.z, world.seed, 48);
  if (!center) {
    return null;
  }
  mob.homeX = center.x;
  mob.homeZ = center.z;
  mob.villageSeed = center.seed || world.seed;
  const plan = getVillageStructurePlan(Math.floor(center.x), Math.floor(center.z), mob.villageSeed);
  mob.gatherPoint = { x: plan.gatherPoint.x + 0.5, z: plan.gatherPoint.z + 0.5 };
  if (mob.type === "villager") {
    if (!mob.profession) {
      const professionIndex = Math.abs(Math.floor((mob.variantSeed || 0) * 1000 + center.seed)) % plan.houses.length;
      const house = plan.houses[professionIndex] || plan.houses[0];
      mob.profession = house.profession;
      mob.bedTarget = { x: house.bed.x + 0.5, z: house.bed.z + 0.5 };
      mob.jobTarget = { x: house.jobSite.x + 0.5, z: house.jobSite.z + 0.5, type: house.jobSite.type };
      mob.offers = getVillagerTradeTable(mob.profession, center.seed + professionIndex * 17);
      mob.willingness = 0.25;
    }
  } else {
    mob.patrolPoints = plan.pathNodes.map((node) => ({ x: node.x + 0.5, z: node.z + 0.5 }));
  }
  return plan;
}

function updateVillageMobPath(mob, world, targetX, targetZ, dt) {
  mob.pathRecalcTimer = Math.max(0, (mob.pathRecalcTimer || 0) - dt);
  const targetKey = `${Math.floor(targetX)}|${Math.floor(targetZ)}`;
  if (mob.pathTargetKey !== targetKey || mob.pathRecalcTimer <= 0 || !Array.isArray(mob.path) || mob.path.length === 0) {
    mob.path = findVillagePath(world, mob.x, mob.z, targetX, targetZ, mob.y + 1, mob.type === "iron_golem" ? 24 : 18);
    mob.pathIndex = 0;
    mob.pathRecalcTimer = 2.4;
    mob.pathTargetKey = targetKey;
  }
  while ((mob.pathIndex || 0) < Math.max(0, mob.path.length - 1)) {
    const waypoint = mob.path[mob.pathIndex];
    const dx = waypoint.x - mob.x;
    const dz = waypoint.z - mob.z;
    if (dx * dx + dz * dz > 0.7 * 0.7) {
      break;
    }
    mob.pathIndex += 1;
  }
  return mob.path?.[mob.pathIndex || 0] || { x: targetX, z: targetZ };
}

function findNearestVillageThreat(mob, allMobs, radius = 10) {
  if (!Array.isArray(allMobs)) return null;
  const radius2 = radius * radius;
  let best = null;
  let bestDist2 = radius2;
  for (const candidate of allMobs) {
    if (!candidate || candidate === mob || candidate.health <= 0 || !getMobDef(candidate.type).hostile) continue;
    const dx = candidate.x - mob.x;
    const dz = candidate.z - mob.z;
    const dist2 = dx * dx + dz * dz;
    if (dist2 < bestDist2) {
      bestDist2 = dist2;
      best = candidate;
    }
  }
  return best;
}

function getVillageMobSteering(mob, world, player, cycle, allMobs, dt, weatherState = null) {
  const plan = ensureVillageMobData(mob, world);
  if (!plan) {
    return null;
  }

  if (mob.type === "villager") {
    const threat = findNearestVillageThreat(mob, allMobs, 10);
    let targetX = mob.gatherPoint?.x || mob.homeX;
    let targetZ = mob.gatherPoint?.z || mob.homeZ;
    let desiredSpeed = getMobDef(mob.type).speed * 0.82;
    let state = "mingle";
    const precipitationType = normalizeWeatherType(weatherState?.type) === WEATHER_TYPES.CLEAR
      ? "none"
      : getColumnPrecipitationType(world.terrain.describeColumn(Math.floor(mob.x), Math.floor(mob.z)));

    if (threat) {
      const awayX = mob.x - (threat.x - mob.x);
      const awayZ = mob.z - (threat.z - mob.z);
      targetX = mob.homeX + clamp(awayX - mob.homeX, -8, 8);
      targetZ = mob.homeZ + clamp(awayZ - mob.homeZ, -8, 8);
      desiredSpeed = getMobDef(mob.type).speed * 1.25;
      state = "panic";
    } else if (precipitationType !== "none" && !(cycle?.isNight || cycle?.phase === "Sunset")) {
      targetX = mob.bedTarget?.x || mob.homeX;
      targetZ = mob.bedTarget?.z || mob.homeZ;
      desiredSpeed = getMobDef(mob.type).speed * 0.86;
      state = "shelter";
    } else if (cycle?.isNight || cycle?.phase === "Sunset") {
      targetX = mob.bedTarget?.x || mob.homeX;
      targetZ = mob.bedTarget?.z || mob.homeZ;
      desiredSpeed = getMobDef(mob.type).speed * 0.96;
      state = "sleep";
    } else if (cycle?.phase === "Day" && cycle?.t < 0.46 && mob.jobTarget) {
      targetX = mob.jobTarget.x;
      targetZ = mob.jobTarget.z;
      desiredSpeed = getMobDef(mob.type).speed * 0.92;
      state = "work";
    } else {
      const wanderPoint = plan.pathNodes[Math.abs(Math.floor((mob.variantSeed || 0) * 100 + (mob.age || 0))) % plan.pathNodes.length] || plan.pathNodes[0];
      targetX = (wanderPoint?.x || mob.homeX) + 0.5;
      targetZ = (wanderPoint?.z || mob.homeZ) + 0.5;
      desiredSpeed = getMobDef(mob.type).speed * 0.74;
    }

    const waypoint = updateVillageMobPath(mob, world, targetX, targetZ, dt);
    if (state === "work" && mob.jobTarget) {
      const dxJob = mob.x - mob.jobTarget.x;
      const dzJob = mob.z - mob.jobTarget.z;
      if (dxJob * dxJob + dzJob * dzJob <= 1.8 * 1.8) {
        mob.workTimer = (mob.workTimer || 0) + dt;
        if (mob.workTimer >= 4) {
          restockVillagerOffers(mob);
          mob.workedToday = true;
          mob.workTimer = 0;
        }
      } else {
        mob.workTimer = 0;
      }
    }

    mob.villagerState = state;
    return {
      targetX: waypoint.x,
      targetZ: waypoint.z,
      desiredSpeed,
      preferredYaw: Math.atan2(waypoint.x - mob.x, waypoint.z - mob.z)
    };
  }

  const hostile = findNearestVillageThreat(mob, allMobs, 14);
  let targetX = mob.homeX;
  let targetZ = mob.homeZ;
  let desiredSpeed = getMobDef(mob.type).speed * 0.78;
  if (hostile) {
    mob.guardTargetId = hostile.variantSeed || hostile.x;
    targetX = hostile.x;
    targetZ = hostile.z;
    desiredSpeed = getMobDef(mob.type).speed * 1.18;
  } else {
    const patrolPoints = mob.patrolPoints?.length ? mob.patrolPoints : [{ x: mob.homeX, z: mob.homeZ }];
    mob.patrolIndex = Math.max(0, Math.floor(mob.patrolIndex || 0)) % patrolPoints.length;
    const patrolTarget = patrolPoints[mob.patrolIndex] || patrolPoints[0];
    const dx = patrolTarget.x - mob.x;
    const dz = patrolTarget.z - mob.z;
    if (dx * dx + dz * dz < 1.2 * 1.2) {
      mob.patrolIndex = (mob.patrolIndex + 1) % patrolPoints.length;
    }
    targetX = patrolTarget.x;
    targetZ = patrolTarget.z;
  }
  const waypoint = updateVillageMobPath(mob, world, targetX, targetZ, dt);
  return {
    targetX: waypoint.x,
    targetZ: waypoint.z,
    desiredSpeed,
    preferredYaw: Math.atan2(waypoint.x - mob.x, waypoint.z - mob.z)
  };
}

class Mob {
  constructor(type = "zombie") {
    this.type = type;
    this.x = 0;
    this.y = SEA_LEVEL + 3;
    this.z = 0;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.yaw = 0;
    this.onGround = false;
    this.goalX = null;
    this.goalZ = null;
    this.goalTimer = 0;
    this.grazeTimer = 0;
    this.fleeTimer = 0;
    this.jumpCooldown = 0;
    this.attackCooldown = 0;
    this.hurtTimer = 0;
    this.stuckTimer = 0;
    this.lastX = 0;
    this.lastZ = 0;
    this.maxHealth = getMobDef(type).maxHealth;
    this.health = this.maxHealth;
    this.age = 0;
    this.homeX = null;
    this.homeZ = null;
    this.turnBias = Math.random() < 0.5 ? -1 : 1;
    this.turnCooldown = 0;
    this.sunBurnTimer = 0;
    this.fuseTimer = 0;
    this.spiderLeapCooldown = 0;
    this.provokedTimer = 0;
    this.variantSeed = Math.random();
    this.profession = "";
    this.offers = [];
    this.willingness = 0;
    this.workTimer = 0;
    this.workedToday = false;
    this.path = [];
    this.pathIndex = 0;
    this.pathRecalcTimer = 0;
    this.pathTargetKey = "";
    this.patrolIndex = 0;
  }

  get radius() {
    return getMobDef(this.type).radius;
  }

  get height() {
    return getMobDef(this.type).height;
  }

  setPosition(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.lastX = x;
    this.lastZ = z;
  }

  chooseGoal(world, minDistance = 2.5, maxDistance = 8, preferredYaw = Math.random() * Math.PI * 2) {
    for (let tries = 0; tries < 14; tries += 1) {
      const angle = preferredYaw + (Math.random() - 0.5) * Math.PI * 1.2;
      const dist = minDistance + Math.random() * (maxDistance - minDistance);
      const targetX = this.x + Math.sin(angle) * dist;
      const targetZ = this.z + Math.cos(angle) * dist;
      const targetY = findWalkableY(world, targetX, targetZ, this.y + 1, this.height > 1.2 ? 2 : 1);
      if (!Number.isFinite(targetY)) continue;
      if (Math.abs(targetY - this.y) > 2.4) continue;
      if (entityWouldCollide(world, targetX, targetY, targetZ, this.radius, this.height)) continue;
      this.goalX = targetX;
      this.goalZ = targetZ;
      this.goalTimer = 1.6 + Math.random() * 3.4;
      return true;
    }
    this.goalX = this.x;
    this.goalZ = this.z;
    this.goalTimer = 1;
    return false;
  }

  takeDamage(amount, sourceX = this.x, sourceZ = this.z) {
    const dmg = Math.max(0, Number(amount) || 0);
    if (dmg <= 0 || this.hurtTimer > 0.08) {
      return false;
    }
    this.health = Math.max(0, this.health - dmg);
    this.hurtTimer = 0.3;
    this.provokedTimer = Math.max(this.provokedTimer, 8);
    this.fleeTimer = getMobDef(this.type).hostile ? 0 : 2.8;
    const dx = this.x - sourceX;
    const dz = this.z - sourceZ;
    const len = Math.hypot(dx, dz) || 1;
    this.vx += (dx / len) * 3.2;
    this.vz += (dz / len) * 3.2;
    this.vy = Math.max(this.vy, 4.8);
    this.goalX = null;
    this.goalZ = null;
    if (this.type === "creeper") {
      this.fuseTimer = 0;
    }
    return this.health <= 0;
  }

  _forwardBlocked(world, moveX, moveZ) {
    const len = Math.hypot(moveX, moveZ);
    if (len < 0.001) return "";
    const dirX = moveX / len;
    const dirZ = moveZ / len;
    const probeX = this.x + dirX * (this.radius + 0.22);
    const probeZ = this.z + dirZ * (this.radius + 0.22);
    const footY = Math.floor(this.y + 0.05);
    const headY = Math.floor(this.y + Math.min(this.height - 0.2, 1.1));
    const frontFeet = world.getBlock(Math.floor(probeX), footY, Math.floor(probeZ));
    const frontHead = world.getBlock(Math.floor(probeX), headY, Math.floor(probeZ));
    const standY = findWalkableY(world, probeX, probeZ, this.y + 0.8, this.height > 1.2 ? 2 : 1);
    const dropTooFar = standY !== null && standY < this.y - 1.15;
    if (isCollidable(frontFeet) || isCollidable(frontHead)) {
      return "obstacle";
    }
    if (dropTooFar || standY === null) {
      return "ledge";
    }
    return "";
  }

  resolveAxis(world, axis, delta) {
    const r = this.radius;
    const h = this.height;
    let aabb = entityAABB(this.x, this.y, this.z, r, h);
    const minX = Math.floor(aabb.minX);
    const maxX = Math.floor(aabb.maxX - 0.00001);
    const minY = Math.floor(aabb.minY);
    const maxY = Math.floor(aabb.maxY - 0.00001);
    const minZ = Math.floor(aabb.minZ);
    const maxZ = Math.floor(aabb.maxZ - 0.00001);

    for (let bx = minX; bx <= maxX; bx += 1) {
      for (let by = minY; by <= maxY; by += 1) {
        for (let bz = minZ; bz <= maxZ; bz += 1) {
          if (!isCollidable(world.getBlock(bx, by, bz))) continue;
          if (!entityIntersectsBlock(this.x, this.y, this.z, r, h, bx, by, bz)) continue;

          if (axis === "x") {
            if (delta > 0) this.x = bx - r - 0.0001;
            else this.x = bx + 1 + r + 0.0001;
            this.vx = 0;
          } else if (axis === "z") {
            if (delta > 0) this.z = bz - r - 0.0001;
            else this.z = bz + 1 + r + 0.0001;
            this.vz = 0;
          } else if (axis === "y") {
            if (delta > 0) this.y = by - h - 0.0001;
            else {
              this.y = by + 1 + 0.0001;
              this.onGround = true;
            }
            this.vy = 0;
          }

          aabb = entityAABB(this.x, this.y, this.z, r, h);
        }
      }
    }
  }

  update(dt, world, player, cycle = null, allMobs = null, weatherState = null) {
    const def = getMobDef(this.type);
    this.age += dt;
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.goalTimer -= dt;
    this.grazeTimer = Math.max(0, this.grazeTimer - dt);
    this.fleeTimer = Math.max(0, this.fleeTimer - dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.jumpCooldown = Math.max(0, this.jumpCooldown - dt);
    this.turnCooldown = Math.max(0, this.turnCooldown - dt);
    this.spiderLeapCooldown = Math.max(0, this.spiderLeapCooldown - dt);
    this.provokedTimer = Math.max(0, this.provokedTimer - dt);

    const dxp = player.x - this.x;
    const dzp = player.z - this.z;
    const dist = Math.hypot(dxp, dzp);
    const distHome = Number.isFinite(this.homeX) && Number.isFinite(this.homeZ)
      ? Math.hypot((this.homeX || 0) - this.x, (this.homeZ || 0) - this.z)
      : Infinity;
    const isHostile = !!def.hostile;
    const isSpider = this.type === "spider";
    const isCreeper = this.type === "creeper";
    const activeHostile = isHostile && !(isSpider && cycle && !cycle.isNight && this.provokedTimer <= 0);
    const shouldFlee = !activeHostile && (this.fleeTimer > 0 || dist < (def.scareRange || 0));
    let targetX = this.goalX;
    let targetZ = this.goalZ;
    let desiredSpeed = 0;
    let preferredYaw = this.yaw;
    let keepFuseLit = false;
    const villageSteering = getVillageMobSteering(this, world, player, cycle, allMobs, dt, weatherState);

    if (villageSteering) {
      targetX = villageSteering.targetX;
      targetZ = villageSteering.targetZ;
      desiredSpeed = villageSteering.desiredSpeed;
      preferredYaw = villageSteering.preferredYaw;
      this.goalTimer = Math.max(this.goalTimer, 0.3);
    } else if (isCreeper && activeHostile && dist < def.aggroRange) {
      targetX = player.x;
      targetZ = player.z;
      preferredYaw = Math.atan2(dxp, dzp);
      desiredSpeed = dist > 2.35 ? def.speed * 0.94 : 0;
      this.goalTimer = Math.max(this.goalTimer, 0.25);
      if (dist < (def.explosionRadius || 3.6) - 0.15) {
        this.fuseTimer = Math.min(def.fuseTime || 1.2, this.fuseTimer + dt);
        keepFuseLit = true;
      }
    } else if (activeHostile && dist < def.aggroRange) {
      targetX = player.x;
      targetZ = player.z;
      desiredSpeed = def.speed;
      preferredYaw = Math.atan2(dxp, dzp);
      this.goalTimer = Math.max(this.goalTimer, 0.2);
    } else if (!activeHostile && Number.isFinite(this.homeX) && Number.isFinite(this.homeZ) && distHome > 10) {
      targetX = this.homeX;
      targetZ = this.homeZ;
      desiredSpeed = def.speed * 0.96;
      preferredYaw = Math.atan2(targetX - this.x, targetZ - this.z);
      this.goalTimer = Math.max(this.goalTimer, 0.8);
    } else if (shouldFlee) {
      const awayX = this.x - dxp;
      const awayZ = this.z - dzp;
      preferredYaw = Math.atan2(awayX, awayZ);
      if (!Number.isFinite(targetX) || !Number.isFinite(targetZ) || this.goalTimer <= 0) {
        this.chooseGoal(world, 5, 10, preferredYaw);
        targetX = this.goalX;
        targetZ = this.goalZ;
      }
      desiredSpeed = def.speed * 1.15;
    } else {
      const reached = Number.isFinite(targetX) && Number.isFinite(targetZ) && Math.hypot(targetX - this.x, targetZ - this.z) < 0.9;
      if (!Number.isFinite(targetX) || !Number.isFinite(targetZ) || this.goalTimer <= 0 || reached) {
        const baseYaw = Number.isFinite(this.homeX) && Number.isFinite(this.homeZ)
          ? Math.atan2(this.homeX - this.x, this.homeZ - this.z)
          : this.yaw;
        this.chooseGoal(world, 1.8, Number.isFinite(this.homeX) ? 5.5 : 7.5, baseYaw + this.turnBias * 0.45);
        targetX = this.goalX;
        targetZ = this.goalZ;
        this.grazeTimer = Math.random() < 0.28 ? 0.6 + Math.random() * 1.6 : 0;
      }
      desiredSpeed = this.grazeTimer > 0 ? 0 : def.speed * 0.9;
    }

    if (!keepFuseLit) {
      this.fuseTimer = Math.max(0, this.fuseTimer - dt * 1.85);
    }

    const targetYaw = Number.isFinite(targetX) && Number.isFinite(targetZ)
      ? Math.atan2(targetX - this.x, targetZ - this.z)
      : preferredYaw;
    const yawError = Math.abs(shortestAngleDelta(this.yaw, targetYaw));
    const turnSpeed = activeHostile ? 6.1 : this.type === "villager" ? 4.6 : 4.2;
    this.yaw = lerpAngle(this.yaw, targetYaw, clamp(dt * turnSpeed, 0, 1));

    const facingFactor = yawError > 1.72
      ? 0
      : clamp(1 - yawError / (activeHostile ? 2.15 : 2.75), activeHostile ? 0.2 : 0.1, 1);
    const moveSpeed = desiredSpeed * facingFactor;
    let moveX = Math.sin(this.yaw) * moveSpeed;
    let moveZ = Math.cos(this.yaw) * moveSpeed;
    const blockState = this._forwardBlocked(world, moveX, moveZ);
    if (blockState) {
      if (blockState === "obstacle" && this.onGround && this.jumpCooldown <= 0) {
        this.vy = Math.max(this.vy, 6.1);
        this.jumpCooldown = 0.6;
      } else if (!activeHostile || blockState === "ledge") {
        if (this.turnCooldown <= 0) {
          this.turnBias *= -1;
          this.turnCooldown = 0.85;
        }
        this.chooseGoal(world, 2.2, 6.5, this.yaw + this.turnBias * (blockState === "ledge" ? 1.15 : 0.9));
      } else {
        if (this.turnCooldown <= 0) {
          this.turnBias *= -1;
          this.turnCooldown = 0.55;
        }
        this.goalX = this.x + Math.sin(this.yaw + this.turnBias * 0.92) * 3.2;
        this.goalZ = this.z + Math.cos(this.yaw + this.turnBias * 0.92) * 3.2;
        this.goalTimer = 0.9;
      }
      moveX *= 0.2;
      moveZ *= 0.2;
    }

    const accel = this.onGround ? 15 : 5.5;
    this.vx = lerp(this.vx, moveX, clamp(accel * dt, 0, 1));
    this.vz = lerp(this.vz, moveZ, clamp(accel * dt, 0, 1));
    if (moveSpeed <= 0.001 && this.onGround) {
      this.vx = lerp(this.vx, 0, clamp(dt * 10, 0, 1));
      this.vz = lerp(this.vz, 0, clamp(dt * 10, 0, 1));
    }

    if (isSpider && activeHostile && this.onGround && this.spiderLeapCooldown <= 0 && !blockState && dist > 1.7 && dist < 4.9 && this.attackCooldown <= 0) {
      const leapNorm = dist || 1;
      this.vx = (dxp / leapNorm) * (def.leapSpeed || 5.25);
      this.vz = (dzp / leapNorm) * (def.leapSpeed || 5.25);
      this.vy = Math.max(this.vy, def.leapVertical || 6.35);
      this.spiderLeapCooldown = def.leapCooldown || 2.15;
    }

    this.vy -= 22 * dt;
    this.vy = Math.max(this.vy, -28);
    this.onGround = false;

    this.x += this.vx * dt;
    this.resolveAxis(world, "x", this.vx * dt);

    this.z += this.vz * dt;
    this.resolveAxis(world, "z", this.vz * dt);

    this.y += this.vy * dt;
    this.resolveAxis(world, "y", this.vy * dt);

    const moved = Math.hypot(this.x - this.lastX, this.z - this.lastZ);
    if (moveSpeed > 0.2 && moved < 0.02) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 0.75) {
        this.turnBias *= -1;
        this.chooseGoal(world, 2.2, 6.8, this.yaw + this.turnBias * 1.15);
        this.stuckTimer = 0;
      }
    } else {
      this.stuckTimer = 0;
    }
    this.lastX = this.x;
    this.lastZ = this.z;

    if (this.y < -40) {
      const spawn = world.findSpawn(Math.floor(player.x), Math.floor(player.z));
      const jitter = (random2(Math.floor(this.x), Math.floor(this.z), world.seed + 777) - 0.5) * 6;
      this.setPosition(spawn.x + jitter, spawn.y, spawn.z);
    }
  }
}

function lerpAngle(a, b, t) {
  return a + shortestAngleDelta(a, b) * t;
}

function shortestAngleDelta(a, b) {
  let delta = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

  return {
    Player,
    Mob,
    entityAABB,
    entityIntersectsBlock,
    entityWouldCollide,
    findWalkableY,
    findLoadedWalkableY,
    rayIntersectAABB,
    restockVillagerOffers,
    ensureVillageMobData,
    updateVillageMobPath,
    findNearestVillageThreat,
    getVillageMobSteering,
    lerpAngle,
    shortestAngleDelta
  };
}
