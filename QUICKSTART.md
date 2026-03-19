# 🎮 FreeCube2 - Quick Start Guide

## Start Playing in 30 Seconds

### 1. Start the Server
```bash
cd /workspaces/free-cube2
python3 -m http.server 8000
```

### 2. Open in Browser
```
http://localhost:8000/index.html
```

### 3. You're Playing! 🎉

---

## Basic Controls

```
W      = Walk Forward         SPACE  = Jump
A      = Walk Left            SHIFT  = Sprint / Crouch
S      = Walk Backward        1-9    = Select Hotbar Slot
D      = Walk Right           F3     = Debug Info
MOUSE  = Look Around          R      = Render Distance +
                              T      = Render Distance -
```

---

## What You'll See

### HUD Elements (On-Screen)
- ❤️ **Health Bar (top-left)** - 10 hearts = 20 HP
- 🍖 **Hunger Bar (top-right)** - 10 food icons = 20 hunger
- 📦 **Hotbar (bottom)** - 9 item slots, orange = selected
- 🟢 **XP Bar (bottom center)** - Green progress bar
- ➕ **Crosshair (center)** - Where you're aiming

### Game Features
- Walk around procedurally generated terrain
- View distance ranges from 1-16 chunks (default 4)
- First-person camera matches Minecraft style
- Realistic gravity and jumping
- Sprint by holding SHIFT while moving
- Crouch by holding SHIFT while not moving

---

## Tips & Tricks

### Performance
- **Experiencing lag?** Press **T** to reduce render distance
- **Want to see more?** Press **R** to increase render distance
- Works best in Chrome or Firefox

### Gameplay
- Sprint consumes hunger (orange bar decreases)
- Health regenerates slowly when hunger is above 0
- Fall from high places to lose health
- Press **F3** to see exact position and rotation

### Debug Info (F3)
Shows:
- Your exact coordinates (X, Y, Z)
- Yaw angle (0° = East, 90° = North, etc.)
- Pitch angle (-90° = straight up, +90° = straight down)
- Current health and hunger
- Toggle hint

---

## Recommended Settings

### For First Time Players
```
Render Distance: 4 chunks (default)
Sensitivity: Default (adjust with mouse if needed)
```

### For High-End PC
```
Render Distance: 8-12 chunks
```

### For Low-End PC / Slow Connection
```
Render Distance: 1-2 chunks
```

---

## What's Next?

The game is still in development. Future features include:
- Block placement and breaking
- Inventory system
- Crafting
- Mobs and NPCs
- Better graphics and textures
- Survival mechanics

---

## Troubleshooting

### "Can't reach localhost:8000"
- Make sure `python3 -m http.server 8000` is running
- Try opening http://127.0.0.1:8000 instead

### "Game is frozen or very slow"
- Check FPS by pressing **F3**
- Lower render distance with **T** key
- Close other programs running in background

### "Movement feels weird"
- Mouse sensitivity is default
- Try moving the mouse around to look first
- Movement is relative to where you're looking (WASD follows view)

### "Can't see blocks/they look flat"
- Game currently uses color-based rendering
- Texture mapping is in development
- This is normal - rendering is optimized for performance

---

## Learning Resources

- **[FIRST_PERSON_GUIDE.md](FIRST_PERSON_GUIDE.md)** - Detailed control guide
- **[CHANGELOG.md](CHANGELOG.md)** - Technical changes made
- **[IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)** - How it was built

---

## Still Have Questions?

Check the console (F12 in browser) for debug messages. The game logs:
- Texture loading status
- Sound loading status
- Render distance changes
- Performance metrics

---

## Have Fun! 🎮

Enjoy exploring the procedurally generated Minecraft-style world in first-person perspective!

**FreeCube2 v3.1 - First-Person Edition**
