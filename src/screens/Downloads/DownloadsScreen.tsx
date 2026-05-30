/**
 * Downloads screen.
 *
 * Top section: any currently-running downloads (from DownloadsContext).
 * Bottom section: completed history (from AsyncStorage via getDownloads).
 *
 * Tapping a completed item that still has a localUri opens our PlayerScreen
 * in offline mode (no stream fetch, plays the file from disk). If the file
 * was deleted from gallery, we offer re-download.
 */
import React, { useCallback, useState } from "react";
import {
  View, Text, FlatList, Pressable, StyleSheet, Alert, ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "../../constants/theme";
import {
  DownloadEntry, getDownloads, deleteDownload, clearAllDownloads,
  isLocalFileStillThere,
} from "../../lib/downloads";
import { useDownloads, ActiveDownload } from "../../lib/DownloadsContext";
import { posterUrl } from "../../api/tmdb";

function fmtBytes(n: number): string {
  if (!n) return "";
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function ago(ts: number): string {
  const sec = Math.round((Date.now() - ts) / 1000);
  if (sec < 60) return "только что";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} мин назад`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} ч назад`;
  const days = Math.round(hr / 24);
  return `${days} дн назад`;
}

export function DownloadsScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { active, start, dismiss } = useDownloads();
  const [items, setItems] = useState<DownloadEntry[]>([]);
  const [filter, setFilter] = useState<"all" | "movie" | "tv">("all");

  const refresh = useCallback(async () => {
    setItems(await getDownloads());
  }, []);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
  // Re-pull when an active download finishes so the persisted row picks up
  // the localUri (lets us show "Смотреть" instead of "Скачать ещё раз").
  React.useEffect(() => {
    if (active.some(a => a.status === "done")) refresh();
  }, [active, refresh]);

  const filtered = filter === "all" ? items : items.filter(i => i.type === filter);

  function entryKey(d: DownloadEntry) {
    return `${d.type}-${d.id}-s${d.season ?? 0}e${d.episode ?? 0}-${d.quality}-${d.downloadedAt}`;
  }

  async function handleOpen(d: DownloadEntry) {
    if (!d.localUri) {
      Alert.alert("Файл не на устройстве", "Файл был удалён из Галереи. Скачать снова?", [
        { text: "Нет", style: "cancel" },
        { text: "Да", onPress: () => start(d) },
      ]);
      return;
    }
    const stillThere = await isLocalFileStillThere(d);
    if (!stillThere) {
      Alert.alert("Файл удалён из Галереи", "Скачать снова?", [
        { text: "Нет", style: "cancel" },
        {
          text: "Да",
          onPress: async () => {
            await deleteDownload(d, false);
            await refresh();
            start(d);
          },
        },
      ]);
      return;
    }
    // Offline mode: navigate to Player with the local URI; PlayerScreen
    // checks this prop and skips the HDRezka fetch.
    nav.navigate("Player", {
      offlineUri: d.localUri,
      tmdbId: d.id,
      type: d.type,
      title: d.title,
      season: d.season,
      episode: d.episode,
      quality: d.quality,
    });
  }

  async function handleDelete(d: DownloadEntry) {
    Alert.alert(
      "Удалить?",
      "Удалит из истории и из Галереи телефона.",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Только из истории",
          onPress: async () => { await deleteDownload(d, false); await refresh(); },
        },
        {
          text: "И с телефона",
          style: "destructive",
          onPress: async () => { await deleteDownload(d, true); await refresh(); },
        },
      ],
    );
  }

  async function handleClearAll() {
    if (items.length === 0) return;
    Alert.alert(
      "Очистить всю историю?",
      `${items.length} записей.`,
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Только историю",
          onPress: async () => { await clearAllDownloads(false); await refresh(); },
        },
        {
          text: "И с телефона",
          style: "destructive",
          onPress: async () => { await clearAllDownloads(true); await refresh(); },
        },
      ],
    );
  }

  function renderActiveJob(a: ActiveDownload) {
    return (
      <View key={a.key} style={[styles.row, styles.activeRow]}>
        {a.entry.poster_path ? (
          <Image source={{ uri: posterUrl(a.entry.poster_path, "w154") || "" }} style={styles.poster} contentFit="cover" />
        ) : (
          <View style={[styles.poster, styles.posterPlaceholder]}>
            <Ionicons name="film-outline" size={24} color={COLORS.textSecondary} />
          </View>
        )}
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.itemTitle} numberOfLines={1}>{a.entry.title}</Text>
          <Text style={styles.itemMeta}>
            {a.entry.type === "tv" ? `S${String(a.entry.season || 1).padStart(2, "0")}E${String(a.entry.episode || 1).padStart(2, "0")} · ` : ""}
            {a.entry.quality}
          </Text>
          {a.status === "running" && (
            <>
              <View style={styles.progressTrack}>
                <View style={[styles.progressBar, { width: `${Math.round(a.progress * 100)}%` }]} />
              </View>
              <Text style={styles.progressLabel}>
                {Math.round(a.progress * 100)}% · {fmtBytes(a.bytesWritten)}{a.totalBytes ? ` из ${fmtBytes(a.totalBytes)}` : ""}
              </Text>
            </>
          )}
          {a.status === "done" && (
            <Text style={[styles.progressLabel, { color: COLORS.primary }]}>✓ В Галерее (альбом sapkeflykino)</Text>
          )}
          {a.status === "error" && (
            <Text style={[styles.progressLabel, { color: "#ef4444" }]} numberOfLines={3}>{a.error}</Text>
          )}
        </View>
        {a.status !== "running" && (
          <Pressable onPress={() => dismiss(a.key)} style={styles.actionBtn} hitSlop={8}>
            <Ionicons name="close" size={20} color={COLORS.textSecondary} />
          </Pressable>
        )}
      </View>
    );
  }

  function renderItem({ item: d }: { item: DownloadEntry }) {
    const hasFile = !!d.localUri;
    return (
      <Pressable onPress={() => handleOpen(d)} style={styles.row}>
        {d.poster_path ? (
          <Image source={{ uri: posterUrl(d.poster_path, "w154") || "" }} style={styles.poster} contentFit="cover" />
        ) : (
          <View style={[styles.poster, styles.posterPlaceholder]}>
            <Ionicons name="film-outline" size={24} color={COLORS.textSecondary} />
          </View>
        )}
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.itemTitle} numberOfLines={2}>{d.title}</Text>
          <Text style={styles.itemMeta}>
            {d.type === "tv" ? `S${String(d.season || 1).padStart(2, "0")}E${String(d.episode || 1).padStart(2, "0")} · ` : ""}
            {d.quality}
            {d.sizeBytes ? ` · ${fmtBytes(d.sizeBytes)}` : ""}
          </Text>
          <Text style={styles.itemAge}>
            {ago(d.downloadedAt)}{hasFile ? " · Готов к офлайн-просмотру" : " · Файл удалён"}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 4 }}>
          {hasFile ? (
            <View style={[styles.actionBtn, { backgroundColor: COLORS.primary + "40" }]}>
              <Ionicons name="play" size={20} color={COLORS.primary} />
            </View>
          ) : (
            <View style={[styles.actionBtn]}>
              <Ionicons name="download-outline" size={20} color={COLORS.text} />
            </View>
          )}
          <Pressable onPress={(e) => { e.stopPropagation?.(); handleDelete(d); }} style={styles.actionBtn} hitSlop={8}>
            <Ionicons name="close" size={20} color={COLORS.textSecondary} />
          </Pressable>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => nav.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={28} color={COLORS.text} />
        </Pressable>
        <Text style={styles.title}>Загрузки</Text>
        <Pressable onPress={handleClearAll} hitSlop={12} disabled={items.length === 0}>
          <Ionicons name="trash-outline" size={22} color={items.length ? "#ef4444" : COLORS.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.filterRow}>
        {(["all", "movie", "tv"] as const).map(f => (
          <Pressable key={f} onPress={() => setFilter(f)} style={[styles.filterBtn, filter === f && styles.filterBtnActive]}>
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f === "all" ? "Все" : f === "movie" ? "Фильмы" : "Сериалы"}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Active downloads — pinned to the top so the user always sees progress */}
      {active.length > 0 && (
        <View style={{ padding: 12, paddingBottom: 0 }}>
          {active.map(renderActiveJob)}
        </View>
      )}

      {filtered.length === 0 && active.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="download-outline" size={48} color={COLORS.textSecondary} />
          <Text style={styles.emptyText}>
            {filter === "all" ? "Пока ничего не скачивал" : "Здесь пусто"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={entryKey}
          contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 32 }}
          renderItem={renderItem}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0f" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
  },
  title: { color: COLORS.text, fontSize: 18, fontWeight: "700" },
  filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  filterBtn: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  filterBtnActive: { backgroundColor: COLORS.primary },
  filterText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: "600" },
  filterTextActive: { color: "#fff" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  emptyText: { color: COLORS.textSecondary, fontSize: 14 },
  row: {
    flexDirection: "row", alignItems: "center", padding: 10,
    backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 12, marginBottom: 8,
  },
  activeRow: { backgroundColor: "rgba(163,230,53,0.08)", borderWidth: 1, borderColor: "rgba(163,230,53,0.2)" },
  poster: { width: 50, height: 75, borderRadius: 6 },
  posterPlaceholder: { backgroundColor: "#222", alignItems: "center", justifyContent: "center" },
  itemTitle: { color: COLORS.text, fontSize: 14, fontWeight: "600" },
  itemMeta: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  itemAge: { color: COLORS.textSecondary, fontSize: 11, marginTop: 4 },
  progressTrack: {
    height: 4, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 2,
    marginTop: 6, overflow: "hidden",
  },
  progressBar: { height: 4, backgroundColor: COLORS.primary, borderRadius: 2 },
  progressLabel: { color: COLORS.textSecondary, fontSize: 11, marginTop: 4 },
  actionBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center", justifyContent: "center",
  },
});
