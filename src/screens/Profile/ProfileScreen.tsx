import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, StatusBar, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, FONTS, SPACING } from '../../constants/theme';
import { getUser, logout, type User } from '../../utils/auth';
import { getHistory, getFavorites } from '../../utils/storage';
import {
  computeStats, evaluateAchievements, type UserStats, type UnlockedAchievement,
} from '../../utils/achievements';

export function ProfileScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState<UserStats>(() => computeStats([], []));

  const refresh = useCallback(async () => {
    const [u, hist, favs] = await Promise.all([getUser(), getHistory(), getFavorites()]);
    setUser(u);
    setStats(computeStats(hist, favs));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const achievements = evaluateAchievements(stats);
  const unlockedCount = achievements.filter(a => a.unlocked).length;

  const handleLogout = () => {
    Alert.alert('Выйти', 'Вы уверены что хотите выйти из аккаунта?', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Выйти', style: 'destructive', onPress: async () => { await logout(); } },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

        {/* Header */}
        <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(user?.name || '?').charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.userName}>{user?.name || 'Гость'}</Text>
          <Text style={styles.userEmail}>{user?.email || ''}</Text>
          <View style={styles.achievementSummary}>
            <Ionicons name="trophy" size={14} color={COLORS.primary} />
            <Text style={styles.achievementSummaryText}>
              {unlockedCount} из {achievements.length} достижений
            </Text>
          </View>
        </Animated.View>

        {/* Stats grid */}
        <View style={styles.statsGrid}>
          <StatCard icon="film" label="Фильмов" value={stats.totalMoviesWatched} accent />
          <StatCard icon="tv" label="Серий" value={stats.totalTvEpisodes} />
          <StatCard icon="time" label="Часов" value={Math.floor(stats.totalHoursWatched)} />
          <StatCard icon="heart" label="В избранном" value={stats.favoritesCount} />
        </View>

        {/* Secondary stats */}
        <View style={styles.secondaryStats}>
          <SmallStat label="Дней подряд" value={stats.consecutiveDays} />
          <SmallStat label="Сериалов до конца" value={stats.completedTvSeries} />
          <SmallStat label="Серий за день" value={stats.maxEpisodesInOneDay} />
          <SmallStat label="Озвучек" value={stats.uniqueTranslators} />
        </View>

        {/* Quick links */}
        <View style={styles.quickLinks}>
          <Pressable
            onPress={() => nav.navigate('Main', { screen: 'FavoritesTab' })}
            style={styles.quickBtn}
          >
            <Ionicons name="heart" size={18} color={'#ff5470'} />
            <Text style={styles.quickBtnText}>Избранное</Text>
          </Pressable>
          <Pressable
            onPress={() => Alert.alert('История', 'История доступна на сайте sapkeflykino.ru/history')}
            style={styles.quickBtn}
          >
            <Ionicons name="time" size={18} color={COLORS.primary} />
            <Text style={styles.quickBtnText}>История</Text>
          </Pressable>
        </View>

        {/* Achievements grid */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="trophy" size={22} color={COLORS.primary} />
              <Text style={styles.sectionTitle}>Достижения</Text>
            </View>
            <Text style={styles.sectionCount}>{unlockedCount}/{achievements.length}</Text>
          </View>
          <View style={styles.achievementGrid}>
            {achievements.map(a => (
              <AchievementCard key={a.id} ach={a} />
            ))}
          </View>
        </View>

        {/* Logout */}
        <Pressable onPress={handleLogout} style={styles.logoutBtn}>
          <Ionicons name="log-out-outline" size={18} color="#ff5470" />
          <Text style={styles.logoutText}>Выйти из аккаунта</Text>
        </Pressable>

      </ScrollView>
    </View>
  );
}

function StatCard({ icon, label, value, accent }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; value: number; accent?: boolean;
}) {
  return (
    <View style={[styles.statCard, accent && styles.statCardAccent]}>
      <Ionicons name={icon} size={22} color={accent ? COLORS.primary : COLORS.textMuted} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function SmallStat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.smallStat}>
      <Text style={styles.smallStatValue}>{value}</Text>
      <Text style={styles.smallStatLabel}>{label}</Text>
    </View>
  );
}

function AchievementCard({ ach }: { ach: UnlockedAchievement }) {
  const isUnlocked = ach.unlocked;
  return (
    <View style={[styles.achCard, isUnlocked ? styles.achCardUnlocked : styles.achCardLocked]}>
      <Text style={[styles.achIcon, !isUnlocked && { opacity: 0.4 }]}>{ach.icon}</Text>
      <Text style={styles.achName} numberOfLines={2}>{ach.name}</Text>
      <Text style={styles.achDesc} numberOfLines={2}>{ach.desc}</Text>
      {!isUnlocked && (
        <>
          <View style={styles.achProgress}>
            <View style={[styles.achProgressFill, { width: `${ach.progress * 100}%` }]} />
          </View>
          <Text style={styles.achProgressText}>{ach.current}/{ach.target}</Text>
        </>
      )}
      <View style={styles.achBadge}>
        <Ionicons
          name={isUnlocked ? 'trophy' : 'lock-closed'}
          size={11}
          color={isUnlocked ? COLORS.primary : 'rgba(255,255,255,0.3)'}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.xl, alignItems: 'center',
  },
  avatar: {
    width: 92, height: 92, borderRadius: 46,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: 'rgba(127,234,2,0.2)',
  },
  avatarText: { fontSize: 36, fontFamily: FONTS.bold, color: '#000' },
  userName: { fontSize: 24, fontFamily: FONTS.bold, color: COLORS.text, marginTop: 12 },
  userEmail: { fontSize: 13, fontFamily: FONTS.regular, color: COLORS.textMuted, marginTop: 4 },
  achievementSummary: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 10, paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: 'rgba(127,234,2,0.1)', borderRadius: RADIUS.pill,
  },
  achievementSummaryText: { color: COLORS.primary, fontSize: 12, fontFamily: FONTS.semibold },

  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: SPACING.lg, gap: 10,
  },
  statCard: {
    flex: 1, minWidth: '45%', backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg, padding: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  statCardAccent: {
    backgroundColor: 'rgba(127,234,2,0.1)', borderColor: 'rgba(127,234,2,0.3)',
  },
  statValue: { fontSize: 26, fontFamily: FONTS.bold, color: COLORS.text, marginTop: 8 },
  statLabel: { fontSize: 11, fontFamily: FONTS.regular, color: COLORS.textMuted, marginTop: 2 },

  secondaryStats: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: SPACING.lg, marginTop: 10, gap: 6,
  },
  smallStat: {
    flex: 1, minWidth: '45%',
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: RADIUS.md,
    paddingHorizontal: 10, paddingVertical: 8,
    borderWidth: 1, borderColor: COLORS.border,
  },
  smallStatValue: { fontSize: 16, fontFamily: FONTS.semibold, color: COLORS.text },
  smallStatLabel: { fontSize: 10, fontFamily: FONTS.regular, color: COLORS.textMuted, marginTop: 2 },

  quickLinks: {
    flexDirection: 'row', paddingHorizontal: SPACING.lg, marginTop: 16, gap: 10,
  },
  quickBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.bgCard, paddingVertical: 14, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border,
  },
  quickBtnText: { color: COLORS.text, fontSize: 14, fontFamily: FONTS.medium },

  section: { paddingHorizontal: SPACING.lg, marginTop: 24 },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12,
  },
  sectionTitle: { fontSize: 22, fontFamily: FONTS.bold, color: COLORS.text },
  sectionCount: { fontSize: 13, color: COLORS.textMuted, fontFamily: FONTS.regular },

  achievementGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
  },
  achCard: {
    width: '31%', borderRadius: RADIUS.md, padding: 10,
    minHeight: 110, position: 'relative',
  },
  achCardUnlocked: {
    backgroundColor: 'rgba(127,234,2,0.08)',
    borderWidth: 1, borderColor: 'rgba(127,234,2,0.4)',
  },
  achCardLocked: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderColor: COLORS.border,
  },
  achIcon: { fontSize: 28, marginBottom: 4 },
  achName: { fontSize: 12, fontFamily: FONTS.semibold, color: COLORS.text },
  achDesc: { fontSize: 10, fontFamily: FONTS.regular, color: COLORS.textMuted, marginTop: 2 },
  achProgress: {
    height: 3, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2,
    marginTop: 6, overflow: 'hidden',
  },
  achProgressFill: { height: '100%', backgroundColor: COLORS.primary, opacity: 0.6 },
  achProgressText: { fontSize: 9, color: COLORS.textMuted, marginTop: 2 },
  achBadge: { position: 'absolute', top: 8, right: 8 },

  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: SPACING.lg, marginTop: 30, paddingVertical: 14,
    backgroundColor: 'rgba(255,84,112,0.1)',
    borderRadius: RADIUS.lg, borderWidth: 1, borderColor: 'rgba(255,84,112,0.3)',
  },
  logoutText: { color: '#ff5470', fontSize: 14, fontFamily: FONTS.semibold },
});
