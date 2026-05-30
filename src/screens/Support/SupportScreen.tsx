/**
 * Mobile support form. Submits to the same /api/tickets endpoint that the
 * web form uses, so admin has one place to read everything (/admin/tickets
 * on the web).
 */
import React, { useState } from "react";
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet,
  ActivityIndicator, Alert, Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { COLORS } from "../../constants/theme";
import { getUser } from "../../utils/auth";

const CATEGORIES = [
  { value: "bug",      label: "🐛 Ошибка" },
  { value: "feature",  label: "💡 Идея" },
  { value: "question", label: "❓ Вопрос" },
  { value: "other",    label: "📝 Другое" },
] as const;

type Category = (typeof CATEGORIES)[number]["value"];

const API_BASE = "https://sapkeflykino.ru";

export function SupportScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState<Category>("bug");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [screenshot, setScreenshot] = useState<{ uri: string; type: string; name: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function pickScreenshot() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Нет доступа к Галерее", "Разреши в настройках Android.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const ext = (asset.uri.split(".").pop() || "jpg").toLowerCase();
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    setScreenshot({ uri: asset.uri, type: mime, name: `screenshot.${ext}` });
  }

  async function handleSubmit() {
    const user = await getUser();
    if (!user?.email) {
      Alert.alert("Войди в аккаунт", "Чтобы отправить заявку, нужен авторизованный email.");
      return;
    }
    if (message.trim().length < 5) {
      Alert.alert("Сообщение слишком короткое", "Опиши проблему хотя бы в 5 символов.");
      return;
    }
    setSubmitting(true);

    const fd = new FormData();
    fd.append("email", user.email);
    fd.append("category", category);
    fd.append("subject", subject);
    fd.append("message", message);
    fd.append("meta", JSON.stringify({
      platform: Platform.OS === "ios" ? "ios" : "android",
      appVersion: (Constants.expoConfig?.version as string) || "unknown",
      userAgent: `sapkeflykino/${Constants.expoConfig?.version} (${Platform.OS} ${Platform.Version})`,
      currentScreen: "Support",
    }));
    if (screenshot) {
      // React Native FormData file shape — Android needs name+type+uri object
      fd.append("screenshot", {
        uri: screenshot.uri,
        type: screenshot.type,
        name: screenshot.name,
      } as any);
    }

    try {
      const res = await fetch(`${API_BASE}/api/tickets`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert("Ошибка", data.error || `HTTP ${res.status}`);
        setSubmitting(false);
        return;
      }
      Alert.alert(
        "Заявка отправлена",
        `Номер: ${data.id.slice(0, 8)}. Ответим на ${user.email}.`,
        [{ text: "OK", onPress: () => nav.goBack() }],
      );
    } catch (e: any) {
      Alert.alert("Сетевая ошибка", String(e?.message || e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => nav.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={28} color={COLORS.text} />
        </Pressable>
        <Text style={styles.title}>Поддержка</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}>
        <Text style={styles.intro}>
          Опиши проблему или предложение. Мы прочитаем и ответим на email.
        </Text>

        <Text style={styles.label}>Тип</Text>
        <View style={styles.catGrid}>
          {CATEGORIES.map(c => (
            <Pressable
              key={c.value}
              onPress={() => setCategory(c.value)}
              style={[styles.catBtn, category === c.value && styles.catBtnActive]}
            >
              <Text style={[styles.catText, category === c.value && { color: "#fff" }]}>{c.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Тема (необязательно)</Text>
        <TextInput
          value={subject}
          onChangeText={setSubject}
          maxLength={200}
          placeholder="Кратко: что не работает"
          placeholderTextColor={COLORS.textSecondary}
          style={styles.input}
        />

        <Text style={styles.label}>Сообщение ({message.length}/4000)</Text>
        <TextInput
          value={message}
          onChangeText={setMessage}
          maxLength={4000}
          multiline
          textAlignVertical="top"
          placeholder="Что хотел сделать, что произошло, на каком фильме/сериале..."
          placeholderTextColor={COLORS.textSecondary}
          style={[styles.input, { minHeight: 140 }]}
        />

        <Text style={styles.label}>Скриншот (до 5 МБ)</Text>
        {screenshot ? (
          <View style={styles.screenshotRow}>
            <Text style={{ color: COLORS.text, flex: 1 }} numberOfLines={1}>
              📎 {screenshot.name}
            </Text>
            <Pressable onPress={() => setScreenshot(null)} hitSlop={8}>
              <Text style={{ color: "#ef4444" }}>Убрать</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={pickScreenshot} style={styles.pickBtn}>
            <Ionicons name="image-outline" size={18} color={COLORS.text} />
            <Text style={{ color: COLORS.text, fontWeight: "600" }}>Прикрепить</Text>
          </Pressable>
        )}

        <Pressable
          onPress={handleSubmit}
          disabled={submitting || message.trim().length < 5}
          style={[styles.submitBtn, (submitting || message.trim().length < 5) && { opacity: 0.4 }]}
        >
          {submitting
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.submitText}>Отправить</Text>}
        </Pressable>
      </ScrollView>
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
  intro: { color: COLORS.textSecondary, fontSize: 14, marginBottom: 16 },
  label: {
    color: COLORS.textSecondary, fontSize: 10, fontWeight: "700",
    textTransform: "uppercase", letterSpacing: 1, marginTop: 16, marginBottom: 6,
  },
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catBtn: {
    width: "48%",
    paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  catBtnActive: { backgroundColor: COLORS.primary },
  catText: { color: COLORS.text, fontSize: 14, fontWeight: "600" },
  input: {
    backgroundColor: "rgba(255,255,255,0.06)", color: COLORS.text,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
  },
  screenshotRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 10, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.04)",
  },
  pickBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 12, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.06)",
  },
  submitBtn: {
    marginTop: 24, paddingVertical: 14, borderRadius: 12,
    backgroundColor: COLORS.primary, alignItems: "center",
  },
  submitText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
