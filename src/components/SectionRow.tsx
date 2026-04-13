import React from 'react';
import { View, Text, FlatList, StyleSheet, Pressable } from 'react-native';
import { MovieCard } from './MovieCard';
import { COLORS, FONTS, SPACING } from '../constants/theme';

interface Props {
  title: string;
  movies: any[];
  onPressMovie: (movie: any) => void;
  onSeeAll?: () => void;
  cardWidth?: number;
}

export function SectionRow({ title, movies, onPressMovie, onSeeAll, cardWidth }: Props) {
  if (!movies.length) return null;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {onSeeAll && (
          <Pressable onPress={onSeeAll} hitSlop={8}>
            <Text style={styles.seeAll}>Все →</Text>
          </Pressable>
        )}
      </View>
      <FlatList
        data={movies}
        renderItem={({ item, index }) => (
          <MovieCard
            movie={item}
            onPress={() => onPressMovie(item)}
            index={index}
            width={cardWidth}
          />
        )}
        keyExtractor={item => String(item.id)}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: SPACING.xxl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  title: {
    color: COLORS.text,
    fontSize: 18,
    fontFamily: FONTS.bold,
    letterSpacing: -0.3,
  },
  seeAll: {
    color: COLORS.primary,
    fontSize: 13,
    fontFamily: FONTS.semibold,
  },
  list: {
    paddingHorizontal: SPACING.lg,
  },
});
