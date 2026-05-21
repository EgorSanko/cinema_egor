import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, Pressable, StyleSheet, Dimensions, BackHandler, StatusBar,
  Alert, Platform, ActivityIndicator, TextInput, ScrollView, PanResponder,
  NativeModules,
} from 'react-native';

// PiP bridge — Android only, no-op on iOS. Flagging true while the player is
// mounted with a playing video gates whether MainActivity enters PiP on
// home-press.
const PipModule: { setPlaying?: (p: boolean) => void } = (NativeModules as any).PipModule || {};
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { Video, ResizeMode, AVPlaybackStatus, Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as NavigationBar from 'expo-navigation-bar';
import * as Brightness from 'expo-brightness';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useNavigation, useRoute } from '@react-navigation/native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import Slider from '@react-native-community/slider';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, FONTS, SPACING } from '../../constants/theme';
import { savePosition, addToHistory, getPosition, saveLastTranslator, recordTranslatorTry } from '../../utils/storage';
import { scheduleSyncToServer } from '../../utils/auth';
import { getStream, getSeasonEpisodes, isEpisodeReleased, type StreamData, type Episode } from '../../api/tmdb';
import { getWatchSocket, setWatchSocket } from '../../utils/watchSocket';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function PlayerScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const {
    streamData: initialStreamData, title: initialTitle, movieId, poster,
    season: initialSeason, episode: initialEpisode, type: mediaType, roomCode,
    searchTitle, year, totalSeasons, baseTitle,
  } = route.params as {
    streamData: StreamData;
    title: string;
    movieId: number;
    poster: string | null;
    season?: number;
    episode?: number;
    type?: 'movie' | 'tv';
    roomCode?: string;
    searchTitle?: string;
    year?: string;
    totalSeasons?: number;
    baseTitle?: string;
  };

  // Episode/season as STATE (not route param) so switching doesn't reset speed/translator
  const [currentSeason, setCurrentSeason] = useState<number | undefined>(initialSeason);
  const [currentEpisode, setCurrentEpisode] = useState<number | undefined>(initialEpisode);
  const [title, setTitle] = useState(initialTitle);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [episodeSwitchLoading, setEpisodeSwitchLoading] = useState(false);
  const [showEpisodesPanel, setShowEpisodesPanel] = useState(false);

  // Autoplay countdown state (TV only)
  const [autoplayCountdown, setAutoplayCountdown] = useState<number | null>(null);
  const autoplayTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoplayTriggeredRef = useRef(false);
  const hasNextEpisodeRef = useRef(false);

  const videoRef = useRef<Video>(null);
  const [streamData, setStreamData] = useState<StreamData>(initialStreamData);
  const [currentQuality, setCurrentQuality] = useState(initialStreamData.quality);
  const [currentTranslator, setCurrentTranslator] = useState(
    initialStreamData.translators.length > 0 ? initialStreamData.translators[0] : null
  );
  const [showUI, setShowUI] = useState(true);
  const [showQualityPanel, setShowQualityPanel] = useState(false);
  const [showSpeedPanel, setShowSpeedPanel] = useState(false);
  const [showTranslatorPanel, setShowTranslatorPanel] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPosition, setSeekPosition] = useState(0);
  const [videoError, setVideoError] = useState(false);
  const [locked, setLocked] = useState(false);
  const [resumeChecked, setResumeChecked] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [translatorLoading, setTranslatorLoading] = useState(false);
  const [seekIndicator, setSeekIndicator] = useState<'left' | 'right' | null>(null);

  // Gesture HUD state — vertical swipe on left half adjusts screen brightness,
  // right half adjusts video volume (system volume isn't programmable on iOS).
  const [brightnessHud, setBrightnessHud] = useState<number | null>(null);
  const [volumeHud, setVolumeHud] = useState<number | null>(null);
  const brightnessRef = useRef(0.8);
  const volumeRef = useRef(1);
  const hudTimerRef = useRef<any>(null);

  // Capture starting values when finger touches down so we accumulate deltas
  // rather than jumping to absolute positions.
  const gestureStartBrightnessRef = useRef(0.8);
  const gestureStartVolumeRef = useRef(1);

  // Watch Together chat & sync
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ id: string; author: string; text: string; timestamp: number; type: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const watchSocketRef = useRef(roomCode ? getWatchSocket() : null);
  const watchSocket = watchSocketRef.current;
  const ignoreRemoteRef = useRef(false);
  const isHostRef = useRef(false);

  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const positionRef = useRef(0);
  const durationRef = useRef(0);
  const qualityRef = useRef(currentQuality);
  const mountedRef = useRef(true);
  const lastTapRef = useRef<{ time: number; x: number }>({ time: 0, x: 0 });
  const seekIndicatorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentUrl = streamData.streams[currentQuality] || streamData.stream;

  useEffect(() => { activateKeepAwakeAsync(); return () => { deactivateKeepAwake(); }; }, []);

  // Mark player active for native PiP gating — only enter PiP on home-press
  // when we're actually on the player screen with a playing video.
  useEffect(() => {
    PipModule.setPlaying?.(isPlaying);
    return () => { PipModule.setPlaying?.(false); };
  }, [isPlaying]);

  // Detect PiP via window resize: in PiP Android resizes the activity to a
  // small floating window (<500px wide). This is the most reliable signal
  // across Android versions — DeviceEventEmitter from the Activity is
  // unreliable on new architecture / Hermes. When in PiP we hide all UI
  // overlays (controls, seek buttons, etc.) so the floating window shows
  // only the raw video, like YouTube does.
  const [windowW, setWindowW] = useState(Dimensions.get('window').width);
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => {
      setWindowW(window.width);
    });
    return () => { sub?.remove?.(); };
  }, []);
  const isInPip = windowW < 500;

  // Audio mode: keep playback alive when the activity goes background (so
  // PiP keeps playing video instead of freezing). On unmount we MUST flip
  // staysActiveInBackground back to false AND call pauseAsync+unloadAsync,
  // otherwise the audio session leaks after the player screen is destroyed
  // (this is what happened in 2.0.12 — audio kept playing after PiP close).
  useEffect(() => {
    Audio.setAudioModeAsync({
      staysActiveInBackground: true,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
      interruptionModeIOS: InterruptionModeIOS.DuckOthers,
      playThroughEarpieceAndroid: false,
      shouldDuckAndroid: true,
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
    }).catch(() => {});

    return () => {
      // Order matters: stop the source FIRST, then release the audio
      // session. Otherwise expo-av may keep a stale buffer playing while
      // we tear down the audio mode.
      (async () => {
        try { await videoRef.current?.pauseAsync(); } catch {}
        try { await videoRef.current?.unloadAsync(); } catch {}
        try {
          await Audio.setAudioModeAsync({
            staysActiveInBackground: false,
            interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
            interruptionModeIOS: InterruptionModeIOS.DoNotMix,
            playThroughEarpieceAndroid: false,
            shouldDuckAndroid: false,
            allowsRecordingIOS: false,
            playsInSilentModeIOS: false,
          });
        } catch {}
      })();
    };
  }, []);

  // Record current translator for Polyglot achievement whenever it changes
  useEffect(() => {
    if (currentTranslator?.name) recordTranslatorTry(currentTranslator.name);
  }, [currentTranslator?.name]);

  // Keep refs in sync
  useEffect(() => { positionRef.current = position; }, [position]);
  useEffect(() => { durationRef.current = duration; }, [duration]);
  useEffect(() => { qualityRef.current = currentQuality; }, [currentQuality]);

  // Orientation lock + immersive mode
  useEffect(() => {
    mountedRef.current = true;
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    StatusBar.setHidden(true);
    if (Platform.OS === 'android') {
      NavigationBar.setVisibilityAsync('hidden');
      NavigationBar.setBehaviorAsync('overlay-swipe');
    }
    return () => {
      mountedRef.current = false;
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      StatusBar.setHidden(false);
      if (Platform.OS === 'android') {
        NavigationBar.setVisibilityAsync('visible');
      }
    };
  }, []);

  // Check resume position
  useEffect(() => {
    if (resumeChecked) return;
    (async () => {
      const saved = await getPosition(movieId, mediaType === 'tv' && currentSeason && currentEpisode ? `tv_s${currentSeason}e${currentEpisode}` : 'movie');
      if (saved && saved.time > 10 && saved.duration > 0) {
        const pct = (saved.time / saved.duration * 100).toFixed(0);
        if (Number(pct) < 95) {
          const mins = Math.floor(saved.time / 60);
          const secs = Math.floor(saved.time % 60);
          Alert.alert(
            'Продолжить просмотр?',
            `Вы остановились на ${mins}:${String(secs).padStart(2, '0')} (${pct}%)`,
            [
              { text: 'С начала', style: 'cancel' },
              {
                text: 'Продолжить',
                onPress: async () => {
                  await videoRef.current?.setPositionAsync(saved.time * 1000);
                },
              },
            ]
          );
        }
      }
      setResumeChecked(true);
    })();
  }, [movieId, resumeChecked]);

  // Auto-hide UI
  useEffect(() => {
    if (showUI && !locked) {
      hideTimerRef.current = setTimeout(() => {
        if (mountedRef.current) {
          setShowUI(false);
          setShowQualityPanel(false);
          setShowSpeedPanel(false);
          setShowTranslatorPanel(false);
        }
      }, 5000);
    }
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [showUI, locked]);

  // Periodic save
  useEffect(() => {
    const posType = mediaType === 'tv' && currentSeason && currentEpisode ? `tv_s${currentSeason}e${currentEpisode}` : 'movie';
    saveTimerRef.current = setInterval(() => {
      const pos = positionRef.current;
      const dur = durationRef.current;
      if (pos > 0 && dur > 0) {
        savePosition(movieId, posType, pos / 1000, dur / 1000);
        addToHistory({
          id: movieId, type: mediaType || 'movie', title,
          poster_path: poster, vote_average: 0,
          watchedAt: Date.now(),
          progress: pos / 1000, duration: dur / 1000,
          quality: qualityRef.current, addedAt: Date.now(),
          season: currentSeason, episode: currentEpisode,
          translatorName: currentTranslator?.name,
          translatorId: currentTranslator?.id,
        });
      }
    }, 15000);
    return () => {
      if (saveTimerRef.current) clearInterval(saveTimerRef.current);
    };
  }, [movieId, title, poster, currentSeason, currentEpisode, mediaType]);

  // Watch Together chat
  useEffect(() => {
    if (!watchSocket || !roomCode) return;
    const handler = (msg: any) => {
      setChatMessages(prev => [...prev.slice(-49), msg]);
    };
    watchSocket.on('chat-message', handler);
    return () => { watchSocket.off('chat-message', handler); };
  }, [roomCode]);

  // Watch Together sync — play/pause/seek from other users
  useEffect(() => {
    if (!watchSocket || !roomCode) return;

    const onPlay = (data: { time: number; by: string }) => {
      ignoreRemoteRef.current = true;
      videoRef.current?.setPositionAsync(data.time * 1000);
      videoRef.current?.playAsync();
      setTimeout(() => { ignoreRemoteRef.current = false; }, 500);
    };
    const onPause = (data: { time: number; by: string }) => {
      ignoreRemoteRef.current = true;
      videoRef.current?.pauseAsync();
      videoRef.current?.setPositionAsync(data.time * 1000);
      setTimeout(() => { ignoreRemoteRef.current = false; }, 500);
    };
    const onSeek = (data: { time: number; by: string }) => {
      ignoreRemoteRef.current = true;
      videoRef.current?.setPositionAsync(data.time * 1000);
      setTimeout(() => { ignoreRemoteRef.current = false; }, 1000);
    };
    const onHeartbeat = (data: { time: number; state: string }) => {
      if (isHostRef.current) return;
      const currentPos = positionRef.current / 1000;
      const diff = Math.abs(currentPos - data.time);
      if (diff > 3) {
        ignoreRemoteRef.current = true;
        videoRef.current?.setPositionAsync(data.time * 1000);
        setTimeout(() => { ignoreRemoteRef.current = false; }, 500);
      }
    };

    watchSocket.on('player-play', onPlay);
    watchSocket.on('player-pause', onPause);
    watchSocket.on('player-seek', onSeek);
    watchSocket.on('sync-heartbeat', onHeartbeat);

    return () => {
      watchSocket.off('player-play', onPlay);
      watchSocket.off('player-pause', onPause);
      watchSocket.off('player-seek', onSeek);
      watchSocket.off('sync-heartbeat', onHeartbeat);
    };
  }, [roomCode]);

  // Watch Together heartbeat — host sends position every 5s
  useEffect(() => {
    if (!watchSocket || !roomCode) return;
    // Check if we're host (our socket.id matches room's hostId)
    // Simple heuristic: the one who created the room is host
    const timer = setInterval(() => {
      if (!watchSocket.connected) return;
      const pos = positionRef.current / 1000;
      watchSocket.emit('sync-heartbeat', {
        time: pos,
        state: isPlaying ? 'playing' : 'paused',
      });
    }, 5000);
    return () => clearInterval(timer);
  }, [roomCode, isPlaying]);

  const sendChatMessage = () => {
    if (!chatInput.trim() || !watchSocket) return;
    watchSocket.emit('chat-message', { text: chatInput.trim() });
    setChatInput('');
  };

  // Back handler
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });
    return () => handler.remove();
  }, []);

  const handleBack = useCallback(() => {
    const pos = positionRef.current;
    const dur = durationRef.current;
    const posType = mediaType === 'tv' && currentSeason && currentEpisode ? `tv_s${currentSeason}e${currentEpisode}` : 'movie';
    if (pos > 0 && dur > 0) {
      savePosition(movieId, posType, pos / 1000, dur / 1000);
    }
    scheduleSyncToServer();
    // Clean up Watch Together socket when leaving player
    if (watchSocketRef.current && roomCode) {
      watchSocketRef.current.emit('leave-room');
      watchSocketRef.current.disconnect();
      watchSocketRef.current = null;
      setWatchSocket(null);
    }
    nav.goBack();
  }, [movieId, nav, currentSeason, currentEpisode, mediaType, roomCode]);

  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    if (!mountedRef.current) return;
    setIsPlaying(status.isPlaying);
    // Only show buffering when actually buffering AND not yet playing
    // Once video has played at least once, don't show buffering overlay
    if (status.isPlaying) {
      setIsBuffering(false);
    } else if (status.isBuffering && !status.isPlaying && status.positionMillis === 0) {
      setIsBuffering(true);
    } else {
      setIsBuffering(false);
    }
    if (!isSeeking) {
      setPosition(status.positionMillis);
    }
    setDuration(status.durationMillis || 0);

    // === AUTOPLAY NEXT EPISODE ===
    // Show 10-second countdown when ≤10s remain (so user has chance to cancel)
    // OR on natural end (covers cases where progress jumps over the threshold).
    if (mediaType === 'tv' && hasNextEpisodeRef.current && !autoplayTriggeredRef.current) {
      const dur = status.durationMillis || 0;
      const pos = status.positionMillis || 0;
      const remaining = dur - pos;
      const justFinished = (status as any).didJustFinish;
      // Only trigger by-time on episodes longer than 90s (avoid trailers/clips)
      if (justFinished || (remaining > 0 && remaining <= 10000 && dur > 90000)) {
        autoplayTriggeredRef.current = true;
        startAutoplayCountdown();
      }
    }
  }, [isSeeking, mediaType]);

  const startAutoplayCountdown = () => {
    setAutoplayCountdown(10);
    if (autoplayTimerRef.current) clearInterval(autoplayTimerRef.current);
    autoplayTimerRef.current = setInterval(() => {
      setAutoplayCountdown(prev => {
        if (prev === null) return null;
        if (prev <= 1) {
          if (autoplayTimerRef.current) clearInterval(autoplayTimerRef.current);
          // Fire next episode
          setTimeout(() => goToNextEpisode(), 0);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const cancelAutoplay = () => {
    if (autoplayTimerRef.current) clearInterval(autoplayTimerRef.current);
    autoplayTimerRef.current = null;
    setAutoplayCountdown(null);
  };

  // Reset autoplay trigger when episode changes
  useEffect(() => {
    autoplayTriggeredRef.current = false;
    cancelAutoplay();
  }, [currentEpisode, currentSeason]);

  // Cleanup autoplay timer on unmount
  useEffect(() => {
    return () => {
      if (autoplayTimerRef.current) clearInterval(autoplayTimerRef.current);
    };
  }, []);

  const toggleUI = () => {
    if (locked) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowUI(prev => !prev);
    setShowQualityPanel(false);
    setShowSpeedPanel(false);
    setShowTranslatorPanel(false);
  };

  const togglePlay = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isPlaying) {
      await videoRef.current?.pauseAsync();
      if (watchSocket && roomCode && !ignoreRemoteRef.current) {
        watchSocket.emit('player-pause', { time: positionRef.current / 1000 });
      }
    } else {
      await videoRef.current?.playAsync();
      if (watchSocket && roomCode && !ignoreRemoteRef.current) {
        watchSocket.emit('player-play', { time: positionRef.current / 1000 });
      }
    }
  };

  const seek = async (deltaMs: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Read the live position from the player itself — `position` in scope is
    // captured by useCallback closures (e.g. the double-tap handler) and lags
    // behind the actual playback time, which caused seek(-10000) at t=600s
    // to use position=0 → newPos=0 → restart from start.
    const status = await videoRef.current?.getStatusAsync();
    const livePos = (status && 'positionMillis' in status) ? status.positionMillis : position;
    const liveDur = (status && 'durationMillis' in status && status.durationMillis) ? status.durationMillis : duration;
    const newPos = Math.max(0, Math.min(livePos + deltaMs, liveDur));
    await videoRef.current?.setPositionAsync(newPos);
    if (watchSocket && roomCode && !ignoreRemoteRef.current) {
      watchSocket.emit('player-seek', { time: newPos / 1000 });
    }
  };

  const onSliderStart = () => {
    setIsSeeking(true);
    setSeekPosition(position);
  };

  const onSliderChange = (value: number) => {
    setSeekPosition(value);
  };

  const onSliderComplete = async (value: number) => {
    await videoRef.current?.setPositionAsync(value);
    setPosition(value);
    setIsSeeking(false);
    if (watchSocket && roomCode) {
      watchSocket.emit('player-seek', { time: value / 1000 });
    }
  };

  const changeQuality = async (q: string) => {
    if (q === currentQuality) return;
    const savedPos = position;
    setCurrentQuality(q);
    setShowQualityPanel(false);
    setIsBuffering(true);
    setTimeout(async () => {
      await videoRef.current?.setPositionAsync(savedPos);
      await videoRef.current?.playAsync();
    }, 1000);
  };

  const changeSpeed = async (s: number) => {
    setSpeed(s);
    setShowSpeedPanel(false);
    // expo-av occasionally swallows setRateAsync if called during a state-
    // transition tick. Belt-and-suspenders: try now AND again after the
    // next render flush. shouldCorrectPitch=true keeps voice natural at
    // non-1x speeds.
    try { await videoRef.current?.setRateAsync(s, true); } catch {}
    setTimeout(() => {
      videoRef.current?.setRateAsync(s, true).catch(() => {});
    }, 150);
  };

  // Actually re-fetch the stream when translator changes
  const changeTranslator = async (translator: { id: number; name: string }) => {
    if (translator.id === currentTranslator?.id) return;
    setTranslatorLoading(true);
    setShowTranslatorPanel(false);
    const savedPos = position;
    try {
      const opts: any = { translator_id: translator.id };
      if (currentSeason) opts.season = currentSeason;
      if (currentEpisode) opts.episode = currentEpisode;
      const searchQ = searchTitle || title.replace(/\sS\d+E\d+$/, '');
      const data = await getStream(searchQ, year || '', mediaType || 'movie', opts);
      if (data.stream) {
        setStreamData(data);
        setCurrentQuality(data.quality);
        setCurrentTranslator(translator);
        // Persist user's translator choice for this title
        saveLastTranslator(movieId, mediaType || 'movie', translator.id, translator.name);
        setIsBuffering(true);
        // Restore position after stream loads
        setTimeout(async () => {
          try {
            await videoRef.current?.setPositionAsync(savedPos);
            await videoRef.current?.playAsync();
          } catch {}
        }, 1500);
      } else {
        Alert.alert('Ошибка', 'Озвучка недоступна');
      }
    } catch {
      Alert.alert('Ошибка', 'Не удалось переключить озвучку');
    }
    setTranslatorLoading(false);
  };

  const toggleLock = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLocked(prev => !prev);
    setShowQualityPanel(false);
    setShowSpeedPanel(false);
    setShowTranslatorPanel(false);
  };

  // === Episode list loader (TV only) ===
  useEffect(() => {
    if (mediaType !== 'tv' || !currentSeason) return;
    let cancelled = false;
    setEpisodesLoading(true);
    getSeasonEpisodes(movieId, currentSeason)
      .then(eps => { if (!cancelled) setEpisodes(eps); })
      .catch(() => { if (!cancelled) setEpisodes([]); })
      .finally(() => { if (!cancelled) setEpisodesLoading(false); });
    return () => { cancelled = true; };
  }, [movieId, currentSeason, mediaType]);

  // Released episodes only — filters out future air dates
  const releasedEpisodes = episodes.filter(isEpisodeReleased);

  const findNextEpisode = useCallback((): { season: number; episode: number } | null => {
    if (mediaType !== 'tv' || !currentSeason || !currentEpisode) return null;
    const idx = releasedEpisodes.findIndex(e => e.episode_number === currentEpisode);
    if (idx >= 0 && idx < releasedEpisodes.length - 1) {
      return { season: currentSeason, episode: releasedEpisodes[idx + 1].episode_number };
    }
    if (totalSeasons && currentSeason < totalSeasons) {
      return { season: currentSeason + 1, episode: 1 };
    }
    return null;
  }, [releasedEpisodes, currentSeason, currentEpisode, mediaType, totalSeasons]);

  const findPrevEpisode = useCallback((): { season: number; episode: number } | null => {
    if (mediaType !== 'tv' || !currentSeason || !currentEpisode) return null;
    const idx = releasedEpisodes.findIndex(e => e.episode_number === currentEpisode);
    if (idx > 0) {
      return { season: currentSeason, episode: releasedEpisodes[idx - 1].episode_number };
    }
    if (currentSeason > 1) {
      // Jump to previous season — we don't know last episode count, plumb through next time
      return { season: currentSeason - 1, episode: 1 };
    }
    return null;
  }, [releasedEpisodes, currentSeason, currentEpisode, mediaType]);

  const goToEpisode = async (season: number, episode: number) => {
    if (mediaType !== 'tv') return;
    if (!searchTitle) {
      Alert.alert('Ошибка', 'Не хватает данных для переключения серии. Перезайдите в фильм.');
      return;
    }
    setEpisodeSwitchLoading(true);
    setShowEpisodesPanel(false);
    try {
      const opts: any = { season, episode };
      if (currentTranslator) opts.translator_id = currentTranslator.id;
      const data = await getStream(searchTitle, year || '', 'tv', opts);
      if (data.stream) {
        // Save current position before switch
        const pos = positionRef.current;
        const dur = durationRef.current;
        if (pos > 0 && dur > 0 && currentSeason && currentEpisode) {
          savePosition(movieId, `tv_s${currentSeason}e${currentEpisode}`, pos / 1000, dur / 1000);
        }

        // Reset position refs IMMEDIATELY so the periodic save timer (which
        // runs on intervals and reads positionRef directly) doesn't write
        // the previous episode's position under the new episode key. This
        // was the root of "next episode starts from previous episode time"
        // bug: timer fired between state updates and saved 120s under
        // `tv_s${newSeason}e${newEpisode}`, then resume-modal asked to
        // continue from 2 min on a freshly-opened episode.
        positionRef.current = 0;
        durationRef.current = 0;

        // Mark resumeChecked=true so the resume modal does NOT fire for a
        // brand-new episode the user just chose explicitly — autoplay /
        // manual "next" both mean: start from 0.
        setStreamData(data);
        setCurrentQuality(data.quality);
        setCurrentSeason(season);
        setCurrentEpisode(episode);
        setTitle(`${baseTitle || initialTitle.replace(/\sS\d+E\d+$/, '')} S${season}E${episode}`);
        setPosition(0);
        setIsBuffering(true);
        setResumeChecked(true); // skip resume modal — new episode = start from 0
        autoplayTriggeredRef.current = false; // re-arm autoplay for this new ep

        // Try to keep the same translator if available in new stream
        if (currentTranslator) {
          const sameTr = data.translators.find(t => t.id === currentTranslator.id);
          if (sameTr) setCurrentTranslator(sameTr);
          else if (data.translators.length > 0) setCurrentTranslator(data.translators[0]);
        }
      } else {
        Alert.alert('Серия недоступна', 'Не удалось найти этот эпизод. Возможно, он ещё не вышел.');
      }
    } catch {
      Alert.alert('Ошибка', 'Не удалось переключить серию');
    } finally {
      setEpisodeSwitchLoading(false);
    }
  };

  const goToNextEpisode = () => {
    const next = findNextEpisode();
    if (next) goToEpisode(next.season, next.episode);
    else Alert.alert('Конец', 'Это последняя доступная серия');
  };

  const goToPrevEpisode = () => {
    const prev = findPrevEpisode();
    if (prev) goToEpisode(prev.season, prev.episode);
  };

  const hasNextEpisode = findNextEpisode() !== null;
  const hasPrevEpisode = findPrevEpisode() !== null;

  // Keep ref in sync for use inside onPlaybackStatusUpdate callback
  useEffect(() => { hasNextEpisodeRef.current = hasNextEpisode; }, [hasNextEpisode]);

  const formatTime = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  // Read initial screen brightness once so the first swipe doesn't jump.
  useEffect(() => {
    (async () => {
      try {
        const cur = await Brightness.getBrightnessAsync();
        brightnessRef.current = cur;
      } catch {}
    })();
  }, []);

  const showHud = (kind: 'brightness' | 'volume', value: number) => {
    if (kind === 'brightness') setBrightnessHud(value);
    else setVolumeHud(value);
    if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    hudTimerRef.current = setTimeout(() => {
      setBrightnessHud(null);
      setVolumeHud(null);
    }, 700);
  };

  // Composed gesture: vertical pan adjusts brightness (left half) or volume
  // (right half); single/double taps are handled by the same surface so they
  // don't fight with the pan. Uses react-native-gesture-handler v2 — proper
  // composition that PanResponder + absoluteFill <Pressable> couldn't deliver
  // (the Pressable was eating touchdown before pan could claim).
  const handleTapStart = useCallback((tapX: number) => {
    const now = Date.now();
    const last = lastTapRef.current;
    const isDoubleTap = now - last.time < 300 && Math.abs(last.x - tapX) < 60;
    if (isDoubleTap && !locked) {
      if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
      const screenW = Dimensions.get('window').width;
      if (tapX < screenW / 2) {
        seek(-10000);
        setSeekIndicator('left');
      } else {
        seek(10000);
        setSeekIndicator('right');
      }
      if (seekIndicatorTimer.current) clearTimeout(seekIndicatorTimer.current);
      seekIndicatorTimer.current = setTimeout(() => setSeekIndicator(null), 700);
      lastTapRef.current = { time: 0, x: 0 };
    } else {
      lastTapRef.current = { time: now, x: tapX };
      singleTapTimer.current = setTimeout(() => {
        toggleUI();
      }, 300);
    }
  }, [locked]);

  const handlePanStart = useCallback((x: number) => {
    const screenW = Dimensions.get('window').width;
    if (x < screenW / 2) {
      gestureStartBrightnessRef.current = brightnessRef.current;
    } else {
      gestureStartVolumeRef.current = volumeRef.current;
    }
  }, []);

  const handlePanUpdate = useCallback((x: number, translationY: number) => {
    const screenW = Dimensions.get('window').width;
    // Pixels-to-fraction: ~250px finger travel covers the full 0-1 range.
    if (x < screenW / 2) {
      const next = Math.max(0, Math.min(1, gestureStartBrightnessRef.current - translationY / 250));
      brightnessRef.current = next;
      Brightness.setBrightnessAsync(next).catch(() => {});
      showHud('brightness', next);
    } else {
      const next = Math.max(0, Math.min(1, gestureStartVolumeRef.current - translationY / 250));
      volumeRef.current = next;
      videoRef.current?.setVolumeAsync(next).catch(() => {});
      showHud('volume', next);
    }
  }, []);

  const playerGesture = useMemo(() => {
    const tap = Gesture.Tap()
      .maxDuration(250)
      .onEnd((e) => { runOnJS(handleTapStart)(e.x); });
    const pan = Gesture.Pan()
      .enabled(!locked)
      // Require 10px of vertical movement before claiming — preserves taps
      .activeOffsetY([-10, 10])
      .failOffsetX([-20, 20])
      .onStart((e) => { runOnJS(handlePanStart)(e.x); })
      .onUpdate((e) => { runOnJS(handlePanUpdate)(e.x, e.translationY); });
    return Gesture.Race(pan, tap);
  }, [handleTapStart, handlePanStart, handlePanUpdate, locked]);

  const displayPosition = isSeeking ? seekPosition : position;

  return (
    <View style={styles.container}>
      <Video
        ref={videoRef}
        key={`${currentQuality}_${currentTranslator?.id}_${currentSeason}_${currentEpisode}`}
        source={{ uri: currentUrl }}
        style={StyleSheet.absoluteFill}
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay
        rate={speed}
        onPlaybackStatusUpdate={onPlaybackStatusUpdate}
        onError={(e) => {
          console.warn('Video error:', e);
          if (mountedRef.current) setVideoError(true);
        }}
        onLoad={() => {
          if (mountedRef.current) setIsBuffering(false);
        }}
      />

      {/* PiP-mode kills all overlays — Android shrinks our activity into a
          floating window and the React Native controls (seek buttons, pause,
          translator panel, etc.) would otherwise be visible inside it. In
          PiP only the raw <Video> stays mounted; the native PiP frame draws
          its own play/pause overlay when the user taps the window. */}
      {!isInPip && (<>

      {/* Brightness HUD */}
      {brightnessHud !== null && (
        <Animated.View entering={FadeIn.duration(120)} style={styles.gestureHud}>
          <Ionicons name="sunny" size={26} color="#fff" />
          <View style={styles.gestureBar}>
            <View style={[styles.gestureBarFill, { width: `${Math.round(brightnessHud * 100)}%` }]} />
          </View>
          <Text style={styles.gestureHudText}>{Math.round(brightnessHud * 100)}%</Text>
        </Animated.View>
      )}

      {/* Volume HUD */}
      {volumeHud !== null && (
        <Animated.View entering={FadeIn.duration(120)} style={[styles.gestureHud, { right: 32, left: undefined }]}>
          <Ionicons name={volumeHud > 0.5 ? 'volume-high' : volumeHud > 0 ? 'volume-low' : 'volume-mute'} size={26} color="#fff" />
          <View style={styles.gestureBar}>
            <View style={[styles.gestureBarFill, { width: `${Math.round(volumeHud * 100)}%` }]} />
          </View>
          <Text style={styles.gestureHudText}>{Math.round(volumeHud * 100)}%</Text>
        </Animated.View>
      )}

      {/* Loading/buffering indicator */}
      {(isBuffering || translatorLoading || episodeSwitchLoading) && !videoError && (
        <View style={styles.bufferingOverlay}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          {translatorLoading && <Text style={styles.bufferingText}>Загрузка озвучки...</Text>}
          {episodeSwitchLoading && <Text style={styles.bufferingText}>Загрузка серии...</Text>}
        </View>
      )}

      {/* Autoplay countdown overlay */}
      {autoplayCountdown !== null && hasNextEpisode && (
        <Animated.View entering={FadeIn.duration(200)} style={styles.autoplayOverlay}>
          <View style={styles.autoplayCard}>
            <Text style={styles.autoplayLabel}>Следующая серия через</Text>
            <Text style={styles.autoplayCountdown}>{autoplayCountdown}</Text>
            <View style={styles.autoplayActions}>
              <Pressable
                onPress={() => { cancelAutoplay(); goToNextEpisode(); }}
                style={[styles.autoplayBtn, { backgroundColor: COLORS.primary }]}
              >
                <Ionicons name="play" size={16} color="#000" />
                <Text style={[styles.autoplayBtnText, { color: '#000' }]}>Смотреть сейчас</Text>
              </Pressable>
              <Pressable onPress={cancelAutoplay} style={styles.autoplayBtn}>
                <Ionicons name="close" size={16} color="#fff" />
                <Text style={styles.autoplayBtnText}>Отмена</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      )}

      {videoError && (
        <View style={styles.errorOverlay}>
          <Ionicons name="alert-circle-outline" size={48} color={COLORS.primary} />
          <Text style={styles.errorText}>Ошибка загрузки видео</Text>
          <Text style={styles.errorSubtext}>Возможно, контент ещё не вышел в онлайн-кинотеатрах</Text>
          <Pressable onPress={() => { setVideoError(false); setIsBuffering(true); }} style={styles.errorBtn}>
            <Ionicons name="refresh" size={18} color="#fff" />
            <Text style={styles.errorBtnText}>Повторить</Text>
          </Pressable>
          <Pressable onPress={handleBack} style={[styles.errorBtn, { backgroundColor: COLORS.bgElevated, marginTop: 8 }]}>
            <Ionicons name="arrow-back" size={18} color="#fff" />
            <Text style={styles.errorBtnText}>Назад</Text>
          </Pressable>
        </View>
      )}

      {/* Unified touch surface: vertical pan = brightness/volume, taps = UI toggle
          or double-tap seek. See playerGesture composition above. */}
      <GestureDetector gesture={playerGesture}>
        <View style={StyleSheet.absoluteFill} pointerEvents="box-only" />
      </GestureDetector>

      {/* Seek indicator overlay */}
      {seekIndicator && (
        <Animated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(300)}
          style={[
            styles.seekIndicatorOverlay,
            seekIndicator === 'left' ? { left: 0, right: '50%' } : { left: '50%', right: 0 },
          ]}
          pointerEvents="none"
        >
          <Ionicons
            name={seekIndicator === 'left' ? 'play-back' : 'play-forward'}
            size={36}
            color="rgba(255,255,255,0.9)"
          />
          <Text style={styles.seekIndicatorText}>10 сек</Text>
        </Animated.View>
      )}

      {/* Locked indicator */}
      {locked && !showUI && (
        <Pressable
          onPress={() => { setShowUI(true); }}
          style={styles.lockHint}
        >
          <Ionicons name="lock-closed" size={18} color="rgba(255,255,255,0.6)" />
        </Pressable>
      )}

      {showUI && (
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={styles.overlay} pointerEvents="box-none">
          {/* Top bar */}
          <View style={styles.topBar}>
            {!locked && (
              <Pressable onPress={handleBack} style={styles.iconBtn} hitSlop={12}>
                <Ionicons name="arrow-back" size={22} color="#fff" />
              </Pressable>
            )}
            <Text style={styles.topTitle} numberOfLines={1}>{title}</Text>
            <Pressable onPress={toggleLock} style={styles.iconBtn} hitSlop={12}>
              <Ionicons name={locked ? 'lock-closed' : 'lock-open'} size={20} color="#fff" />
            </Pressable>
          </View>

          {!locked && (
            <>
              {/* Center controls */}
              <View style={styles.centerControls}>
                <Pressable onPress={() => seek(-10000)} style={styles.seekBtn}>
                  <Ionicons name="play-back" size={22} color="#fff" />
                  <Text style={styles.seekLabel}>10</Text>
                </Pressable>
                <Pressable onPress={togglePlay} style={styles.playPauseBtn}>
                  <Ionicons name={isPlaying ? 'pause' : 'play'} size={36} color="#fff" />
                </Pressable>
                <Pressable onPress={() => seek(10000)} style={styles.seekBtn}>
                  <Ionicons name="play-forward" size={22} color="#fff" />
                  <Text style={styles.seekLabel}>10</Text>
                </Pressable>
              </View>

              {/* Bottom bar */}
              <View style={styles.bottomBar}>
                {/* Progress slider */}
                <View style={styles.progressRow}>
                  <Text style={styles.timeText}>{formatTime(displayPosition)}</Text>
                  <Slider
                    style={styles.slider}
                    minimumValue={0}
                    maximumValue={Math.max(duration, 1)}
                    value={displayPosition}
                    onSlidingStart={onSliderStart}
                    onValueChange={onSliderChange}
                    onSlidingComplete={onSliderComplete}
                    minimumTrackTintColor={COLORS.primary}
                    maximumTrackTintColor="rgba(255,255,255,0.3)"
                    thumbTintColor={COLORS.primary}
                  />
                  <Text style={styles.timeText}>{formatTime(duration)}</Text>
                </View>

                <View style={styles.bottomControls}>
                  {/* Quality */}
                  <Pressable
                    onPress={() => { setShowQualityPanel(!showQualityPanel); setShowSpeedPanel(false); setShowTranslatorPanel(false); }}
                    style={styles.controlBtn}
                  >
                    <Ionicons name="settings-outline" size={14} color="#fff" />
                    <Text style={styles.controlText}>{currentQuality}</Text>
                  </Pressable>

                  {/* Speed */}
                  <Pressable
                    onPress={() => { setShowSpeedPanel(!showSpeedPanel); setShowQualityPanel(false); setShowTranslatorPanel(false); }}
                    style={styles.controlBtn}
                  >
                    <Ionicons name="speedometer-outline" size={14} color="#fff" />
                    <Text style={styles.controlText}>{speed}x</Text>
                  </Pressable>

                  {/* Translator */}
                  {streamData.translators.length > 1 && (
                    <Pressable
                      onPress={() => { setShowTranslatorPanel(!showTranslatorPanel); setShowQualityPanel(false); setShowSpeedPanel(false); setShowEpisodesPanel(false); }}
                      style={styles.controlBtn}
                    >
                      <Ionicons name="mic-outline" size={14} color="#fff" />
                      <Text style={styles.controlText} numberOfLines={1}>
                        {currentTranslator?.name || 'Озвучка'}
                      </Text>
                    </Pressable>
                  )}

                  {/* Episode navigation (TV only) */}
                  {mediaType === 'tv' && currentSeason && currentEpisode && (
                    <>
                      <Pressable
                        onPress={goToPrevEpisode}
                        disabled={!hasPrevEpisode}
                        style={[styles.controlBtn, !hasPrevEpisode && { opacity: 0.4 }]}
                        hitSlop={8}
                      >
                        <Ionicons name="play-skip-back" size={14} color="#fff" />
                      </Pressable>

                      <Pressable
                        onPress={() => { setShowEpisodesPanel(!showEpisodesPanel); setShowQualityPanel(false); setShowSpeedPanel(false); setShowTranslatorPanel(false); }}
                        style={styles.controlBtn}
                      >
                        <Ionicons name="list-outline" size={14} color="#fff" />
                        <Text style={styles.controlText} numberOfLines={1}>
                          S{currentSeason}E{currentEpisode}
                        </Text>
                      </Pressable>

                      <Pressable
                        onPress={goToNextEpisode}
                        disabled={!hasNextEpisode}
                        style={[styles.controlBtn, !hasNextEpisode && { opacity: 0.4 }]}
                        hitSlop={8}
                      >
                        <Ionicons name="play-skip-forward" size={14} color="#fff" />
                      </Pressable>
                    </>
                  )}
                </View>
              </View>

              {/* Quality panel */}
              {showQualityPanel && (
                <Animated.View entering={FadeIn.duration(150)} style={styles.panel}>
                  <Text style={styles.panelTitle}>Качество</Text>
                  <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
                    {streamData.qualities.map(q => (
                      <Pressable
                        key={q}
                        onPress={() => changeQuality(q)}
                        style={[styles.panelItem, q === currentQuality && styles.panelItemActive]}
                      >
                        <Text style={[styles.panelText, q === currentQuality && styles.panelTextActive]}>
                          {q === currentQuality ? '✓ ' : ''}{q}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </Animated.View>
              )}

              {/* Speed panel */}
              {showSpeedPanel && (
                <Animated.View entering={FadeIn.duration(150)} style={[styles.panel, { left: undefined, right: SPACING.xl }]}>
                  <Text style={styles.panelTitle}>Скорость</Text>
                  <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
                    {SPEED_OPTIONS.map(s => (
                      <Pressable
                        key={s}
                        onPress={() => changeSpeed(s)}
                        style={[styles.panelItem, s === speed && styles.panelItemActive]}
                      >
                        <Text style={[styles.panelText, s === speed && styles.panelTextActive]}>
                          {s === speed ? '✓ ' : ''}{s}x
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </Animated.View>
              )}

              {/* Translator panel */}
              {showTranslatorPanel && (
                <Animated.View entering={FadeIn.duration(150)} style={[styles.panel, { minWidth: 240 }]}>
                  <Text style={styles.panelTitle}>Озвучка</Text>
                  <ScrollView showsVerticalScrollIndicator={true} bounces={false}>
                    {/* Dedupe by id — backend occasionally returns the same translator
                        twice (e.g. when HDRezka has theatrical + director's-cut entries
                        with identical ids); without this, ✓ check shows on both rows. */}
                    {Array.from(new Map(streamData.translators.map(t => [t.id, t])).values()).map(t => (
                      <Pressable
                        key={t.id}
                        onPress={() => changeTranslator(t)}
                        style={[styles.panelItem, t.id === currentTranslator?.id && styles.panelItemActive]}
                      >
                        <Text style={[styles.panelText, t.id === currentTranslator?.id && styles.panelTextActive]} numberOfLines={1}>
                          {t.id === currentTranslator?.id ? '✓ ' : ''}{(t as any).is_premium ? '🔒 ' : ''}{t.name}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </Animated.View>
              )}

              {/* Episodes panel (TV only) */}
              {showEpisodesPanel && mediaType === 'tv' && (
                <Animated.View entering={FadeIn.duration(150)} style={[styles.panel, { minWidth: 240, maxHeight: 280 }]}>
                  <Text style={styles.panelTitle}>Сезон {currentSeason} — серии</Text>
                  {episodesLoading ? (
                    <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 12 }} />
                  ) : (
                    <ScrollView showsVerticalScrollIndicator={false}>
                      {episodes.map(ep => {
                        const released = isEpisodeReleased(ep);
                        const isActive = ep.episode_number === currentEpisode;
                        return (
                          <Pressable
                            key={ep.id}
                            onPress={() => released && goToEpisode(currentSeason!, ep.episode_number)}
                            disabled={!released}
                            style={[styles.panelItem, isActive && styles.panelItemActive, !released && { opacity: 0.4 }]}
                          >
                            <Text style={[styles.panelText, isActive && styles.panelTextActive]} numberOfLines={1}>
                              {isActive ? '✓ ' : !released ? '🔒 ' : ''}E{ep.episode_number} {ep.name ? `· ${ep.name}` : ''}
                              {!released && ep.air_date ? ` (${new Date(ep.air_date).toLocaleDateString('ru-RU')})` : ''}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  )}
                </Animated.View>
              )}
            </>
          )}
        </Animated.View>
      )}

      {/* Watch Together chat button */}
      {roomCode && !showChat && (
        <Pressable
          onPress={() => setShowChat(true)}
          style={styles.chatFloatingBtn}
        >
          <Ionicons name="chatbubbles" size={22} color="#fff" />
          {chatMessages.length > 0 && (
            <View style={styles.chatBadge}>
              <Text style={styles.chatBadgeText}>{Math.min(chatMessages.length, 99)}</Text>
            </View>
          )}
        </Pressable>
      )}

      {/* Watch Together chat overlay */}
      {roomCode && showChat && (
        <Animated.View entering={FadeIn.duration(200)} style={styles.chatOverlay}>
          <View style={styles.chatOverlayHeader}>
            <Text style={styles.chatOverlayTitle}>Чат</Text>
            <Pressable onPress={() => setShowChat(false)} hitSlop={12}>
              <Ionicons name="close" size={22} color="#fff" />
            </Pressable>
          </View>
          <ScrollView style={styles.chatOverlayMessages} contentContainerStyle={{ paddingBottom: 8 }}>
            {chatMessages.map(msg => (
              <View key={msg.id} style={msg.type === 'system' ? styles.chatSysMsg : styles.chatUserMsg}>
                {msg.type === 'system' ? (
                  <Text style={styles.chatSysText}>{msg.text}</Text>
                ) : (
                  <>
                    <Text style={styles.chatMsgAuthor}>{msg.author}</Text>
                    <Text style={styles.chatMsgText}>{msg.text}</Text>
                  </>
                )}
              </View>
            ))}
          </ScrollView>
          <View style={styles.chatOverlayInput}>
            <TextInput
              style={styles.chatInputField}
              value={chatInput}
              onChangeText={setChatInput}
              placeholder="Сообщение..."
              placeholderTextColor="rgba(255,255,255,0.4)"
              selectionColor={COLORS.primary}
              onSubmitEditing={sendChatMessage}
              returnKeyType="send"
            />
            <Pressable onPress={sendChatMessage} style={styles.chatSendBtn}>
              <Ionicons name="send" size={18} color={chatInput.trim() ? COLORS.primary : 'rgba(255,255,255,0.3)'} />
            </Pressable>
          </View>
        </Animated.View>
      )}

      </>)}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  gestureHud: {
    position: 'absolute',
    top: '50%',
    left: 32,
    transform: [{ translateY: -28 }],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 24,
    minWidth: 200,
    zIndex: 50,
  },
  gestureBar: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  gestureBarFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
  },
  gestureHudText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    minWidth: 38,
    textAlign: 'right',
  },
  bufferingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    zIndex: 5,
  },
  bufferingText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontFamily: FONTS.medium,
    marginTop: 12,
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    paddingHorizontal: 40,
  },
  errorText: {
    color: '#fff',
    fontSize: 18,
    fontFamily: FONTS.semibold,
    marginTop: 12,
    marginBottom: 4,
  },
  errorSubtext: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    marginBottom: 20,
  },
  errorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
  },
  errorBtnText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: FONTS.semibold,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.sm,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    fontFamily: FONTS.semibold,
    textAlign: 'center',
    marginHorizontal: SPACING.md,
  },
  centerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 40,
  },
  seekBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  seekLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontFamily: FONTS.bold,
    marginTop: -2,
  },
  playPauseBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBar: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.lg,
    paddingTop: SPACING.sm,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  timeText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontFamily: FONTS.medium,
    minWidth: 50,
    textAlign: 'center',
  },
  slider: {
    flex: 1,
    height: 40,
  },
  bottomControls: {
    flexDirection: 'row',
    gap: SPACING.sm,
    flexWrap: 'wrap',
  },
  controlBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    maxWidth: 160,
  },
  controlText: {
    color: '#fff',
    fontSize: 13,
    fontFamily: FONTS.semibold,
  },
  panel: {
    position: 'absolute',
    bottom: 80,
    left: SPACING.xl,
    backgroundColor: 'rgba(20,20,30,0.95)',
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    minWidth: 140,
    maxHeight: 300,
  },
  panelTitle: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontFamily: FONTS.semibold,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  panelItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  panelItemActive: {
    backgroundColor: COLORS.primary + '20',
  },
  panelText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontFamily: FONTS.medium,
  },
  panelTextActive: {
    color: COLORS.primary,
    fontFamily: FONTS.bold,
  },
  lockHint: {
    position: 'absolute',
    top: 20,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
  },
  seekIndicatorOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 100,
    zIndex: 6,
  },
  seekIndicatorText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    fontFamily: FONTS.bold,
    marginTop: 4,
  },
  // Watch Together chat
  chatFloatingBtn: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  chatBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  chatBadgeText: { color: '#fff', fontSize: 10, fontFamily: FONTS.bold },
  chatOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 280,
    backgroundColor: 'rgba(0,0,0,0.85)',
    zIndex: 25,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,255,255,0.1)',
  },
  chatOverlayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  chatOverlayTitle: { color: '#fff', fontSize: 15, fontFamily: FONTS.bold },
  chatOverlayMessages: { flex: 1, paddingHorizontal: 10 },
  chatSysMsg: { alignItems: 'center', paddingVertical: 4 },
  chatSysText: { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontStyle: 'italic' },
  chatUserMsg: { paddingVertical: 4 },
  chatMsgAuthor: { color: COLORS.primary, fontSize: 12, fontFamily: FONTS.bold },
  chatMsgText: { color: 'rgba(255,255,255,0.9)', fontSize: 13, marginTop: 1 },
  chatOverlayInput: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    gap: 6,
  },
  chatInputField: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#fff',
    fontSize: 13,
  },
  chatSendBtn: { padding: 6 },

  // Autoplay countdown overlay
  autoplayOverlay: {
    position: 'absolute',
    bottom: 100,
    right: 24,
    zIndex: 30,
  },
  autoplayCard: {
    backgroundColor: 'rgba(0,0,0,0.9)',
    borderRadius: RADIUS.lg,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    minWidth: 200,
  },
  autoplayLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontFamily: FONTS.regular,
    marginBottom: 4,
  },
  autoplayCountdown: {
    color: COLORS.primary,
    fontSize: 36,
    fontFamily: FONTS.bold,
    marginBottom: 12,
  },
  autoplayActions: {
    flexDirection: 'row',
    gap: 8,
  },
  autoplayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  autoplayBtnText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: FONTS.medium,
  },
});
