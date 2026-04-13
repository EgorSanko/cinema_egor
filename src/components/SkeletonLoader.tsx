import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming,
  interpolate,
} from 'react-native-reanimated';
import { COLORS, RADIUS, SPACING } from '../constants/theme';

const { width: SCREEN_W } = Dimensions.get('window');

function SkeletonPulse({ style }: { style?: any }) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1200 }), -1, true);
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.3, 0.6]),
  }));

  return <Animated.View style={[styles.bone, style, animStyle]} />;
}

export function HomeSkeleton() {
  const cardW = (SCREEN_W - SPACING.lg * 2 - SPACING.md * 2) / 3;

  return (
    <View style={styles.container}>
      {/* Hero skeleton */}
      <SkeletonPulse style={styles.hero} />

      {/* Section skeletons */}
      {[1, 2, 3].map(section => (
        <View key={section} style={styles.section}>
          <SkeletonPulse style={styles.sectionTitle} />
          <View style={styles.row}>
            {[1, 2, 3].map(i => (
              <SkeletonPulse key={i} style={{ width: cardW, height: cardW * 1.5, borderRadius: RADIUS.md }} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

export function MovieDetailSkeleton() {
  return (
    <View style={styles.container}>
      <SkeletonPulse style={{ width: SCREEN_W, height: 300 }} />
      <View style={{ padding: SPACING.lg }}>
        <SkeletonPulse style={{ width: '70%', height: 28, borderRadius: 6, marginBottom: 12 }} />
        <SkeletonPulse style={{ width: '40%', height: 16, borderRadius: 6, marginBottom: 20 }} />
        <SkeletonPulse style={{ width: '100%', height: 50, borderRadius: RADIUS.lg, marginBottom: 16 }} />
        <SkeletonPulse style={{ width: '100%', height: 60, borderRadius: 6 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  bone: {
    backgroundColor: COLORS.bgElevated,
  },
  hero: {
    width: SCREEN_W,
    height: 420,
  },
  section: {
    marginTop: SPACING.xxl,
    paddingHorizontal: SPACING.lg,
  },
  sectionTitle: {
    width: 120,
    height: 18,
    borderRadius: 6,
    marginBottom: SPACING.md,
  },
  row: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
});
