import React, { useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import * as Location from "expo-location";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { useAuth } from "@clerk/clerk-expo";

export default function LocationConsentScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { userId } = useAuth();
  
  // Explicitly import the API mutations
  const grantConsent = useMutation(api.consent.grantConsent);

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

      // If granted, inform our backend
      if (userId) {
        await grantConsent({ clerkId: userId });
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
        
        {/* Simple Location Icon placeholder */}
        <View className="w-20 h-20 bg-red-600/20 rounded-full items-center justify-center mb-6">
           <Text className="text-4xl">📍</Text>
        </View>

        <Text className="text-2xl font-bold text-white mb-4 text-center">Location Access</Text>
        <Text className="text-neutral-400 mb-8 text-center leading-relaxed">
          FireVision needs access to your location in order to provide real-time evacuation routing in the event of an emergency. 
        </Text>

        {error ? <Text className="text-red-400 text-center mb-4">{error}</Text> : null}

        <TouchableOpacity 
          className="w-full bg-red-600 rounded-xl py-4 items-center"
          onPress={requestPermission}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold text-lg">Allow Location</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}
