import React, { useEffect, useState } from 'react';
import {
  View, Text, Modal, Pressable, StyleSheet, ActivityIndicator,
  Clipboard, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, RADIUS, FONTS, SPACING, API_BASE } from '../constants/theme';

interface StreamPayload {
  stream: string;
  quality: string;
  streams: Record<string, string>;
  title: string;
  translators?: { id: number; name: string }[];
  selectedTranslator?: number | null;
  searchQuery?: string;
  year?: string;
  season?: number;
  episode?: number;
  isSeries?: boolean;
  totalSeasons?: number;
  totalEpisodes?: number;
  mediaId?: number;
  mediaType?: 'movie' | 'tv';
  poster_path?: string | null;
  vote_average?: number;
  release_date?: string;
  first_air_date?: string;
  episodeName?: string;
}

interface Props {
  streamData: StreamPayload | null;
  visible: boolean;
  onClose: () => void;
  userEmail?: string | null;
}

export function SendToTV({ streamData, visible, onClose, userEmail }: Props) {
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  // Create room when modal opens
  useEffect(() => {
    if (!visible || !streamData) return;
    let cancelled = false;
    setCode(null);
    setConnected(false);
    setError('');
    setLoading(true);
    fetch(`${API_BASE}/api/tv-room`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create',
        stream: { ...streamData, userEmail: userEmail || null },
      }),
    })
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        if (d.code) setCode(d.code);
        else setError('Не удалось создать комнату');
      })
      .catch(() => { if (!cancelled) setError('Ошибка сервера'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [visible, streamData, userEmail]);

  // Poll for TV connection
  useEffect(() => {
    if (!code || connected) return;
    const interval = setInterval(async () => {
      try {
        const r = await fetch(`${API_BASE}/api/tv-room`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'status', code }),
        });
        const d = await r.json();
        if (d.connected) {
          setConnected(true);
          clearInterval(interval);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } catch {}
    }, 2000);
    return () => clearInterval(interval);
  }, [code, connected]);

  const copyCode = () => {
    if (!code) return;
    Clipboard.setString(code);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.iconBox}>
                <Ionicons name="tv" size={22} color="#ef4444" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>На ТВ</Text>
                {streamData?.title ? (
                  <Text style={styles.subtitle} numberOfLines={1}>{streamData.title}</Text>
                ) : null}
              </View>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#94a3b8" />
            </Pressable>
          </View>

          {/* Body */}
          <View style={styles.body}>
            {loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loadingText}>Создаём комнату...</Text>
              </View>
            ) : error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={32} color="#ef4444" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : connected ? (
              <View style={styles.connectedBox}>
                <View style={styles.connectedIcon}>
                  <Ionicons name="checkmark-circle" size={48} color={COLORS.primary} />
                </View>
                <Text style={styles.connectedTitle}>ТВ подключился!</Text>
                <Text style={styles.connectedSubtitle}>Воспроизведение началось на телевизоре</Text>
              </View>
            ) : code ? (
              <>
                <Text style={styles.instruction}>
                  Откройте на ТВ:
                </Text>
                <Text style={styles.url}>sapkeflykino.ru/cast</Text>
                <Text style={styles.instruction}>и введите код:</Text>
                <Pressable style={styles.codeBox} onPress={copyCode}>
                  <Text style={styles.codeText}>{code}</Text>
                  <View style={styles.copyHint}>
                    <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={14} color={COLORS.textMuted} />
                    <Text style={styles.copyText}>{copied ? 'Скопировано' : 'Копировать'}</Text>
                  </View>
                </Pressable>
                <View style={styles.waitingHint}>
                  <ActivityIndicator size="small" color={COLORS.primary} />
                  <Text style={styles.waitingText}>Ждём подключения ТВ...</Text>
                </View>
              </>
            ) : null}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center', justifyContent: 'center',
    padding: SPACING.lg,
  },
  card: {
    width: '100%', maxWidth: 380,
    backgroundColor: '#0f172a',
    borderRadius: RADIUS.xl,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  iconBox: {
    width: 40, height: 40, borderRadius: RADIUS.md,
    backgroundColor: 'rgba(239,68,68,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { color: '#fff', fontSize: 17, fontFamily: FONTS.bold },
  subtitle: { color: '#64748b', fontSize: 12, fontFamily: FONTS.regular, marginTop: 2 },
  closeBtn: { padding: 4 },

  body: { padding: SPACING.lg, alignItems: 'center', minHeight: 220, justifyContent: 'center' },
  loadingBox: { alignItems: 'center', gap: 12 },
  loadingText: { color: '#94a3b8', fontSize: 13, fontFamily: FONTS.regular },

  errorBox: { alignItems: 'center', gap: 8 },
  errorText: { color: '#ef4444', fontSize: 14, fontFamily: FONTS.medium },

  connectedBox: { alignItems: 'center', gap: 8 },
  connectedIcon: { marginBottom: 6 },
  connectedTitle: { color: '#fff', fontSize: 18, fontFamily: FONTS.bold },
  connectedSubtitle: { color: '#94a3b8', fontSize: 13, fontFamily: FONTS.regular, textAlign: 'center' },

  instruction: { color: '#94a3b8', fontSize: 13, fontFamily: FONTS.regular, marginBottom: 4 },
  url: {
    color: COLORS.primary, fontSize: 15, fontFamily: FONTS.semibold,
    marginBottom: 16,
  },
  codeBox: {
    width: '100%',
    backgroundColor: 'rgba(127,234,2,0.08)',
    borderWidth: 1, borderColor: 'rgba(127,234,2,0.3)',
    borderRadius: RADIUS.lg,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 14,
  },
  codeText: {
    color: COLORS.primary, fontSize: 36, fontFamily: FONTS.bold,
    letterSpacing: 6,
  },
  copyHint: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  copyText: { color: COLORS.textMuted, fontSize: 11, fontFamily: FONTS.regular },

  waitingHint: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  waitingText: { color: '#94a3b8', fontSize: 12, fontFamily: FONTS.regular },
});
