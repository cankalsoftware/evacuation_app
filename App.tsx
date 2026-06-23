import './polyfill';
import "react-native-reanimated";
import './global.css';

import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, Image, Text, useWindowDimensions, TouchableOpacity } from 'react-native';
import React, { useEffect, useState } from 'react';
import { ClerkProvider, useAuth, useUser } from "@clerk/clerk-expo";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient, useQuery, useMutation } from "convex/react";
import * as SecureStore from "expo-secure-store";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { api } from "./convex/_generated/api";
import { getOrCreateDeviceId } from "./utils/device";

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
  const { isLoaded, isSignedIn, userId, signOut } = useAuth();
  const { user } = useUser();
  const syncUser = useMutation(api.users.syncUser);
  const [hasSynced, setHasSynced] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [collisionWarning, setCollisionWarning] = useState(false);
  const [deviceConfirmed, setDeviceConfirmed] = useState(false);

  useEffect(() => {
    getOrCreateDeviceId().then(id => setDeviceId(id));
  }, []);

  const convexUser = useQuery(api.users.getUser, { clerkId: userId ?? undefined });

  // Phase 23: Login Collision Interceptor
  useEffect(() => {
    if (isSignedIn && userId && user?.primaryEmailAddress?.emailAddress && !hasSynced && deviceId && convexUser !== undefined) {
      // If the user already has an active device, and it's not this one, trigger the warning BEFORE syncing!
      if (convexUser && convexUser.activeDeviceId && convexUser.activeDeviceId !== deviceId && !collisionWarning) {
        setCollisionWarning(true);
        return;
      }

      if (!collisionWarning) {
        executeSync();
      }
    }
  }, [isSignedIn, userId, user?.primaryEmailAddress?.emailAddress, hasSynced, syncUser, deviceId, convexUser, collisionWarning]);

  const executeSync = () => {
    if (!user?.primaryEmailAddress?.emailAddress || !userId || !deviceId) return;
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
          role: role,
          activeDeviceId: deviceId
        }).then(() => setHasSynced(true)).catch((err: any) => console.error("Sync failed:", err));
      }).catch((err: any) => console.error("SecureStore failed:", err));
  };

  // Ensure convex actually registers our device before enforcing kicks
  useEffect(() => {
    if (convexUser?.activeDeviceId === deviceId) {
      setDeviceConfirmed(true);
    }
  }, [convexUser?.activeDeviceId, deviceId]);

  // Auto-Kick Enforcer (Listen for changes AFTER we have synced and confirmed our device)
  useEffect(() => {
    if (deviceConfirmed && isSignedIn && convexUser && deviceId && convexUser.activeDeviceId) {
      if (convexUser.activeDeviceId !== deviceId) {
        console.warn("Device kicked! Active device changed.");
        (async () => {
          try {
            await signOut();
          } catch (e) {
            console.log("Clerk signout error (ignored):", e);
          }
        })();
        setHasSynced(false); // Reset sync state
        setCollisionWarning(false);
        setDeviceConfirmed(false);
        if (Platform.OS !== 'web') {
           const { Alert } = require('react-native');
           Alert.alert("Logged Out", "You were logged out because your account was accessed from another device.");
        } else {
           window.alert("You were logged out because your account was accessed from another device.");
        }
      }
    }
  }, [deviceConfirmed, isSignedIn, convexUser?.activeDeviceId, deviceId, signOut]);

  const hasConsented = convexUser === undefined 
    ? undefined 
    : (convexUser?.locationGranted !== undefined && convexUser?.notificationsGranted !== undefined);

  if (!isLoaded) {
    return (
      <View className="flex-1 bg-neutral-900 items-center justify-center">
        <ActivityIndicator color="red" size="large" />
      </View>
    );
  }

  if (collisionWarning) {
    return (
      <View className="flex-1 bg-neutral-900 items-center justify-center p-6">
        <View className="w-full max-w-sm bg-neutral-800 p-8 rounded-3xl shadow-xl border border-neutral-700 items-center">
          <Text className="text-4xl mb-4">⚠️</Text>
          <Text className="text-xl font-bold text-white mb-4 text-center">Multiple Devices Detected</Text>
          <Text className="text-neutral-400 mb-8 text-center leading-relaxed">
            You are currently logged in on another device. If you proceed, the other device will be automatically logged out.
          </Text>
          <View className="w-full flex-col space-y-3">
             <View className="mb-3">
               <TouchableOpacity 
                 onPress={() => {
                   setHasSynced(true);
                   executeSync();
                   setCollisionWarning(false);
                 }}
                 className="bg-red-600 border border-neutral-700 rounded-xl py-4 items-center"
               >
                 <Text className="text-white font-bold text-center">Log Out Other Device & Continue</Text>
               </TouchableOpacity>
             </View>
             <TouchableOpacity 
               onPress={() => {
                 (async () => {
                   try {
                     await signOut();
                   } catch (e) {
                     console.log(e);
                   }
                 })();
                 setCollisionWarning(false);
               }}
               className="bg-neutral-800 border border-neutral-700 rounded-xl py-4 items-center"
             >
               <Text className="text-white font-bold text-center">Cancel Login</Text>
             </TouchableOpacity>
          </View>
        </View>
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
          source={require('./assets/FireVision.png')} 
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
