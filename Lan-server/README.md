# Cubes and Caves LAN Server

This folder contains the standalone multiplayer server for Cubes and Caves.

It supports:
- Dedicated multiplayer worlds over WebSocket
- LAN room browser packets
- WebRTC signaling for peer rooms

## Start

```bash
cd Lan-server
npm install
npm start
```

Default address:

```text
ws://localhost:3000
```

On another machine on your LAN, use:

```text
ws://YOUR_COMPUTER_IP:3000
```

## Environment

- `PORT`: WebSocket port, default `3000`
- `SERVER_NAME`: visible dedicated server name
- `DEFAULT_SERVER_ID`: dedicated server id, default `default`
- `WORLD_SEED`: optional fixed world seed
- `MAX_PLAYERS`: max dedicated players, default `8`

## Notes

The game client already includes Google's public STUN servers for WebRTC fallback. This server is the authoritative WebSocket host for Cubes and Caves sessions.
