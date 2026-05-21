/**
 * Version gate — checks current app version against /api/app-version on the
 * site. If installed version is below `minimum`, shows a blocking screen that
 * users can't dismiss. Below `latest` but above `minimum`, shows a one-time
 * soft banner.
 *
 * Without this users sit on old APKs and never know there's a new build.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Linking, ActivityIndicator } from 'react-native';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';

const VERSION_URL = 'https://sapkeflykino.ru/api/app-version';

interface Manifest {
  latest: string;
  minimum: string;
  downloadUrl: string;
  downloadPage: string;
  releaseNotes?: string[];
}

// Semver-ish compare: returns -1 / 0 / 1 like sort comparator.
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da !== db) return da > db ? 1 : -1;
  }
  return 0;
}

export function VersionGate({ children }: { children: React.ReactNode }) {
  // Read version from native first (more reliable in standalone builds);
  // fall back to expo-constants for dev/Expo Go.
  const installed: string =
    Application.nativeApplicationVersion ||
    (Constants.expoConfig?.version as string) ||
    ((Constants as any).manifest?.version as string) ||
    '0.0.0';

  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [softDismissed, setSoftDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(VERSION_URL)
      .then(r => r.json())
      .then((m: Manifest) => { if (!cancelled) setManifest(m); })
      .catch(() => { /* offline — let the app run, recheck next launch */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Network call hasn't finished yet — show app normally. We never block users
  // when we can't reach the server (would brick the app during outages).
  if (loading || !manifest) return <>{children}</>;

  const belowMinimum = compareVersions(installed, manifest.minimum) < 0;
  const belowLatest = compareVersions(installed, manifest.latest) < 0;

  if (belowMinimum) {
    return <UpdateRequiredScreen installed={installed} manifest={manifest} />;
  }

  return (
    <>
      {children}
      {belowLatest && !softDismissed && (
        <SoftUpdateBanner installed={installed} manifest={manifest} onDismiss={() => setSoftDismissed(true)} />
      )}
    </>
  );
}

function UpdateRequiredScreen({ installed, manifest }: { installed: string; manifest: Manifest }) {
  return (
    <View style={styles.fullscreen}>
      <View style={styles.iconCircle}>
        <Ionicons name="cloud-download-outline" size={48} color={COLORS.primary} />
      </View>
      <Text style={styles.title}>Нужно обновление</Text>
      <Text style={styles.subtitle}>
        У тебя версия <Text style={styles.versionInline}>v{installed}</Text>. Минимальная поддерживаемая —{' '}
        <Text style={styles.versionInline}>v{manifest.minimum}</Text>. Старые сборки не работают со свежим бэкендом.
      </Text>

      {manifest.releaseNotes && manifest.releaseNotes.length > 0 && (
        <View style={styles.notes}>
          <Text style={styles.notesTitle}>Что нового в v{manifest.latest}:</Text>
          {manifest.releaseNotes.map(n => (
            <Text key={n} style={styles.notesItem}>• {n}</Text>
          ))}
        </View>
      )}

      <Pressable
        onPress={() => Linking.openURL(manifest.downloadUrl)}
        style={styles.primaryBtn}
      >
        <Ionicons name="download" size={20} color="#000" />
        <Text style={styles.primaryBtnText}>Скачать APK v{manifest.latest}</Text>
      </Pressable>
      <Pressable
        onPress={() => Linking.openURL(manifest.downloadPage)}
        style={styles.secondaryBtn}
      >
        <Text style={styles.secondaryBtnText}>Открыть страницу скачивания</Text>
      </Pressable>
    </View>
  );
}

function SoftUpdateBanner({ installed, manifest, onDismiss }: { installed: string; manifest: Manifest; onDismiss: () => void }) {
  return (
    <View style={styles.softBanner}>
      <Ionicons name="cloud-download-outline" size={20} color={COLORS.primary} />
      <View style={styles.softTextWrap}>
        <Text style={styles.softTitle}>Доступна версия v{manifest.latest}</Text>
        <Text style={styles.softSubtitle}>У тебя v{installed}. Обнови когда удобно.</Text>
      </View>
      <Pressable onPress={() => Linking.openURL(manifest.downloadUrl)} style={styles.softUpdateBtn}>
        <Text style={styles.softUpdateText}>Скачать</Text>
      </Pressable>
      <Pressable onPress={onDismiss} hitSlop={12} style={styles.softCloseBtn}>
        <Ionicons name="close" size={18} color="rgba(255,255,255,0.5)" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fullscreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    backgroundColor: COLORS.bg,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: COLORS.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  title: {
    color: COLORS.text,
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 12,
  },
  subtitle: {
    color: COLORS.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
  },
  versionInline: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  notes: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
    padding: 16,
    marginBottom: 28,
    width: '100%',
  },
  notesTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  notesItem: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 30,
    backgroundColor: COLORS.primary,
    marginBottom: 14,
  },
  primaryBtnText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  secondaryBtnText: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  softBanner: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.primary + '40',
  },
  softTextWrap: { flex: 1 },
  softTitle: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  softSubtitle: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },
  softUpdateBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
  },
  softUpdateText: { color: '#000', fontSize: 13, fontWeight: '700' },
  softCloseBtn: { padding: 4 },
});
