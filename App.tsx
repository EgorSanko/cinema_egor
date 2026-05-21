import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

// Sentry — silently swallows initialization when DSN is missing, so safe to
// keep here without a guard. Set EXPO_PUBLIC_SENTRY_DSN in .env once you have
// a project at sentry.io. Free tier covers 5k events/mo.
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN || '',
  enabled: !!process.env.EXPO_PUBLIC_SENTRY_DSN,
  release: (Constants.expoConfig?.version as string) || undefined,
  // GlitchTip-friendly: low trace sampling (mobile makes many transactions),
  // session tracking off (GlitchTip doesn't support sessions yet).
  tracesSampleRate: 0.01,
  autoSessionTracking: false,
  // Don't spam from dev builds
  enableInExpoDevelopment: false,
});
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { AppNavigator } from './src/navigation/AppNavigator';
import { VersionGate } from './src/components/VersionGate';
import { COLORS } from './src/constants/theme';

const DarkTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    primary: COLORS.primary,
    background: COLORS.bg,
    card: COLORS.bgCard,
    text: COLORS.text,
    border: COLORS.border,
    notification: COLORS.primary,
  },
};

function AppInner() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  if (!fontsLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer theme={DarkTheme}>
        <StatusBar style="light" />
        <VersionGate>
          <AppNavigator />
        </VersionGate>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}

// Wrap with Sentry — only attaches if DSN is set (see init() above).
export default Sentry.wrap(AppInner);

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
