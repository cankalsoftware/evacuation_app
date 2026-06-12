import './global.css';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, Image, Text, useWindowDimensions } from 'react-native';
import React, { useEffect, useState } from 'react';
import { ClerkProvider, useAuth, useUser } from "@clerk/clerk-expo";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient, useQuery, useMutation } from "convex/react";
import * as SecureStore from "expo-secure-store";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { api } from "./convex/_generated/api";

import AuthScreen from "./components/AuthScreen";
import LocationConsentScreen from "./components/LocationConsentScreen";
import MainScreen from "./components/MainScreen";
import Toast from "./components/Toast";

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!, {
  unsavedChangesWarning: false,
});

const tokenCache = {
  async getToken(key: string) {
    try {
      return SecureStore.getItemAsync(key);
    } catch (err) {
      return null;
    }
  },
  async saveToken(key: string, value: string) {
    try {
      return SecureStore.setItemAsync(key, value);
    } catch (err) {
      return;
    }
  },
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

function RootNavigator() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { user } = useUser();
  const syncUser = useMutation(api.users.syncUser);
  const [hasSynced, setHasSynced] = useState(false);

  useEffect(() => {
    if (isSignedIn && userId && user?.primaryEmailAddress?.emailAddress && !hasSynced) {
      const { Platform } = require('react-native');
      const getRolePromise = Platform.OS === 'web' 
        ? Promise.resolve(localStorage.getItem('requested_role'))
        : SecureStore.getItemAsync('requested_role');

      getRolePromise.then((savedRole: any) => {
        // If a role was saved during login, use it. Otherwise, default to whatever they had before, or guest.
        const role = savedRole || (typeof user.publicMetadata?.role === 'string' ? user.publicMetadata.role : "guest");
        
        syncUser({ 
          clerkId: userId,
          email: user.primaryEmailAddress!.emailAddress,
          role: role
        }).then(() => setHasSynced(true)).catch((err: any) => console.error("Sync failed:", err));
      }).catch((err: any) => console.error("SecureStore failed:", err));
    }
  }, [isSignedIn, userId, user?.primaryEmailAddress?.emailAddress, hasSynced, syncUser]);

  const hasConsented = useQuery(api.consent.getConsentStatus, 
    { clerkId: userId ?? undefined }
  );

  if (!isLoaded) {
    return (
      <View className="flex-1 bg-neutral-900 items-center justify-center">
        <ActivityIndicator color="red" size="large" />
      </View>
    );
  }

  if (!isSignedIn) {
    return <AuthScreen />;
  }

  if (hasConsented === undefined) {
    return (
      <View className="flex-1 bg-neutral-900 items-center justify-center">
        <ActivityIndicator color="red" size="large" />
      </View>
    );
  }

  if (!hasConsented) {
    return <LocationConsentScreen />;
  }

  return <MainScreen />;
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const { width } = useWindowDimensions();

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 2500);

    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('emergency', {
        name: 'Emergency Alerts',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
        sound: 'default', // Ideally a custom loud siren sound
        bypassDnd: true, // Crucial for Android DND override
      });
    }

    return () => clearTimeout(timer);
  }, []);

  if (showSplash) {
    const logoSize = Math.min(width * 0.9, 600); // 90% of screen width, max 600px
    const dynamicFontSize = Math.max(24, Math.min(width * 0.08, 48)); // Scale font size based on width

    return (
      <View className="flex-1 bg-neutral-900 items-center justify-center px-4">
        <Image 
          source={require('./FireVision.png')} 
          style={{ width: logoSize, height: logoSize }} 
          resizeMode="contain" 
        />
        <Text 
          className="text-white font-black uppercase tracking-widest text-center mt-6"
          style={{ fontSize: dynamicFontSize }}
        >
          Evacuation App
        </Text>
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <ClerkProvider 
      publishableKey={process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!}
      tokenCache={tokenCache}
    >
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <RootNavigator />
        <Toast />
        <StatusBar style="light" />
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
