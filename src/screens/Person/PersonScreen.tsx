import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { getPersonDetails, posterUrl, profileUrl } from '../../api/tmdb';
import { COLORS, RADIUS, FONTS, SPACING } from '../../constants/theme';

const SCREEN_W = Dimensions.get('window').width;
const POSTER_W = (SCREEN_W - 48) / 3;

export function PersonScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { id, name } = route.params as { id: number; name: string };

  const [details, setDetails] = useState<any>(null);
  const [credits, setCredits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getPersonDetails(id).then(data => {
      if (cancelled || !data) return setLoading(false);
      setDetails(data.details);
      // Sort by popularity so the most relevant titles lead — combined_credits
      // returns movies AND TV unsorted, so the old arbitrary slice(30) dropped
      // famous roles. (raised cap below from 30 → 100 to actually show them all.)
      setCredits(
        (data.credits.cast || [])
          .filter((c: any) => c.poster_path)
          .sort((a: any, b: any) => (b.popularity || 0) - (a.popularity || 0))
      );
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [id]);

  const movies = credits.filter(c => c.media_type === 'movie');
  const series = credits.filter(c => c.media_type === 'tv');

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Pressable onPress={() => nav.goBack()} style={[styles.backBtn, { top: insets.top + 8 }]} hitSlop={12}>
        <Ionicons name="arrow-back" size={22} color="#fff" />
      </Pressable>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        ) : !details ? (
          <View style={styles.loadingBox}>
            <Text style={{ color: COLORS.textMuted }}>Не удалось загрузить</Text>
          </View>
        ) : (
          <Animated.View entering={FadeIn.duration(400)}>
            {/* Header */}
            <View style={styles.header}>
              {details.profile_path ? (
                <Image source={{ uri: profileUrl(details.profile_path) || '' }} style={styles.profile} contentFit="cover" />
              ) : (
                <View style={[styles.profile, { backgroundColor: COLORS.bgCard, alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={{ color: '#fff', fontSize: 60 }}>{(name || '?').charAt(0)}</Text>
                </View>
              )}
              <Text style={styles.name}>{details.name}</Text>
              {details.known_for_department && (
                <Text style={styles.department}>{details.known_for_department}</Text>
              )}
              <View style={styles.metaRow}>
                {details.birthday && (
                  <Text style={styles.metaText}>📅 {new Date(details.birthday).toLocaleDateString('ru-RU')}</Text>
                )}
                {details.place_of_birth && (
                  <Text style={styles.metaText}>📍 {details.place_of_birth}</Text>
                )}
              </View>
            </View>

            {/* Bio */}
            {details.biography ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Биография</Text>
                <Text style={styles.bioText} numberOfLines={6}>{details.biography}</Text>
              </View>
            ) : null}

            {/* Movies */}
            {movies.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>🎬 Фильмы ({movies.length})</Text>
                <View style={styles.grid}>
                  {movies.slice(0, 100).map((m: any) => (
                    <Pressable
                      key={`m-${m.id}-${m.credit_id}`}
                      onPress={() => nav.navigate('MovieDetail', { id: m.id, title: m.title })}
                      style={styles.gridItem}
                    >
                      {m.poster_path ? (
                        <Image source={{ uri: posterUrl(m.poster_path) || '' }} style={styles.gridPoster} contentFit="cover" />
                      ) : (
                        <View style={[styles.gridPoster, { backgroundColor: COLORS.bgCard }]} />
                      )}
                      <Text style={styles.gridLabel} numberOfLines={2}>{m.title}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {/* TV */}
            {series.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>📺 Сериалы ({series.length})</Text>
                <View style={styles.grid}>
                  {series.slice(0, 100).map((s: any) => (
                    <Pressable
                      key={`t-${s.id}-${s.credit_id}`}
                      onPress={() => nav.navigate('TVDetail', { id: s.id, title: s.name })}
                      style={styles.gridItem}
                    >
                      {s.poster_path ? (
                        <Image source={{ uri: posterUrl(s.poster_path) || '' }} style={styles.gridPoster} contentFit="cover" />
                      ) : (
                        <View style={[styles.gridPoster, { backgroundColor: COLORS.bgCard }]} />
                      )}
                      <Text style={styles.gridLabel} numberOfLines={2}>{s.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  backBtn: {
    position: 'absolute',
    left: SPACING.lg,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 10,
  },
  loadingBox: { flex: 1, padding: 60, alignItems: 'center', justifyContent: 'center' },
  header: { alignItems: 'center', paddingHorizontal: SPACING.lg, paddingTop: 60, paddingBottom: 24 },
  profile: { width: 120, height: 120, borderRadius: 60, backgroundColor: COLORS.bgCard },
  name: { fontSize: 24, fontFamily: FONTS.bold, color: COLORS.text, marginTop: 12, textAlign: 'center' },
  department: { fontSize: 14, fontFamily: FONTS.medium, color: COLORS.primary, marginTop: 4 },
  metaRow: { flexDirection: 'row', gap: 12, marginTop: 12, flexWrap: 'wrap', justifyContent: 'center' },
  metaText: { color: COLORS.textMuted, fontSize: 12, fontFamily: FONTS.regular },
  section: { paddingHorizontal: SPACING.lg, marginTop: 16 },
  sectionTitle: { fontSize: 18, fontFamily: FONTS.bold, color: COLORS.text, marginBottom: 12 },
  bioText: { color: COLORS.textSecondary, fontSize: 13, fontFamily: FONTS.regular, lineHeight: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gridItem: { width: POSTER_W },
  gridPoster: { width: '100%', aspectRatio: 2 / 3, borderRadius: RADIUS.md, backgroundColor: COLORS.bgCard },
  gridLabel: { color: COLORS.text, fontSize: 11, fontFamily: FONTS.medium, marginTop: 4 },
});
