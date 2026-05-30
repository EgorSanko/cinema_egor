/**
 * Downloads history screen.
 *
 * Lists what the user has downloaded (from AsyncStorage). The actual files
 * live in cache and may have been evicted by the OS — this screen is about
 * "what did I grab?" not "where is the file?". Re-tap to re-download via
 * the same proxy URL flow.
 */
import React, { useCallback, useEffect, useState } from "react";
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
  buildFilename, toProxyUrl, downloadToDevice, addDownload,
} from "../../lib/downloads";
import { posterUrl } from "../../api/tmdb";

export function DownloadsScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<DownloadEntry[]>([]);
  const [filter, setFilter] = useState<"all" | "movie" | "tv">("all");
  const [redownloading, setRedownloading] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setItems(await getDownloads());
  }, []);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
  useEffect(() => { refresh(); }, [refresh]);

  const filtered = filter === "all" ? items : items.filter(i => i.type === filter);

  function entryKey(d: DownloadEntry) {
    return `${d.type}-${d.id}-s${d.season ?? 0}e${d.episode ?? 0}-${d.quality}-${d.downloadedAt}`;
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

  async function handleRedownload(d: DownloadEntry) {
    if (redownloading) return;
    const filename = buildFilename(d);
    setRedownloading(entryKey(d));
    try {
      await downloadToDevice(toProxyUrl(d.url, filename), filename);
      await addDownload(d);
      await refresh();
    } catch (e: any) {
      Alert.alert("Ошибка", String(e?.message || e));
    } finally {
      setRedownloading(null);
    }
  }

  async function handleDelete(d: DownloadEntry) {
    Alert.alert("Удалить из истории?", "Запись удалится, файл — нет.", [
      { text: "Отмена", style: "cancel" },
      {
        text: "Удалить",
        style: "destructive",
        onPress: async () => {
          await deleteDownload(d.id, d.type, d.season, d.episode, d.quality);
          await refresh();
        },
      },
    ]);
  }

  async function handleClearAll() {
    if (items.length === 0) return;
    Alert.alert("Очистить всю историю?", `${items.length} записей будет удалено.`, [
      { text: "Отмена", style: "cancel" },
      {
        text: "Очистить",
        style: "destructive",
        onPress: async () => { await clearAllDownloads(); await refresh(); },
      },
    ]);
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

      {filtered.length === 0 ? (
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
          renderItem={({ item: d }) => {
            const isRedown = redownloading === entryKey(d);
            return (
              <View style={styles.row}>
                {d.poster_path ? (
                  <Image source={{ uri: posterUrl(d.poster_path, "w154") || "" }} style={styles.poster} contentFit="cover" />
                ) : (
                  <View style={[styles.poster, { backgroundColor: "#222", alignItems: "center", justifyContent: "center" }]}>
                    <Ionicons name="film-outline" size={24} color={COLORS.textSecondary} />
                  </View>
                )}
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.itemTitle} numberOfLines={2}>{d.title}</Text>
                  <Text style={styles.itemMeta}>
                    {d.type === "tv" ? `S${String(d.season || 1).padStart(2, "0")}E${String(d.episode || 1).padStart(2, "0")} · ` : ""}
                    {d.quality}
                    {d.translatorName ? ` · ${d.translatorName}` : ""}
                  </Text>
                  <Text style={styles.itemAge}>{ago(d.downloadedAt)}</Text>
                </View>
                <View style={{ flexDirection: "row", gap: 4 }}>
                  <Pressable onPress={() => handleRedownload(d)} style={styles.actionBtn} disabled={!!redownloading}>
                    {isRedown ? (
                      <ActivityIndicator size="small" color={COLORS.primary} />
                    ) : (
                      <Ionicons name="download-outline" size={20} color={COLORS.text} />
                    )}
                  </Pressable>
                  <Pressable onPress={() => handleDelete(d)} style={styles.actionBtn}>
                    <Ionicons name="close" size={20} color={COLORS.textSecondary} />
                  </Pressable>
                </View>
              </View>
            );
          }}
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
  poster: { width: 50, height: 75, borderRadius: 6 },
  itemTitle: { color: COLORS.text, fontSize: 14, fontWeight: "600" },
  itemMeta: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  itemAge: { color: COLORS.textSecondary, fontSize: 11, marginTop: 4 },
  actionBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center", justifyContent: "center",
  },
});
