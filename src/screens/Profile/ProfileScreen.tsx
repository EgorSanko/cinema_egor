import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, StatusBar, Alert, Image,
  ImageBackground, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import Animated, { FadeIn, useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, Easing } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { COLORS, RADIUS, FONTS, SPACING } from '../../constants/theme';
import { getUser, logout, type User } from '../../utils/auth';
import { getHistory, getFavorites, getTriedTranslators } from '../../utils/storage';
import {
  computeStats, evaluateAchievements, type UserStats, type UnlockedAchievement,
} from '../../utils/achievements';
import { AchievementIcon } from '../../utils/achievement-icons';
import { posterUrl, backdropUrl } from '../../api/tmdb';

const { width: SCREEN_W } = Dimensions.get('window');

type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
function rarityFor(ach: UnlockedAchievement): Rarity {
  if (ach.target >= 100) return 'legendary';
  if (ach.target >= 25) return 'epic';
  if (ach.target >= 5) return 'rare';
  return 'common';
}

const RARITY_COLORS: Record<Rarity, { ring: string; bg: string; icon: string; glow: string }> = {
  common:    { ring: 'rgba(255,255,255,0.10)', bg: 'rgba(255,255,255,0.04)',  icon: 'rgba(255,255,255,0.75)', glow: 'transparent' },
  rare:      { ring: 'rgba(96,165,250,0.40)',  bg: 'rgba(59,130,246,0.10)',   icon: '#93c5fd',                glow: 'rgba(59,130,246,0.25)' },
  epic:      { ring: 'rgba(168,85,247,0.50)',  bg: 'rgba(168,85,247,0.12)',   icon: '#d8b4fe',                glow: 'rgba(168,85,247,0.30)' },
  legendary: { ring: 'rgba(250,204,21,0.65)',  bg: 'rgba(250,204,21,0.18)',   icon: '#fde047',                glow: 'rgba(250,204,21,0.50)' },
};

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const day = 86400_000;
  if (diff < 3600_000) return `${Math.max(1, Math.floor(diff / 60_000))} мин назад`;
  if (diff < day) {
    const h = new Date(ts).getHours();
    const m = new Date(ts).getMinutes();
    return `Сегодня в ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  if (diff < 2 * day) return 'Вчера';
  const d = new Date(ts);
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

export function ProfileScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState<UserStats>(() => computeStats([], []));
  const [history, setHistory] = useState<any[]>([]);
  const [favorites, setFavorites] = useState<any[]>([]);
  const [showAllAch, setShowAllAch] = useState(false);

  const refresh = useCallback(async () => {
    const [u, hist, favs, tried] = await Promise.all([getUser(), getHistory(), getFavorites(), getTriedTranslators()]);
    setUser(u);
    setHistory(hist);
    setFavorites(favs);
    setStats(computeStats(hist, favs, tried));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const achievements = useMemo(() => evaluateAchievements(stats), [stats]);
  const unlockedCount = achievements.filter(a => a.unlocked).length;
  const progressPct = achievements.length ? (unlockedCount / achievements.length) * 100 : 0;

  const continueWatching = useMemo(() => {
    const unfinished = history.filter((h: any) => {
      if (!h.duration || !h.progress) return false;
      const pct = (h.progress / h.duration) * 100;
      return pct > 1 && pct < 95;
    });
    const seen = new Set();
    const out: any[] = [];
    for (const h of unfinished.sort((a, b) => b.watchedAt - a.watchedAt)) {
      const key = `${h.type}-${h.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(h);
    }
    return out.slice(0, 5);
  }, [history]);

  const recentActivity = useMemo(() => history.slice(0, 4), [history]);
  const featured = continueWatching[0];
  const heroBackdrop = useMemo(() => {
    const item = history.find((h: any) => h.backdrop_path || h.poster_path);
    if (!item) return null;
    return backdropUrl(item.backdrop_path || item.poster_path);
  }, [history]);

  const topGenres = useMemo(() => {
    const entries = Object.entries(stats.byGenre || {})
      .filter(([, count]) => (count as number) > 0)
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .slice(0, 5);
    const total = entries.reduce((s, [, c]) => s + (c as number), 0);
    return entries.map(([name, count]) => ({ name, count: count as number, pct: total ? Math.round(((count as number) / total) * 100) : 0 }));
  }, [stats]);

  const heatmap = useMemo(() => {
    const weeks = 12;
    const data: number[][] = Array.from({ length: weeks }, () => Array(7).fill(0));
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    for (const h of history) {
      const diffDays = Math.floor((todayStart.getTime() - new Date(h.watchedAt).setHours(0, 0, 0, 0)) / 86400_000);
      if (diffDays < 0 || diffDays >= weeks * 7) continue;
      const week = Math.floor(diffDays / 7);
      const day = diffDays % 7;
      data[weeks - 1 - week][day]++;
    }
    return data;
  }, [history]);

  // Pulse animation for the avatar glow + featured Play button
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true
    );
  }, []);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  const visibleAchievements = useMemo(() => {
    const sorted = [...achievements].sort((a, b) => {
      if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
      return (b.progress || 0) - (a.progress || 0);
    });
    return showAllAch ? sorted : sorted.slice(0, 12);
  }, [achievements, showAllAch]);

  const handleLogout = () => {
    Alert.alert('Выйти', 'Вы уверены что хотите выйти из аккаунта?', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Выйти', style: 'destructive', onPress: async () => { await logout(); } },
    ]);
  };

  const hoursWatched = Math.floor(stats.totalHoursWatched);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

        {/* ── HERO: cinematic backdrop ───────────────────────────────── */}
        <View style={styles.hero}>
          {heroBackdrop && (
            <ImageBackground source={{ uri: heroBackdrop }} style={StyleSheet.absoluteFill} blurRadius={12}>
              <View style={styles.heroOverlayDark} />
              <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
            </ImageBackground>
          )}
          {/* Lime fog glow top-right */}
          <View style={styles.fogLime} />
          {/* Purple fog bottom-left */}
          <View style={styles.fogPurple} />
          {/* Bottom fade to bg */}
          <LinearGradient
            colors={['transparent', COLORS.bg]}
            style={styles.heroBottomFade}
          />

          <View style={styles.heroContent}>
            <Pressable onPress={handleLogout} style={styles.logoutChip}>
              <Ionicons name="log-out-outline" size={13} color="rgba(255,255,255,0.75)" />
              <Text style={styles.logoutChipText}>Выйти</Text>
            </Pressable>

            <View style={styles.heroRow}>
              <View style={styles.avatarWrap}>
                <Animated.View style={[styles.avatarGlow, pulseStyle]} />
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{(user?.name || '?').charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.premiumBadge}>
                  <Ionicons name="diamond" size={9} color={COLORS.primary} />
                  <Text style={styles.premiumBadgeText}>ПРЕМИУМ</Text>
                </View>
              </View>

              <View style={styles.heroText}>
                <Text style={styles.userName} numberOfLines={1}>{user?.name || 'Гость'}</Text>
                <Text style={styles.userEmail} numberOfLines={1}>{user?.email || ''}</Text>

                <View style={styles.progressRow}>
                  <View style={styles.progressLabelRow}>
                    <Ionicons name="trophy" size={11} color={COLORS.primary} />
                    <Text style={styles.progressLabel}>{unlockedCount} / {achievements.length}</Text>
                    <Text style={styles.progressPct}>{Math.round(progressPct)}%</Text>
                  </View>
                  <View style={styles.progressBar}>
                    <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* ── Featured Continue Watching (full-width cinematic) ───────── */}
        {featured && (
          <FeaturedContinueHero item={featured} nav={nav} pulseStyle={pulseStyle} />
        )}

        {/* ── 4 BIG stat cards ───────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.statsGrid}>
            <BigStatCard icon="film-outline" label="Фильмов" value={stats.totalMoviesWatched} />
            <BigStatCard icon="tv-outline" label="Сериалов" value={stats.totalTvEpisodes} />
            <BigStatCard icon="time-outline" label="Часов" value={hoursWatched} />
            <BigStatCard icon="heart-outline" label="В избранном" value={stats.favoritesCount} />
          </View>
        </View>

        {/* ── 4 small stat tiles ─────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.smallStatsGrid}>
            <SmallStatTile icon="flame" label="Дней подряд" value={stats.consecutiveDays} accent />
            <SmallStatTile icon="flag" label="Сериал до конца" value={stats.completedTvSeries} />
            <SmallStatTile icon="trending-up" label="Рекорд за день" value={stats.maxEpisodesInOneDay} />
            <SmallStatTile icon="mic" label="Озвучек" value={stats.uniqueTranslators} />
          </View>
        </View>

        {/* ── Recent activity timeline ────────────────────────────────── */}
        {recentActivity.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Недавняя активность</Text>
            </View>
            <View style={styles.card}>
              {recentActivity.map((item, i) => (
                <ActivityRow key={`${item.type}-${item.id}-${i}`} item={item} isLast={i === recentActivity.length - 1} />
              ))}
            </View>
          </View>
        )}

        {/* ── Achievements ───────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={styles.sectionIconBox}>
                <Ionicons name="trophy" size={14} color={COLORS.primary} />
              </View>
              <Text style={styles.sectionTitle}>Достижения</Text>
              <Text style={styles.sectionCount}>{unlockedCount}/{achievements.length}</Text>
            </View>
            <Pressable onPress={() => setShowAllAch(!showAllAch)} style={styles.headerBtn}>
              <Text style={styles.headerBtnText}>{showAllAch ? 'Скрыть' : 'Все'}</Text>
              <Ionicons name="chevron-forward" size={12} color="rgba(255,255,255,0.75)" />
            </Pressable>
          </View>

          <View style={styles.achGrid}>
            {visibleAchievements.map(a => (
              <AchievementCard key={a.id} ach={a} />
            ))}
          </View>

          {!showAllAch && achievements.length > 12 && (
            <Pressable onPress={() => setShowAllAch(true)} style={styles.showMoreBtn}>
              <Text style={styles.showMoreBtnText}>Показать ещё {achievements.length - 12}</Text>
              <Ionicons name="chevron-down" size={13} color="rgba(255,255,255,0.55)" />
            </Pressable>
          )}
        </View>

        {/* ── Top genres (horizontal bars) ───────────────────────────── */}
        {topGenres.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Любимые жанры</Text>
            </View>
            <View style={styles.card}>
              {topGenres.map((g, i) => (
                <View key={g.name} style={styles.genreRow}>
                  <Text style={styles.genreName} numberOfLines={1}>{g.name}</Text>
                  <View style={styles.genreBarBg}>
                    <View style={[styles.genreBarFill, { width: `${g.pct}%`, backgroundColor: GENRE_COLORS[i % GENRE_COLORS.length] }]} />
                  </View>
                  <Text style={styles.genrePct}>{g.pct}%</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Watch heatmap (12 × 7 grid, GitHub style) ───────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Когда ты смотришь</Text>
          </View>
          <View style={styles.card}>
            <WatchHeatmap data={heatmap} />
          </View>
        </View>

        {/* ── My lists ────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Мои списки</Text>
          </View>
          <View style={styles.listsGrid}>
            <ListCard
              title="Избранное"
              count={favorites.length}
              items={favorites.slice(0, 4)}
              onPress={() => nav.navigate('Main', { screen: 'FavoritesTab' })}
            />
            <ListCard
              title="История"
              count={history.length}
              items={history.slice(0, 4)}
              onPress={() => Alert.alert('История', 'История доступна на сайте sapkeflykino.ru/history')}
            />
            <ListCard
              title="Шедевры"
              count={history.filter(h => h.vote_average >= 9).length}
              items={history.filter(h => h.vote_average >= 9).slice(0, 4)}
              onPress={() => {}}
            />
            <ListCard
              title="Хиты 2025"
              count={history.filter(h => h.vote_average >= 8).length}
              items={history.filter(h => h.vote_average >= 8).slice(0, 4)}
              onPress={() => {}}
            />
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

/* ────────────────────── Sub-components ────────────────────── */

function FeaturedContinueHero({ item, nav, pulseStyle }: { item: any; nav: any; pulseStyle: any }) {
  const pct = item.duration ? Math.min(100, Math.floor((item.progress / item.duration) * 100)) : 0;
  const remaining = item.duration ? Math.max(0, Math.floor((item.duration - item.progress) / 60)) : 0;
  const backdrop = backdropUrl(item.backdrop_path || item.poster_path);
  const poster = posterUrl(item.poster_path, 'w342');

  return (
    <View style={styles.featured}>
      {backdrop && (
        <ImageBackground source={{ uri: backdrop }} style={StyleSheet.absoluteFill}>
          <LinearGradient
            colors={['rgba(0,0,0,0.4)', 'rgba(0,0,0,0.85)']}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.85)', 'transparent']}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          />
        </ImageBackground>
      )}

      <View style={styles.featuredContent}>
        <View style={{ flex: 1 }}>
          <View style={styles.featuredBadge}>
            <Ionicons name="sparkles" size={9} color={COLORS.primary} />
            <Text style={styles.featuredBadgeText}>ПРОДОЛЖИТЬ ПРОСМОТР</Text>
          </View>
          <Text style={styles.featuredTitle} numberOfLines={2}>{item.title}</Text>
          {item.type === 'tv' && item.season && item.episode && (
            <Text style={styles.featuredEpisode}>S{item.season} · E{item.episode}</Text>
          )}

          <View style={styles.featuredProgressRow}>
            <Text style={styles.featuredPct}>{pct}%</Text>
            {remaining > 0 && <Text style={styles.featuredRemaining}>Осталось {remaining} мин</Text>}
          </View>
          <View style={styles.featuredProgressBar}>
            <View style={[styles.featuredProgressFill, { width: `${pct}%` }]} />
          </View>

          <Animated.View style={pulseStyle}>
            <Pressable
              onPress={() => Alert.alert('Откройте фильм', 'Найдите фильм на главной чтобы продолжить просмотр')}
              style={styles.featuredPlayBtn}
            >
              <Ionicons name="play" size={16} color="#000" />
              <Text style={styles.featuredPlayText}>Продолжить</Text>
            </Pressable>
          </Animated.View>
        </View>

        {poster && (
          <Image source={{ uri: poster }} style={styles.featuredPoster} />
        )}
      </View>
    </View>
  );
}

function BigStatCard({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: number }) {
  return (
    <View style={styles.bigStatCard}>
      <View style={styles.bigStatIconWrap}>
        <Ionicons name={icon} size={18} color={COLORS.primary} />
      </View>
      <Text style={styles.bigStatValue}>{value}</Text>
      <Text style={styles.bigStatLabel}>{label}</Text>
    </View>
  );
}

function SmallStatTile({ icon, label, value, accent }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: number; accent?: boolean }) {
  return (
    <View style={[styles.smallStatTile, accent && styles.smallStatTileAccent]}>
      <View style={[styles.smallStatIconWrap, accent && styles.smallStatIconWrapAccent]}>
        <Ionicons name={icon} size={12} color={accent ? '#fca5a5' : COLORS.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.smallStatValue}>{value}</Text>
        <Text style={styles.smallStatLabel} numberOfLines={1}>{label}</Text>
      </View>
    </View>
  );
}

function ActivityRow({ item, isLast }: { item: any; isLast: boolean }) {
  const isTv = item.type === 'tv';
  const pct = item.duration ? (item.progress / item.duration) * 100 : 0;
  const poster = posterUrl(item.poster_path, 'w185');

  let label = 'Смотрит';
  let labelColor = COLORS.primary;
  let trailing = null;
  if (pct >= 95) {
    label = isTv ? 'Посмотрел серию' : 'Посмотрел фильм';
    if (item.vote_average) {
      trailing = (
        <View style={styles.activityRating}>
          <Ionicons name="star" size={10} color="#fcd34d" />
          <Text style={styles.activityRatingText}>{item.vote_average.toFixed(1)}</Text>
        </View>
      );
    }
  } else if (item.progress > 0) {
    label = 'Смотрит';
  } else {
    label = 'Добавил в избранное';
  }

  return (
    <View style={[styles.activityRow, !isLast && styles.activityRowBorder]}>
      {poster && (
        <Image source={{ uri: poster }} style={styles.activityPoster} />
      )}
      <View style={{ flex: 1, marginLeft: 10, minWidth: 0 }}>
        <Text style={[styles.activityLabel, { color: labelColor }]}>{label}</Text>
        <Text style={styles.activityTitle} numberOfLines={1}>
          {item.title}
          {isTv && item.season && item.episode && (
            <Text style={styles.activityEpisode}> S{item.season}E{item.episode}</Text>
          )}
        </Text>
        <Text style={styles.activityTime}>{formatRelative(item.watchedAt)}</Text>
      </View>
      {trailing}
    </View>
  );
}

function AchievementCard({ ach }: { ach: UnlockedAchievement }) {
  const isUnlocked = ach.unlocked;
  const rarity = rarityFor(ach);
  const colors = RARITY_COLORS[rarity];
  const nearUnlock = !isUnlocked && ach.progress >= 0.5;

  return (
    <View
      style={[
        styles.achCard,
        isUnlocked && {
          backgroundColor: colors.bg,
          borderColor: colors.ring,
          shadowColor: colors.glow,
          shadowOpacity: 1,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 0 },
          elevation: rarity === 'legendary' ? 8 : 4,
        },
        nearUnlock && styles.achCardNearUnlock,
      ]}
    >
      <View style={[
        styles.achIconWrap,
        { backgroundColor: isUnlocked ? colors.bg : 'rgba(255,255,255,0.04)', borderColor: isUnlocked ? colors.ring : 'rgba(255,255,255,0.06)' },
      ]}>
        <AchievementIcon
          slug={ach.icon}
          size={18}
          color={isUnlocked ? colors.icon : 'rgba(255,255,255,0.35)'}
        />
      </View>

      <Text style={styles.achName} numberOfLines={1}>{ach.name}</Text>
      <Text style={styles.achDesc} numberOfLines={2}>{ach.desc}</Text>

      {isUnlocked ? (
        <View style={[styles.achGotBadge, { backgroundColor: colors.bg }]}>
          {rarity === 'legendary' && (
            <Ionicons name="flash" size={9} color={colors.icon} />
          )}
          <Text style={[styles.achGotText, { color: colors.icon }]}>
            {rarity === 'common' ? 'Получено' : rarity === 'rare' ? 'Редкое' : rarity === 'epic' ? 'Эпическое' : 'Легенда'}
          </Text>
        </View>
      ) : ach.progress > 0 ? (
        <>
          <View style={styles.achProgressBar}>
            <View style={[styles.achProgressFill, { width: `${Math.min(ach.progress * 100, 100)}%` }]} />
          </View>
          <Text style={styles.achProgressText}>{ach.current} / {ach.target}</Text>
        </>
      ) : (
        <Text style={styles.achProgressText}>{ach.current} / {ach.target}</Text>
      )}

      {!isUnlocked && (
        <View style={styles.achLockBadge}>
          <Ionicons name="lock-closed" size={9} color="rgba(255,255,255,0.35)" />
        </View>
      )}
    </View>
  );
}

const GENRE_COLORS = ['#a3e635', '#a78bfa', '#60a5fa', '#fb923c', '#f472b6'];

function WatchHeatmap({ data }: { data: number[][] }) {
  const max = Math.max(1, ...data.flat());
  const dayLabels = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const cellSize = Math.floor((SCREEN_W - 80) / 13);

  return (
    <View style={{ flexDirection: 'row' }}>
      <View style={{ marginRight: 6 }}>
        {dayLabels.map(d => (
          <Text key={d} style={[styles.heatmapDay, { height: cellSize + 3 }]}>{d}</Text>
        ))}
      </View>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        {data.map((week, wi) => (
          <View key={wi} style={{ marginRight: 3 }}>
            {week.map((count, di) => {
              const intensity = count === 0 ? 0 : Math.min(1, count / max);
              const opacity = count === 0 ? 0.05 : 0.18 + intensity * 0.7;
              return (
                <View
                  key={di}
                  style={{
                    width: cellSize,
                    height: cellSize,
                    borderRadius: 2,
                    marginBottom: 3,
                    backgroundColor: count === 0 ? 'rgba(255,255,255,0.04)' : `rgba(163,230,53,${opacity})`,
                  }}
                />
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

function ListCard({ title, count, items, onPress }: { title: string; count: number; items: any[]; onPress: () => void }) {
  const posters = items.filter(i => i.poster_path).slice(0, 4);
  return (
    <Pressable onPress={onPress} style={styles.listCard}>
      <View style={styles.listCardImageWrap}>
        {posters.length > 0 ? (
          <View style={styles.listCardCollage}>
            {posters.map((p, i) => {
              const url = posterUrl(p.poster_path, 'w342');
              return url ? (
                <Image key={i} source={{ uri: url }} style={styles.listCardCollageItem} />
              ) : <View key={i} style={[styles.listCardCollageItem, { backgroundColor: 'rgba(255,255,255,0.04)' }]} />;
            })}
          </View>
        ) : (
          <View style={{ alignItems: 'center', justifyContent: 'center', flex: 1 }}>
            <Ionicons name="film-outline" size={28} color="rgba(255,255,255,0.20)" />
          </View>
        )}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.92)']} style={styles.listCardGradient} />
      </View>
      <View style={styles.listCardText}>
        <Text style={styles.listCardTitle}>{title}</Text>
        <Text style={styles.listCardCount}>{count}</Text>
      </View>
    </Pressable>
  );
}

/* ─────────────────────── Styles ─────────────────────── */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  section: { paddingHorizontal: SPACING.lg, marginTop: 18 },

  /* Hero */
  hero: { height: 240, position: 'relative', marginBottom: 18, overflow: 'hidden' },
  heroOverlayDark: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,12,16,0.55)' },
  fogLime: {
    position: 'absolute', top: -120, right: -80, width: 320, height: 320,
    borderRadius: 200, backgroundColor: 'rgba(163,230,53,0.20)', opacity: 0.7,
  },
  fogPurple: {
    position: 'absolute', bottom: -100, left: -60, width: 280, height: 280,
    borderRadius: 200, backgroundColor: 'rgba(168,85,247,0.12)',
  },
  heroBottomFade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 80 },
  heroContent: { flex: 1, paddingHorizontal: SPACING.lg, paddingTop: 12, paddingBottom: 28, justifyContent: 'space-between' },
  logoutChip: {
    alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 100,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
  },
  logoutChipText: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontFamily: FONTS.medium },

  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarWrap: { position: 'relative', width: 84, height: 84 },
  avatarGlow: {
    position: 'absolute', inset: -8, width: 100, height: 100, top: -8, left: -8,
    borderRadius: 50, backgroundColor: 'rgba(163,230,53,0.20)', opacity: 0.7,
  },
  avatar: {
    width: 84, height: 84, borderRadius: 42, backgroundColor: '#0a0c10',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: COLORS.primary,
    shadowColor: COLORS.primary, shadowOpacity: 0.6, shadowRadius: 22, shadowOffset: { width: 0, height: 0 },
  },
  avatarText: { fontSize: 36, fontFamily: FONTS.bold, color: COLORS.primary },
  premiumBadge: {
    position: 'absolute', bottom: -10, left: -2, right: -2,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: 'rgba(10,12,16,0.95)', borderRadius: 100,
    borderWidth: 1, borderColor: 'rgba(163,230,53,0.4)',
  },
  premiumBadgeText: { color: COLORS.primary, fontSize: 9, fontFamily: FONTS.bold, letterSpacing: 0.5 },

  heroText: { flex: 1, minWidth: 0 },
  userName: { fontSize: 26, fontFamily: FONTS.bold, color: '#fff', letterSpacing: -0.5 },
  userEmail: { fontSize: 12, fontFamily: FONTS.regular, color: 'rgba(255,255,255,0.55)', marginTop: 2 },

  progressRow: { marginTop: 12 },
  progressLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  progressLabel: { color: COLORS.primary, fontSize: 11, fontFamily: FONTS.semibold },
  progressPct: { color: 'rgba(255,255,255,0.45)', fontSize: 10, fontFamily: FONTS.medium, marginLeft: 'auto' },
  progressBar: {
    height: 5, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)',
  },
  progressFill: {
    height: '100%', backgroundColor: COLORS.primary, borderRadius: 3,
    shadowColor: COLORS.primary, shadowOpacity: 0.7, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
  },

  /* Featured Continue */
  featured: {
    marginHorizontal: SPACING.lg, height: 200, borderRadius: 20, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
  },
  featuredContent: { flex: 1, flexDirection: 'row', padding: 14, alignItems: 'flex-end' },
  featuredBadge: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, marginBottom: 8,
    backgroundColor: 'rgba(163,230,53,0.15)', borderRadius: 100,
    borderWidth: 1, borderColor: 'rgba(163,230,53,0.30)',
  },
  featuredBadgeText: { color: COLORS.primary, fontSize: 9, fontFamily: FONTS.bold, letterSpacing: 0.6 },
  featuredTitle: { color: '#fff', fontSize: 22, fontFamily: FONTS.bold, lineHeight: 26, letterSpacing: -0.4 },
  featuredEpisode: { color: 'rgba(255,255,255,0.70)', fontSize: 12, fontFamily: FONTS.medium, marginTop: 2 },
  featuredProgressRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, marginBottom: 4 },
  featuredPct: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontFamily: FONTS.semibold },
  featuredRemaining: { color: 'rgba(255,255,255,0.55)', fontSize: 10, fontFamily: FONTS.regular, marginLeft: 'auto' },
  featuredProgressBar: { height: 4, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 3, overflow: 'hidden' },
  featuredProgressFill: {
    height: '100%', backgroundColor: COLORS.primary, borderRadius: 3,
    shadowColor: COLORS.primary, shadowOpacity: 0.8, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
  },
  featuredPlayBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    marginTop: 10, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 100,
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary, shadowOpacity: 0.6, shadowRadius: 14, shadowOffset: { width: 0, height: 4 },
  },
  featuredPlayText: { color: '#000', fontSize: 13, fontFamily: FONTS.bold },
  featuredPoster: {
    width: 80, height: 120, borderRadius: 10, marginLeft: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },

  /* Card primitive */
  card: {
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },

  /* Section header */
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { color: '#fff', fontSize: 16, fontFamily: FONTS.bold },
  sectionCount: { color: 'rgba(255,255,255,0.45)', fontSize: 11, fontFamily: FONTS.medium, marginLeft: 4 },
  sectionIconBox: {
    width: 24, height: 24, borderRadius: 7,
    backgroundColor: 'rgba(163,230,53,0.15)',
    borderWidth: 1, borderColor: 'rgba(163,230,53,0.30)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 100,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  headerBtnText: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontFamily: FONTS.medium },

  /* 4 big stats */
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bigStatCard: {
    flex: 1, minWidth: '47%',
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  bigStatIconWrap: {
    width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(163,230,53,0.12)',
    borderWidth: 1, borderColor: 'rgba(163,230,53,0.25)',
    marginBottom: 10,
    shadowColor: COLORS.primary, shadowOpacity: 0.30, shadowRadius: 10, shadowOffset: { width: 0, height: 0 },
  },
  bigStatValue: { color: '#fff', fontSize: 22, fontFamily: FONTS.bold, lineHeight: 24 },
  bigStatLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 11, fontFamily: FONTS.regular, marginTop: 3 },

  /* small stats */
  smallStatsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  smallStatTile: {
    flex: 1, minWidth: '47%', flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.025)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  smallStatTileAccent: {
    backgroundColor: 'rgba(251,113,86,0.08)', borderColor: 'rgba(251,146,60,0.25)',
  },
  smallStatIconWrap: {
    width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(163,230,53,0.12)', borderWidth: 1, borderColor: 'rgba(163,230,53,0.22)',
  },
  smallStatIconWrapAccent: {
    backgroundColor: 'rgba(251,146,60,0.15)', borderColor: 'rgba(251,146,60,0.32)',
  },
  smallStatValue: { color: '#fff', fontSize: 15, fontFamily: FONTS.bold, lineHeight: 16 },
  smallStatLabel: { color: 'rgba(255,255,255,0.45)', fontSize: 9.5, fontFamily: FONTS.regular, marginTop: 2 },

  /* Activity */
  activityRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  activityRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.05)' },
  activityPoster: { width: 36, height: 50, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.04)' },
  activityLabel: { fontSize: 10.5, fontFamily: FONTS.medium, color: 'rgba(255,255,255,0.55)' },
  activityTitle: { color: '#fff', fontSize: 13, fontFamily: FONTS.semibold, marginTop: 1 },
  activityEpisode: { color: 'rgba(255,255,255,0.45)', fontSize: 11, fontFamily: FONTS.regular },
  activityTime: { color: 'rgba(255,255,255,0.40)', fontSize: 10, fontFamily: FONTS.regular, marginTop: 1 },
  activityRating: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6,
    backgroundColor: 'rgba(252,211,77,0.12)',
  },
  activityRatingText: { color: '#fcd34d', fontSize: 10, fontFamily: FONTS.bold },

  /* Achievements grid */
  achGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  achCard: {
    width: (SCREEN_W - SPACING.lg * 2 - 7 * 3) / 4,
    minHeight: 122, padding: 8, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.025)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
    position: 'relative', alignItems: 'center',
  },
  achCardNearUnlock: { borderColor: 'rgba(163,230,53,0.20)' },
  achIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, marginTop: 4, marginBottom: 4,
  },
  achName: { color: '#fff', fontSize: 10.5, fontFamily: FONTS.semibold, textAlign: 'center' },
  achDesc: { color: 'rgba(255,255,255,0.45)', fontSize: 9, fontFamily: FONTS.regular, textAlign: 'center', marginTop: 2, minHeight: 22 },
  achProgressBar: { height: 2, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 1, marginTop: 6, width: '100%', overflow: 'hidden' },
  achProgressFill: { height: '100%', backgroundColor: COLORS.primary, opacity: 0.7 },
  achProgressText: { color: 'rgba(255,255,255,0.45)', fontSize: 8.5, fontFamily: FONTS.medium, marginTop: 2 },
  achGotBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    marginTop: 6, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4,
  },
  achGotText: { fontSize: 8.5, fontFamily: FONTS.bold, letterSpacing: 0.3 },
  achLockBadge: { position: 'absolute', top: 6, right: 6 },

  showMoreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 10, marginTop: 8, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.025)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  showMoreBtnText: { color: 'rgba(255,255,255,0.55)', fontSize: 11, fontFamily: FONTS.medium },

  /* Genres */
  genreRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, gap: 10 },
  genreName: { color: 'rgba(255,255,255,0.80)', fontSize: 12, fontFamily: FONTS.medium, width: 80 },
  genreBarBg: { flex: 1, height: 5, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' },
  genreBarFill: { height: '100%', borderRadius: 3 },
  genrePct: { color: 'rgba(255,255,255,0.55)', fontSize: 11, fontFamily: FONTS.bold, width: 32, textAlign: 'right' },

  /* Heatmap */
  heatmapDay: { color: 'rgba(255,255,255,0.35)', fontSize: 8, fontFamily: FONTS.regular, lineHeight: 12, marginBottom: 3 },

  /* Lists */
  listsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  listCard: {
    flex: 1, minWidth: '47%', borderRadius: 14, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.025)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  listCardImageWrap: { aspectRatio: 16 / 9, position: 'relative' },
  listCardCollage: { flex: 1, flexDirection: 'row', flexWrap: 'wrap' },
  listCardCollageItem: { width: '50%', height: '50%' },
  listCardGradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 50 },
  listCardText: { position: 'absolute', bottom: 8, left: 10, right: 10 },
  listCardTitle: { color: '#fff', fontSize: 13, fontFamily: FONTS.bold },
  listCardCount: { color: 'rgba(255,255,255,0.65)', fontSize: 10, fontFamily: FONTS.regular, marginTop: 1 },
});
