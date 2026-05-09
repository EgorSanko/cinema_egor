import React, { useEffect, useState } from 'react';
import { Pressable, Text, StyleSheet, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getMovieVideos, getTVVideos, pickBestTrailer, type TmdbVideo } from '../api/tmdb';
import { COLORS, RADIUS, FONTS } from '../constants/theme';

interface Props {
  mediaId: number;
  mediaType: 'movie' | 'tv';
}

export function TrailerButton({ mediaId, mediaType }: Props) {
  const [trailer, setTrailer] = useState<TmdbVideo | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const fetcher = mediaType === 'movie' ? getMovieVideos : getTVVideos;
    fetcher(mediaId).then(videos => {
      if (cancelled) return;
      setTrailer(pickBestTrailer(videos));
    });
    return () => { cancelled = true; };
  }, [mediaId, mediaType]);

  const handlePress = async () => {
    if (!trailer) return;
    const url = `https://www.youtube.com/watch?v=${trailer.key}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      Alert.alert('Ошибка', 'Не удалось открыть YouTube');
    }
  };

  // Don't render anything while loading or if no trailer
  if (trailer === undefined || trailer === null) return null;

  return (
    <Pressable onPress={handlePress} style={styles.btn}>
      <Ionicons name="play-circle" size={18} color={COLORS.text} />
      <Text style={styles.text}>Трейлер</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: RADIUS.lg,
    marginTop: 10,
  },
  text: {
    color: COLORS.text,
    fontSize: 14,
    fontFamily: FONTS.semibold,
  },
});
