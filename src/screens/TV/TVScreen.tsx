import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { SectionRow } from '../../components/SectionRow';
import { HomeSkeleton } from '../../components/SkeletonLoader';
import { getTrendingTV, getPopularTV } from '../../api/tmdb';
import type { TVShow } from '../../api/tmdb';
import { COLORS, FONTS, SPACING } from '../../constants/theme';

export function TVScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [trending, setTrending] = useState<TVShow[]>([]);
  const [popular, setPopular] = useState<TVShow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const results = await Promise.allSettled([getTrendingTV(), getPopularTV()]);
      setTrending(results[0].status === 'fulfilled' ? results[0].value : []);
      setPopular(results[1].status === 'fulfilled' ? results[1].value : []);
    } catch (e) { console.warn(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchAll(); }, []);

  const goToTV = (show: TVShow) => nav.navigate('TVDetail', { id: show.id, title: show.name });

  if (loading) return <HomeSkeleton />;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchAll(); }} tintColor={COLORS.primary} colors={[COLORS.primary]} progressBackgroundColor={COLORS.bgCard} />}>
        <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
          <Ionicons name="tv" size={24} color={COLORS.primary} />
          <Text style={styles.headerTitle}>Сериалы</Text>
        </Animated.View>
        <SectionRow title="В тренде" movies={trending} onPressMovie={goToTV} />
        <SectionRow title="Популярные" movies={popular} onPressMovie={goToTV} />
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.sm },
  headerTitle: { color: COLORS.text, fontSize: 28, fontFamily: FONTS.extrabold, letterSpacing: -0.5 },
});
