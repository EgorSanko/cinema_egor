/**
 * Download picker — opens a sheet with season/episode/translator/quality
 * choices, then kicks off the download in DownloadsContext and navigates
 * to the Downloads screen so the user can watch progress there (instead of
 * holding this modal open the whole time).
 */
import React, { useEffect, useState } from "react";
import {
  View, Text, Pressable, Modal, StyleSheet, ScrollView,
  ActivityIndicator, Alert,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../constants/theme";
import { getStream, StreamData } from "../api/tmdb";
import { DownloadEntry } from "../lib/downloads";
import { useDownloads } from "../lib/DownloadsContext";

interface BaseProps {
  id: number;
  title: string;
  poster_path: string | null;
}

interface MovieProps extends BaseProps {
  type: "movie";
  release_date?: string;
}

interface TVProps extends BaseProps {
  type: "tv";
  first_air_date?: string;
  number_of_seasons: number;
  seasons: Array<{ season_number: number; episode_count: number }>;
  initialSeason?: number;
  initialEpisode?: number;
  episodeName?: string;
}

type Props = MovieProps | TVProps;

export function DownloadButton(props: Props) {
  const nav = useNavigation<any>();
  const { start } = useDownloads();
  const [open, setOpen] = useState(false);
  const [season, setSeason] = useState((props as TVProps).initialSeason || 1);
  const [episode, setEpisode] = useState((props as TVProps).initialEpisode || 1);
  const [stream, setStream] = useState<StreamData | null>(null);
  const [selectedTranslator, setSelectedTranslator] = useState<number | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isTV = props.type === "tv";
  const year = (() => {
    const d = isTV ? (props as TVProps).first_air_date : (props as MovieProps).release_date;
    return d ? String(new Date(d).getFullYear()) : "";
  })();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setStream(null);
    const opts: any = {};
    if (isTV) { opts.season = season; opts.episode = episode; }
    if (selectedTranslator) opts.translator_id = selectedTranslator;
    getStream(props.title, year, props.type, opts)
      .then((data) => {
        setStream(data);
        if (data.active_translator_id && !selectedTranslator) {
          setSelectedTranslator(data.active_translator_id);
        }
      })
      .catch((e: any) => setError(e?.message || "Не удалось получить ссылки"))
      .finally(() => setLoading(false));
  }, [open, season, episode, selectedTranslator]);

  const epCount = isTV
    ? ((props as TVProps).seasons.find(s => s.season_number === season)?.episode_count || 1)
    : 0;

  function handleQualityTap(quality: string, url: string) {
    const entry: Omit<DownloadEntry, "downloadedAt"> = {
      id: props.id,
      type: props.type,
      title: props.title,
      poster_path: props.poster_path,
      quality,
      url,
      release_date: !isTV ? (props as MovieProps).release_date : undefined,
      first_air_date: isTV ? (props as TVProps).first_air_date : undefined,
      ...(isTV && {
        season,
        episode,
        episodeName: (props as TVProps).episodeName,
      }),
      translatorName: stream?.translators.find(t => t.id === selectedTranslator)?.name,
    };

    // Kick off in the background context — modal closes, user goes to
    // Downloads to watch progress. Errors there (permission denied etc)
    // surface as a red-state job in the list.
    start(entry).catch((e: any) => Alert.alert("Ошибка", String(e?.message || e)));
    setOpen(false);
    nav.navigate("Downloads");
  }

  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={styles.btn}>
        <Ionicons name="download-outline" size={20} color={COLORS.text} />
        <Text style={styles.btnText}>Скачать</Text>
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        transparent
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />

          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle} numberOfLines={1}>
              Скачать: {props.title}
            </Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={12}>
              <Ionicons name="close" size={24} color={COLORS.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 500 }} contentContainerStyle={{ paddingBottom: 24 }}>
            {isTV && (
              <>
                <Text style={styles.label}>Сезон</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {Array.from({ length: (props as TVProps).number_of_seasons || 1 }, (_, i) => i + 1).map(s => (
                    <Pressable
                      key={s}
                      onPress={() => { setSeason(s); setEpisode(1); }}
                      style={[styles.chip, season === s && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, season === s && styles.chipTextActive]}>{s}</Text>
                    </Pressable>
                  ))}
                </ScrollView>

                <Text style={styles.label}>Серия</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {Array.from({ length: epCount }, (_, i) => i + 1).map(e => (
                    <Pressable
                      key={e}
                      onPress={() => setEpisode(e)}
                      style={[styles.chip, episode === e && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, episode === e && styles.chipTextActive]}>{e}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}

            {stream && stream.translators.length > 1 && (
              <>
                <Text style={styles.label}>Озвучка</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {Array.from(new Map(stream.translators.map(t => [t.id, t])).values()).map(t => (
                    <Pressable
                      key={t.id}
                      onPress={() => setSelectedTranslator(t.id)}
                      style={[styles.chip, selectedTranslator === t.id && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, selectedTranslator === t.id && styles.chipTextActive]}>{t.is_premium ? `🔒 ${t.name}` : t.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}

            {loading && (
              <View style={styles.center}>
                <ActivityIndicator color={COLORS.primary} />
                <Text style={styles.muted}>Получаем ссылки...</Text>
              </View>
            )}

            {error && (
              <Text style={styles.error}>{error}</Text>
            )}

            {/* Quality buttons — 2x2 grid, fixed widths so they don't escape the modal. */}
            {stream && !loading && (
              <>
                <Text style={styles.label}>Качество</Text>
                <View style={styles.qualityGrid}>
                  {stream.qualities.map(q => {
                    const url = stream.streams[q];
                    return (
                      <Pressable
                        key={q}
                        disabled={!url}
                        onPress={() => handleQualityTap(q, url)}
                        style={[styles.qualityBtn, !url && { opacity: 0.4 }]}
                      >
                        <Ionicons name="download-outline" size={18} color={COLORS.text} />
                        <Text style={styles.qualityText}>{q}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={styles.muted}>
                  Тапни качество — закроется и откроется экран Загрузки с прогрессом.
                </Text>
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 12, paddingHorizontal: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12, marginTop: 8,
  },
  btnText: { color: COLORS.text, fontSize: 15, fontWeight: "600" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    backgroundColor: "#0f0f14", borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24,
  },
  sheetHandle: {
    alignSelf: "center", width: 36, height: 4, borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)", marginBottom: 8,
  },
  sheetHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 12,
  },
  sheetTitle: { color: COLORS.text, fontSize: 16, fontWeight: "700", flex: 1, marginRight: 12 },
  label: {
    color: COLORS.textSecondary, fontSize: 10, fontWeight: "700",
    textTransform: "uppercase", letterSpacing: 1, marginTop: 12, marginBottom: 6,
  },
  chipRow: { paddingVertical: 4, paddingRight: 8, gap: 6 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.06)", marginRight: 6,
  },
  chipActive: { backgroundColor: COLORS.primary },
  chipText: { color: COLORS.text, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  qualityGrid: {
    flexDirection: "row", flexWrap: "wrap",
    justifyContent: "space-between", gap: 10,
  },
  qualityBtn: {
    width: "48%",
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 16, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.06)",
  },
  qualityText: { color: COLORS.text, fontSize: 16, fontWeight: "700" },
  center: { alignItems: "center", paddingVertical: 24, gap: 8 },
  muted: { color: COLORS.textSecondary, fontSize: 12, textAlign: "center", marginTop: 10, paddingHorizontal: 12 },
  error: { color: "#ef4444", fontSize: 13, textAlign: "center", padding: 12 },
});
