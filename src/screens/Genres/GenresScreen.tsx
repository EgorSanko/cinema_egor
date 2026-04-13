import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { getGenres } from '../../api/tmdb';
import { COLORS, RADIUS, FONTS, SPACING } from '../../constants/theme';

const GENRE_ICONS: Record<number, string> = {
  28: 'flash', 12: 'compass', 16: 'color-palette', 35: 'happy',
  80: 'skull', 99: 'document-text', 18: 'heart', 10751: 'people',
  14: 'sparkles', 36: 'time', 27: 'skull-outline', 10402: 'musical-notes',
  9648: 'help-circle', 10749: 'rose', 878: 'planet', 10770: 'tv',
  53: 'warning', 10752: 'flag', 37: 'sunny',
};

const GENRE_COLORS = [
  '#e11d48', '#8b5cf6', '#0ea5e9', '#22c55e', '#f59e0b',
  '#ef4444', '#6366f1', '#14b8a6', '#f97316', '#ec4899',
  '#3b82f6', '#10b981', '#a855f7', '#06b6d4', '#eab308',
  '#dc2626', '#7c3aed', '#059669', '#d97706',
];

export function GenresScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [genres, setGenres] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const g = await getGenres();
        setGenres(g);
      } catch {}
      setLoading(false);
    })();
  }, []);

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
        <Text style={styles.headerTitle}>Жанры</Text>
      </Animated.View>
      <FlatList
        data={genres}
        numColumns={2}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.gridRow}
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index }) => {
          const color = GENRE_COLORS[index % GENRE_COLORS.length];
          const iconName = GENRE_ICONS[item.id] || 'film';
          return (
            <Animated.View entering={FadeInDown.duration(300).delay(index * 40)} style={{ flex: 1 }}>
              <Pressable
                onPress={() => nav.navigate('GenreMovies', { genreId: item.id, genreName: item.name })}
                style={[styles.card, { borderColor: color + '30' }]}
              >
                <View style={[styles.iconWrap, { backgroundColor: color + '20' }]}>
                  <Ionicons name={iconName as any} size={24} color={color} />
                </View>
                <Text style={styles.cardText}>{item.name}</Text>
              </Pressable>
            </Animated.View>
          );
        }}
      />
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
  grid: { paddingHorizontal: SPACING.lg, paddingBottom: 100 },
  gridRow: { gap: SPACING.md, marginBottom: SPACING.md },
  card: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    alignItems: 'center',
    gap: SPACING.sm,
    minHeight: 100,
    justifyContent: 'center',
  },
  iconWrap: {
    width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center',
  },
  cardText: {
    color: COLORS.text, fontSize: 13, fontFamily: FONTS.semibold, textAlign: 'center',
  },
});
