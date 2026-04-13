import React, { useRef } from 'react';
import {
  View, Text, Pressable, StyleSheet, Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming,
  interpolate,
} from 'react-native-reanimated';
import { posterUrl } from '../api/tmdb';
import { COLORS, RADIUS, FONTS, SPACING } from '../constants/theme';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = (SCREEN_W - SPACING.lg * 2 - SPACING.md * 2) / 3;
const CARD_H = CARD_W * 1.5;

interface Props {
  movie: { id: number; title?: string; name?: string; poster_path: string | null; vote_average: number; release_date?: string; first_air_date?: string };
  onPress: () => void;
  index?: number;
  width?: number;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function MovieCard({ movie, onPress, index = 0, width }: Props) {
  const scale = useSharedValue(1);
  const cardW = width || CARD_W;
  const cardH = cardW * 1.5;

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const title = movie.title || (movie as any).name || '';
  const year = (movie.release_date || (movie as any).first_air_date || '').slice(0, 4);
  const rating = movie.vote_average?.toFixed(1);
  const img = posterUrl(movie.poster_path);

  return (
    <AnimatedPressable
      onPressIn={() => { scale.value = withTiming(0.97, { duration: 100 }); }}
      onPressOut={() => { scale.value = withTiming(1, { duration: 150 }); }}
      onPress={onPress}
      style={[styles.container, { width: cardW }, animStyle]}
    >
      <View style={[styles.poster, { height: cardH }]}>
        {img ? (
          <Image
            source={{ uri: img }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={300}
            recyclingKey={`poster-${movie.id}`}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
            <Text style={styles.placeholderText}>🎬</Text>
          </View>
        )}
        {/* Rating badge */}
        <View style={styles.ratingBadge}>
          <Text style={styles.ratingText}>⭐ {rating}</Text>
        </View>
        {/* Gradient overlay at bottom */}
        <View style={styles.gradientOverlay} />
      </View>
      <Text style={styles.title} numberOfLines={2}>{title}</Text>
      {year ? <Text style={styles.year}>{year}</Text> : null}
    </AnimatedPressable>
  );
}

export function MovieCardWide({ movie, onPress }: Props) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const title = movie.title || (movie as any).name || '';
  const img = posterUrl(movie.poster_path, 'w342');
  const rating = movie.vote_average?.toFixed(1);

  return (
    <AnimatedPressable
      onPressIn={() => { scale.value = withTiming(0.97, { duration: 100 }); }}
      onPressOut={() => { scale.value = withTiming(1, { duration: 150 }); }}
      onPress={onPress}
      style={[styles.wideCard, animStyle]}
    >
      <View style={styles.widePoster}>
        {img && (
          <Image
            source={{ uri: img }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={300}
          />
        )}
      </View>
      <View style={styles.wideInfo}>
        <Text style={styles.wideTitle} numberOfLines={2}>{title}</Text>
        <Text style={styles.wideRating}>⭐ {rating}</Text>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    marginRight: SPACING.md,
  },
  poster: {
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    backgroundColor: COLORS.bgCard,
  },
  placeholder: {
    backgroundColor: COLORS.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 32,
  },
  ratingBadge: {
    position: 'absolute',
    top: SPACING.xs,
    right: SPACING.xs,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  ratingText: {
    color: COLORS.text,
    fontSize: 10,
    fontFamily: FONTS.semibold,
  },
  gradientOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '30%',
    backgroundColor: 'transparent',
  },
  title: {
    color: COLORS.text,
    fontSize: 12,
    fontFamily: FONTS.medium,
    marginTop: SPACING.xs,
    lineHeight: 16,
  },
  year: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontFamily: FONTS.regular,
    marginTop: 2,
  },
  wideCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  widePoster: {
    width: 80,
    height: 120,
    backgroundColor: COLORS.bgElevated,
  },
  wideInfo: {
    flex: 1,
    padding: SPACING.md,
    justifyContent: 'center',
  },
  wideTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontFamily: FONTS.semibold,
    marginBottom: 4,
  },
  wideRating: {
    color: COLORS.star,
    fontSize: 13,
    fontFamily: FONTS.medium,
  },
});
