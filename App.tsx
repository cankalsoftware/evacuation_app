import './global.css';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import React, { useEffect, useState } from 'react';
import { ClerkProvider, useAuth, useUser } from "@clerk/clerk-expo";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient, useQuery, useMutation } from "convex/react";
import * as SecureStore from "expo-secure-store";
import { api } from "./convex/_generated/api";

import AuthScreen from "./components/AuthScreen";
import LocationConsentScreen from "./components/LocationConsentScreen";
import MainScreen from "./components/MainScreen";

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

function RootNavigator() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { user } = useUser();
  const syncUser = useMutation(api.users.syncUser);
  const [hasSynced, setHasSynced] = useState(false);

  useEffect(() => {
    if (isSignedIn && userId && user?.primaryEmailAddress?.emailAddress && !hasSynced) {
      const role = typeof user.publicMetadata?.role === 'string' ? user.publicMetadata.role : undefined;
      
      syncUser({ 
        clerkId: userId,
        email: user.primaryEmailAddress.emailAddress,
        role: role
      }).then(() => setHasSynced(true));
    }
  }, [isSignedIn, userId, user?.primaryEmailAddress?.emailAddress, user?.publicMetadata?.role, hasSynced, syncUser]);

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
  return (
    <ClerkProvider 
      publishableKey={process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!}
      tokenCache={tokenCache}
    >
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <RootNavigator />
        <StatusBar style="light" />
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
