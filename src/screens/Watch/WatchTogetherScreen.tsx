import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, Alert, FlatList,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
  Dimensions, Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { io, Socket } from 'socket.io-client';
import { COLORS, RADIUS, FONTS, SPACING, API_BASE } from '../../constants/theme';
import { searchMovies, posterUrl, getStream, type Movie } from '../../api/tmdb';
import { getUser } from '../../utils/auth';
import { setWatchSocket } from '../../utils/watchSocket';

const { width: SCREEN_W } = Dimensions.get('window');

interface Member {
  id: string;
  name: string;
  isReady: boolean;
  isHost: boolean;
}

interface ChatMessage {
  id: string;
  author: string;
  text: string;
  timestamp: number;
  type: 'message' | 'system';
}

interface RoomState {
  code: string;
  hostId: string | null;
  movieId: number | null;
  movieTitle: string;
  moviePoster: string | null;
  movieType: string;
  movieYear: string;
  state: string;
  streamUrl: string;
  quality: string;
  streams: Record<string, string>;
  translators: { id: number; name: string }[];
  translatorId: number | null;
  currentTime: number;
  members: Member[];
  messages: ChatMessage[];
}

// Phases: choose → lobby (name input) → search (pick movie) → room (waiting/chat) → playing
type Phase = 'lobby' | 'search' | 'room';

export function WatchTogetherScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>('lobby');
  const [userName, setUserName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [room, setRoom] = useState<RoomState | null>(null);
  const [chatText, setChatText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Movie[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [watchLoading, setWatchLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [streamReady, setStreamReady] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const chatListRef = useRef<FlatList>(null);
  const roomRef = useRef<RoomState | null>(null);
  const navigatingToPlayerRef = useRef(false);

  useEffect(() => {
    getUser().then(u => { if (u) setUserName(u.name); });
  }, []);

  // Keep roomRef in sync
  useEffect(() => { roomRef.current = room; }, [room]);

  useEffect(() => {
    return () => {
      // Don't kill socket when navigating to Player — it needs to stay alive for sync
      if (socketRef.current && !navigatingToPlayerRef.current) {
        socketRef.current.emit('leave-room');
        socketRef.current.disconnect();
        socketRef.current = null;
        setWatchSocket(null);
      }
    };
  }, []);

  const connectSocket = useCallback((): Promise<Socket> => {
    return new Promise((resolve, reject) => {
      if (socketRef.current?.connected) { resolve(socketRef.current); return; }
      if (socketRef.current) socketRef.current.disconnect();

      const socket = io(API_BASE, {
        path: '/socket.io/',
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      const timeout = setTimeout(() => { socket.disconnect(); reject(new Error('timeout')); }, 8000);

      socket.on('connect', () => {
        clearTimeout(timeout);
        setupSocketListeners(socket);
        socketRef.current = socket;
        setWatchSocket(socket);
        resolve(socket);
      });

      socket.on('connect_error', () => {
        clearTimeout(timeout);
        reject(new Error('connect_error'));
      });
    });
  }, []);

  const setupSocketListeners = (socket: Socket) => {
    socket.on('member-joined', (data: { member: Member }) => {
      setRoom(prev => {
        if (!prev) return prev;
        if (prev.members.find(m => m.id === data.member.id)) return prev;
        return { ...prev, members: [...prev.members, data.member] };
      });
    });

    socket.on('member-left', (data: { memberId: string }) => {
      setRoom(prev => {
        if (!prev) return prev;
        return { ...prev, members: prev.members.filter(m => m.id !== data.memberId) };
      });
    });

    socket.on('chat-message', (msg: ChatMessage) => {
      setRoom(prev => {
        if (!prev) return prev;
        return { ...prev, messages: [...prev.messages, msg] };
      });
      setTimeout(() => chatListRef.current?.scrollToEnd({ animated: true }), 100);
    });

    socket.on('stream-changed', (data: any) => {
      setRoom(prev => prev ? {
        ...prev,
        streamUrl: data.streamUrl,
        quality: data.quality,
        streams: data.streams || {},
        translators: data.translators || [],
        translatorId: data.translatorId,
      } : prev);
      setStreamReady(true);
    });

    socket.on('member-ready', (data: { memberId: string }) => {
      setRoom(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          members: prev.members.map(m => m.id === data.memberId ? { ...m, isReady: true } : m),
        };
      });
    });

    socket.on('playback-starting', (data: { countdown: number }) => {
      setCountdown(data.countdown);
    });

    socket.on('playback-go', () => {
      setCountdown(0);
      // Use ref to get latest room state
      const r = roomRef.current;
      if (!r || !r.streamUrl) {
        console.warn('[playback-go] No stream URL in room state');
        return;
      }
      // Don't kill socket when navigating to Player
      navigatingToPlayerRef.current = true;
      nav.navigate('Player', {
        streamData: {
          title: r.movieTitle,
          stream: r.streamUrl,
          quality: r.quality,
          streams: r.streams,
          qualities: Object.keys(r.streams),
          translators: r.translators,
          is_series: r.movieType === 'tv',
          url: '',
        },
        title: r.movieTitle,
        movieId: r.movieId,
        poster: r.moviePoster,
        type: r.movieType,
        roomCode: r.code,
      });
    });

    socket.on('player-play', (data: { time: number; by: string }) => {
      // Will be handled in Player screen
    });

    socket.on('player-pause', (data: { time: number; by: string }) => {
      // Will be handled in Player screen
    });

    socket.on('disconnect', () => {
      console.log('[socket] disconnected');
    });
  };

  // Host flow: select movie → create room → load stream → ready
  const selectMovieAndCreate = async (movie: Movie) => {
    if (!userName.trim()) { Alert.alert('Ошибка', 'Введите имя'); return; }
    setLoading(true);
    try {
      const socket = await connectSocket();
      const title = movie.title;
      const year = movie.release_date?.split('-')[0] || '';
      const type = 'movie';

      socket.emit('create-room', {
        name: userName.trim(),
        movieId: movie.id,
        movieTitle: title,
        moviePoster: movie.poster_path,
        movieType: type,
        movieYear: year,
        isSeries: false,
      }, async (response: any) => {
        if (response.error) {
          Alert.alert('Ошибка', response.error);
          setLoading(false);
          return;
        }
        const code = response.code;
        const newRoom: RoomState = {
          code,
          hostId: socket.id || null,
          movieId: movie.id,
          movieTitle: title,
          moviePoster: movie.poster_path || null,
          movieType: type,
          movieYear: year,
          state: 'lobby',
          streamUrl: '',
          quality: '',
          streams: {},
          translators: [],
          translatorId: null,
          currentTime: 0,
          members: [{ id: socket.id || '', name: userName.trim(), isReady: false, isHost: true }],
          messages: [{
            id: '1', author: 'system', text: `Комната создана! Код: ${code}`,
            timestamp: Date.now(), type: 'system',
          }],
        };
        setRoom(newRoom);
        setPhase('room');
        setSearchQuery('');
        setSearchResults([]);

        // Host: load stream automatically
        try {
          let data = await getStream(title, year, type);
          if (!data.stream) {
            for (let i = 0; i < 3; i++) {
              data = await getStream(title, year, type, { index: i });
              if (data.stream) break;
            }
          }
          if (data.stream) {
            socket.emit('set-stream', {
              streamUrl: data.stream,
              quality: data.quality,
              streams: data.streams || {},
              translators: data.translators || [],
              translatorId: (data as any).translator_id || data.translators?.[0]?.id || null,
            });
            socket.emit('player-ready');
            setStreamReady(true);
            setRoom(prev => prev ? {
              ...prev,
              streamUrl: data.stream,
              quality: data.quality,
              streams: data.streams || {},
              translators: data.translators || [],
              members: prev.members.map(m => m.isHost ? { ...m, isReady: true } : m),
            } : prev);
          } else {
            Alert.alert('Внимание', 'Фильм пока недоступен для просмотра');
          }
        } catch {
          Alert.alert('Ошибка', 'Не удалось загрузить стрим');
        }
        setLoading(false);
      });
    } catch {
      Alert.alert('Ошибка', 'Не удалось подключиться к серверу');
      setLoading(false);
    }
  };

  // Guest flow: join room
  const joinRoom = async () => {
    if (!userName.trim()) { Alert.alert('Ошибка', 'Введите имя'); return; }
    if (!joinCode.trim() || joinCode.trim().length < 4) { Alert.alert('Ошибка', 'Введите код комнаты'); return; }
    setLoading(true);
    const code = joinCode.trim().toUpperCase();
    try {
      const socket = await connectSocket();
      socket.emit('join-room', { code, name: userName.trim() }, (response: any) => {
        if (response.error) {
          Alert.alert('Ошибка', response.error);
          setLoading(false);
          return;
        }
        const r = response.room;
        setRoom({
          code: r.code,
          hostId: r.hostId,
          movieId: r.movieId,
          movieTitle: r.movieTitle || '',
          moviePoster: r.moviePoster || null,
          movieType: r.movieType || 'movie',
          movieYear: r.movieYear || '',
          state: r.state,
          streamUrl: r.streamUrl || '',
          quality: r.quality || '',
          streams: r.streams || {},
          translators: r.translators || [],
          translatorId: r.translatorId || null,
          currentTime: r.currentTime || 0,
          members: r.members || [],
          messages: r.messages || [],
        });

        // If stream already exists, mark ready
        if (r.streamUrl) {
          setStreamReady(true);
          socket.emit('player-ready');
        }

        // If already playing, go straight to player
        if ((r.state === 'playing' || r.state === 'paused') && r.streamUrl) {
          navigatingToPlayerRef.current = true;
          nav.navigate('Player', {
            streamData: {
              title: r.movieTitle,
              stream: r.streamUrl,
              quality: r.quality,
              streams: r.streams || {},
              qualities: Object.keys(r.streams || {}),
              translators: r.translators || [],
              is_series: r.movieType === 'tv',
              url: '',
            },
            title: r.movieTitle,
            movieId: r.movieId,
            poster: r.moviePoster,
            type: r.movieType,
            roomCode: r.code,
          });
        }

        setPhase('room');
        setLoading(false);
      });
    } catch {
      Alert.alert('Ошибка', 'Не удалось подключиться');
      setLoading(false);
    }
  };

  const sendChat = () => {
    if (!chatText.trim() || !socketRef.current) return;
    socketRef.current.emit('chat-message', { text: chatText.trim() });
    setChatText('');
  };

  const shareRoom = async () => {
    if (!room) return;
    try {
      await Share.share({
        message: `Присоединяйся к просмотру "${room.movieTitle}" в Кинотеатре Егора!\nОткрой kino.lead-seek.ru/watch и введи код: ${room.code}`,
      });
    } catch {}
  };

  const doSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const results = await searchMovies(searchQuery.trim());
      setSearchResults(results);
    } catch { setSearchResults([]); }
    setSearching(false);
  };

  const startPlayback = () => {
    if (!socketRef.current || !streamReady) return;
    socketRef.current.emit('start-playback');
  };

  const leaveRoom = () => {
    if (socketRef.current) {
      socketRef.current.emit('leave-room');
      socketRef.current.disconnect();
      socketRef.current = null;
      setWatchSocket(null);
    }
    setRoom(null);
    setPhase('lobby');
    setJoinCode('');
    setStreamReady(false);
    setCountdown(0);
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  const isHost = room?.hostId === socketRef.current?.id;
  const allReady = room ? room.members.length >= 2 && room.members.every(m => m.isReady) : false;

  // ─── Lobby: name + create/join ───
  if (phase === 'lobby') {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ScrollView contentContainerStyle={styles.lobbyContent} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => nav.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </Pressable>

          <Animated.View entering={FadeIn.duration(500)} style={styles.lobbyHeader}>
            <View style={styles.lobbyIconCircle}>
              <Ionicons name="people" size={48} color={COLORS.primary} />
            </View>
            <Text style={styles.lobbyTitle}>Смотреть вместе</Text>
            <Text style={styles.lobbySubtitle}>Создайте комнату или присоединитесь к друзьям</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(400).delay(100)}>
            <Text style={styles.label}>Ваше имя</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="person-outline" size={20} color={COLORS.textMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Введите имя"
                placeholderTextColor={COLORS.textMuted}
                value={userName}
                onChangeText={setUserName}
                selectionColor={COLORS.primary}
              />
            </View>
          </Animated.View>

          {/* Create — goes to movie search */}
          <Animated.View entering={FadeInDown.duration(400).delay(200)} style={styles.section}>
            <Pressable onPress={() => {
              if (!userName.trim()) { Alert.alert('Ошибка', 'Введите имя'); return; }
              setPhase('search');
            }} style={styles.createBtn}>
              <Ionicons name="add-circle" size={22} color="#fff" />
              <Text style={styles.createBtnText}>Создать комнату</Text>
            </Pressable>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(400).delay(300)} style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>или</Text>
            <View style={styles.dividerLine} />
          </Animated.View>

          {/* Join */}
          <Animated.View entering={FadeInDown.duration(400).delay(400)}>
            <Text style={styles.label}>Код комнаты</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="key-outline" size={20} color={COLORS.textMuted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { letterSpacing: 2, fontSize: 18, fontFamily: FONTS.bold }]}
                placeholder="ABCDEF"
                placeholderTextColor={COLORS.textMuted}
                value={joinCode}
                onChangeText={t => setJoinCode(t.toUpperCase().slice(0, 6))}
                autoCapitalize="characters"
                maxLength={6}
                selectionColor={COLORS.primary}
              />
            </View>
            <Pressable onPress={joinRoom} disabled={loading} style={[styles.joinBtn, loading && { opacity: 0.7 }]}>
              {loading ? <ActivityIndicator color={COLORS.primary} /> : (
                <>
                  <Ionicons name="enter-outline" size={20} color={COLORS.primary} />
                  <Text style={styles.joinBtnText}>Присоединиться</Text>
                </>
              )}
            </Pressable>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(400).delay(500)} style={styles.infoBlock}>
            <View style={styles.infoRow}>
              <Ionicons name="globe-outline" size={18} color={COLORS.textMuted} />
              <Text style={styles.infoText}>Работает между приложением и сайтом kino.lead-seek.ru</Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="chatbubbles-outline" size={18} color={COLORS.textMuted} />
              <Text style={styles.infoText}>Общайтесь в чате во время просмотра</Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="sync-outline" size={18} color={COLORS.textMuted} />
              <Text style={styles.infoText}>Синхронное воспроизведение для всех</Text>
            </View>
          </Animated.View>
        </ScrollView>
      </View>
    );
  }

  // ─── Search: pick a movie before creating room ───
  if (phase === 'search') {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.searchHeader}>
          <Pressable onPress={() => setPhase('lobby')} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </Pressable>
          <Text style={styles.searchTitle}>Выберите фильм</Text>
        </View>
        <View style={styles.searchInputWrap}>
          <Ionicons name="search" size={20} color={COLORS.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Поиск фильма..."
            placeholderTextColor={COLORS.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={doSearch}
            returnKeyType="search"
            selectionColor={COLORS.primary}
            autoFocus
          />
          {searching && <ActivityIndicator size="small" color={COLORS.primary} />}
        </View>

        {loading && (
          <View style={styles.loadingCenter}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Создание комнаты...</Text>
          </View>
        )}

        {!loading && (
          <FlatList
            data={searchResults}
            keyExtractor={item => String(item.id)}
            contentContainerStyle={{ paddingHorizontal: SPACING.lg }}
            renderItem={({ item }) => {
              const img = posterUrl(item.poster_path, 'w92');
              return (
                <Pressable onPress={() => selectMovieAndCreate(item)} style={styles.searchItem}>
                  <View style={styles.searchItemPoster}>
                    {img && <Image source={{ uri: img }} style={{ width: '100%', height: '100%' }} contentFit="cover" />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.searchItemTitle} numberOfLines={2}>{item.title}</Text>
                    <Text style={styles.searchItemYear}>{item.release_date?.split('-')[0]}</Text>
                  </View>
                  <Ionicons name="add-circle-outline" size={24} color={COLORS.primary} />
                </Pressable>
              );
            }}
            ListEmptyComponent={searchQuery && !searching ? (
              <Text style={styles.emptySearch}>Ничего не найдено</Text>
            ) : null}
          />
        )}
      </View>
    );
  }

  // ─── Room: waiting + chat ───
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        {/* Room Header */}
        <View style={styles.roomHeader}>
          <Pressable onPress={leaveRoom} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </Pressable>
          <View style={{ flex: 1, marginLeft: SPACING.md }}>
            <Text style={styles.roomTitle} numberOfLines={1}>{room?.movieTitle || 'Комната'}</Text>
            <View style={styles.codeRow}>
              <Text style={styles.roomCode}>{room?.code}</Text>
              <Pressable onPress={shareRoom} hitSlop={8} style={styles.shareBtn}>
                <Ionicons name="share-outline" size={18} color={COLORS.primary} />
              </Pressable>
            </View>
          </View>
          <View style={styles.usersCount}>
            <Ionicons name="people" size={16} color={COLORS.primary} />
            <Text style={styles.usersCountText}>{room?.members.length || 1}</Text>
          </View>
        </View>

        {/* Members */}
        <View style={styles.usersBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: SPACING.lg }}>
            {room?.members.map((m) => (
              <View key={m.id} style={styles.userChip}>
                <View style={[styles.userAvatar, m.isHost && { backgroundColor: COLORS.primary }]}>
                  <Text style={styles.userAvatarText}>{m.name[0]?.toUpperCase()}</Text>
                </View>
                <Text style={styles.userChipName} numberOfLines={1}>{m.name}</Text>
                {m.isHost && <Ionicons name="star" size={12} color={COLORS.star} />}
                {m.isReady && <Ionicons name="checkmark-circle" size={14} color="#22c55e" />}
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Movie info + Start button */}
        <View style={styles.movieSection}>
          {room?.moviePoster && (
            <View style={styles.selectedMovie}>
              <View style={styles.selectedPoster}>
                <Image source={{ uri: posterUrl(room.moviePoster)! }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.selectedTitle} numberOfLines={2}>{room.movieTitle}</Text>
                {streamReady ? (
                  <Text style={styles.readyText}>Стрим загружен</Text>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <ActivityIndicator size="small" color={COLORS.primary} />
                    <Text style={styles.loadingStreamText}>Загрузка стрима...</Text>
                  </View>
                )}
                {countdown > 0 && (
                  <Text style={styles.countdownText}>Начинаем через {countdown}...</Text>
                )}
                {isHost && streamReady && !countdown && (
                  <Pressable onPress={startPlayback} style={[styles.watchBtn, !allReady && { opacity: 0.6 }]}>
                    <Ionicons name="play-circle" size={20} color="#fff" />
                    <Text style={styles.watchBtnText}>
                      {allReady ? 'Начать просмотр' : `Ждём участников (${room?.members.filter(m => m.isReady).length}/${room?.members.length})`}
                    </Text>
                  </Pressable>
                )}
                {!isHost && streamReady && !countdown && (
                  <Text style={styles.waitingText}>Ожидание хоста...</Text>
                )}
              </View>
            </View>
          )}
        </View>

        {/* Chat */}
        <View style={styles.chatContainer}>
          <View style={styles.chatHeader}>
            <Ionicons name="chatbubbles" size={18} color={COLORS.primary} />
            <Text style={styles.chatTitle}>Чат</Text>
          </View>
          <FlatList
            ref={chatListRef}
            data={room?.messages || []}
            keyExtractor={item => item.id}
            style={styles.chatList}
            contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm }}
            renderItem={({ item }) => (
              <View style={[styles.chatMsg, item.type === 'system' && styles.chatMsgSystem]}>
                {item.type === 'system' ? (
                  <Text style={styles.chatSystemText}>{item.text}</Text>
                ) : (
                  <>
                    <View style={styles.chatMsgHeader}>
                      <Text style={[styles.chatAuthor, item.author === userName && { color: COLORS.primary }]}>
                        {item.author}
                      </Text>
                      <Text style={styles.chatTime}>{formatTime(item.timestamp)}</Text>
                    </View>
                    <Text style={styles.chatText}>{item.text}</Text>
                  </>
                )}
              </View>
            )}
            onContentSizeChange={() => chatListRef.current?.scrollToEnd({ animated: true })}
          />
          <View style={[styles.chatInputRow, { paddingBottom: Math.max(insets.bottom, 8) }]}>
            <TextInput
              style={styles.chatInput}
              placeholder="Написать сообщение..."
              placeholderTextColor={COLORS.textMuted}
              value={chatText}
              onChangeText={setChatText}
              selectionColor={COLORS.primary}
              onSubmitEditing={sendChat}
              returnKeyType="send"
            />
            <Pressable onPress={sendChat} style={styles.chatSendBtn} disabled={!chatText.trim()}>
              <Ionicons name="send" size={20} color={chatText.trim() ? COLORS.primary : COLORS.textMuted} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  backBtn: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md },

  // Lobby
  lobbyContent: { flexGrow: 1, paddingHorizontal: SPACING.xxl, paddingBottom: 40 },
  lobbyHeader: { alignItems: 'center', marginTop: SPACING.xxl, marginBottom: 32 },
  lobbyIconCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: COLORS.primary + '15', alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.lg },
  lobbyTitle: { color: COLORS.text, fontSize: 28, fontFamily: FONTS.extrabold, letterSpacing: -0.5 },
  lobbySubtitle: { color: COLORS.textMuted, fontSize: 14, fontFamily: FONTS.regular, marginTop: 4, textAlign: 'center' },
  label: { color: COLORS.textSecondary, fontSize: 13, fontFamily: FONTS.medium, marginBottom: 6, marginLeft: 4 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bgElevated, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, height: 52 },
  inputIcon: { marginRight: SPACING.sm },
  input: { flex: 1, color: COLORS.text, fontSize: 16, fontFamily: FONTS.medium },
  section: { marginTop: SPACING.xl },
  createBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.primary, height: 52, borderRadius: RADIUS.lg },
  createBtnText: { color: '#fff', fontSize: 16, fontFamily: FONTS.bold },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: SPACING.xxl },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { color: COLORS.textMuted, fontSize: 13, fontFamily: FONTS.medium, paddingHorizontal: SPACING.lg },
  joinBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: RADIUS.lg, borderWidth: 1.5, borderColor: COLORS.primary, marginTop: SPACING.md },
  joinBtnText: { color: COLORS.primary, fontSize: 16, fontFamily: FONTS.bold },
  infoBlock: { marginTop: SPACING.xxxl, gap: SPACING.md },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  infoText: { color: COLORS.textMuted, fontSize: 13, fontFamily: FONTS.regular, flex: 1 },

  // Search
  searchHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, gap: SPACING.md },
  searchTitle: { color: COLORS.text, fontSize: 18, fontFamily: FONTS.bold },
  searchInputWrap: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.bgElevated, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, height: 44, marginHorizontal: SPACING.lg, marginBottom: SPACING.sm },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 14, fontFamily: FONTS.medium },
  searchItem: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  searchItemPoster: { width: 45, height: 67, borderRadius: RADIUS.sm, overflow: 'hidden', backgroundColor: COLORS.bgCard },
  searchItemTitle: { color: COLORS.text, fontSize: 14, fontFamily: FONTS.medium },
  searchItemYear: { color: COLORS.textMuted, fontSize: 12, fontFamily: FONTS.regular, marginTop: 2 },
  emptySearch: { color: COLORS.textMuted, textAlign: 'center', paddingVertical: SPACING.xl, fontFamily: FONTS.regular },
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md },
  loadingText: { color: COLORS.textMuted, fontSize: 14, fontFamily: FONTS.medium },

  // Room header
  roomHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  roomTitle: { color: COLORS.text, fontSize: 16, fontFamily: FONTS.bold },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  roomCode: { color: COLORS.primary, fontSize: 18, fontFamily: FONTS.extrabold, letterSpacing: 3 },
  shareBtn: { padding: 4 },
  usersCount: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.bgElevated, paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.pill },
  usersCountText: { color: COLORS.text, fontSize: 14, fontFamily: FONTS.bold },

  // Users bar
  usersBar: { paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  userChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.bgElevated, paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.pill, marginRight: SPACING.sm },
  userAvatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center' },
  userAvatarText: { color: '#fff', fontSize: 12, fontFamily: FONTS.bold },
  userChipName: { color: COLORS.text, fontSize: 13, fontFamily: FONTS.medium, maxWidth: 80 },

  // Movie section
  movieSection: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  selectedMovie: { flexDirection: 'row', gap: SPACING.md, backgroundColor: COLORS.bgElevated, borderRadius: RADIUS.lg, padding: SPACING.md },
  selectedPoster: { width: 80, height: 120, borderRadius: RADIUS.sm, overflow: 'hidden', backgroundColor: COLORS.bgCard },
  selectedTitle: { color: COLORS.text, fontSize: 16, fontFamily: FONTS.bold, marginBottom: SPACING.xs },
  readyText: { color: '#22c55e', fontSize: 13, fontFamily: FONTS.medium, marginBottom: SPACING.sm },
  loadingStreamText: { color: COLORS.textMuted, fontSize: 13, fontFamily: FONTS.medium },
  countdownText: { color: COLORS.primary, fontSize: 20, fontFamily: FONTS.extrabold, marginVertical: SPACING.sm },
  waitingText: { color: COLORS.textMuted, fontSize: 13, fontFamily: FONTS.medium, fontStyle: 'italic', marginTop: SPACING.sm },
  watchBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.primary, paddingVertical: 10, borderRadius: RADIUS.md, marginTop: SPACING.sm },
  watchBtnText: { color: '#fff', fontSize: 13, fontFamily: FONTS.bold },

  // Chat
  chatContainer: { flex: 1, borderTopWidth: 1, borderTopColor: COLORS.border },
  chatHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm },
  chatTitle: { color: COLORS.text, fontSize: 14, fontFamily: FONTS.bold },
  chatList: { flex: 1 },
  chatMsg: { marginBottom: SPACING.sm },
  chatMsgSystem: { alignItems: 'center' },
  chatMsgHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  chatAuthor: { color: COLORS.accent, fontSize: 13, fontFamily: FONTS.bold },
  chatTime: { color: COLORS.textMuted, fontSize: 11, fontFamily: FONTS.regular },
  chatSystemText: { color: COLORS.textMuted, fontSize: 12, fontFamily: FONTS.regular, fontStyle: 'italic', textAlign: 'center' },
  chatText: { color: COLORS.text, fontSize: 14, fontFamily: FONTS.regular, marginTop: 2 },
  chatInputRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border, gap: SPACING.sm },
  chatInput: { flex: 1, backgroundColor: COLORS.bgElevated, borderRadius: RADIUS.pill, paddingHorizontal: SPACING.lg, paddingVertical: 10, color: COLORS.text, fontSize: 14, fontFamily: FONTS.regular },
  chatSendBtn: { padding: 8 },
});
