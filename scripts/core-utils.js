export function generateId() {
  if (globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(8);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return Math.floor(Math.random() * 1e16).toString(16);
}

export function generateRandomWorldSeed() {
  if (globalThis.crypto?.getRandomValues) {
    const value = new Uint32Array(1);
    globalThis.crypto.getRandomValues(value);
    return Number(value[0] % 2147483647) || 1;
  }
  return Math.floor(Math.random() * 2147483646) + 1;
}

export function normalizeWorldSeed(value, fallback = generateRandomWorldSeed()) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  const raw = String(value ?? "").trim();
  if (!raw) {
    return fallback;
  }

  if (/^-?\d+$/.test(raw)) {
    const parsed = Number(raw);
    if (Number.isSafeInteger(parsed)) {
      return parsed;
    }
  }

  let hash = 2166136261;
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) || fallback;
}

export function makeSafeFileName(value, fallback = "world") {
  const raw = String(value || fallback).trim();
  const normalized = raw.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-").replace(/\s+/g, " ").trim();
  const compact = normalized.replace(/[. ]+$/g, "").slice(0, 64);
  return compact || fallback;
}

export function packBlockPositionKey(x, y, z) {
  return `${Math.floor(x)}|${Math.floor(y)}|${Math.floor(z)}`;
}

export function getWebSocketURL(url, defaultUrl = "") {
  const raw = String(url || "").trim();
  if (!raw) {
    return "";
  }
  if (raw.startsWith("wss://") || raw.startsWith("ws://")) {
    return raw;
  }
  if (raw.startsWith("https://")) {
    return raw.replace(/^https:\/\//, "wss://");
  }
  if (raw.startsWith("http://")) {
    return raw.replace(/^http:\/\//, "ws://");
  }
  if (raw.startsWith("file://")) {
    return defaultUrl;
  }
  if (raw.startsWith("localhost") || raw.startsWith("127.0.0.1")) {
    return `ws://${raw.replace(/^ws:\/\//, "").replace(/^wss:\/\//, "")}`;
  }
  return raw;
}

export function downloadTextFile(filename, content, mimeType = "application/json") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function mod(value, size) {
  return ((value % size) + size) % size;
}

export function rgb(r, g, b) {
  return [r, g, b];
}

export function mixRgb(a, b, t) {
  return [
    Math.round(lerp(a[0], b[0], t)),
    Math.round(lerp(a[1], b[1], t)),
    Math.round(lerp(a[2], b[2], t))
  ];
}

export function scaleRgb(color, factor) {
  return [
    clamp(Math.round(color[0] * factor), 0, 255),
    clamp(Math.round(color[1] * factor), 0, 255),
    clamp(Math.round(color[2] * factor), 0, 255)
  ];
}

export function rgba(color, alpha = 1) {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
}

export function packChunkKey(chunkX, chunkZ) {
  return `${chunkX},${chunkZ}`;
}

export function packLocalKey(x, y, z) {
  return `${x}|${y}|${z}`;
}

export function unpackLocalKey(key) {
  const [x, y, z] = key.split("|").map(Number);
  return { x, y, z };
}
