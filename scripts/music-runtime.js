export function createMusicRuntime({
  state,
  musicTracks,
  musicFadeSeconds,
  block,
  playerEyeHeight,
  worldHeight,
  clamp,
  resolveResourcePackAsset,
  getMode,
  getSettings,
  getPlayer,
  getWorld,
  getRuntimePlayerInCave,
  getRuntimePlayerInVillage,
  getNearestVillageCenter,
  isFluidBlock
}) {
  function preloadMusicTracks() {
    const settings = getSettings();
    for (const track of [musicTracks.title, musicTracks.pause, ...Object.values(musicTracks.gameplay)]) {
      const resolvedTrack = resolveResourcePackAsset(track, settings);
      if (!resolvedTrack || state.pool.has(resolvedTrack)) continue;
      const audio = new Audio(resolvedTrack);
      audio.preload = "auto";
      audio.loop = false;
      state.pool.set(resolvedTrack, audio);
      audio.load();
    }
  }

  function getMusicVolumeScalar() {
    const settings = getSettings();
    return clamp((settings.masterVolume || 0) * (settings.musicVolume || 0), 0, 1);
  }

  function syncMusicVolume() {
    const baseVolume = getMusicVolumeScalar();
    if (state.currentAudio) {
      state.currentAudio.volume = baseVolume * state.currentGain;
    }
    for (const voice of state.fadingVoices) {
      if (voice?.audio) {
        voice.audio.volume = baseVolume * clamp(voice.gain, 0, 1);
      }
    }
  }

  function retireMusicVoice(voice, resetPosition = true) {
    const audio = voice?.audio || voice;
    if (!audio) return;
    audio.onended = null;
    audio.pause();
    if (resetPosition) {
      try {
        audio.currentTime = 0;
      } catch {
        // Ignore media reset issues.
      }
    }
  }

  function queueMusicFadeOut(audio, gain = 1, resetPosition = true) {
    if (!audio) return;
    audio.onended = null;
    state.fadingVoices.push({
      audio,
      gain: clamp(gain, 0, 1),
      resetPosition
    });
  }

  function stopMusic(resetPosition = true) {
    if (state.currentAudio) {
      retireMusicVoice(state.currentAudio, resetPosition);
    }
    state.currentAudio = null;
    state.currentGain = 0;
    for (const voice of state.fadingVoices) {
      retireMusicVoice(voice, voice.resetPosition && resetPosition);
    }
    state.fadingVoices = [];
    state.currentTrack = "";
    state.currentState = "";
  }

  function getDesiredMusicState() {
    const mode = getMode();
    if (mode === "playing") {
      return "gameplay";
    }
    if (mode === "paused") {
      return "pause";
    }
    return "title";
  }

  function isPlayerInCave() {
    const player = getPlayer();
    const world = getWorld();
    if (!player || !world) return false;
    const px = Math.floor(player.x);
    const pz = Math.floor(player.z);
    const py = Math.floor(player.y + playerEyeHeight);
    const column = world.terrain.describeColumn(px, pz);
    if (py >= column.height - 4) {
      return false;
    }
    let covered = 0;
    for (let y = py + 1; y <= Math.min(worldHeight - 1, py + 10); y += 1) {
      const blockType = world.peekBlock(px, y, pz);
      if (blockType !== block.AIR && !isFluidBlock(blockType)) {
        covered += 1;
      }
    }
    return covered >= 3;
  }

  function isPlayerInVillage() {
    const player = getPlayer();
    const world = getWorld();
    if (!player || !world) return false;
    const center = getNearestVillageCenter(player.x, player.z, world.seed, 36);
    if (!center) return false;
    const dx = center.x - player.x;
    const dz = center.z - player.z;
    return dx * dx + dz * dz <= 18 * 18;
  }

  function getGameplayMusicTrack() {
    const player = getPlayer();
    const world = getWorld();
    if (!player || !world) return "";
    if (getRuntimePlayerInCave()) {
      return musicTracks.gameplay.cave;
    }
    if (getRuntimePlayerInVillage()) {
      return musicTracks.gameplay.village;
    }
    const column = world.terrain.describeColumn(Math.floor(player.x), Math.floor(player.z));
    if (column.biome === "forest") {
      return musicTracks.gameplay.forest;
    }
    return "";
  }

  function playMusicTrack(nextState, track) {
    if (!state.unlocked || !track) {
      return;
    }
    preloadMusicTracks();
    const settings = getSettings();
    const resolvedTrack = resolveResourcePackAsset(track, settings);
    const source = state.pool.get(resolvedTrack);
    if (!source) {
      return;
    }
    if (state.currentTrack === resolvedTrack && state.currentState === nextState) {
      syncMusicVolume();
      return;
    }
    if (state.currentAudio) {
      queueMusicFadeOut(state.currentAudio, state.currentGain, false);
    }
    const audio = source?.cloneNode?.(true) || new Audio(resolvedTrack);
    audio.preload = "auto";
    state.currentAudio = audio;
    state.currentGain = 0;
    state.currentTrack = resolvedTrack;
    state.currentState = nextState;
    state.currentAudio.loop = nextState !== "gameplay";
    state.currentAudio.currentTime = 0;
    state.currentAudio.onended = nextState === "gameplay"
      ? () => {
          if (state.currentState !== "gameplay") return;
          playMusicTrack("gameplay", getGameplayMusicTrack());
        }
      : null;
    syncMusicVolume();
    state.currentAudio.play().catch(() => {});
  }

  function updateMusicFades(dt) {
    if (state.currentAudio) {
      state.currentGain = clamp(state.currentGain + dt / musicFadeSeconds, 0, 1);
    } else {
      state.currentGain = 0;
    }
    if (state.fadingVoices.length > 0) {
      const nextVoices = [];
      for (const voice of state.fadingVoices) {
        voice.gain = clamp(voice.gain - dt / musicFadeSeconds, 0, 1);
        if (voice.gain <= 0.001) {
          retireMusicVoice(voice, voice.resetPosition);
          continue;
        }
        nextVoices.push(voice);
      }
      state.fadingVoices = nextVoices;
    }
    syncMusicVolume();
  }

  function updateMusicState(dt = 0) {
    if (!state.unlocked) {
      return;
    }
    const desiredState = getDesiredMusicState();
    const desiredTrack = desiredState === "gameplay" ? getGameplayMusicTrack() : musicTracks[desiredState];
    if (desiredState === "gameplay" && !desiredTrack) {
      if (state.currentState === "gameplay" && state.currentAudio) {
        queueMusicFadeOut(state.currentAudio, state.currentGain, false);
        state.currentAudio = null;
        state.currentGain = 0;
        state.currentTrack = "";
        state.currentState = "";
      }
    } else {
      playMusicTrack(desiredState, desiredTrack);
    }
    updateMusicFades(dt);
  }

  function unlockMusicPlayback() {
    if (state.unlocked) return;
    state.unlocked = true;
    updateMusicState();
  }

  return {
    getGameplayMusicTrack,
    isPlayerInCave,
    isPlayerInVillage,
    preloadMusicTracks,
    syncMusicVolume,
    stopMusic,
    unlockMusicPlayback,
    updateMusicState
  };
}
