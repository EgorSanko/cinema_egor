import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, FlatList, Pressable, StyleSheet, Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { searchMovies, searchTV, posterUrl } from '../../api/tmdb';
import { COLORS, RADIUS, FONTS, SPACING } from '../../constants/theme';

type ResultItem = {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  vote_average: number;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
  type: 'movie' | 'tv';
};

export function SearchScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleSearch = useCallback((text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      if (!mountedRef.current) return;
      setLoading(true);
      setSearched(true);
      try {
        const [movies, tvShows] = await Promise.all([
          searchMovies(text),
          searchTV(text),
        ]);
        if (!mountedRef.current) return;
        const combined: ResultItem[] = [
          ...movies.map(m => ({ ...m, type: 'movie' as const })),
          ...tvShows.map(t => ({ ...t, title: t.name, type: 'tv' as const })),
        ].sort((a, b) => b.vote_average - a.vote_average);
        setResults(combined);
      } catch {
        if (mountedRef.current) setResults([]);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    }, 400);
  }, []);

  const goToDetail = (item: ResultItem) => {
    Keyboard.dismiss();
    if (item.type === 'movie') {
      nav.navigate('MovieDetail', { id: item.id, title: item.title });
    } else {
      nav.navigate('TVDetail', { id: item.id, title: item.name || item.title });
    }
  };

  const renderResult = ({ item, index }: { item: ResultItem; index: number }) => {
    const img = posterUrl(item.poster_path);
    const title = item.title || item.name || '';
    const year = (item.release_date || item.first_air_date || '').slice(0, 4);
    const badge = item.type === 'tv' ? 'Сериал' : 'Фильм';

    return (
      <Animated.View entering={FadeInDown.duration(300).delay(index * 50)}>
        <Pressable onPress={() => goToDetail(item)} style={styles.resultCard}>
          <View style={styles.resultPoster}>
            {img ? (
              <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.resultPosterPlaceholder]}>
                <Text style={{ fontSize: 24 }}>🎬</Text>
              </View>
            )}
          </View>
          <View style={styles.resultInfo}>
            <Text style={styles.resultTitle} numberOfLines={2}>{title}</Text>
            <View style={styles.resultMeta}>
              <View style={[styles.typeBadge, item.type === 'tv' && styles.typeBadgeTV]}>
                <Text style={styles.typeBadgeText}>{badge}</Text>
              </View>
              {year ? <Text style={styles.resultYear}>{year}</Text> : null}
              <Text style={styles.resultRating}>⭐ {item.vote_average.toFixed(1)}</Text>
            </View>
            {item.overview ? (
              <Text style={styles.resultOverview} numberOfLines={2}>{item.overview}</Text>
            ) : null}
          </View>
        </Pressable>
      </Animated.View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Search bar */}
      <Animated.View entering={FadeIn.duration(400)} style={styles.searchBar}>
        <View style={styles.inputWrap}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.input}
            placeholder="Поиск фильмов и сериалов..."
            placeholderTextColor={COLORS.textMuted}
            value={query}
            onChangeText={handleSearch}
            autoFocus
            returnKeyType="search"
            selectionColor={COLORS.primary}
          />
          {query.length > 0 && (
            <Pressable onPress={() => handleSearch('')} hitSlop={8}>
              <Text style={styles.clearBtn}>✕</Text>
            </Pressable>
          )}
        </View>
      </Animated.View>

      {/* Results */}
      {loading ? (
        <View style={styles.center}>
          <Text style={styles.statusText}>Ищу...</Text>
        </View>
      ) : results.length > 0 ? (
        <FlatList
          data={results}
          renderItem={renderResult}
          keyExtractor={item => `${item.type}-${item.id}`}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        />
      ) : searched ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>🎬</Text>
          <Text style={styles.emptyText}>Ничего не найдено</Text>
          <Text style={styles.emptySubtext}>Попробуйте другой запрос</Text>
        </View>
      ) : (
        <View style={styles.center}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>🔍</Text>
          <Text style={styles.emptyText}>Введите название</Text>
          <Text style={styles.emptySubtext}>фильма или сериала</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  searchBar: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgElevated,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    height: 48,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: SPACING.sm,
  },
  input: {
    flex: 1,
    color: COLORS.text,
    fontSize: 16,
    fontFamily: FONTS.medium,
  },
  clearBtn: {
    color: COLORS.textMuted,
    fontSize: 16,
    padding: 4,
  },
  list: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: 100,
  },
  resultCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  resultPoster: {
    width: 85,
    height: 128,
    backgroundColor: COLORS.bgElevated,
  },
  resultPosterPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bgElevated,
  },
  resultInfo: {
    flex: 1,
    padding: SPACING.md,
    justifyContent: 'center',
  },
  resultTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontFamily: FONTS.semibold,
    marginBottom: 6,
    lineHeight: 20,
  },
  resultMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  typeBadge: {
    backgroundColor: COLORS.primary + '20',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  typeBadgeTV: {
    backgroundColor: COLORS.accent + '20',
  },
  typeBadgeText: {
    color: COLORS.primaryLight,
    fontSize: 11,
    fontFamily: FONTS.semibold,
  },
  resultYear: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontFamily: FONTS.medium,
  },
  resultRating: {
    color: COLORS.star,
    fontSize: 12,
    fontFamily: FONTS.medium,
  },
  resultOverview: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontFamily: FONTS.regular,
    lineHeight: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: {
    color: COLORS.textSecondary,
    fontSize: 16,
    fontFamily: FONTS.medium,
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: 18,
    fontFamily: FONTS.semibold,
  },
  emptySubtext: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontFamily: FONTS.regular,
    marginTop: 4,
  },
});
