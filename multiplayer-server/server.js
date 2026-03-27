const { WebSocketServer } = require("ws");

const PORT = Number(process.env.PORT || 3000);
const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LENGTH = 5;
const DEFAULT_MAX_PLAYERS = 8;
const DEFAULT_SERVER_ID = String(process.env.DEFAULT_SERVER_ID || "default").trim() || "default";
const DEFAULT_SERVER_NAME = String(process.env.SERVER_NAME || "FreeCube2 Dedicated Server").trim() || "FreeCube2 Dedicated Server";
const DEFAULT_WORLD_SEED = Number.isFinite(Number(process.env.WORLD_SEED))
  ? Number(process.env.WORLD_SEED)
  : Math.floor(Math.random() * 0x7fffffff);

const clients = new Map();
const signalRooms = new Map();
const dedicatedServers = new Map();

function sendJSON(ws, payload) {
  if (!ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify(payload));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function hashString(value) {
  let hash = 0;
  for (const ch of String(value || "")) {
    hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
  }
  return Math.abs(hash);
}

function generateRoomCode() {
  let code = "";
  do {
    code = Array.from({ length: ROOM_CODE_LENGTH }, () => ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)]).join("");
  } while (signalRooms.has(code));
  return code;
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(String(raw || ""));
  } catch {
    return null;
  }
}

function sanitizeServerId(rawValue) {
  const cleaned = String(rawValue || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || DEFAULT_SERVER_ID;
}

function normalizeString(value, fallback, maxLength) {
  const next = String(value || fallback || "").trim().slice(0, maxLength);
  return next || fallback;
}

function normalizeFinite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function normalizeInt(value, fallback = 0) {
  return Math.floor(normalizeFinite(value, fallback));
}

function getClient(id) {
  return clients.get(String(id || "")) || null;
}

function serializeClient(client) {
  return {
    id: client.id,
    username: client.username,
    skinPreset: client.skinPreset,
    skinDataUrl: client.skinDataUrl
  };
}

function serializeSignalRoom(room) {
  return {
    code: room.code,
    name: room.name,
    private: !!room.private,
    cheatDetection: !!room.cheatDetection,
    maxPlayers: room.maxPlayers,
    playerCount: room.peers.size
  };
}

function getVisibleSignalRooms() {
  return Array.from(signalRooms.values())
    .filter((room) => !room.private)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(serializeSignalRoom);
}

function broadcastSignalRoomList() {
  const payload = {
    type: "signal_room_list",
    rooms: getVisibleSignalRooms()
  };
  for (const client of clients.values()) {
    sendJSON(client.ws, payload);
  }
}

function getSignalRoomForClient(client) {
  if (!client?.roomCode) return null;
  return signalRooms.get(client.roomCode) || null;
}

function sendSignalError(client, message) {
  sendJSON(client.ws, {
    type: "signal_error",
    message: String(message || "Signaling request failed.")
  });
}

function sendGameError(client, message) {
  sendJSON(client.ws, {
    type: "server_error",
    message: String(message || "Dedicated server request failed.")
  });
}

function applyProfile(client, payload = {}) {
  client.username = normalizeString(payload.username, client.username || "Player", 16) || "Player";
  client.skinPreset = normalizeString(payload.skinPreset, client.skinPreset || "steve", 32) || "steve";
  client.skinDataUrl = String(payload.skinDataUrl || client.skinDataUrl || "").trim().slice(0, 2_000_000);
}

function closeSignalRoom(roomCode, reason = "Room closed by host.") {
  const room = signalRooms.get(String(roomCode || ""));
  if (!room) return;
  for (const peerId of room.peers) {
    const peer = getClient(peerId);
    if (!peer) continue;
    peer.roomCode = "";
    sendJSON(peer.ws, {
      type: "signal_room_closed",
      roomCode: room.code,
      message: reason
    });
  }
  signalRooms.delete(room.code);
  broadcastSignalRoomList();
}

function removeClientFromSignalRoom(client, reason = "") {
  const room = getSignalRoomForClient(client);
  if (!room) return;
  room.peers.delete(client.id);
  client.roomCode = "";

  if (client.id === room.hostId) {
    closeSignalRoom(room.code, reason || "The host left the room.");
    return;
  }

  const host = getClient(room.hostId);
  if (host) {
    sendJSON(host.ws, {
      type: "signal_room_peer_left",
      roomCode: room.code,
      peerId: client.id
    });
  }
  if (room.peers.size <= 0) {
    signalRooms.delete(room.code);
  }
  broadcastSignalRoomList();
}

function createDedicatedServer(serverId) {
  const resolvedId = sanitizeServerId(serverId);
  const suffix = resolvedId === DEFAULT_SERVER_ID ? "" : ` (${resolvedId})`;
  return {
    id: resolvedId,
    name: `${DEFAULT_SERVER_NAME}${suffix}`,
    motd: "Dedicated world host plus LAN/WebRTC signaling.",
    seed: DEFAULT_WORLD_SEED + hashString(resolvedId),
    maxPlayers: clamp(Math.floor(Number(process.env.MAX_PLAYERS) || DEFAULT_MAX_PLAYERS), 2, 32),
    players: new Set(),
    modifiedBlocks: new Map(),
    worldTime: 0,
    weather: "clear",
    createdAt: Date.now()
  };
}

function getDedicatedServer(serverId = DEFAULT_SERVER_ID) {
  const resolvedId = sanitizeServerId(serverId);
  if (!dedicatedServers.has(resolvedId)) {
    dedicatedServers.set(resolvedId, createDedicatedServer(resolvedId));
  }
  return dedicatedServers.get(resolvedId);
}

function getDedicatedServerForClient(client) {
  if (!client?.dedicatedServerId) return null;
  return dedicatedServers.get(client.dedicatedServerId) || null;
}

function serializeDedicatedPlayer(client) {
  return {
    id: client.id,
    username: client.username,
    skinPreset: client.skinPreset,
    skinDataUrl: client.skinDataUrl,
    x: normalizeFinite(client.state?.x, 0),
    y: normalizeFinite(client.state?.y, 0),
    z: normalizeFinite(client.state?.z, 0),
    yaw: normalizeFinite(client.state?.yaw, 0),
    pitch: normalizeFinite(client.state?.pitch, 0),
    onGround: !!client.state?.onGround,
    action: normalizeString(client.state?.action, "idle", 24),
    animation: normalizeString(client.state?.animation, normalizeString(client.state?.action, "idle", 24), 24)
  };
}

function serializeDedicatedServerMeta(server) {
  return {
    id: server.id,
    name: server.name,
    motd: server.motd,
    seed: server.seed,
    maxPlayers: server.maxPlayers,
    playerCount: server.players.size
  };
}

function packBlockKey(x, y, z) {
  return `${x}|${y}|${z}`;
}

function packChunkKey(chunkX, chunkZ) {
  return `${chunkX},${chunkZ}`;
}

function serializeRequestedChunks(server, centerChunkX, centerChunkZ, radius) {
  const chunks = new Map();
  for (const block of server.modifiedBlocks.values()) {
    const chunkX = Math.floor(block.x / 16);
    const chunkZ = Math.floor(block.z / 16);
    if (Math.abs(chunkX - centerChunkX) > radius || Math.abs(chunkZ - centerChunkZ) > radius) {
      continue;
    }
    const chunkKey = packChunkKey(chunkX, chunkZ);
    if (!chunks.has(chunkKey)) {
      chunks.set(chunkKey, {
        chunkX,
        chunkZ,
        blocks: []
      });
    }
    chunks.get(chunkKey).blocks.push(block);
  }
  return Array.from(chunks.values()).sort((a, b) => (a.chunkX - b.chunkX) || (a.chunkZ - b.chunkZ));
}

function broadcastDedicatedServer(server, payload, excludeClientId = "") {
  for (const playerId of server.players) {
    if (excludeClientId && playerId === excludeClientId) continue;
    const peer = getClient(playerId);
    if (!peer) continue;
    sendJSON(peer.ws, payload);
  }
}

function removeClientFromDedicatedServer(client, reason = "Player left the server.") {
  const server = getDedicatedServerForClient(client);
  if (!server) return;
  server.players.delete(client.id);
  client.dedicatedServerId = "";
  if (server.players.size > 0) {
    broadcastDedicatedServer(server, {
      type: "player_leave",
      serverId: server.id,
      id: client.id,
      reason
    }, client.id);
  } else if (server.id !== DEFAULT_SERVER_ID) {
    dedicatedServers.delete(server.id);
  }
}

function handleSignalRegister(client, payload) {
  applyProfile(client, payload);
  sendJSON(client.ws, {
    type: "signal_registered",
    clientId: client.id
  });
  sendJSON(client.ws, {
    type: "signal_room_list",
    rooms: getVisibleSignalRooms()
  });
}

function handleSignalCreateRoom(client, payload) {
  removeClientFromSignalRoom(client);
  const code = generateRoomCode();
  const room = {
    code,
    hostId: client.id,
    name: normalizeString(payload.name, "FreeCube2 LAN World", 48) || "FreeCube2 LAN World",
    private: !!payload.private,
    cheatDetection: !!payload.cheatDetection,
    maxPlayers: clamp(Math.floor(Number(payload.maxPlayers) || DEFAULT_MAX_PLAYERS), 2, 16),
    peers: new Set([client.id]),
    createdAt: Date.now()
  };
  client.roomCode = code;
  signalRooms.set(code, room);
  sendJSON(client.ws, {
    type: "signal_room_created",
    room: serializeSignalRoom(room)
  });
  sendJSON(client.ws, {
    type: "signal_room_joined",
    room: serializeSignalRoom(room),
    hostPeerId: client.id,
    isHost: true
  });
  broadcastSignalRoomList();
}

function handleSignalJoinRoom(client, payload) {
  const roomCode = String(payload.roomCode || "").trim().toUpperCase();
  if (!roomCode) {
    sendSignalError(client, "Enter a valid world code.");
    return;
  }
  const room = signalRooms.get(roomCode);
  if (!room) {
    sendSignalError(client, `Room ${roomCode} was not found.`);
    return;
  }
  if (room.peers.size >= room.maxPlayers) {
    sendSignalError(client, `Room ${roomCode} is full.`);
    return;
  }
  removeClientFromSignalRoom(client);
  room.peers.add(client.id);
  client.roomCode = room.code;
  sendJSON(client.ws, {
    type: "signal_room_joined",
    room: serializeSignalRoom(room),
    hostPeerId: room.hostId,
    isHost: false
  });
  const host = getClient(room.hostId);
  if (host) {
    sendJSON(host.ws, {
      type: "signal_room_peer_joined",
      roomCode: room.code,
      peer: serializeClient(client)
    });
  }
  broadcastSignalRoomList();
}

function handleSignalCloseRoom(client, payload) {
  const room = getSignalRoomForClient(client);
  if (!room || room.hostId !== client.id) {
    sendSignalError(client, "Only the host can close this room.");
    return;
  }
  closeSignalRoom(payload?.roomCode || room.code, "The host closed the room.");
}

function handleSignalRelay(client, payload) {
  const room = getSignalRoomForClient(client);
  if (!room) {
    sendSignalError(client, "Join a room before relaying WebRTC messages.");
    return;
  }
  const targetId = String(payload.to || "");
  const target = getClient(targetId);
  if (!target || target.roomCode !== room.code) {
    sendSignalError(client, "The requested peer is not in this room.");
    return;
  }
  sendJSON(target.ws, {
    type: "signal_relay",
    roomCode: room.code,
    from: client.id,
    data: payload.data && typeof payload.data === "object" ? payload.data : {}
  });
}

function handleDedicatedHello(client, payload) {
  applyProfile(client, payload);
  const requestedServerId = sanitizeServerId(payload.serverId || payload.worldId || payload.server || DEFAULT_SERVER_ID);
  if (client.dedicatedServerId && client.dedicatedServerId !== requestedServerId) {
    removeClientFromDedicatedServer(client, "Player switched servers.");
  }

  const server = getDedicatedServer(requestedServerId);
  if (!server.players.has(client.id) && server.players.size >= server.maxPlayers) {
    sendGameError(client, `Dedicated server ${server.id} is full.`);
    return;
  }

  client.dedicatedServerId = server.id;
  client.state = {
    ...client.state,
    x: normalizeFinite(payload.x, client.state.x),
    y: normalizeFinite(payload.y, client.state.y),
    z: normalizeFinite(payload.z, client.state.z),
    yaw: normalizeFinite(payload.yaw, client.state.yaw),
    pitch: normalizeFinite(payload.pitch, client.state.pitch),
    onGround: payload.onGround !== undefined ? !!payload.onGround : !!client.state.onGround,
    action: normalizeString(payload.action, client.state.action || "idle", 24),
    animation: normalizeString(payload.animation, client.state.animation || client.state.action || "idle", 24)
  };

  const isNewJoin = !server.players.has(client.id);
  server.players.add(client.id);

  sendJSON(client.ws, {
    type: "welcome",
    clientId: client.id,
    server: serializeDedicatedServerMeta(server),
    world: {
      seed: server.seed,
      worldTime: server.worldTime,
      weather: server.weather,
      modifiedBlocks: Array.from(server.modifiedBlocks.values())
    },
    players: Array.from(server.players)
      .map((playerId) => getClient(playerId))
      .filter(Boolean)
      .map(serializeDedicatedPlayer)
  });

  if (isNewJoin) {
    broadcastDedicatedServer(server, {
      type: "player_join",
      serverId: server.id,
      player: serializeDedicatedPlayer(client)
    }, client.id);
  }
}

function extractPlayerStatePayload(payload) {
  if (payload?.player && typeof payload.player === "object") {
    return payload.player;
  }
  return payload || {};
}

function handleDedicatedMove(client, payload) {
  const server = getDedicatedServerForClient(client);
  if (!server) {
    sendGameError(client, "Join a dedicated server before sending movement.");
    return;
  }
  const nextState = extractPlayerStatePayload(payload);
  client.state = {
    ...client.state,
    x: normalizeFinite(nextState.x, client.state.x),
    y: normalizeFinite(nextState.y, client.state.y),
    z: normalizeFinite(nextState.z, client.state.z),
    yaw: normalizeFinite(nextState.yaw, client.state.yaw),
    pitch: normalizeFinite(nextState.pitch, client.state.pitch),
    onGround: nextState.onGround !== undefined ? !!nextState.onGround : !!client.state.onGround,
    action: normalizeString(nextState.action, client.state.action || "idle", 24),
    animation: normalizeString(nextState.animation, nextState.action || client.state.animation || "idle", 24)
  };
  broadcastDedicatedServer(server, {
    type: "player_state",
    serverId: server.id,
    player: serializeDedicatedPlayer(client)
  }, client.id);
}

function handleDedicatedChunkRequest(client, payload) {
  const server = getDedicatedServerForClient(client);
  if (!server) {
    sendGameError(client, "Join a dedicated server before requesting chunks.");
    return;
  }
  const centerChunkX = normalizeInt(payload.centerChunkX, 0);
  const centerChunkZ = normalizeInt(payload.centerChunkZ, 0);
  const radius = clamp(normalizeInt(payload.radius, payload.renderDistance || 3), 0, 8);
  sendJSON(client.ws, {
    type: "chunk_data",
    serverId: server.id,
    centerChunkX,
    centerChunkZ,
    radius,
    seed: server.seed,
    worldTime: server.worldTime,
    weather: server.weather,
    chunks: serializeRequestedChunks(server, centerChunkX, centerChunkZ, radius)
  });
}

function handleDedicatedBreakBlock(client, payload) {
  const server = getDedicatedServerForClient(client);
  if (!server) {
    sendGameError(client, "Join a dedicated server before breaking blocks.");
    return;
  }
  const x = normalizeInt(payload.x, 0);
  const y = normalizeInt(payload.y, 0);
  const z = normalizeInt(payload.z, 0);
  server.modifiedBlocks.set(packBlockKey(x, y, z), { x, y, z, blockType: 0 });
  broadcastDedicatedServer(server, {
    type: "block_update",
    serverId: server.id,
    x,
    y,
    z,
    blockType: 0
  });
}

function handleDedicatedPlaceBlock(client, payload) {
  const server = getDedicatedServerForClient(client);
  if (!server) {
    sendGameError(client, "Join a dedicated server before placing blocks.");
    return;
  }
  const x = normalizeInt(payload.x, 0);
  const y = normalizeInt(payload.y, 0);
  const z = normalizeInt(payload.z, 0);
  const blockType = normalizeInt(payload.blockType, 0);
  if (blockType <= 0) {
    sendGameError(client, "Choose a valid block type before placing.");
    return;
  }
  server.modifiedBlocks.set(packBlockKey(x, y, z), { x, y, z, blockType });
  broadcastDedicatedServer(server, {
    type: "block_update",
    serverId: server.id,
    x,
    y,
    z,
    blockType
  });
}

function handleSignalMessage(client, payload) {
  switch (payload.type) {
    case "signal_register":
      handleSignalRegister(client, payload);
      break;
    case "signal_list_rooms":
      sendJSON(client.ws, {
        type: "signal_room_list",
        rooms: getVisibleSignalRooms()
      });
      break;
    case "signal_create_room":
      handleSignalCreateRoom(client, payload);
      break;
    case "signal_join_room":
      handleSignalJoinRoom(client, payload);
      break;
    case "signal_leave_room":
      removeClientFromSignalRoom(client, "A player left the room.");
      sendJSON(client.ws, {
        type: "signal_room_list",
        rooms: getVisibleSignalRooms()
      });
      break;
    case "signal_close_room":
      handleSignalCloseRoom(client, payload);
      break;
    case "signal_relay":
      handleSignalRelay(client, payload);
      break;
    default:
      sendSignalError(client, `Unknown signaling packet type: ${String(payload.type || "unknown")}`);
      break;
  }
}

function handleDedicatedMessage(client, payload) {
  switch (payload.type) {
    case "hello":
      handleDedicatedHello(client, payload);
      break;
    case "move":
    case "player_state":
      handleDedicatedMove(client, payload);
      break;
    case "request_chunks":
      handleDedicatedChunkRequest(client, payload);
      break;
    case "break_block":
    case "break_block_request":
      handleDedicatedBreakBlock(client, payload);
      break;
    case "place_block":
    case "place_block_request":
      handleDedicatedPlaceBlock(client, payload);
      break;
    case "leave_server":
      removeClientFromDedicatedServer(client, "A player left the dedicated server.");
      break;
    default:
      sendGameError(client, `Unknown dedicated-server packet type: ${String(payload.type || "unknown")}`);
      break;
  }
}

function handleClientMessage(client, payload) {
  if (!payload || typeof payload !== "object") {
    sendGameError(client, "Malformed JSON packet ignored.");
    return;
  }

  if (typeof payload.type !== "string" || !payload.type.trim()) {
    sendGameError(client, "Packets must include a type.");
    return;
  }

  if (payload.type.startsWith("signal_")) {
    handleSignalMessage(client, payload);
    return;
  }

  if (payload.type === "ping") {
    sendJSON(client.ws, {
      type: "pong",
      serverTime: Date.now(),
      capabilities: {
        dedicated: true,
        lanRtcSignaling: true
      },
      defaultServerId: DEFAULT_SERVER_ID,
      publicRooms: getVisibleSignalRooms().length,
      dedicatedServers: Array.from(dedicatedServers.values()).map(serializeDedicatedServerMeta)
    });
    return;
  }

  handleDedicatedMessage(client, payload);
}

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws) => {
  const client = {
    id: generateId(),
    ws,
    username: "Player",
    skinPreset: "steve",
    skinDataUrl: "",
    roomCode: "",
    dedicatedServerId: "",
    state: {
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      pitch: 0,
      onGround: false,
      action: "idle",
      animation: "idle"
    }
  };
  clients.set(client.id, client);

  sendJSON(ws, {
    type: "connected",
    id: client.id,
    message: "Connected to the FreeCube2 multiplayer server.",
    capabilities: {
      dedicated: true,
      lanRtcSignaling: true
    },
    defaultServerId: DEFAULT_SERVER_ID
  });

  ws.on("message", (raw) => {
    const payload = safeJsonParse(raw);
    if (!payload) {
      sendGameError(client, "Malformed JSON packet ignored.");
      return;
    }
    handleClientMessage(client, payload);
  });

  ws.on("close", () => {
    removeClientFromSignalRoom(client, "A player disconnected.");
    removeClientFromDedicatedServer(client, "A player disconnected.");
    clients.delete(client.id);
  });

  ws.on("error", (error) => {
    console.warn(`[server] socket error for ${client.id}:`, error.message);
  });
});

wss.on("listening", () => {
  console.log(`[server] FreeCube2 multiplayer server listening on ws://localhost:${PORT}`);
  console.log("[server] Modes: dedicated world sync + LAN/WebRTC signaling");
});

wss.on("error", (error) => {
  console.error(`[server] Failed to start multiplayer server on port ${PORT}: ${error.message}`);
});
