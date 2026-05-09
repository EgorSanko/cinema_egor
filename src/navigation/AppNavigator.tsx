import React, { useState, useEffect } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS } from '../constants/theme';

import { HomeScreen } from '../screens/Home/HomeScreen';
import { MovieDetailScreen } from '../screens/Movie/MovieDetailScreen';
import { SearchScreen } from '../screens/Search/SearchScreen';
import { FavoritesScreen } from '../screens/Favorites/FavoritesScreen';
import { TVScreen } from '../screens/TV/TVScreen';
import { PlayerScreen } from '../screens/Player/PlayerScreen';
import { GenresScreen } from '../screens/Genres/GenresScreen';
import { GenreMoviesScreen } from '../screens/Genres/GenreMoviesScreen';
import { CollectionsScreen } from '../screens/Collections/CollectionsScreen';
import { SwipeScreen } from '../screens/Swipe/SwipeScreen';
import { WatchTogetherScreen } from '../screens/Watch/WatchTogetherScreen';
import { AuthScreen } from '../screens/Auth/AuthScreen';
import { ProfileScreen } from '../screens/Profile/ProfileScreen';
import { PersonScreen } from '../screens/Person/PersonScreen';
import { getUser, onAuthChange, syncFromServer, type User } from '../utils/auth';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const TAB_ICONS: Record<string, { focused: keyof typeof Ionicons.glyphMap; unfocused: keyof typeof Ionicons.glyphMap }> = {
  HomeTab: { focused: 'home', unfocused: 'home-outline' },
  TVTab: { focused: 'tv', unfocused: 'tv-outline' },
  SearchTab: { focused: 'search', unfocused: 'search-outline' },
  GenresTab: { focused: 'grid', unfocused: 'grid-outline' },
  FavoritesTab: { focused: 'heart', unfocused: 'heart-outline' },
  ProfileTab: { focused: 'person-circle', unfocused: 'person-circle-outline' },
};

function HomeTabs() {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, 8);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarLabelStyle: { fontSize: 10, fontFamily: FONTS.medium, marginTop: -2 },
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'rgba(10,10,15,0.95)',
          borderTopWidth: 1,
          borderTopColor: COLORS.border,
          height: 56 + bottomPadding,
          paddingBottom: bottomPadding,
          paddingTop: 6,
        },
        tabBarIcon: ({ focused, color }) => {
          const icons = TAB_ICONS[route.name];
          return <Ionicons name={focused ? icons.focused : icons.unfocused} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen name="HomeTab" component={HomeScreen} options={{ tabBarLabel: 'Главная' }} />
      <Tab.Screen name="TVTab" component={TVScreen} options={{ tabBarLabel: 'Сериалы' }} />
      <Tab.Screen name="SearchTab" component={SearchScreen} options={{ tabBarLabel: 'Поиск' }} />
      <Tab.Screen name="GenresTab" component={GenresScreen} options={{ tabBarLabel: 'Жанры' }} />
      <Tab.Screen name="FavoritesTab" component={FavoritesScreen} options={{ tabBarLabel: 'Избранное' }} />
      <Tab.Screen name="ProfileTab" component={ProfileScreen} options={{ tabBarLabel: 'Профиль' }} />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    getUser().then(async (u) => {
      setUser(u);
      if (u?.email) { try { await syncFromServer(u.email); } catch {} }
    });
    return onAuthChange(setUser);
  }, []);

  if (user === undefined) return null;

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!user ? (
        <Stack.Screen name="Auth">{() => <AuthScreen onAuth={setUser} />}</Stack.Screen>
      ) : (
        <>
          <Stack.Screen name="Main" component={HomeTabs} />
          <Stack.Screen name="MovieDetail" component={MovieDetailScreen} options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="TVDetail" component={MovieDetailScreen} options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="Player" component={PlayerScreen} options={{ animation: 'fade', orientation: 'landscape' }} />
          <Stack.Screen name="GenreMovies" component={GenreMoviesScreen} options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="Collections" component={CollectionsScreen} options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="Swipe" component={SwipeScreen} options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="WatchTogether" component={WatchTogetherScreen} options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="Person" component={PersonScreen} options={{ animation: 'slide_from_right' }} />
        </>
      )}
    </Stack.Navigator>
  );
}
