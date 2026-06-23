/**
 * @file LocationConsentScreen.tsx
 * @description The onboarding screen presented to users immediately after signing up.
 * Educates the user on why background location and push notifications are critical
 * for the evacuation app to function, and handles the OS-level permission requests.
 * 
 * @module LocationConsentScreen
 */
import React, { useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { Text, TouchableOpacity } from "./ResponsiveUI";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { useAuth } from "@clerk/clerk-expo";

/**
 * LocationConsentScreen Component
 * 
 * @description Manages the UI and logic for requesting mandatory device permissions.
 * Persists the user's choices to the Convex backend so the app knows whether to render
 * the full dashboard or a warning banner in the future.
 * 
 * @returns {JSX.Element} The rendered React component.
 */
export default function LocationConsentScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { userId } = useAuth();
  
  // Explicitly import the API mutations
  const updatePermissions = useMutation(api.users.updatePermissions);
  const savePushToken = useMutation(api.users.savePushToken);

  const requestPermission = async () => {
    setLoading(true);
    setError("");
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status !== "granted") {
        // We no longer block if Location is denied. Just proceed.
      }

      let notificationsGranted = !Device.isDevice; // Default to true on emulators to prevent warning banners
      // Request Push Notification Permission (Phase 13) - MOBILE ONLY
      let pushToken = "";
      if (Platform.OS !== 'web' && Device.isDevice) {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
          const { status: newStatus } = await Notifications.requestPermissionsAsync({
            ios: {
              allowAlert: true,
              allowBadge: true,
              allowSound: true,
              allowCriticalAlerts: true, // Crucial for overriding silent mode!
            },
          });
          finalStatus = newStatus;
        }
        
        notificationsGranted = finalStatus === 'granted';

        if (finalStatus !== 'granted') {
          // We no longer block if Push is denied. Just proceed.
        }

        // Get Expo Push Token
        try {
          pushToken = (await Notifications.getExpoPushTokenAsync()).data;
        } catch (e) {
          // Silently ignore push token errors on dev clients without Firebase setup
        }
      }

      // If granted, inform our backend
      if (userId) {
        await updatePermissions({ 
          clerkId: userId, 
          locationGranted: status === 'granted',
          notificationsGranted: notificationsGranted
        });
        if (pushToken) {
          await savePushToken({ clerkId: userId, token: pushToken });
        }
      }
      
      // The parent App.tsx component will automatically re-render when the query updates!
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-neutral-900 items-center justify-center p-6">
      <View className="w-full max-w-sm bg-neutral-800 p-8 rounded-3xl shadow-xl border border-neutral-700 items-center">
        
        {/* Simple Icon placeholder */}
        <View className="w-20 h-20 bg-red-600/20 rounded-full items-center justify-center mb-6">
           <Text className="text-4xl">🚨</Text>
        </View>

        <Text className="text-2xl font-bold text-white mb-4 text-center">Critical Access Required</Text>
        <Text className="text-neutral-400 mb-8 text-center leading-relaxed">
          FireVision requires access to your Location and Push Notifications to provide real-time evacuation routing and Critical Alerts in the event of an emergency.
        </Text>

        {error ? <Text className="text-red-400 text-center mb-4">{error}</Text> : null}

        <TouchableOpacity 
          className="w-full bg-red-600 rounded-xl py-4 items-center mb-4"
          onPress={requestPermission}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold text-lg">Allow Permissions</Text>}
        </TouchableOpacity>

        <TouchableOpacity 
          className="w-full py-4 items-center"
          onPress={() => {
            if (userId) updatePermissions({ clerkId: userId, locationGranted: false, notificationsGranted: false });
          }}
          disabled={loading}
        >
          <Text className="text-neutral-400 font-bold text-sm">Skip for now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
