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

export default function LocationConsentScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { userId } = useAuth();
  
  // Explicitly import the API mutations
  const grantConsent = useMutation(api.consent.grantConsent);
  const savePushToken = useMutation(api.users.savePushToken);

  const requestPermission = async () => {
    setLoading(true);
    setError("");
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status !== "granted") {
        setError("Location permission is absolutely required for evacuation routing.");
        setLoading(false);
        return;
      }

      // Request Push Notification Permission (Phase 13)
      let pushToken = "";
      if (Device.isDevice) {
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
        if (finalStatus !== 'granted') {
          if (Platform.OS === 'web') {
            console.warn("Push notification permission denied (expected in some Web/Incognito environments). Continuing without push.");
          } else {
            setError("Push notification permission is required to warn you of an emergency drill or fire.");
            setLoading(false);
            return;
          }
        }

        // Get Expo Push Token
        try {
          // projectId usually from app.json, but expo-notifications auto-infers it in dev
          pushToken = (await Notifications.getExpoPushTokenAsync()).data;
        } catch (e) {
          console.log("Failed to get push token:", e);
        }
      }

      // If granted, inform our backend
      if (userId) {
        await grantConsent({ clerkId: userId });
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
          className="w-full bg-red-600 rounded-xl py-4 items-center"
          onPress={requestPermission}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold text-lg">Allow Permissions</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}
