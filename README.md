# FreeCube2 - Minecraft Clone with Sirco Game Engine

A lightweight Minecraft-inspired voxel game built with the **Sirco Game Engine** - a powerful, open-source 2D/3D game engine featuring WebGL 2/3 support, WASM integration, and a comprehensive UI system.

## Features

### Game Features
- **Isometric Voxel Rendering**: Beautiful isometric block rendering with depth effects
- **World Generation**: Procedurally generated terrain with grass, dirt, stone, water, and trees
- **Block System**: 9 different block types with unique colors and properties
- **Inventory System**: Hotbar for selecting and placing blocks (1-5 keys)
- **Player Controls**: WASD for movement, mouse for rotation, left-click to place blocks
- **World Persistence**: Save and load your worlds with localStorage
- **HUD Display**: Health, hunger, position, and inventory indicators

### UI System
- **Title Screen**: Beautiful startup menu
- **Pause Menu**: ESC to pause, resume, or go back to main menu
- **Settings Screen**: Adjust game preferences (expandable)
- **Main Menu**: Navigate between game and settings
- **Interactive Buttons**: Smooth hover effects and responsive controls

### Engine Features
- **WebGL 2/3 Support**: Hardware acceleration with automatic fallback to Canvas 2D
- **WASM Integration**: Fast computation with WebAssembly runtime
- **ECS System**: Entity-Component-System architecture for clean code
- **Physics Engine**: 2D and 3D physics simulation
- **Audio Management**: Sound effects and background music support
- **Particle System**: Visual effects and animations
- **Event Bus**: Decoupled event system for game logic
- **Debug Console**: Built-in developer tools (Ctrl+Shift+Alt+Z)
- **Storage System**: Save/load game data easily
- **UI Framework**: Complete UI system with screens, buttons, panels, and labels

## How to Play

### Controls
- **WASD**: Move around the world
- **Mouse**: Look around (rotation)
- **1-5 Keys**: Select blocks from hotbar
- **Left Click**: Place the selected block
- **ESC**: Pause game
- **Ctrl+Shift+D**: Open developer tools
- **Ctrl+Shift+Alt+Z**: Toggle debug console

### Game Mechanics
1. **World Generation**: The game generates a 32x16x32 world with terrain features
2. **Block Placement**: Click to place blocks where the cursor is pointing
3. **Survival**: Manage health and hunger (UI shows current values)
4. **Exploration**: Find and uncover different biomes and features

## Architecture

### Sirco Game Engine (index.js)
The engine is a compact, feature-rich JavaScript game engine that includes:

#### Core Systems
- **Renderer2D/3D**: Multi-renderer system supporting Canvas 2D and WebGL
- **Physics2D/3D**: Box2D-like solver with AABB collision detection
- **Audio Manager**: Multi-track audio with volume control
- **Input System**: Keyboard and mouse input handling with querying

#### Advanced Features
- **ECS (Entity-Component-System)**: Flexible entity architecture
- **Plugin System**: Plugin-based extension architecture
- **Scene Manager**: Scene loading, creation, and management
- **Prefab System**: Reusable entity templates
- **Network Snapshots**: Rollback-based networking support
- **Asset Importer**: Support for loading assets from various sources

#### UI System
- **ScreenManager**: Manage multiple game screens
- **UIScreen**: Base class for game screens
- **UIButton**: Interactive button with hover states
- **UILabel**: Text rendering
- **UIPanel**: Container for UI elements

### Game (freecube-js.js)
The game uses the engine to implement:

#### Game Systems
- **BlockTypes**: 9 different block types (Air, Grass, Dirt, Stone, Wood, Leaves, Water, Sand, Oak Log)
- **World**: Voxel grid with terrain generation
- **GamePlayer**: Player state, controls, and inventory
- **Screen Management**: Title, Pause, Settings screens

#### Rendering
- **IsometricRenderer**: Voxel-to-isometric projection
- **HUD**: Player stats, inventory, crosshair
- **Lighting**: Basic color shading for 3D depth effect

## File Structure

```
free-cube2/
├── index.js           # Sirco Game Engine (2000+ lines)
├── freecube-js.js     # Minecraft Clone game
├── index.html         # Main HTML entry point
├── README.md          # This file
├── LICENSE            # MIT License
└── from.txt           # Original project notes
```

## Performance Optimizations

### Engine Level
- **WebGL 2/3 Support**: Hardware acceleration for faster rendering
- **WASM Runtime**: Fast computation for physics and logic
- **Efficient Rendering**: Batch rendering with sprite layers
- **Object Pooling**: Reuse objects to reduce garbage collection
- **Delta Time Capping**: Prevent spiral of death in physics
- **Input Caching**: Efficient input polling

### Game Level
- **Efficient World Representation**: Uint8Array for block storage (~16KB for 32x16x32 world)
- **Frustum Culling**: Only render visible blocks
- **Local Storage Caching**: Pre-compute terrain features
- **Minimal Allocations**: Reuse calculations per frame

## Browser Compatibility

- **Chrome/Chromium**: Full support (WebGL 2)
- **Firefox**: Full support (WebGL 2)
- **Safari**: Supported (WebGL 1/2)
- **Edge**: Full support (WebGL 2)
- **Fallback**: Canvas 2D rendering for unsupported browsers

## Building & Running

### Local Development
```bash
# Start a local HTTP server
python3 -m http.server 8080

# Open in browser
open http://localhost:8080
```

### Multiplayer / LAN Server
```bash
cd Lan-server
npm install
npm start
```

The default multiplayer endpoint used by the game is:

```text
ws://localhost:3000
```

When the game is opened from a LAN host like `http://192.168.1.20:8080`, multiplayer now defaults to that same machine automatically:

```text
ws://192.168.1.20:3000
```

To join from another device on the same network, point the game to:

```text
ws://YOUR_COMPUTER_IP:3000
```

### Deployment
Simply copy all files to a web server. The game runs entirely in-browser with no build step required!

## Extending the Engine

The Sirco Game Engine is designed to be reusable. To create a new game:

```javascript
export default function(engine) {
  return {
    start() { /* Initialize game */ },
    update(dt) { /* Update game logic */ },
    render(dt) { /* Render frame */ }
  };
}
```

### Using UI Screens
```javascript
const screen = engine.screenManager.createScreen('myscreen');
const button = new __engine.UIButton(x, y, w, h, 'Click Me', 
  () => { /* do something */ }, engine);
screen.addElement(button);
engine.screenManager.showScreen('myscreen');
```

### Using Physics
```javascript
const body = new __engine.RigidBody2D({
  w: 32, h: 32, mass: 1, 
  restitution: 0.8, friction: 0.3
});
entity.add(body);
engine.physics2DSolver.step(dt);
```

## Assets Used

This game was designed to work with:
- **Kenney Assets**: Popular free game assets used for textures
- **SFX Packs**: Placeholder support for sound effects

To add custom assets, modify the game file to load images:
```javascript
const texture = await engine.resources.loadImage('path/to/image.png');
```

## License

This project is provided under the MIT License. The Sirco Game Engine is open-source and can be used freely in your own projects.

## Author

Created with the Sirco Game Engine - An open-source game engine by Sirco Web.

## Tips & Tricks

1. **Save Your World**: Your world is automatically saved in browser localStorage
2. **Performance**: Press F12 and use Chrome DevTools to profile performance
3. **Debug Mode**: Press Ctrl+Shift+Alt+Z to access the debug console
4. **Dev Tools**: Press Ctrl+Shift+D to open developer tools for storage inspection

## Future Enhancements

Potential additions to make this game even better:
- Actual Kenney texture atlas support
- Block breaking/mining mechanics
- Mobs and NPCs with AI
- Crafting system
- Multiplayer with WebSockets
- Full 3D rendering with WebGL
- Advanced lighting and shadows
- Day/night cycle
- Weather system
- Biome variations

---

**Happy building! 🎮⛏️**
