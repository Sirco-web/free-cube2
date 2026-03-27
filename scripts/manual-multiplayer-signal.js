function normalizeManualMultiplayerCode(rawValue = "") {
  let value = String(rawValue || "").trim();
  if (!value) return "";
  if (value.includes("#")) {
    value = value.slice(value.lastIndexOf("#") + 1);
  }
  value = value
    .replace(/^cubesandcaves:\/\//i, "")
    .replace(/^cubesandcaves:/i, "")
    .replace(/^cacz-/i, "")
    .replace(/^cac-/i, "")
    .replace(/^freecube2:\/\//i, "")
    .replace(/^freecube2:/i, "")
    .replace(/^fc2z-/i, "")
    .replace(/^fc2-/i, "")
    .replace(/\s+/g, "");
  const tokenMatch = value.match(/[A-Za-z0-9\-_+=/]+$/);
  return tokenMatch ? tokenMatch[0] : value;
}

function encodeBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value = "") {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function compressManualMultiplayerPayload(bytes) {
  if (typeof CompressionStream !== "function") {
    return { bytes, compressed: false };
  }
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
    if (compressed.length + 4 < bytes.length) {
      return { bytes: compressed, compressed: true };
    }
  } catch (error) {
    console.warn("Manual multiplayer payload compression failed:", error.message);
  }
  return { bytes, compressed: false };
}

async function inflateManualMultiplayerPayload(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    return new Uint8Array();
  }
  if (typeof DecompressionStream !== "function") {
    throw new Error("Can't connect.");
  }
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    throw new Error("Can't connect.");
  }
}

function createCompactManualMultiplayerPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  if (payload.type === "freecube2_lan_offer") {
    return {
      t: "o",
      v: 2,
      r: String(payload.roomCode || "").slice(0, 7).toUpperCase(),
      c: payload.cheatDetection ? 1 : 0,
      s: String(payload.sdp?.sdp || "")
    };
  }
  if (payload.type === "freecube2_lan_answer") {
    return {
      t: "a",
      v: 2,
      r: String(payload.roomCode || "").slice(0, 7).toUpperCase(),
      s: String(payload.sdp?.sdp || "")
    };
  }
  return payload;
}

function expandCompactManualMultiplayerPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  if (payload.t === "o" && typeof payload.s === "string") {
    return {
      type: "freecube2_lan_offer",
      version: Number(payload.v) || 2,
      roomCode: String(payload.r || ""),
      cheatDetection: !!payload.c,
      sdp: {
        type: "offer",
        sdp: payload.s
      }
    };
  }
  if (payload.t === "a" && typeof payload.s === "string") {
    return {
      type: "freecube2_lan_answer",
      version: Number(payload.v) || 2,
      roomCode: String(payload.r || ""),
      sdp: {
        type: "answer",
        sdp: payload.s
      }
    };
  }
  if (payload.sdp && typeof payload.sdp === "string") {
    return {
      ...payload,
      sdp: {
        type: payload.type === "freecube2_lan_answer" ? "answer" : "offer",
        sdp: payload.sdp
      }
    };
  }
  return payload;
}

export async function encodeMultiplayerSignalPayload(payload) {
  try {
    const compactPayload = createCompactManualMultiplayerPayload(payload);
    const bytes = new TextEncoder().encode(JSON.stringify(compactPayload));
    const encoded = await compressManualMultiplayerPayload(bytes);
    return `${encoded.compressed ? "CACZ-" : "CAC-"}${encodeBase64Url(encoded.bytes)}`;
  } catch (error) {
    console.warn("Manual multiplayer payload encode failed:", error.message);
    return "";
  }
}

export async function decodeMultiplayerSignalPayload(rawValue) {
  const source = normalizeManualMultiplayerCode(rawValue);
  if (!source) {
    return null;
  }
  try {
    const compressed = /(CACZ-|FC2Z-)/i.test(String(rawValue || ""));
    const bytes = decodeBase64Url(source);
    const decodedBytes = compressed ? await inflateManualMultiplayerPayload(bytes) : bytes;
    return expandCompactManualMultiplayerPayload(JSON.parse(new TextDecoder().decode(decodedBytes)));
  } catch {
    return null;
  }
}

export function buildManualLanRoomCode(generateId) {
  return String(generateId()).replace(/[^A-Z0-9]/gi, "").slice(0, 7).toUpperCase() || "LAN";
}

export function waitForIceGatheringComplete(pc, timeoutMs = 4000) {
  if (!pc || pc.iceGatheringState === "complete") {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      pc.removeEventListener("icegatheringstatechange", handleStateChange);
      clearTimeout(timer);
      resolve();
    };
    const handleStateChange = () => {
      if (pc.iceGatheringState === "complete") {
        finish();
      }
    };
    const timer = setTimeout(finish, timeoutMs);
    pc.addEventListener("icegatheringstatechange", handleStateChange);
  });
}

export function showManualMultiplayerCode(promptLabel, encodedPayload, { onCopy } = {}) {
  if (!encodedPayload) {
    throw new Error("Can't connect.");
  }
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(encodedPayload).then(() => {
      onCopy?.(encodedPayload);
    }).catch(() => {});
  }
  prompt(promptLabel, encodedPayload);
}

export async function readManualMultiplayerCode(promptLabel) {
  const rawValue = String(prompt(promptLabel, "") || "").trim();
  if (!rawValue) {
    return null;
  }
  const payload = await decodeMultiplayerSignalPayload(rawValue);
  if (!payload || typeof payload !== "object") {
    throw new Error("Can't connect.");
  }
  return { rawValue, payload };
}

export async function describeManualInviteCode(rawValue = "") {
  const payload = await decodeMultiplayerSignalPayload(rawValue);
  if (!payload || typeof payload !== "object") {
    return {
      roomCode: "",
      subtitle: "Saved invite code",
      statusText: "Invite code"
    };
  }
  const roomCode = String(payload.roomCode || "").slice(0, 7).toUpperCase();
  return {
    roomCode,
    subtitle: roomCode ? `Code ${roomCode}` : "Saved invite code",
    statusText: "Invite code"
  };
}
