import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { getTopRated, getMoviesByGenre } from '../../api/tmdb';
import { SectionRow } from '../../components/SectionRow';
import type { Movie } from '../../api/tmdb';
import { COLORS, RADIUS, FONTS, SPACING } from '../../constants/theme';

const COLLECTIONS = [
  { title: 'Лучшие драмы', genreId: 18, icon: 'heart', color: '#e11d48' },
  { title: 'Лучшие комедии', genreId: 35, icon: 'happy', color: '#22c55e' },
  { title: 'Лучший экшн', genreId: 28, icon: 'flash', color: '#f59e0b' },
  { title: 'Лучшие ужасы', genreId: 27, icon: 'skull', color: '#8b5cf6' },
  { title: 'Лучшая анимация', genreId: 16, icon: 'color-palette', color: '#0ea5e9' },
  { title: 'Лучшая фантастика', genreId: 878, icon: 'planet', color: '#6366f1' },
];

export function CollectionsScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [topRated, setTopRated] = useState<Movie[]>([]);
  const [collections, setCollections] = useState<Record<number, Movie[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const results = await Promise.allSettled([
          getTopRated(),
          ...COLLECTIONS.map(c => getMoviesByGenre(c.genreId)),
        ]);
        const top = results[0].status === 'fulfilled' ? results[0].value : [];
        setTopRated(top);
        const map: Record<number, Movie[]> = {};
        COLLECTIONS.forEach((c, i) => {
          const r = results[i + 1];
          map[c.genreId] = r.status === 'fulfilled' ? r.value : [];
        });
        setCollections(map);
      } catch {}
      setLoading(false);
    })();
  }, []);

  const goToMovie = (m: Movie) => nav.navigate('MovieDetail', { id: m.id, title: m.title });

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
          <Text style={styles.headerTitle}>Коллекции</Text>
        </Animated.View>

        <SectionRow title="⭐ Топ рейтинга" movies={topRated} onPressMovie={goToMovie} />

        {COLLECTIONS.map((c, i) => (
          <Animated.View key={c.genreId} entering={FadeInDown.duration(400).delay(i * 80)}>
            <SectionRow
              title={`${c.title}`}
              movies={collections[c.genreId] || []}
              onPressMovie={goToMovie}
            />
          </Animated.View>
        ))}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.lg },
  headerTitle: {
    color: COLORS.text, fontSize: 28, fontFamily: FONTS.extrabold, letterSpacing: -0.5,
  },
});
