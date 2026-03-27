export function createRedstoneRuntime({
  block,
  clamp,
  redstoneMaxSignal,
  redstoneRepeaterMinDelay,
  redstoneRepeaterMaxDelay
} = {}) {
  const REDSTONE_DIRECTIONS = Object.freeze({
    north: Object.freeze({ x: 0, y: 0, z: -1 }),
    south: Object.freeze({ x: 0, y: 0, z: 1 }),
    west: Object.freeze({ x: -1, y: 0, z: 0 }),
    east: Object.freeze({ x: 1, y: 0, z: 0 }),
    up: Object.freeze({ x: 0, y: 1, z: 0 }),
    down: Object.freeze({ x: 0, y: -1, z: 0 })
  });

  const REDSTONE_HORIZONTAL_FACINGS = ["north", "east", "south", "west"];
  const REDSTONE_NEIGHBOR_OFFSETS = [
    REDSTONE_DIRECTIONS.east,
    REDSTONE_DIRECTIONS.west,
    REDSTONE_DIRECTIONS.up,
    REDSTONE_DIRECTIONS.down,
    REDSTONE_DIRECTIONS.south,
    REDSTONE_DIRECTIONS.north
  ];

  function cloneRedstoneState(state) {
    return state && typeof state === "object" ? { ...state } : null;
  }

  function isRedstoneWireBlock(blockType) {
    return blockType === block.REDSTONE_WIRE;
  }

  function isLeverBlock(blockType) {
    return blockType === block.LEVER;
  }

  function isRedstoneTorchBlock(blockType) {
    return blockType === block.REDSTONE_TORCH;
  }

  function isRepeaterBlock(blockType) {
    return blockType === block.REPEATER;
  }

  function isPistonBaseBlock(blockType) {
    return blockType === block.PISTON || blockType === block.STICKY_PISTON;
  }

  function isPistonHeadBlock(blockType) {
    return blockType === block.PISTON_HEAD;
  }

  function usesRedstoneState(blockType) {
    return (
      isRedstoneWireBlock(blockType)
      || isLeverBlock(blockType)
      || isRedstoneTorchBlock(blockType)
      || isRepeaterBlock(blockType)
      || isPistonBaseBlock(blockType)
      || isPistonHeadBlock(blockType)
    );
  }

  function isRedstoneRelevantBlock(blockType) {
    return usesRedstoneState(blockType);
  }

  function getOppositeFacing(facing = "north") {
    switch (facing) {
      case "north": return "south";
      case "south": return "north";
      case "east": return "west";
      case "west": return "east";
      case "up": return "down";
      case "down": return "up";
      default: return "north";
    }
  }

  function getFacingVector(facing = "north") {
    return REDSTONE_DIRECTIONS[facing] || REDSTONE_DIRECTIONS.north;
  }

  function normalizeHorizontalFacing(value, fallback = "north") {
    const facing = String(value || "").toLowerCase();
    return REDSTONE_HORIZONTAL_FACINGS.includes(facing) ? facing : fallback;
  }

  function getFacingFromYaw(yaw = 0) {
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    if (Math.abs(sin) > Math.abs(cos)) {
      return sin >= 0 ? "east" : "west";
    }
    return cos >= 0 ? "south" : "north";
  }

  function buildDefaultRedstoneState(blockType, overrides = {}) {
    const facing = normalizeHorizontalFacing(overrides.facing, "north");
    switch (blockType) {
      case block.REDSTONE_WIRE:
        return { power: clamp(Math.floor(Number(overrides.power) || 0), 0, redstoneMaxSignal) };
      case block.LEVER:
        return { powered: !!overrides.powered };
      case block.REDSTONE_TORCH:
        return { lit: overrides.lit !== false };
      case block.REPEATER:
        return {
          facing,
          delay: clamp(Math.floor(Number(overrides.delay) || 1), redstoneRepeaterMinDelay, redstoneRepeaterMaxDelay),
          powered: !!overrides.powered,
          pendingPowered: typeof overrides.pendingPowered === "boolean" ? overrides.pendingPowered : null
        };
      case block.PISTON:
      case block.STICKY_PISTON:
        return {
          facing,
          extended: !!overrides.extended
        };
      case block.PISTON_HEAD:
        return {
          facing,
          sticky: !!overrides.sticky,
          baseKey: typeof overrides.baseKey === "string" ? overrides.baseKey : ""
        };
      default:
        return null;
    }
  }

  function normalizeSerializedRedstoneState(blockType, state = {}) {
    return buildDefaultRedstoneState(blockType, state);
  }

  return {
    REDSTONE_DIRECTIONS,
    REDSTONE_HORIZONTAL_FACINGS,
    REDSTONE_NEIGHBOR_OFFSETS,
    cloneRedstoneState,
    isRedstoneWireBlock,
    isLeverBlock,
    isRedstoneTorchBlock,
    isRepeaterBlock,
    isPistonBaseBlock,
    isPistonHeadBlock,
    usesRedstoneState,
    isRedstoneRelevantBlock,
    getOppositeFacing,
    getFacingVector,
    normalizeHorizontalFacing,
    getFacingFromYaw,
    buildDefaultRedstoneState,
    normalizeSerializedRedstoneState
  };
}
