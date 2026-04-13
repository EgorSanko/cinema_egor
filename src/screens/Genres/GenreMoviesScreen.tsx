import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { getMoviesByGenre, posterUrl } from '../../api/tmdb';
import { MovieCard } from '../../components/MovieCard';
import type { Movie } from '../../api/tmdb';
import { COLORS, FONTS, SPACING } from '../../constants/theme';

export function GenreMoviesScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { genreId, genreName } = route.params;
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchMovies = async (p: number) => {
    try {
      const m = await getMoviesByGenre(genreId, p);
      if (p === 1) {
        setMovies(m);
      } else {
        setMovies(prev => [...prev, ...m]);
      }
    } catch {}
  };

  useEffect(() => {
    (async () => {
      await fetchMovies(1);
      setLoading(false);
    })();
  }, [genreId]);

  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    const next = page + 1;
    await fetchMovies(next);
    setPage(next);
    setLoadingMore(false);
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
        <Pressable onPress={() => nav.goBack()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{genreName}</Text>
      </Animated.View>
      <FlatList
        data={movies}
        numColumns={3}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.gridRow}
        showsVerticalScrollIndicator={false}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={COLORS.primary} style={{ padding: 20 }} /> : null}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.duration(300).delay(Math.min(index, 12) * 30)}>
            <MovieCard
              movie={item}
              onPress={() => nav.navigate('MovieDetail', { id: item.id, title: item.title })}
            />
          </Animated.View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg, gap: SPACING.md,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.bgElevated,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    color: COLORS.text, fontSize: 22, fontFamily: FONTS.bold, flex: 1,
  },
  grid: { paddingHorizontal: SPACING.lg, paddingBottom: 100 },
  gridRow: { gap: SPACING.md, marginBottom: SPACING.md },
});
