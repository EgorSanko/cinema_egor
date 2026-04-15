import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, Pressable, StyleSheet, Dimensions, Alert, ScrollView, ActivityIndicator, Share, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Animated, { FadeIn, FadeInDown, useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { posterUrl, getGenres } from '../../api/tmdb';
import type { Genre } from '../../api/tmdb';
import { COLORS, RADIUS, FONTS, SPACING, SHADOWS, API_BASE } from '../../constants/theme';
import { getUser } from '../../utils/auth';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = SCREEN_W - 48;
const CARD_H = CARD_W * 1.4;
const SWIPE_THRESHOLD = SCREEN_W * 0.3;

const GENRE_COLORS = ['#e11d48', '#8b5cf6', '#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#6366f1', '#14b8a6', '#f97316', '#ec4899', '#3b82f6', '#10b981', '#a855f7', '#06b6d4', '#eab308', '#dc2626', '#7c3aed', '#059669', '#d97706'];

const GENRE_NAMES: Record<number, string> = {
  28: 'Экшн', 12: 'Приключения', 16: 'Анимация', 35: 'Комедия',
  80: 'Криминал', 99: 'Документальный', 18: 'Драма', 10751: 'Семейный',
  14: 'Фэнтези', 36: 'Исторический', 27: 'Ужасы', 10402: 'Музыка',
  9648: 'Детектив', 10749: 'Мелодрама', 878: 'Фантастика',
  53: 'Триллер', 10752: 'Военный', 37: 'Вестерн',
};

type Phase = 'lobby' | 'genres' | 'waiting-genres' | 'swiping' | 'waiting' | 'results';

interface SwipeMovie {
  id: number;
  title: string;
  poster_path: string | null;
  vote_average: number;
  release_date: string;
  overview: string;
  type: string;
  genre_ids: number[];
}

interface PlayerStatus {
  name: string;
  genres: number[];
  genresDone: boolean;
  liked: number;
  total: number;
  done: boolean;
}

interface RoomStatus {
  phase: string;
  bothJoined: boolean;
  allGenresDone: boolean;
  allDone: boolean;
  matches: SwipeMovie[];
  matchCount: number;
  compatibility: number;
  genreCompatibility: number;
  sharedGenres: number[];
  players: Record<string, PlayerStatus>;
  totalMovies: number;
  recommendations: (SwipeMovie & { basedOn?: string })[];
}

async function swipeApi(body: any): Promise<any> {
  const res = await fetch(`${API_BASE}/api/swipe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

export function SwipeScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>('lobby');
  const [genres, setGenres] = useState<Genre[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<number[]>([]);
  const [movies, setMovies] = useState<SwipeMovie[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [liked, setLiked] = useState<SwipeMovie[]>([]);
  const [loading, setLoading] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [status, setStatus] = useState<RoomStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const rotation = useSharedValue(0);

  // Load user name
  useEffect(() => {
    getUser().then(u => { if (u) setPlayerName(u.name); });
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Polling for waiting phases
  useEffect(() => {
    if (phase !== 'waiting-genres' && phase !== 'waiting') {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    const poll = async () => {
      const data = await swipeApi({ action: 'status', code: roomCode });
      if (!data.success) return;
      setStatus(data);
      if (data.allDone || data.phase === 'results') {
        setPhase('results');
      } else if (data.phase === 'swiping' && phase === 'waiting-genres') {
        // Both submitted genres, load deck
        const deckData = await swipeApi({ action: 'deck', code: roomCode });
        if (deckData.success && deckData.movies) {
          setMovies(deckData.movies);
          setCurrentIdx(0);
          setLiked([]);
          setPhase('swiping');
        }
      }
    };
    poll();
    pollRef.current = setInterval(poll, 3000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [phase, roomCode]);

  // Safety: if swiping but out of movies, mark done
  useEffect(() => {
    if (phase === 'swiping' && movies.length > 0 && currentIdx >= movies.length) {
      markDone();
    }
  }, [phase, currentIdx, movies.length]);

  const loadGenres = async () => {
    setLoading(true);
    try { setGenres(await getGenres()); } catch {}
    setLoading(false);
  };

  const createRoom = async () => {
    if (!playerName.trim()) { Alert.alert('', 'Введите имя'); return; }
    setLoading(true);
    try {
      const data = await swipeApi({ action: 'create', playerName: playerName.trim() });
      if (data.success) {
        setRoomCode(data.code);
        await loadGenres();
        setPhase('genres');
        try {
          await Share.share({ message: `Присоединяйся к свайпу в sapkeflykino! Код: ${data.code}\nОткрой sapkeflykino.ru/swipe и введи код` });
        } catch {}
      } else {
        Alert.alert('Ошибка', data.error || 'Не удалось создать комнату');
      }
    } catch { Alert.alert('Ошибка', 'Сервер не отвечает'); }
    setLoading(false);
  };

  const joinRoom = async () => {
    if (!playerName.trim()) { Alert.alert('', 'Введите имя'); return; }
    if (!joinCode.trim() || joinCode.trim().length < 4) { Alert.alert('', 'Введите код комнаты'); return; }
    setLoading(true);
    const code = joinCode.trim().toUpperCase();
    try {
      const data = await swipeApi({ action: 'join', code, playerName: playerName.trim() });
      if (data.success) {
        setRoomCode(code);
        // Check room status
        const statusData = await swipeApi({ action: 'status', code });
        if (statusData.success) {
          setStatus(statusData);
          const player = statusData.players[playerName.trim()];
          if (statusData.phase === 'results' || statusData.allDone) {
            setPhase('results');
          } else if (statusData.phase === 'swiping') {
            const deckData = await swipeApi({ action: 'deck', code });
            if (deckData.success && deckData.movies) {
              setMovies(deckData.movies);
              setCurrentIdx(0);
              setLiked([]);
            }
            setPhase(player?.done ? 'waiting' : 'swiping');
          } else {
            await loadGenres();
            setPhase(player?.genresDone ? 'waiting-genres' : 'genres');
          }
        } else {
          await loadGenres();
          setPhase('genres');
        }
      } else {
        Alert.alert('Ошибка', data.error || 'Комната не найдена');
      }
    } catch { Alert.alert('Ошибка', 'Сервер не отвечает'); }
    setLoading(false);
  };

  const toggleGenre = (id: number) => {
    setSelectedGenres(prev => prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]);
  };

  const submitGenres = async () => {
    if (selectedGenres.length < 1) { Alert.alert('', 'Выберите хотя бы 1 жанр'); return; }
    setLoading(true);
    try {
      const data = await swipeApi({ action: 'genres', code: roomCode, playerName: playerName.trim(), genres: selectedGenres });
      if (data.success) {
        if (data.phase === 'swiping') {
          // Both players submitted, load deck
          const deckData = await swipeApi({ action: 'deck', code: roomCode });
          if (deckData.success && deckData.movies) {
            setMovies(deckData.movies);
            setCurrentIdx(0);
            setLiked([]);
            setPhase('swiping');
          }
        } else {
          setPhase('waiting-genres');
        }
      }
    } catch { Alert.alert('Ошибка', 'Не удалось отправить жанры'); }
    setLoading(false);
  };

  const handleSwipe = useCallback(async (direction: 'left' | 'right') => {
    const movie = movies[currentIdx];
    if (!movie) return;
    const movieKey = `${movie.type || 'movie'}-${movie.id}`;

    if (direction === 'right') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setLiked(prev => [...prev, movie]);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    // Send swipe to server
    swipeApi({ action: 'swipe', code: roomCode, playerName: playerName.trim(), movieKey, direction }).catch(() => {});

    if (currentIdx >= movies.length - 1) {
      markDone();
    } else {
      setCurrentIdx(prev => prev + 1);
    }
  }, [currentIdx, movies, roomCode, playerName]);

  const markDone = async () => {
    try {
      await swipeApi({ action: 'done', code: roomCode, playerName: playerName.trim() });
    } catch {}
    // Check status immediately
    const data = await swipeApi({ action: 'status', code: roomCode });
    if (data?.success) {
      setStatus(data);
      if (data.allDone || data.phase === 'results') {
        setPhase('results');
      } else {
        setPhase('waiting');
      }
    } else {
      setPhase('waiting');
    }
  };

  const gesture = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY * 0.3;
      rotation.value = (e.translationX / SCREEN_W) * 15;
    })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > SWIPE_THRESHOLD) {
        const dir = e.translationX > 0 ? 'right' : 'left';
        translateX.value = withTiming(e.translationX > 0 ? SCREEN_W * 1.5 : -SCREEN_W * 1.5, { duration: 300 });
        runOnJS(handleSwipe)(dir);
        setTimeout(() => {
          translateX.value = 0;
          translateY.value = 0;
          rotation.value = 0;
        }, 350);
      } else {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        rotation.value = withSpring(0);
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${rotation.value}deg` },
    ],
  }));

  const likeOpacity = useAnimatedStyle(() => ({
    opacity: Math.min(Math.max(translateX.value / 100, 0), 1),
  }));
  const nopeOpacity = useAnimatedStyle(() => ({
    opacity: Math.min(Math.max(-translateX.value / 100, 0), 1),
  }));

  const resetAll = () => {
    setPhase('lobby');
    setCurrentIdx(0);
    setLiked([]);
    setMovies([]);
    setSelectedGenres([]);
    setRoomCode('');
    setJoinCode('');
    setStatus(null);
  };

  // ─── Lobby ───
  if (phase === 'lobby') {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => nav.goBack()} hitSlop={12}><Ionicons name="arrow-back" size={24} color={COLORS.text} /></Pressable>
          <Text style={styles.headerTitle}>Свайп вдвоём</Text>
        </View>

        <ScrollView contentContainerStyle={styles.lobbyContent}>
          <Animated.View entering={FadeIn.duration(500)} style={styles.lobbyHero}>
            <View style={styles.lobbyIconCircle}>
              <Ionicons name="heart-circle" size={56} color={COLORS.primary} />
            </View>
            <Text style={styles.lobbyTitle}>Свайп вдвоём</Text>
            <Text style={styles.lobbySubtitle}>Выберите жанры, свайпайте фильмы — посмотрите что совпало!</Text>
          </Animated.View>

          {/* Name input */}
          <Animated.View entering={FadeInDown.duration(400).delay(50)} style={styles.nameInputBlock}>
            <Text style={styles.inputLabel}>Ваше имя</Text>
            <TextInput
              style={styles.nameInput}
              value={playerName}
              onChangeText={setPlayerName}
              placeholder="Например: Егор"
              placeholderTextColor={COLORS.textMuted}
              maxLength={20}
            />
          </Animated.View>

          {/* Steps */}
          <Animated.View entering={FadeInDown.duration(400).delay(100)} style={styles.stepsBlock}>
            {[
              { icon: 'add-circle', text: 'Создайте комнату и поделитесь кодом' },
              { icon: 'grid', text: 'Оба выберите любимые жанры' },
              { icon: 'swap-horizontal', text: 'Свайпайте фильмы — вправо нравится, влево нет' },
              { icon: 'checkmark-circle', text: 'Посмотрите совпадения и выберите фильм!' },
            ].map((step, i) => (
              <View key={i} style={styles.stepRow}>
                <View style={styles.stepNum}><Text style={styles.stepNumText}>{i + 1}</Text></View>
                <Ionicons name={step.icon as any} size={20} color={COLORS.primary} />
                <Text style={styles.stepText}>{step.text}</Text>
              </View>
            ))}
          </Animated.View>

          {/* Buttons */}
          <Animated.View entering={FadeInDown.duration(400).delay(250)} style={styles.lobbyButtons}>
            <Pressable onPress={createRoom} disabled={loading} style={styles.createRoomBtn}>
              {loading ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="people" size={20} color="#fff" />
                  <Text style={styles.createRoomBtnText}>Создать комнату</Text>
                </>
              )}
            </Pressable>

            {/* Join room */}
            <View style={styles.joinBlock}>
              <Text style={styles.inputLabel}>Или войдите по коду</Text>
              <View style={styles.joinRow}>
                <TextInput
                  style={styles.joinInput}
                  value={joinCode}
                  onChangeText={t => setJoinCode(t.toUpperCase())}
                  placeholder="XXXXX"
                  placeholderTextColor={COLORS.textMuted}
                  maxLength={5}
                  autoCapitalize="characters"
                />
                <Pressable onPress={joinRoom} disabled={loading} style={styles.joinBtn}>
                  <Text style={styles.joinBtnText}>Войти</Text>
                </Pressable>
              </View>
            </View>
          </Animated.View>
        </ScrollView>
      </View>
    );
  }

  // ─── Genres ───
  if (phase === 'genres') {
    if (loading && genres.length === 0) return <View style={[styles.container, styles.center, { paddingTop: insets.top }]}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={resetAll} hitSlop={12}><Ionicons name="arrow-back" size={24} color={COLORS.text} /></Pressable>
          <Text style={styles.headerTitle}>Выберите жанры</Text>
          {roomCode ? (
            <View style={styles.codeBadge}><Text style={styles.codeBadgeText}>{roomCode}</Text></View>
          ) : null}
        </View>
        <Text style={styles.subtitle}>Отметьте жанры, которые вам нравятся</Text>
        <ScrollView contentContainerStyle={styles.genreGrid}>
          {genres.map((g, i) => {
            const sel = selectedGenres.includes(g.id);
            const color = GENRE_COLORS[i % GENRE_COLORS.length];
            return (
              <Pressable key={g.id} onPress={() => toggleGenre(g.id)} style={[styles.genreChip, sel && { backgroundColor: color + '30', borderColor: color }]}>
                {sel && <Ionicons name="checkmark-circle" size={16} color={color} />}
                <Text style={[styles.genreChipText, sel && { color }]}>{g.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={styles.genreFooter}>
          <Pressable onPress={submitGenres} disabled={loading} style={[styles.startBtn, selectedGenres.length === 0 && { opacity: 0.5 }]}>
            {loading ? <ActivityIndicator color="#fff" /> : (
              <Text style={styles.startBtnText}>Отправить ({selectedGenres.length})</Text>
            )}
          </Pressable>
        </View>
      </View>
    );
  }

  // ─── Waiting for partner's genres ───
  if (phase === 'waiting-genres') {
    const players = status?.players || {};
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={resetAll} hitSlop={12}><Ionicons name="arrow-back" size={24} color={COLORS.text} /></Pressable>
          <Text style={styles.headerTitle}>Ожидание</Text>
          <View style={styles.codeBadge}><Text style={styles.codeBadgeText}>{roomCode}</Text></View>
        </View>
        <View style={styles.waitingContent}>
          <Animated.View entering={FadeIn.duration(500)} style={styles.waitingHero}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.waitingTitle}>Ваши жанры сохранены!</Text>
            <Text style={styles.waitingSubtitle}>Ожидание партнёра...</Text>
          </Animated.View>
          {Object.keys(players).map(key => (
            <View key={key} style={styles.playerRow}>
              <View style={[styles.playerAvatar, players[key].genresDone && { backgroundColor: '#22c55e' }]}>
                <Text style={styles.playerAvatarText}>{players[key].name.charAt(0).toUpperCase()}</Text>
              </View>
              <Text style={styles.playerName}>{players[key].name}</Text>
              <View style={[styles.statusBadge, players[key].genresDone ? styles.statusReady : styles.statusPending]}>
                <Text style={[styles.statusText, players[key].genresDone ? styles.statusTextReady : styles.statusTextPending]}>
                  {players[key].genresDone ? 'Готово' : 'Выбирает...'}
                </Text>
              </View>
            </View>
          ))}
          {Object.keys(players).length < 2 && (
            <View style={styles.noPartnerHint}>
              <Text style={styles.noPartnerText}>Партнёр ещё не подключился. Код: <Text style={styles.noPartnerCode}>{roomCode}</Text></Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  // ─── Waiting for partner to finish swiping ───
  if (phase === 'waiting') {
    const players = status?.players || {};
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={resetAll} hitSlop={12}><Ionicons name="arrow-back" size={24} color={COLORS.text} /></Pressable>
          <Text style={styles.headerTitle}>Ожидание</Text>
        </View>
        <View style={styles.waitingContent}>
          <Animated.View entering={FadeIn.duration(500)} style={styles.waitingHero}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.waitingTitle}>Вы закончили!</Text>
            <Text style={styles.waitingSubtitle}>Ожидание партнёра...</Text>
          </Animated.View>
          {Object.keys(players).map(key => (
            <View key={key} style={styles.playerRow}>
              <View style={[styles.playerAvatar, players[key].done && { backgroundColor: '#22c55e' }]}>
                <Text style={styles.playerAvatarText}>{players[key].name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.playerName}>{players[key].name}</Text>
                <Text style={styles.playerStat}>{players[key].liked} из {players[key].total}</Text>
              </View>
              <View style={[styles.statusBadge, players[key].done ? styles.statusReady : styles.statusPending]}>
                <Text style={[styles.statusText, players[key].done ? styles.statusTextReady : styles.statusTextPending]}>
                  {players[key].done ? 'Готово' : 'Свайпает...'}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  }

  // ─── Results ───
  if (phase === 'results') {
    const matches = status?.matches || [];
    const compatibility = status?.compatibility || 0;
    const genreCompat = status?.genreCompatibility || 0;
    const sharedGenres = (status?.sharedGenres || []).map(id => GENRE_NAMES[id]).filter(Boolean);
    const players = status?.players || {};
    const recommendations = status?.recommendations || [];

    const compatEmoji = compatibility >= 80 ? 'heart-circle' : compatibility >= 60 ? 'heart' : compatibility >= 40 ? 'happy' : 'sad';

    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={resetAll} hitSlop={12}><Ionicons name="arrow-back" size={24} color={COLORS.text} /></Pressable>
          <Text style={styles.headerTitle}>Результаты</Text>
        </View>
        <ScrollView>
          {/* Compatibility circle */}
          <Animated.View entering={FadeIn.duration(500)} style={styles.resultsCenter}>
            <View style={styles.compatCircle}>
              <Text style={styles.compatPercent}>{compatibility}%</Text>
              <Text style={styles.compatLabel}>совпадение</Text>
            </View>
          </Animated.View>

          {/* Genre compatibility */}
          {sharedGenres.length > 0 && (
            <View style={styles.sharedGenresBlock}>
              <Text style={styles.sharedGenresTitle}>Общие жанры:</Text>
              <View style={styles.sharedGenresRow}>
                {sharedGenres.map(g => (
                  <View key={g} style={styles.sharedGenreChip}>
                    <Text style={styles.sharedGenreText}>{g}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Player stats */}
          <View style={styles.playersRow}>
            {Object.keys(players).map(key => (
              <View key={key} style={styles.playerStatCard}>
                <View style={styles.playerStatAvatar}>
                  <Text style={styles.playerStatAvatarText}>{players[key].name.charAt(0).toUpperCase()}</Text>
                </View>
                <Text style={styles.playerStatName}>{players[key].name}</Text>
                <Text style={styles.playerStatLikes}>{players[key].liked} из {players[key].total}</Text>
              </View>
            ))}
          </View>

          {/* Matches */}
          <Text style={[styles.sectionLabel, { paddingHorizontal: SPACING.lg }]}>
            {matches.length > 0 ? `${matches.length} совпадени${matches.length === 1 ? 'е' : matches.length < 5 ? 'я' : 'й'}!` : 'Нет совпадений'}
          </Text>

          {matches.length > 0 ? (
            <View style={styles.matchesList}>
              {matches.map((m: SwipeMovie, idx: number) => (
                <Pressable
                  key={`${m.type}-${m.id}`}
                  onPress={() => nav.navigate(m.type === 'tv' ? 'TVDetail' : 'MovieDetail', { id: m.id, title: m.title })}
                  style={styles.matchCard}
                >
                  <View style={[styles.matchRank, idx === 0 && { backgroundColor: '#f59e0b30' }]}>
                    <Text style={[styles.matchRankText, idx === 0 && { color: '#f59e0b' }]}>{idx + 1}</Text>
                  </View>
                  <Image source={{ uri: posterUrl(m.poster_path, 'w92')! }} style={styles.matchPoster} contentFit="cover" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.matchTitle} numberOfLines={1}>{m.title}</Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
                      <Text style={styles.matchMeta}>{m.vote_average?.toFixed(1)}</Text>
                      {m.release_date && <Text style={styles.matchMeta}>{m.release_date.slice(0, 4)}</Text>}
                      {m.type === 'tv' && <Text style={styles.matchTvBadge}>Сериал</Text>}
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={styles.noMatchesBlock}>
              <Ionicons name="heart-dislike-outline" size={40} color={COLORS.textMuted} />
              <Text style={styles.noMatchesText}>Ни один фильм не совпал</Text>
            </View>
          )}

          {/* Recommendations */}
          {recommendations.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { paddingHorizontal: SPACING.lg, marginTop: SPACING.lg }]}>Вам также понравится</Text>
              <View style={styles.resultsGrid}>
                {recommendations.map((rec) => (
                  <Pressable
                    key={`${rec.type}-${rec.id}`}
                    onPress={() => nav.navigate(rec.type === 'tv' ? 'TVDetail' : 'MovieDetail', { id: rec.id, title: rec.title })}
                    style={styles.resultCard}
                  >
                    <Image source={{ uri: posterUrl(rec.poster_path)! }} style={styles.resultPoster} contentFit="cover" />
                    <Text style={styles.resultTitle} numberOfLines={2}>{rec.title}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <Pressable onPress={resetAll} style={styles.retryBtn}>
            <Ionicons name="refresh" size={18} color="#fff" />
            <Text style={styles.retryBtnText}>Новая комната</Text>
          </Pressable>
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    );
  }

  // ─── Swiping ───
  const movie = movies[currentIdx];
  if (!movie) return <View style={[styles.container, styles.center, { paddingTop: insets.top }]}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  const img = posterUrl(movie.poster_path, 'w500');

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => { markDone(); }} hitSlop={12}><Ionicons name="arrow-back" size={24} color={COLORS.text} /></Pressable>
        <Text style={styles.headerTitle}>{currentIdx + 1} / {movies.length}</Text>
        <View style={styles.codeBadge}><Text style={styles.codeBadgeText}>{roomCode}</Text></View>
        <Text style={styles.likedCount}><Ionicons name="heart" size={16} color={COLORS.primary} /> {liked.length}</Text>
      </View>

      <View style={styles.cardContainer}>
        <GestureDetector gesture={gesture}>
          <Animated.View style={[styles.card, cardStyle]}>
            {img && <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />}
            <Animated.View style={[styles.likeOverlay, likeOpacity]}>
              <Text style={[styles.overlayText, { color: '#22c55e' }]}>ХОЧУ</Text>
            </Animated.View>
            <Animated.View style={[styles.nopeOverlay, nopeOpacity]}>
              <Text style={[styles.overlayText, { color: '#ef4444' }]}>ПАСС</Text>
            </Animated.View>
            <View style={styles.cardInfo}>
              <Text style={styles.cardTitle}>{movie.title}</Text>
              <View style={styles.cardMeta}>
                <Ionicons name="star" size={14} color={COLORS.star} />
                <Text style={styles.cardMetaText}>{movie.vote_average?.toFixed(1)}</Text>
                <Text style={styles.cardMetaText}>{movie.release_date?.slice(0, 4)}</Text>
                {movie.type === 'tv' && <Text style={[styles.cardMetaText, { color: '#0ea5e9' }]}>Сериал</Text>}
              </View>
              {movie.overview ? (
                <Text style={styles.cardOverview} numberOfLines={3}>{movie.overview}</Text>
              ) : null}
            </View>
          </Animated.View>
        </GestureDetector>
      </View>

      <View style={styles.swipeButtons}>
        <Pressable onPress={() => { translateX.value = withTiming(-SCREEN_W * 1.5, { duration: 300 }); setTimeout(() => { handleSwipe('left'); translateX.value = 0; translateY.value = 0; rotation.value = 0; }, 350); }} style={[styles.swipeBtn, styles.nopeBtnStyle]}>
          <Ionicons name="close" size={32} color="#ef4444" />
        </Pressable>
        <Pressable onPress={() => nav.navigate('MovieDetail', { id: movie.id, title: movie.title })} style={[styles.swipeBtn, styles.infoBtnStyle]}>
          <Ionicons name="information-circle-outline" size={28} color={COLORS.text} />
        </Pressable>
        <Pressable onPress={() => { translateX.value = withTiming(SCREEN_W * 1.5, { duration: 300 }); setTimeout(() => { handleSwipe('right'); translateX.value = 0; translateY.value = 0; rotation.value = 0; }, 350); }} style={[styles.swipeBtn, styles.likeBtnStyle]}>
          <Ionicons name="heart" size={32} color="#22c55e" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, gap: SPACING.md },
  headerTitle: { flex: 1, color: COLORS.text, fontSize: 18, fontFamily: FONTS.bold },

  // Lobby
  lobbyContent: { paddingHorizontal: SPACING.xxl, paddingBottom: 40 },
  lobbyHero: { alignItems: 'center', marginTop: SPACING.xl, marginBottom: SPACING.lg },
  lobbyIconCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: COLORS.primary + '15', alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md },
  lobbyTitle: { color: COLORS.text, fontSize: 28, fontFamily: FONTS.extrabold, letterSpacing: -0.5 },
  lobbySubtitle: { color: COLORS.textMuted, fontSize: 14, fontFamily: FONTS.regular, textAlign: 'center', marginTop: 6, lineHeight: 20 },
  nameInputBlock: { marginBottom: SPACING.lg },
  inputLabel: { color: COLORS.textSecondary, fontSize: 13, fontFamily: FONTS.medium, marginBottom: 6 },
  nameInput: { backgroundColor: COLORS.bgElevated, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.lg, paddingHorizontal: 16, paddingVertical: 14, color: COLORS.text, fontSize: 16, fontFamily: FONTS.medium },
  stepsBlock: { marginBottom: SPACING.xl, gap: SPACING.md },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  stepNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.primary + '20', alignItems: 'center', justifyContent: 'center' },
  stepNumText: { color: COLORS.primary, fontSize: 12, fontFamily: FONTS.bold },
  stepText: { flex: 1, color: COLORS.textSecondary, fontSize: 13, fontFamily: FONTS.regular },
  lobbyButtons: { gap: SPACING.lg },
  createRoomBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.primary, height: 52, borderRadius: RADIUS.lg },
  createRoomBtnText: { color: '#fff', fontSize: 16, fontFamily: FONTS.bold },
  joinBlock: { marginTop: SPACING.sm },
  joinRow: { flexDirection: 'row', gap: SPACING.sm },
  joinInput: { flex: 1, backgroundColor: COLORS.bgElevated, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.lg, paddingHorizontal: 16, paddingVertical: 14, color: COLORS.text, fontSize: 18, fontFamily: FONTS.bold, textAlign: 'center', letterSpacing: 4 },
  joinBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 24, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center' },
  joinBtnText: { color: '#fff', fontSize: 15, fontFamily: FONTS.bold },

  // Genres
  subtitle: { color: COLORS.textSecondary, fontSize: 14, fontFamily: FONTS.regular, paddingHorizontal: SPACING.lg, marginBottom: SPACING.md },
  codeBadge: { backgroundColor: COLORS.primary + '20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.pill },
  codeBadgeText: { color: COLORS.primary, fontSize: 12, fontFamily: FONTS.bold, letterSpacing: 2 },
  genreGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xl },
  genreChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: RADIUS.pill, backgroundColor: COLORS.bgElevated, borderWidth: 1, borderColor: COLORS.border },
  genreChipText: { color: COLORS.textSecondary, fontSize: 14, fontFamily: FONTS.medium },
  genreFooter: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl },
  startBtn: { backgroundColor: COLORS.primary, paddingVertical: 16, borderRadius: RADIUS.lg, alignItems: 'center' },
  startBtnText: { color: '#fff', fontSize: 16, fontFamily: FONTS.bold },
  likedCount: { color: COLORS.text, fontSize: 14, fontFamily: FONTS.semibold },

  // Waiting
  waitingContent: { flex: 1, paddingHorizontal: SPACING.lg },
  waitingHero: { alignItems: 'center', marginVertical: SPACING.xxl, gap: SPACING.md },
  waitingTitle: { color: COLORS.text, fontSize: 22, fontFamily: FONTS.bold },
  waitingSubtitle: { color: COLORS.textMuted, fontSize: 14, fontFamily: FONTS.regular },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, backgroundColor: COLORS.bgCard, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm },
  playerAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary + '50', alignItems: 'center', justifyContent: 'center' },
  playerAvatarText: { color: '#fff', fontSize: 16, fontFamily: FONTS.bold },
  playerName: { flex: 1, color: COLORS.text, fontSize: 15, fontFamily: FONTS.medium },
  playerStat: { color: COLORS.textMuted, fontSize: 12, fontFamily: FONTS.regular },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.md },
  statusReady: { backgroundColor: 'rgba(34,197,94,0.1)' },
  statusPending: { backgroundColor: 'rgba(245,158,11,0.1)' },
  statusText: { fontSize: 12, fontFamily: FONTS.medium },
  statusTextReady: { color: '#22c55e' },
  statusTextPending: { color: '#f59e0b' },
  noPartnerHint: { marginTop: SPACING.lg, backgroundColor: 'rgba(245,158,11,0.05)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)', borderRadius: RADIUS.lg, padding: SPACING.md },
  noPartnerText: { color: '#f59e0b', fontSize: 13, fontFamily: FONTS.regular },
  noPartnerCode: { fontFamily: FONTS.bold, letterSpacing: 2 },

  // Card
  cardContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { width: CARD_W, height: CARD_H, borderRadius: RADIUS.xl, overflow: 'hidden', backgroundColor: COLORS.bgCard, ...SHADOWS.card },
  cardInfo: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: SPACING.lg, backgroundColor: 'rgba(0,0,0,0.75)' },
  cardTitle: { color: '#fff', fontSize: 20, fontFamily: FONTS.bold, marginBottom: 4 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  cardMetaText: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontFamily: FONTS.medium },
  cardOverview: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontFamily: FONTS.regular, lineHeight: 16, marginTop: 4 },
  likeOverlay: { position: 'absolute', top: 40, left: 20, borderWidth: 3, borderColor: '#22c55e', borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: 'rgba(34,197,94,0.15)', transform: [{ rotate: '-15deg' }] },
  nopeOverlay: { position: 'absolute', top: 40, right: 20, borderWidth: 3, borderColor: '#ef4444', borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: 'rgba(239,68,68,0.15)', transform: [{ rotate: '15deg' }] },
  overlayText: { fontSize: 28, fontFamily: FONTS.extrabold },
  swipeButtons: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 24, paddingVertical: SPACING.xl },
  swipeBtn: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  nopeBtnStyle: { borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)' },
  likeBtnStyle: { borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.1)' },
  infoBtnStyle: { borderColor: COLORS.border, backgroundColor: COLORS.bgElevated, width: 48, height: 48, borderRadius: 24 },

  // Results
  sectionLabel: { color: COLORS.text, fontSize: 16, fontFamily: FONTS.bold, marginBottom: SPACING.sm },
  resultsCenter: { alignItems: 'center', paddingVertical: SPACING.xl },
  compatCircle: { width: 130, height: 130, borderRadius: 65, borderWidth: 6, borderColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  compatPercent: { color: COLORS.text, fontSize: 36, fontFamily: FONTS.extrabold },
  compatLabel: { color: COLORS.textMuted, fontSize: 12, fontFamily: FONTS.regular },
  sharedGenresBlock: { paddingHorizontal: SPACING.lg, marginBottom: SPACING.md },
  sharedGenresTitle: { color: COLORS.textSecondary, fontSize: 13, fontFamily: FONTS.medium, marginBottom: 6 },
  sharedGenresRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  sharedGenreChip: { backgroundColor: COLORS.primary + '15', paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.pill },
  sharedGenreText: { color: COLORS.primary, fontSize: 12, fontFamily: FONTS.medium },
  playersRow: { flexDirection: 'row', paddingHorizontal: SPACING.lg, gap: SPACING.sm, marginBottom: SPACING.lg },
  playerStatCard: { flex: 1, backgroundColor: COLORS.bgCard, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.lg, padding: SPACING.md, alignItems: 'center' },
  playerStatAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary + '30', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  playerStatAvatarText: { color: COLORS.primary, fontSize: 18, fontFamily: FONTS.bold },
  playerStatName: { color: COLORS.text, fontSize: 14, fontFamily: FONTS.medium },
  playerStatLikes: { color: COLORS.textMuted, fontSize: 12, fontFamily: FONTS.regular, marginTop: 2 },
  matchesList: { paddingHorizontal: SPACING.lg, gap: SPACING.sm },
  matchCard: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, backgroundColor: COLORS.bgCard, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.lg, padding: SPACING.md },
  matchRank: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.bgElevated, alignItems: 'center', justifyContent: 'center' },
  matchRankText: { color: COLORS.textMuted, fontSize: 12, fontFamily: FONTS.bold },
  matchPoster: { width: 48, height: 72, borderRadius: RADIUS.md },
  matchTitle: { color: COLORS.text, fontSize: 15, fontFamily: FONTS.semibold },
  matchMeta: { color: COLORS.textMuted, fontSize: 12, fontFamily: FONTS.regular },
  matchTvBadge: { color: '#0ea5e9', fontSize: 11, fontFamily: FONTS.medium, backgroundColor: 'rgba(14,165,233,0.15)', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  noMatchesBlock: { alignItems: 'center', paddingVertical: SPACING.xxl },
  noMatchesText: { color: COLORS.textMuted, fontSize: 14, fontFamily: FONTS.regular, marginTop: SPACING.md },
  resultsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: SPACING.lg, gap: SPACING.sm },
  resultCard: { width: (SCREEN_W - 48 - 16) / 3 },
  resultPoster: { width: '100%', aspectRatio: 2 / 3, borderRadius: RADIUS.md },
  resultTitle: { color: COLORS.text, fontSize: 11, fontFamily: FONTS.medium, marginTop: 4 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.primary, marginHorizontal: SPACING.lg, marginVertical: SPACING.lg, paddingVertical: 14, borderRadius: RADIUS.lg },
  retryBtnText: { color: '#fff', fontSize: 15, fontFamily: FONTS.bold },
});
