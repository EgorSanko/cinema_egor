import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, Dimensions, StatusBar,
  ActivityIndicator, Alert, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInDown, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  getMovieDetails, getTVDetails, getMovieCredits, getTVCredits,
  getMovieRecommendations, getTVRecommendations,
  backdropUrl, posterUrl, profileUrl, getStream, formatBudget,
} from '../../api/tmdb';
import type { MovieDetails, TVShowDetails, StreamData, CastMember, Movie, TVShow } from '../../api/tmdb';
import { MovieDetailSkeleton } from '../../components/SkeletonLoader';
import { toggleFavorite, isFavorite, getComments, addComment, deleteComment, type Comment } from '../../utils/storage';
import { SectionRow } from '../../components/SectionRow';
import { TrailerButton } from '../../components/TrailerButton';
import { COLORS, RADIUS, FONTS, SPACING, SHADOWS } from '../../constants/theme';
import { scheduleSyncToServer, getUser } from '../../utils/auth';

const { width: SCREEN_W } = Dimensions.get('window');
const BACKDROP_H = 360;
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function MovieDetailScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { id, startSeason, startEpisode, startProgress, autoPlay: shouldAutoPlay } = route.params as {
    id: number;
    startSeason?: number;
    startEpisode?: number;
    startProgress?: number;
    autoPlay?: boolean;
  };
  const isTV = route.name === 'TVDetail';

  const [movie, setMovie] = useState<MovieDetails | null>(null);
  const [tvShow, setTvShow] = useState<TVShowDetails | null>(null);
  const [cast, setCast] = useState<CastMember[]>([]);
  const [recommendations, setRecommendations] = useState<(Movie | TVShow)[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [fav, setFav] = useState(false);
  const [streamLoading, setStreamLoading] = useState(false);

  // TV episode
  const [selectedSeason, setSelectedSeason] = useState(startSeason ?? 1);
  const [selectedEpisode, setSelectedEpisode] = useState(startEpisode ?? 1);
  const [showSeasonPicker, setShowSeasonPicker] = useState(false);
  const [autoPlayConsumed, setAutoPlayConsumed] = useState(false);

  // Comment form
  const [commentText, setCommentText] = useState('');
  const [commentRating, setCommentRating] = useState(0);
  const [commentAuthor, setCommentAuthor] = useState('');

  useEffect(() => {
    (async () => {
      const user = await getUser();
      if (user?.name) setCommentAuthor(user.name);
    })();
  }, []);

  const playScale = useSharedValue(1);
  const playAnim = useAnimatedStyle(() => ({ transform: [{ scale: playScale.value }] }));

  useEffect(() => {
    (async () => {
      try {
        if (isTV) {
          const [data, castData, recs] = await Promise.all([
            getTVDetails(id), getTVCredits(id), getTVRecommendations(id),
          ]);
          setTvShow(data);
          setCast(castData);
          setRecommendations(recs);
        } else {
          const [data, castData, recs] = await Promise.all([
            getMovieDetails(id), getMovieCredits(id), getMovieRecommendations(id),
          ]);
          setMovie(data);
          setCast(castData);
          setRecommendations(recs);
        }
        setFav(await isFavorite(id, isTV ? 'tv' : 'movie'));
        setComments(await getComments(id, isTV ? 'tv' : 'movie'));
      } catch (e) { console.warn(e); }
      finally { setLoading(false); }
    })();
  }, [id, isTV]);

  const detail = isTV ? tvShow : movie;
  const detailTitle = isTV ? tvShow?.name : movie?.title;
  const origSearch = ((isTV ? (tvShow as any)?.original_name : (movie as any)?.original_title) || '').replace(/["'«»""]/g, "").trim();
  const searchTitle = origSearch && /[a-z]/i.test(origSearch) ? origSearch : (detailTitle || '');
  const detailDate = isTV ? tvShow?.first_air_date : movie?.release_date;

  // Auto-play when navigated from "Continue Watching" with autoPlay flag
  useEffect(() => {
    if (!shouldAutoPlay || autoPlayConsumed || !detail || streamLoading) return;
    setAutoPlayConsumed(true);
    handlePlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail, shouldAutoPlay, autoPlayConsumed]);

  const handleFavorite = async () => {
    if (!detail) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const added = await toggleFavorite({
      id: detail.id, type: isTV ? 'tv' : 'movie',
      title: detailTitle || '', poster_path: detail.poster_path,
      vote_average: detail.vote_average,
      release_date: !isTV ? (detail as MovieDetails).release_date : undefined,
      first_air_date: isTV ? (detail as TVShowDetails).first_air_date : undefined,
      addedAt: Date.now(),
    });
    setFav(added);
    scheduleSyncToServer();
  };

  const handlePlay = async () => {
    if (!detail) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStreamLoading(true);
    try {
      const year = detailDate ? new Date(detailDate).getFullYear().toString() : '';
      const opts: any = {};
      if (isTV) { opts.season = selectedSeason; opts.episode = selectedEpisode; }
      let data = await getStream(searchTitle, year, isTV ? 'tv' : 'movie', opts);
      if (!data.stream) {
        for (let i = 0; i < 3; i++) {
          data = await getStream(searchTitle, year, isTV ? 'tv' : 'movie', { ...opts, index: i });
          if (data.stream) break;
        }
      }
      if (data.stream) {
        nav.navigate('Player', {
          streamData: data,
          title: isTV ? `${detailTitle} S${selectedSeason}E${selectedEpisode}` : detailTitle,
          movieId: detail.id, poster: detail.poster_path,
          type: isTV ? 'tv' : 'movie',
          season: isTV ? selectedSeason : undefined,
          episode: isTV ? selectedEpisode : undefined,
          searchTitle, year,
          totalSeasons: isTV ? (detail as TVShowDetails).number_of_seasons : undefined,
          baseTitle: detailTitle,
        });
      } else {
        Alert.alert('Пока недоступно', 'Этот контент ещё не вышел в онлайн-кинотеатрах. Ждём релиза!');
      }
    } catch { Alert.alert('Пока недоступно', 'Не удалось найти этот контент. Возможно, он ещё не вышел в онлайн-кинотеатрах.'); }
    finally { setStreamLoading(false); }
  };

  const handleAddComment = async () => {
    if (!commentText.trim() || commentRating === 0) {
      Alert.alert('', 'Напишите отзыв и поставьте оценку');
      return;
    }
    const c = await addComment({
      mediaId: id, mediaType: isTV ? 'tv' : 'movie',
      author: commentAuthor.trim() || 'Аноним',
      text: commentText.trim(), rating: commentRating,
    });
    setComments(prev => [c, ...prev]);
    setCommentText('');
    setCommentRating(0);
    scheduleSyncToServer();
  };

  const handleDeleteComment = async (commentId: string) => {
    await deleteComment(commentId);
    setComments(prev => prev.filter(c => c.id !== commentId));
    scheduleSyncToServer();
  };

  if (loading || !detail) return <MovieDetailSkeleton />;

  const backdrop = backdropUrl(detail.backdrop_path);
  const poster = posterUrl(detail.poster_path, 'w342');
  const year = detailDate?.slice(0, 4);
  const runtime = !isTV && movie ? movie.runtime : 0;
  const hours = Math.floor(runtime / 60);
  const mins = runtime % 60;
  const duration = runtime > 0 ? `${hours}ч ${mins}мин` : null;
  const seasons = isTV && tvShow ? tvShow.seasons.filter(s => s.season_number > 0) : [];
  const currentSeasonData = seasons.find(s => s.season_number === selectedSeason);
  const avgRating = comments.length > 0
    ? (comments.reduce((s, c) => s + c.rating, 0) / comments.length).toFixed(1)
    : null;

  const goToRec = (m: any) => {
    if (isTV || m.name) {
      nav.push('TVDetail', { id: m.id, title: m.name || m.title });
    } else {
      nav.push('MovieDetail', { id: m.id, title: m.title });
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
        {/* Backdrop */}
        <View style={styles.backdropWrap}>
          {backdrop && <Image source={{ uri: backdrop }} style={StyleSheet.absoluteFill} contentFit="cover" transition={500} />}
          <LinearGradient colors={['rgba(10,10,15,0.3)', 'rgba(10,10,15,0.7)', COLORS.bg]} style={StyleSheet.absoluteFill} locations={[0.2, 0.6, 1]} />
          <Pressable onPress={() => nav.goBack()} style={[styles.backBtn, { top: insets.top + 8 }]} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.content}>
          {/* Top row: poster + info */}
          <View style={styles.topRow}>
            <Animated.View entering={FadeInDown.duration(500).delay(100)} style={styles.posterWrap}>
              {poster && <Image source={{ uri: poster }} style={styles.poster} contentFit="cover" transition={300} />}
            </Animated.View>
            <View style={styles.topInfo}>
              <Animated.Text entering={FadeInDown.duration(500).delay(200)} style={styles.title}>{detailTitle}</Animated.Text>
              <Animated.View entering={FadeInDown.duration(500).delay(300)} style={styles.metaRow}>
                <View style={styles.ratingBadge}><Text style={styles.ratingText}>⭐ {detail.vote_average.toFixed(1)}</Text></View>
                {year && <Text style={styles.metaText}>{year}</Text>}
                {duration && <Text style={styles.metaText}>{duration}</Text>}
                {isTV && tvShow && <Text style={styles.metaText}>{tvShow.number_of_seasons} сез.</Text>}
              </Animated.View>
              {detail.genres.length > 0 && (
                <Animated.View entering={FadeInDown.duration(500).delay(350)} style={styles.genresRow}>
                  {detail.genres.slice(0, 3).map(g => (
                    <Pressable key={g.id} onPress={() => nav.navigate('GenreMovies', { genreId: g.id, genreName: g.name })} style={styles.genreBadge}>
                      <Text style={styles.genreText}>{g.name}</Text>
                    </Pressable>
                  ))}
                </Animated.View>
              )}
            </View>
          </View>

          {/* Budget & Revenue (movies only) */}
          {!isTV && movie && (movie.budget > 0 || movie.revenue > 0) && (
            <Animated.View entering={FadeInDown.duration(500).delay(370)} style={styles.financials}>
              {movie.budget > 0 && (
                <View style={styles.finItem}>
                  <Text style={styles.finLabel}>Бюджет</Text>
                  <Text style={styles.finValue}>{formatBudget(movie.budget)}</Text>
                </View>
              )}
              {movie.revenue > 0 && (
                <View style={styles.finItem}>
                  <Text style={styles.finLabel}>Сборы</Text>
                  <Text style={styles.finValue}>{formatBudget(movie.revenue)}</Text>
                </View>
              )}
              {detail.vote_count > 0 && (
                <View style={styles.finItem}>
                  <Text style={styles.finLabel}>Голоса</Text>
                  <Text style={styles.finValue}>{detail.vote_count.toLocaleString()}</Text>
                </View>
              )}
            </Animated.View>
          )}

          {/* TV Season/Episode */}
          {isTV && seasons.length > 0 && (
            <Animated.View entering={FadeInDown.duration(500).delay(380)}>
              <Text style={styles.sectionLabel}>Сезон и серия</Text>
              <Pressable onPress={() => setShowSeasonPicker(!showSeasonPicker)} style={styles.pickerBtn}>
                <Text style={styles.pickerText}>Сезон {selectedSeason}</Text>
                <Ionicons name="chevron-down" size={16} color={COLORS.textSecondary} />
              </Pressable>
              {showSeasonPicker && (
                <View style={styles.seasonList}>
                  {seasons.map(s => (
                    <Pressable key={s.season_number} onPress={() => { setSelectedSeason(s.season_number); setSelectedEpisode(1); setShowSeasonPicker(false); }}
                      style={[styles.seasonItem, s.season_number === selectedSeason && styles.seasonItemActive]}>
                      <Text style={[styles.seasonItemText, s.season_number === selectedSeason && styles.seasonItemTextActive]}>
                        Сезон {s.season_number} ({s.episode_count} серий)
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: SPACING.md }}>
                {Array.from({ length: currentSeasonData?.episode_count || 1 }, (_, i) => i + 1).map(ep => (
                  <Pressable key={ep} onPress={() => setSelectedEpisode(ep)}
                    style={[styles.episodeBtn, ep === selectedEpisode && styles.episodeBtnActive]}>
                    <Text style={[styles.episodeBtnText, ep === selectedEpisode && styles.episodeBtnTextActive]}>{ep}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </Animated.View>
          )}

          {/* Play button */}
          <Animated.View entering={FadeInDown.duration(500).delay(400)}>
            <AnimatedPressable onPress={handlePlay}
              onPressIn={() => { playScale.value = withSpring(0.96); }}
              onPressOut={() => { playScale.value = withSpring(1); }}
              style={[styles.playBtn, playAnim]} disabled={streamLoading}>
              <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.playBtnGradient}>
                {streamLoading ? <ActivityIndicator color="#fff" /> : (
                  <View style={styles.playBtnContent}>
                    <Ionicons name="play" size={20} color="#fff" />
                    <Text style={styles.playBtnText}>{isTV ? `Смотреть S${selectedSeason}E${selectedEpisode}` : 'Смотреть онлайн'}</Text>
                  </View>
                )}
              </LinearGradient>
            </AnimatedPressable>
          </Animated.View>

          {/* Trailer */}
          <TrailerButton mediaId={detail.id} mediaType={isTV ? 'tv' : 'movie'} />

          {/* Favorite */}
          <Pressable onPress={handleFavorite} style={styles.favBtn}>
            <Ionicons name={fav ? 'heart' : 'heart-outline'} size={20} color={fav ? COLORS.primary : COLORS.textSecondary} />
            <Text style={[styles.favBtnText, fav && { color: COLORS.primary }]}>{fav ? 'В избранном' : 'В избранное'}</Text>
          </Pressable>

          {/* Overview */}
          {detail.overview ? (
            <Animated.View entering={FadeInDown.duration(500).delay(450)}>
              <Text style={styles.sectionLabel}>Описание</Text>
              <Text style={styles.overview}>{detail.overview}</Text>
            </Animated.View>
          ) : null}

          {/* Cast */}
          {cast.length > 0 && (
            <Animated.View entering={FadeInDown.duration(500).delay(500)}>
              <Text style={styles.sectionLabel}>Актёры</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {cast.slice(0, 12).map(c => (
                  <View key={c.id} style={styles.castCard}>
                    <View style={styles.castPhoto}>
                      {c.profile_path ? (
                        <Image source={{ uri: profileUrl(c.profile_path)! }} style={StyleSheet.absoluteFill} contentFit="cover" />
                      ) : (
                        <Ionicons name="person" size={20} color={COLORS.textMuted} />
                      )}
                    </View>
                    <Text style={styles.castName} numberOfLines={1}>{c.name}</Text>
                    <Text style={styles.castChar} numberOfLines={1}>{c.character}</Text>
                  </View>
                ))}
              </ScrollView>
            </Animated.View>
          )}

          {/* Comments */}
          <View style={styles.commentsSection}>
            <Text style={styles.sectionLabel}>
              Отзывы {comments.length > 0 ? `(${comments.length})` : ''}
              {avgRating ? ` — ⭐ ${avgRating}` : ''}
            </Text>

            {/* Comment form */}
            <View style={styles.commentForm}>
              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map(s => (
                  <Pressable key={s} onPress={() => setCommentRating(s)} hitSlop={4}>
                    <Ionicons name={s <= commentRating ? 'star' : 'star-outline'} size={28} color={s <= commentRating ? COLORS.star : COLORS.textMuted} />
                  </Pressable>
                ))}
              </View>
              <TextInput style={styles.commentInput} placeholder="Ваш отзыв..." placeholderTextColor={COLORS.textMuted}
                value={commentText} onChangeText={setCommentText} multiline maxLength={500} selectionColor={COLORS.primary} />
              <View style={styles.commentFormRow}>
                <View style={{ flex: 1 }} />
                <Pressable onPress={handleAddComment} style={styles.commentSendBtn}>
                  <Ionicons name="send" size={18} color="#fff" />
                </Pressable>
              </View>
            </View>

            {/* Comment list */}
            {comments.map(c => {
              const ago = getTimeAgo(c.createdAt);
              return (
                <View key={c.id} style={styles.commentCard}>
                  <View style={styles.commentHeader}>
                    <Text style={styles.commentAuthor}>{c.author}</Text>
                    <View style={styles.commentStars}>
                      {[1, 2, 3, 4, 5].map(s => (
                        <Ionicons key={s} name={s <= c.rating ? 'star' : 'star-outline'} size={12} color={COLORS.star} />
                      ))}
                    </View>
                    <Text style={styles.commentTime}>{ago}</Text>
                    <Pressable onPress={() => handleDeleteComment(c.id)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={14} color={COLORS.textMuted} />
                    </Pressable>
                  </View>
                  <Text style={styles.commentBody}>{c.text}</Text>
                </View>
              );
            })}
          </View>

          {/* Recommendations */}
          {recommendations.length > 0 && (
            <SectionRow title="Рекомендации" movies={recommendations} onPressMovie={goToRec} />
          )}

          <View style={{ height: 100 }} />
        </View>
      </ScrollView>
    </View>
  );
}

function getTimeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return 'только что';
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}ч назад`;
  if (diff < 172800) return 'вчера';
  return `${Math.floor(diff / 86400)}д назад`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  backdropWrap: { width: SCREEN_W, height: BACKDROP_H },
  backBtn: { position: 'absolute', left: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  content: { marginTop: -60, paddingHorizontal: SPACING.lg },
  topRow: { flexDirection: 'row', gap: SPACING.lg, marginBottom: SPACING.xl },
  posterWrap: { ...SHADOWS.card },
  poster: { width: 110, height: 165, borderRadius: RADIUS.md },
  topInfo: { flex: 1, paddingTop: SPACING.sm },
  title: { color: COLORS.text, fontSize: 22, fontFamily: FONTS.bold, letterSpacing: -0.3, marginBottom: SPACING.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm, flexWrap: 'wrap' },
  ratingBadge: { backgroundColor: 'rgba(251,191,36,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.sm },
  ratingText: { color: COLORS.star, fontSize: 13, fontFamily: FONTS.bold },
  metaText: { color: COLORS.textSecondary, fontSize: 13, fontFamily: FONTS.medium },
  genresRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  genreBadge: { backgroundColor: COLORS.bgElevated, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border },
  genreText: { color: COLORS.textSecondary, fontSize: 11, fontFamily: FONTS.medium },

  financials: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.lg, flexWrap: 'wrap' },
  finItem: { backgroundColor: COLORS.bgElevated, paddingHorizontal: 14, paddingVertical: 10, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  finLabel: { color: COLORS.textMuted, fontSize: 11, fontFamily: FONTS.medium },
  finValue: { color: COLORS.text, fontSize: 14, fontFamily: FONTS.bold, marginTop: 2 },

  sectionLabel: { color: COLORS.text, fontSize: 16, fontFamily: FONTS.bold, marginBottom: SPACING.sm, marginTop: SPACING.md },

  pickerBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.bgElevated, paddingHorizontal: 14, paddingVertical: 10, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm, alignSelf: 'flex-start' },
  pickerText: { color: COLORS.text, fontSize: 14, fontFamily: FONTS.semibold },
  seasonList: { backgroundColor: COLORS.bgElevated, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm, overflow: 'hidden' },
  seasonItem: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  seasonItemActive: { backgroundColor: COLORS.primary + '20' },
  seasonItemText: { color: COLORS.textSecondary, fontSize: 14, fontFamily: FONTS.medium },
  seasonItemTextActive: { color: COLORS.primary, fontFamily: FONTS.bold },
  episodeBtn: { width: 44, height: 44, borderRadius: RADIUS.md, marginRight: 8, backgroundColor: COLORS.bgElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },
  episodeBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  episodeBtnText: { color: COLORS.textSecondary, fontSize: 14, fontFamily: FONTS.semibold },
  episodeBtnTextActive: { color: '#fff' },

  playBtn: { borderRadius: RADIUS.lg, overflow: 'hidden', marginBottom: SPACING.md, ...SHADOWS.glow },
  playBtnGradient: { paddingVertical: 16, alignItems: 'center' },
  playBtnContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  playBtnText: { color: '#fff', fontSize: 17, fontFamily: FONTS.bold },
  favBtn: { backgroundColor: COLORS.bgElevated, paddingVertical: 14, borderRadius: RADIUS.lg, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.lg, flexDirection: 'row', justifyContent: 'center', gap: 8 },
  favBtnText: { color: COLORS.textSecondary, fontSize: 15, fontFamily: FONTS.semibold },
  overview: { color: COLORS.textSecondary, fontSize: 14, fontFamily: FONTS.regular, lineHeight: 22 },

  // Cast
  castCard: { width: 80, marginRight: SPACING.md, alignItems: 'center' },
  castPhoto: { width: 60, height: 60, borderRadius: 30, backgroundColor: COLORS.bgElevated, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  castName: { color: COLORS.text, fontSize: 11, fontFamily: FONTS.medium, textAlign: 'center' },
  castChar: { color: COLORS.textMuted, fontSize: 10, fontFamily: FONTS.regular, textAlign: 'center' },

  // Comments
  commentsSection: { marginTop: SPACING.lg },
  commentForm: { backgroundColor: COLORS.bgCard, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  starsRow: { flexDirection: 'row', gap: 4, marginBottom: SPACING.sm },
  commentInput: { backgroundColor: COLORS.bgElevated, borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 10, color: COLORS.text, fontSize: 14, fontFamily: FONTS.regular, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border, maxHeight: 100 },
  commentFormRow: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'flex-end' },
  commentSendBtn: { backgroundColor: COLORS.primary, width: 44, height: 44, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  commentCard: { backgroundColor: COLORS.bgCard, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  commentAuthor: { color: COLORS.text, fontSize: 13, fontFamily: FONTS.semibold },
  commentStars: { flexDirection: 'row', gap: 1 },
  commentTime: { color: COLORS.textMuted, fontSize: 11, fontFamily: FONTS.regular, flex: 1 },
  commentBody: { color: COLORS.textSecondary, fontSize: 13, fontFamily: FONTS.regular, lineHeight: 20 },
});
