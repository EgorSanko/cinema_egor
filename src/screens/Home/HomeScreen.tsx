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

const ContinueCard = ({ item, onPress }: { item: HistoryItem; onPress: () => void }) => {
  const img = posterUrl(item.poster_path);
  const progress = item.duration > 0 ? Math.min(item.progress / item.duration, 1) : 0;
  const remaining = Math.max(0, item.duration - item.progress);
  const mins = Math.ceil(remaining / 60);
  return (
    <Pressable onPress={onPress} style={styles.continueCard}>
      <View style={styles.continuePoster}>
        {img && <Image source={{ uri: img }} style={{ width: '100%', height: '100%' }} contentFit="cover" />}
        <View style={styles.continueProgress}><View style={[styles.continueProgressFill, { width: `${progress * 100}%` }]} /></View>
      </View>
      <Text style={styles.continueTitle} numberOfLines={2}>{item.title}</Text>
      {item.season && item.episode && (
        <Text style={styles.continueEpisode}>S{item.season}E{item.episode}</Text>
      )}
      <Text style={styles.continueTime}>{mins} мин осталось</Text>
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
  const [continueWatching, setContinueWatching] = useState<HistoryItem[]>([]);
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
        // Group TV episodes — only show latest episode per show
        const seen = new Set<string>();
        const unfinished = hist.filter(h => {
          if (h.duration <= 0 || (h.progress / h.duration) >= 0.95) return false;
          const key = `${h.type}_${h.id}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setContinueWatching(unfinished.slice(0, 10));
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
  const goToHistoryItem = (item: HistoryItem) => {
    const screen = item.type === 'movie' ? 'MovieDetail' : 'TVDetail';
    nav.navigate(screen, { id: item.id, title: item.title });
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
  continueTitle: { color: COLORS.text, fontSize: 12, fontFamily: FONTS.medium, marginTop: SPACING.xs, lineHeight: 16 },
  continueEpisode: { color: COLORS.primary, fontSize: 11, fontFamily: FONTS.bold, marginTop: 2 },
  continueTime: { color: COLORS.textMuted, fontSize: 11, fontFamily: FONTS.regular, marginTop: 2 },
});
