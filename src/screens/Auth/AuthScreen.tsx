import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, Alert, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { login, register } from '../../utils/auth';
import { COLORS, RADIUS, FONTS, SPACING } from '../../constants/theme';

interface Props {
  onAuth: (user: { email: string; name: string }) => void;
}

export function AuthScreen({ onAuth }: Props) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Ошибка', 'Заполните все поля');
      return;
    }
    if (mode === 'register' && !name.trim()) {
      Alert.alert('Ошибка', 'Введите имя');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Ошибка', 'Пароль минимум 6 символов');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        const user = await login(email.trim(), password);
        onAuth(user);
      } else {
        const user = await register(name.trim(), email.trim(), password);
        onAuth(user);
      }
    } catch (e: any) {
      Alert.alert('Ошибка', e.message || 'Что-то пошло не так');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <Animated.View entering={FadeIn.duration(600)} style={styles.logoWrap}>
            <Image source={require('../../../assets/logo.png')} style={styles.logoImage} resizeMode="contain" />
            <Text style={styles.logoSubtext}>Кино и сериалы онлайн</Text>
          </Animated.View>

          {/* Form */}
          <Animated.View entering={FadeInDown.duration(500).delay(200)} style={styles.form}>
            {mode === 'register' && (
              <View style={styles.inputWrap}>
                <Ionicons name="person-outline" size={20} color={COLORS.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Имя"
                  placeholderTextColor={COLORS.textMuted}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  selectionColor={COLORS.primary}
                />
              </View>
            )}

            <View style={styles.inputWrap}>
              <Ionicons name="mail-outline" size={20} color={COLORS.textMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor={COLORS.textMuted}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                selectionColor={COLORS.primary}
              />
            </View>

            <View style={styles.inputWrap}>
              <Ionicons name="lock-closed-outline" size={20} color={COLORS.textMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Пароль"
                placeholderTextColor={COLORS.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                selectionColor={COLORS.primary}
              />
              <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={8}>
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={COLORS.textMuted}
                />
              </Pressable>
            </View>

            <Pressable
              onPress={handleSubmit}
              disabled={loading}
              style={[styles.submitBtn, loading && { opacity: 0.7 }]}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitText}>
                  {mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
                </Text>
              )}
            </Pressable>

            <Pressable
              onPress={() => setMode(mode === 'login' ? 'register' : 'login')}
              style={styles.switchBtn}
            >
              <Text style={styles.switchText}>
                {mode === 'login' ? 'Нет аккаунта? Регистрация' : 'Уже есть аккаунт? Войти'}
              </Text>
            </Pressable>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACING.xxl,
    paddingBottom: 40,
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoImage: {
    width: 140,
    height: 140,
    marginBottom: SPACING.md,
  },
  logoSubtext: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontFamily: FONTS.regular,
    marginTop: 4,
  },
  form: {
    gap: SPACING.md,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgElevated,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    height: 52,
  },
  inputIcon: {
    marginRight: SPACING.sm,
  },
  input: {
    flex: 1,
    color: COLORS.text,
    fontSize: 16,
    fontFamily: FONTS.medium,
  },
  submitBtn: {
    backgroundColor: COLORS.primary,
    height: 52,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.sm,
  },
  submitText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: FONTS.bold,
  },
  switchBtn: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  switchText: {
    color: COLORS.primary,
    fontSize: 14,
    fontFamily: FONTS.medium,
  },
});
