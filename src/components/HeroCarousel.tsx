import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, Dimensions, FlatList,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming,
} from 'react-native-reanimated';
import { backdropUrl } from '../api/tmdb';
import { COLORS, RADIUS, FONTS, SPACING } from '../constants/theme';
import type { Movie } from '../api/tmdb';

const { width: SCREEN_W } = Dimensions.get('window');
const HERO_H = 420;

interface Props {
  movies: Movie[];
  onPress: (movie: Movie) => void;
}

function HeroDot({ active }: { active: boolean }) {
  const w = useSharedValue(active ? 20 : 6);
  const opacity = useSharedValue(active ? 1 : 0.4);

  useEffect(() => {
    w.value = withTiming(active ? 20 : 6, { duration: 300 });
    opacity.value = withTiming(active ? 1 : 0.4, { duration: 300 });
  }, [active]);

  const style = useAnimatedStyle(() => ({
    width: w.value,
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.dot, active && styles.dotActive, style]} />
  );
}

export function HeroCarousel({ movies, onPress }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const autoScrollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const isDragging = useRef(false);

  const startAutoScroll = useCallback(() => {
    if (autoScrollTimer.current) clearInterval(autoScrollTimer.current);
    if (movies.length <= 1) return;
    autoScrollTimer.current = setInterval(() => {
      if (isDragging.current) return;
      setActiveIndex(prev => {
        const next = (prev + 1) % Math.min(movies.length, 8);
        try {
          flatListRef.current?.scrollToIndex({ index: next, animated: true });
        } catch {}
        return next;
      });
    }, 6000);
  }, [movies.length]);

  useEffect(() => {
    startAutoScroll();
    return () => {
      if (autoScrollTimer.current) clearInterval(autoScrollTimer.current);
    };
  }, [startAutoScroll]);

  const renderItem = ({ item }: { item: Movie }) => {
    const img = backdropUrl(item.backdrop_path);
    const year = item.release_date?.slice(0, 4);

    return (
      <Pressable onPress={() => onPress(item)} style={{ width: SCREEN_W }}>
        <View style={styles.heroItem}>
          {img && (
            <Image
              source={{ uri: img }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={500}
            />
          )}
          <LinearGradient
            colors={['transparent', 'rgba(10,10,15,0.6)', COLORS.bg]}
            style={StyleSheet.absoluteFill}
            locations={[0.3, 0.65, 1]}
          />
          <LinearGradient
            colors={[COLORS.bg, 'transparent']}
            style={[StyleSheet.absoluteFill, { height: 80 }]}
          />
          <View style={styles.heroContent}>
            <Text style={styles.heroTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <View style={styles.heroMeta}>
              <View style={styles.heroBadge}>
                <Text style={styles.heroBadgeText}>⭐ {item.vote_average.toFixed(1)}</Text>
              </View>
              {year && (
                <View style={[styles.heroBadge, styles.heroBadgeOutline]}>
                  <Text style={styles.heroBadgeTextOutline}>{year}</Text>
                </View>
              )}
            </View>
            <Text style={styles.heroOverview} numberOfLines={2}>
              {item.overview}
            </Text>
            <View style={styles.heroActions}>
              <Pressable
                style={styles.playButton}
                onPress={() => onPress(item)}
              >
                <Text style={styles.playButtonText}>▶  Смотреть</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View>
      <FlatList
        ref={flatListRef}
        data={movies.slice(0, 8)}
        renderItem={renderItem}
        keyExtractor={item => String(item.id)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
          setActiveIndex(idx);
          isDragging.current = false;
          startAutoScroll();
        }}
        onScrollBeginDrag={() => {
          isDragging.current = true;
          if (autoScrollTimer.current) clearInterval(autoScrollTimer.current);
        }}
      />
      <View style={styles.dots}>
        {movies.slice(0, 8).map((_, i) => (
          <HeroDot key={i} active={i === activeIndex} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heroItem: {
    width: SCREEN_W,
    height: HERO_H,
    justifyContent: 'flex-end',
  },
  heroContent: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.xxl,
  },
  heroTitle: {
    color: COLORS.text,
    fontSize: 28,
    fontFamily: FONTS.extrabold,
    letterSpacing: -0.5,
    marginBottom: SPACING.sm,
  },
  heroMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  heroBadge: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
  },
  heroBadgeText: {
    color: COLORS.text,
    fontSize: 12,
    fontFamily: FONTS.semibold,
  },
  heroBadgeOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  heroBadgeTextOutline: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontFamily: FONTS.medium,
  },
  heroOverview: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontFamily: FONTS.regular,
    lineHeight: 18,
    marginBottom: SPACING.lg,
  },
  heroActions: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  playButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xxl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.lg,
  },
  playButtonText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: FONTS.bold,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    marginTop: -SPACING.lg,
  },
  dot: {
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.text,
  },
  dotActive: {
    backgroundColor: COLORS.primary,
  },
});
