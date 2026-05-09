import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, RefreshControl, StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { HeroCarousel } from '../../components/HeroCarousel';
import { SectionRow } from '../../components/SectionRow';
import { HomeSkeleton } from '../../components/SkeletonLoader';
import { getTrending, getPopular, getLatest, getTopRated, getMovieRecommendations, posterUrl } from '../../api/tmdb';
import { getHistory, type HistoryItem } from '../../utils/storage';
import type { Movie } from '../../api/tmdb';
import { COLORS, RADIUS, FONTS, SPACING } from '../../constants/theme';

type ContinueItem = HistoryItem & {
  // Where to actually launch when card is tapped (may differ from item.season/episode
  // if last watched episode is completed — then we suggest the next one)
  launchSeason?: number;
  launchEpisode?: number;
  launchProgress?: number;
  isNextEpisode?: boolean; // true when card represents the NEXT (not last watched) episode
};

const ContinueCard = ({ item, onPress }: { item: ContinueItem; onPress: () => void }) => {
  const img = posterUrl(item.poster_path);
  const progress = item.isNextEpisode
    ? 0
    : item.duration > 0 ? Math.min(item.progress / item.duration, 1) : 0;
  const remaining = Math.max(0, item.duration - item.progress);
  const mins = Math.ceil(remaining / 60);
  const showSeason = item.launchSeason ?? item.season;
  const showEpisode = item.launchEpisode ?? item.episode;
  return (
    <Pressable onPress={onPress} style={styles.continueCard}>
      <View style={styles.continuePoster}>
        {img && <Image source={{ uri: img }} style={{ width: '100%', height: '100%' }} contentFit="cover" />}
        <View style={styles.continueProgress}><View style={[styles.continueProgressFill, { width: `${progress * 100}%` }]} /></View>
        {item.isNextEpisode && (
          <View style={styles.continueNextBadge}>
            <Text style={styles.continueNextBadgeText}>СЛЕД.</Text>
          </View>
        )}
      </View>
      <Text style={styles.continueTitle} numberOfLines={2}>{item.title}</Text>
      {showSeason && showEpisode && (
        <Text style={styles.continueEpisode}>S{showSeason}E{showEpisode}</Text>
      )}
      <Text style={styles.continueTime}>
        {item.isNextEpisode ? 'Начать следующую' : `${mins} мин осталось`}
      </Text>
    </Pressable>
  );
};

export function HomeScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [trending, setTrending] = useState<Movie[]>([]);
  const [popular, setPopular] = useState<Movie[]>([]);
  const [latest, setLatest] = useState<Movie[]>([]);
  const [topRated, setTopRated] = useState<Movie[]>([]);
  const [continueWatching, setContinueWatching] = useState<ContinueItem[]>([]);
  const [recommendations, setRecommendations] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const results = await Promise.allSettled([getTrending(), getPopular(), getLatest(), getTopRated()]);
      setTrending(results[0].status === 'fulfilled' ? results[0].value : []);
      setPopular(results[1].status === 'fulfilled' ? results[1].value : []);
      setLatest(results[2].status === 'fulfilled' ? results[2].value : []);
      setTopRated(results[3].status === 'fulfilled' ? results[3].value : []);
    } catch (e) { console.warn('Home fetch error:', e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchAll(); }, []);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    (async () => {
      try {
        const hist = await getHistory();
        if (cancelled) return;

        // Build "Continue Watching" with smart logic:
        // - Movies: show only if not finished (<95%)
        // - TV series: always show latest watched episode of each show.
        //   If that episode is completed, show NEXT episode card (with progress 0).
        const items: ContinueItem[] = [];
        const seenShows = new Set<string>();
        for (const h of hist) {
          if (h.duration <= 0) continue;
          const key = `${h.type}_${h.id}`;
          if (seenShows.has(key)) continue;
          seenShows.add(key);

          const ratio = h.progress / h.duration;
          const isFinished = ratio >= 0.95;

          if (h.type === 'movie') {
            if (!isFinished) items.push({ ...h });
          } else {
            // TV series
            if (!isFinished) {
              items.push({
                ...h,
                launchSeason: h.season,
                launchEpisode: h.episode,
                launchProgress: h.progress,
              });
            } else if (h.season && h.episode) {
              // Suggest next episode (we don't know runtime/title yet — generic "next")
              items.push({
                ...h,
                launchSeason: h.season,
                launchEpisode: h.episode + 1,
                launchProgress: 0,
                isNextEpisode: true,
              });
            }
          }
        }
        setContinueWatching(items.slice(0, 10));

        // Build recommendations from last 3 watched
        const unique = hist.slice(0, 3);
        if (unique.length > 0) {
          const recsArrays = await Promise.all(unique.map(h => getMovieRecommendations(h.id).catch(() => [])));
          if (cancelled) return;
          const allRecs = recsArrays.flat();
          const recsSeen = new Set<number>();
          const deduped = allRecs.filter(m => { if (recsSeen.has(m.id)) return false; recsSeen.add(m.id); return true; });
          setRecommendations(deduped.slice(0, 20));
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []));

  const goToMovie = (movie: Movie) => nav.navigate('MovieDetail', { id: movie.id, title: movie.title });
  const goToHistoryItem = (item: ContinueItem) => {
    const screen = item.type === 'movie' ? 'MovieDetail' : 'TVDetail';
    nav.navigate(screen, {
      id: item.id,
      title: item.title,
      // Pass startup hints — MovieDetailScreen will pre-select season/episode and auto-play
      startSeason: item.launchSeason,
      startEpisode: item.launchEpisode,
      startProgress: item.launchProgress,
      autoPlay: true,
    });
  };

  if (loading) return <HomeSkeleton />;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
      <ScrollView showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchAll(); }} tintColor={COLORS.primary} colors={[COLORS.primary]} progressBackgroundColor={COLORS.bgCard} />}>

        <Animated.View entering={FadeIn.duration(600)}>
          <HeroCarousel movies={trending} onPress={goToMovie} />
        </Animated.View>

        {/* Quick actions */}
        <View style={styles.quickActions}>
          <Pressable onPress={() => nav.navigate('Swipe')} style={styles.quickBtn}>
            <Ionicons name="swap-horizontal" size={18} color={COLORS.primary} />
            <Text style={styles.quickBtnText}>Свайп</Text>
          </Pressable>
          <Pressable onPress={() => nav.navigate('Collections')} style={styles.quickBtn}>
            <Ionicons name="albums" size={18} color={COLORS.accent} />
            <Text style={styles.quickBtnText}>Подборки</Text>
          </Pressable>
          <Pressable onPress={() => nav.navigate('WatchTogether')} style={styles.quickBtn}>
            <Ionicons name="people" size={18} color={COLORS.success} />
            <Text style={styles.quickBtnText}>Вместе</Text>
          </Pressable>
        </View>

        {continueWatching.length > 0 && (
          <Animated.View entering={FadeIn.duration(600).delay(100)}>
            <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>▶ Продолжить просмотр</Text></View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: SPACING.lg }}>
              {continueWatching.map(item => <ContinueCard key={`${item.type}-${item.id}`} item={item} onPress={() => goToHistoryItem(item)} />)}
            </ScrollView>
          </Animated.View>
        )}

        {recommendations.length > 0 && (
          <SectionRow title="Рекомендации для вас" movies={recommendations} onPressMovie={goToMovie} />
        )}

        <SectionRow title="Популярное" movies={popular} onPressMovie={goToMovie} />
        <SectionRow title="Новинки" movies={latest} onPressMovie={goToMovie} />
        <SectionRow title="Лучшее" movies={topRated} onPressMovie={goToMovie} />

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  quickActions: { flexDirection: 'row', paddingHorizontal: SPACING.lg, gap: SPACING.sm, marginVertical: SPACING.md },
  quickBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.bgElevated, paddingHorizontal: 14, paddingVertical: 10, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border },
  quickBtnText: { color: COLORS.text, fontSize: 13, fontFamily: FONTS.medium },
  sectionHeader: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.sm },
  sectionTitle: { color: COLORS.text, fontSize: 18, fontFamily: FONTS.bold },
  continueCard: { width: 130, marginRight: SPACING.md, marginBottom: SPACING.md },
  continuePoster: { width: 130, height: 195, borderRadius: RADIUS.md, overflow: 'hidden', backgroundColor: COLORS.bgCard },
  continueProgress: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.2)' },
  continueProgressFill: { height: '100%', backgroundColor: COLORS.primary },
  continueNextBadge: {
    position: 'absolute', top: 6, right: 6,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 4,
  },
  continueNextBadgeText: {
    color: '#000', fontSize: 9, fontFamily: FONTS.bold, letterSpacing: 0.5,
  },
  continueTitle: { color: COLORS.text, fontSize: 12, fontFamily: FONTS.medium, marginTop: SPACING.xs, lineHeight: 16 },
  continueEpisode: { color: COLORS.primary, fontSize: 11, fontFamily: FONTS.bold, marginTop: 2 },
  continueTime: { color: COLORS.textMuted, fontSize: 11, fontFamily: FONTS.regular, marginTop: 2 },
});
