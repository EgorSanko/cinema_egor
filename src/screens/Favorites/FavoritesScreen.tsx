import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, Dimensions, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { posterUrl } from '../../api/tmdb';
import { getFavorites, getHistory, type FavoriteItem, type HistoryItem } from '../../utils/storage';
import { getUser, logout, type User } from '../../utils/auth';
import { COLORS, RADIUS, FONTS, SPACING } from '../../constants/theme';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = (SCREEN_W - SPACING.lg * 2 - SPACING.md * 2) / 3;

type Tab = 'favorites' | 'history' | 'profile';

export function FavoritesScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('favorites');
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [user, setUser] = useState<User | null>(null);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setFavorites(await getFavorites());
        setHistory(await getHistory());
        setUser(await getUser());
      })();
    }, [])
  );

  const goToDetail = (item: FavoriteItem) => {
    if (item.type === 'movie') {
      nav.navigate('MovieDetail', { id: item.id, title: item.title });
    } else {
      nav.navigate('TVDetail', { id: item.id, title: item.title });
    }
  };

  const handleLogout = () => {
    Alert.alert('Выйти', 'Вы уверены?', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Выйти',
        style: 'destructive',
        onPress: async () => {
          await logout();
          // Force reload by navigating to auth
          // In a real app, use a context or state manager
        },
      },
    ]);
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins} мин назад`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}ч назад`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Вчера';
    if (diffDays < 7) return `${diffDays}д назад`;
    return d.toLocaleDateString('ru-RU');
  };

  const data = tab === 'favorites' ? favorites : history;
  const emptyIcon = tab === 'favorites' ? 'heart-outline' : 'time-outline';
  const emptyText = tab === 'favorites' ? 'Пока пусто' : 'Нет истории';
  const emptySubtext = tab === 'favorites'
    ? 'Добавляйте фильмы в избранное'
    : 'Начните смотреть фильмы';

  const renderItem = ({ item, index }: { item: FavoriteItem; index: number }) => {
    const img = posterUrl(item.poster_path);
    const histItem = item as HistoryItem;
    const progress = histItem.progress && histItem.duration
      ? Math.min(histItem.progress / histItem.duration, 1)
      : 0;

    return (
      <Animated.View entering={FadeInDown.duration(300).delay(Math.min(index, 12) * 40)}>
        <Pressable onPress={() => goToDetail(item)} style={styles.card}>
          <View style={styles.cardPoster}>
            {img ? (
              <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: COLORS.bgElevated, alignItems: 'center', justifyContent: 'center' }]}>
                <Ionicons name="film" size={24} color={COLORS.textMuted} />
              </View>
            )}
            {tab === 'history' && progress > 0 && (
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
              </View>
            )}
          </View>
          <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
          {tab === 'history' && histItem.watchedAt && (
            <Text style={styles.cardTime}>{formatDate(histItem.watchedAt)}</Text>
          )}
        </Pressable>
      </Animated.View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
        <Text style={styles.headerTitle}>Моя коллекция</Text>
        {user && (
          <Pressable onPress={handleLogout} style={styles.profileBtn} hitSlop={8}>
            <Ionicons name="person-circle" size={28} color={COLORS.textSecondary} />
          </Pressable>
        )}
      </Animated.View>

      {user && (
        <View style={styles.userInfo}>
          <Ionicons name="person" size={16} color={COLORS.primary} />
          <Text style={styles.userName}>{user.name}</Text>
          <Text style={styles.userEmail}>{user.email}</Text>
        </View>
      )}

      {/* Tabs */}
      <View style={styles.tabs}>
        {(['favorites', 'history'] as Tab[]).map(t => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            style={[styles.tab, tab === t && styles.tabActive]}
          >
            <Ionicons
              name={t === 'favorites' ? 'heart' : 'time'}
              size={16}
              color={tab === t ? COLORS.primary : COLORS.textMuted}
            />
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'favorites' ? `Избранное (${favorites.length})` : `История (${history.length})`}
            </Text>
          </Pressable>
        ))}
      </View>

      {data.length > 0 ? (
        <FlatList
          data={data}
          renderItem={renderItem}
          keyExtractor={item => `${item.type}-${item.id}`}
          numColumns={3}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.gridRow}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <View style={styles.empty}>
          <Ionicons name={emptyIcon as any} size={48} color={COLORS.textMuted} />
          <Text style={styles.emptyText}>{emptyText}</Text>
          <Text style={styles.emptySubtext}>{emptySubtext}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.lg,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  headerTitle: {
    color: COLORS.text, fontSize: 28, fontFamily: FONTS.extrabold, letterSpacing: -0.5,
  },
  profileBtn: { padding: 4 },
  userInfo: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md,
  },
  userName: { color: COLORS.text, fontSize: 14, fontFamily: FONTS.semibold },
  userEmail: { color: COLORS.textMuted, fontSize: 12, fontFamily: FONTS.regular },
  tabs: {
    flexDirection: 'row', paddingHorizontal: SPACING.lg, gap: SPACING.sm, marginBottom: SPACING.lg,
  },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
    borderRadius: RADIUS.pill, backgroundColor: COLORS.bgElevated,
    borderWidth: 1, borderColor: COLORS.border,
  },
  tabActive: { backgroundColor: COLORS.primary + '20', borderColor: COLORS.primary + '40' },
  tabText: { color: COLORS.textMuted, fontSize: 13, fontFamily: FONTS.semibold },
  tabTextActive: { color: COLORS.primary },
  grid: { paddingHorizontal: SPACING.lg, paddingBottom: 100 },
  gridRow: { gap: SPACING.md, marginBottom: SPACING.md },
  card: { width: CARD_W },
  cardPoster: {
    width: CARD_W, height: CARD_W * 1.5, borderRadius: RADIUS.md,
    overflow: 'hidden', backgroundColor: COLORS.bgCard,
  },
  cardTitle: {
    color: COLORS.text, fontSize: 12, fontFamily: FONTS.medium,
    marginTop: SPACING.xs, lineHeight: 16,
  },
  cardTime: {
    color: COLORS.textMuted, fontSize: 10, fontFamily: FONTS.regular, marginTop: 2,
  },
  progressBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  progressFill: { height: '100%', backgroundColor: COLORS.primary },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText: { color: COLORS.textSecondary, fontSize: 18, fontFamily: FONTS.semibold },
  emptySubtext: { color: COLORS.textMuted, fontSize: 14, fontFamily: FONTS.regular },
});
