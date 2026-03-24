const { WebSocketServer } = require("ws");

const PORT = Number(process.env.PORT || 3000);
const TICK_MS = 50;
const VIEW_DISTANCE = 4;
const MAX_MOVE_PER_TICK = 0.85;
const MAX_BREAK_REACH = 6;
const MAX_PLACE_REACH = 6;
const DEFAULT_WORLD_HEIGHT = 128;
const CHUNK_SIZE = 16;

const players = new Map();
const chunks = new Map();
const blockChanges = new Map();

let nextGuestId = 1;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function chunkKey(cx, cz) {
  return `${cx},${cz}`;
}

function blockKey(x, y, z) {
  return `${x}|${y}|${z}`;
}

function getChunkCoords(x, z) {
  return {
    cx: Math.floor(x / CHUNK_SIZE),
    cz: Math.floor(z / CHUNK_SIZE)
  };
}

function createGuestName() {
  const label = `Guest${String(nextGuestId).padStart(3, "0")}`;
  nextGuestId += 1;
  return label;
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(String(raw || ""));
  } catch {
    return null;
  }
}

function sendJSON(ws, payload) {
  if (!ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify(payload));
}

function broadcastJSON(payload, excludeId = "") {
  const message = JSON.stringify(payload);
  for (const [id, player] of players) {
    if (excludeId && id === excludeId) continue;
    if (player.ws.readyState === 1) {
      player.ws.send(message);
    }
  }
}

function snapshotPlayer(player) {
  return {
    id: player.id,
    username: player.username,
    skin: player.skin,
    x: player.x,
    y: player.y,
    z: player.z,
    yaw: player.yaw,
    pitch: player.pitch,
    onGround: player.onGround,
    action: player.action,
    animation: player.animation,
    velocity: { ...player.velocity }
  };
}

function createPlayer(id, ws) {
  return {
    id,
    ws,
    username: createGuestName(),
    skin: "steve_large",
    x: 8,
    y: 70,
    z: 8,
    yaw: 0,
    pitch: 0,
    onGround: true,
    action: "idle",
    animation: "idle",
    velocity: { x: 0, y: 0, z: 0 },
    loadedChunks: new Set(),
    lastMoveAt: Date.now(),
    violations: 0
  };
}

function getBaseBlock(x, y) {
  if (y <= 0) return "bedrock";
  if (y < 58) return "stone";
  if (y < 62) return "dirt";
  if (y === 62) return "grass";
  return "air";
}

function getBlockAt(x, y, z) {
  const override = blockChanges.get(blockKey(x, y, z));
  if (override !== undefined) {
    return override;
  }
  return getBaseBlock(x, y, z);
}

function setBlockAt(x, y, z, type) {
  blockChanges.set(blockKey(x, y, z), type);
  const { cx, cz } = getChunkCoords(x, z);
  const key = chunkKey(cx, cz);
  const chunk = getOrCreateChunk(cx, cz);
  chunk.revision += 1;
  return key;
}

function generateChunk(cx, cz) {
  return {
    cx,
    cz,
    revision: 1,
    worldHeight: DEFAULT_WORLD_HEIGHT
  };
}

function getOrCreateChunk(cx, cz) {
  const key = chunkKey(cx, cz);
  if (!chunks.has(key)) {
    chunks.set(key, generateChunk(cx, cz));
  }
  return chunks.get(key);
}

function getChunkChanges(cx, cz) {
  const minX = cx * CHUNK_SIZE;
  const minZ = cz * CHUNK_SIZE;
  const maxX = minX + CHUNK_SIZE;
  const maxZ = minZ + CHUNK_SIZE;
  const entries = [];
  for (const [key, type] of blockChanges) {
    const [xRaw, yRaw, zRaw] = key.split("|");
    const x = Number(xRaw);
    const y = Number(yRaw);
    const z = Number(zRaw);
    if (x >= minX && x < maxX && z >= minZ && z < maxZ) {
      entries.push({ x, y, z, type });
    }
  }
  return entries;
}

function sendChunkToPlayer(player, cx, cz) {
  const chunk = getOrCreateChunk(cx, cz);
  sendJSON(player.ws, {
    type: "chunk",
    cx,
    cz,
    revision: chunk.revision,
    worldHeight: chunk.worldHeight,
    generator: "flat-dev",
    surfaceY: 62,
    changes: getChunkChanges(cx, cz)
  });
}

function sendNearbyChunks(player) {
  const { cx, cz } = getChunkCoords(player.x, player.z);
  const nextLoaded = new Set();
  for (let x = cx - VIEW_DISTANCE; x <= cx + VIEW_DISTANCE; x += 1) {
    for (let z = cz - VIEW_DISTANCE; z <= cz + VIEW_DISTANCE; z += 1) {
      const key = chunkKey(x, z);
      nextLoaded.add(key);
      if (!player.loadedChunks.has(key)) {
        sendChunkToPlayer(player, x, z);
      }
    }
  }
  player.loadedChunks = nextLoaded;
}

function distance3(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function validateMove(player, payload) {
  const next = {
    x: Number(payload.x),
    y: Number(payload.y),
    z: Number(payload.z)
  };
  if (![next.x, next.y, next.z].every(Number.isFinite)) {
    return null;
  }
  const delta = distance3(player, next);
  if (delta > MAX_MOVE_PER_TICK) {
    player.violations += 1;
    sendJSON(player.ws, {
      type: "server_correction",
      reason: "move_rejected",
      player: snapshotPlayer(player)
    });
    return null;
  }
  return next;
}

function canReach(player, x, y, z, maxReach) {
  return distance3(player, { x: x + 0.5, y: y + 0.5, z: z + 0.5 }) <= maxReach;
}

function handleHello(player, payload) {
  const username = String(payload.username || "").trim().slice(0, 16);
  if (username) {
    player.username = username;
  }
  const skin = String(payload.skin || "").trim().slice(0, 64);
  if (skin) {
    player.skin = skin;
  }
  sendJSON(player.ws, {
    type: "hello",
    id: player.id,
    tickMs: TICK_MS,
    viewDistance: VIEW_DISTANCE,
    worldHeight: DEFAULT_WORLD_HEIGHT,
    player: snapshotPlayer(player),
    players: Array.from(players.values()).map(snapshotPlayer)
  });
  broadcastJSON({
    type: "player_join",
    player: snapshotPlayer(player)
  }, player.id);
}

function handleMove(player, payload) {
  const next = validateMove(player, payload);
  if (!next) return;
  player.velocity.x = next.x - player.x;
  player.velocity.y = next.y - player.y;
  player.velocity.z = next.z - player.z;
  player.x = next.x;
  player.y = clamp(next.y, 1, DEFAULT_WORLD_HEIGHT - 2);
  player.z = next.z;
  player.yaw = Number.isFinite(payload.yaw) ? payload.yaw : player.yaw;
  player.pitch = Number.isFinite(payload.pitch) ? payload.pitch : player.pitch;
  player.onGround = payload.onGround !== false;
  player.action = String(payload.action || (player.onGround ? "idle" : "jump")).slice(0, 24);
  player.animation = String(payload.animation || player.action).slice(0, 24);
  player.lastMoveAt = Date.now();
}

function handleBreakBlock(player, payload) {
  const x = Math.floor(Number(payload.x));
  const y = Math.floor(Number(payload.y));
  const z = Math.floor(Number(payload.z));
  if (![x, y, z].every(Number.isFinite)) return;
  if (!canReach(player, x, y, z, MAX_BREAK_REACH)) return;
  const current = getBlockAt(x, y, z);
  if (current === "air" || current === "bedrock") return;
  setBlockAt(x, y, z, "air");
  broadcastJSON({
    type: "block_update",
    x,
    y,
    z,
    block: "air",
    by: player.id
  });
}

function handlePlaceBlock(player, payload) {
  const x = Math.floor(Number(payload.x));
  const y = Math.floor(Number(payload.y));
  const z = Math.floor(Number(payload.z));
  const block = String(payload.block || "").trim().slice(0, 32);
  if (![x, y, z].every(Number.isFinite) || !block) return;
  if (!canReach(player, x, y, z, MAX_PLACE_REACH)) return;
  if (getBlockAt(x, y, z) !== "air") return;
  setBlockAt(x, y, z, block);
  broadcastJSON({
    type: "block_update",
    x,
    y,
    z,
    block,
    by: player.id
  });
}

function handleRequestChunks(player, payload) {
  const cx = Number.isFinite(payload?.cx) ? Math.floor(payload.cx) : getChunkCoords(player.x, player.z).cx;
  const cz = Number.isFinite(payload?.cz) ? Math.floor(payload.cz) : getChunkCoords(player.x, player.z).cz;
  const radius = clamp(Math.floor(payload?.radius || VIEW_DISTANCE), 1, VIEW_DISTANCE);
  for (let x = cx - radius; x <= cx + radius; x += 1) {
    for (let z = cz - radius; z <= cz + radius; z += 1) {
      sendChunkToPlayer(player, x, z);
    }
  }
}

function handlePing(player, payload) {
  sendJSON(player.ws, {
    type: "pong",
    clientTime: payload?.clientTime || 0,
    serverTime: Date.now()
  });
}

function handleMessage(player, payload) {
  if (!payload || typeof payload !== "object") return;
  switch (payload.type) {
    case "hello":
      handleHello(player, payload);
      break;
    case "move":
      handleMove(player, payload);
      break;
    case "break_block":
      handleBreakBlock(player, payload);
      break;
    case "place_block":
      handlePlaceBlock(player, payload);
      break;
    case "request_chunks":
      handleRequestChunks(player, payload);
      break;
    case "ping":
      handlePing(player, payload);
      break;
    default:
      sendJSON(player.ws, {
        type: "warning",
        message: `Unknown packet type: ${String(payload.type || "unknown")}`
      });
      break;
  }
}

function serverTick() {
  for (const player of players.values()) {
    sendNearbyChunks(player);
  }
  broadcastJSON({
    type: "players_state",
    players: Array.from(players.values()).map(snapshotPlayer),
    serverTime: Date.now()
  });
}

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws) => {
  const id = Math.random().toString(36).slice(2, 10);
  const player = createPlayer(id, ws);
  players.set(id, player);

  sendJSON(ws, {
    type: "connected",
    id,
    message: "Connected to FreeCube2 dedicated server."
  });

  ws.on("message", (raw) => {
    const payload = safeJsonParse(raw);
    if (!payload) {
      sendJSON(ws, {
        type: "warning",
        message: "Malformed JSON packet ignored."
      });
      return;
    }
    handleMessage(player, payload);
  });

  ws.on("close", () => {
    players.delete(id);
    broadcastJSON({
      type: "player_leave",
      id
    });
  });

  ws.on("error", (error) => {
    console.warn(`[server] socket error for ${id}:`, error.message);
  });
});

setInterval(serverTick, TICK_MS);

console.log(`[server] FreeCube2 multiplayer server listening on ws://localhost:${PORT}`);
