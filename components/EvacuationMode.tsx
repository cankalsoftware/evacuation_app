import React, { useEffect, useState, useRef } from "react";
import { View, Text, TouchableOpacity, Image, useWindowDimensions, Animated, Platform } from "react-native";
import * as Location from "expo-location";
import * as Speech from "expo-speech";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export default function EvacuationMode({ dashboardData, onClose }: { dashboardData: any, onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const [heading, setHeading] = useState<number>(0);
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const lastSpokenRef = useRef<number>(0);
  
  // For prototype, we assume the exit is due North (0 degrees).
  // In future phases, this will come from Convex routing algorithm.
  const TARGET_HEADING = 0; 
  const HEADING_TOLERANCE = 45; // Tightened degrees for Left/Right detection

  useEffect(() => {
    let isMounted = true;

    const startCompass = async () => {
      // Don't run compass on web
      if (Platform.OS === 'web') return;

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      subscriptionRef.current = await Location.watchHeadingAsync((data) => {
        if (!isMounted) return;
        
        const currentHeading = data.magHeading;
        setHeading(currentHeading);

        // Calculate shortest difference between angles
        let diff = currentHeading - TARGET_HEADING;
        while (diff > 180) diff -= 360;
        while (diff < -180) diff += 360;

        const isSafe = Math.abs(diff) <= HEADING_TOLERANCE;

        // Voice Warnings (throttle to once every 5 seconds)
        const now = Date.now();
        if (!isSafe && (now - lastSpokenRef.current > 5000)) {
          if (diff > 45 && diff <= 135) Speech.speak("Turn Left.");
          else if (diff < -45 && diff >= -135) Speech.speak("Turn Right.");
          else Speech.speak("You are facing the wrong direction. Turn around.");
          
          lastSpokenRef.current = now;
        }
      });
    };

    startCompass();

    Speech.speak("Evacuation initiated. Follow the green arrow on your screen.");

    return () => {
      isMounted = false;
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
      }
      Speech.stop();
    };
  }, []);

  // Direction Logic
  let normalizedDiff = heading - TARGET_HEADING;
  while (normalizedDiff > 180) normalizedDiff -= 360;
  while (normalizedDiff < -180) normalizedDiff += 360;

  const absDiff = Math.abs(normalizedDiff);
  const isSafeDirection = absDiff <= HEADING_TOLERANCE;

  let statusTitle = "Safe Route";
  let statusSub = "Keep moving in this direction towards the exit.";
  let statusTitleColor = "text-green-400";
  let statusSubColor = "text-green-300";
  let bgColor = "bg-green-900/10";
  let iconColor = "#22c55e"; // green-500

  if (!isSafeDirection) {
    if (normalizedDiff > 45 && normalizedDiff <= 135) {
      statusTitle = "Turn Left";
      statusSub = "The safe route is to your left.";
      statusTitleColor = "text-amber-500";
      statusSubColor = "text-amber-300";
      bgColor = "bg-amber-900/10";
      iconColor = "#f59e0b"; // amber-500
    } else if (normalizedDiff < -45 && normalizedDiff >= -135) {
      statusTitle = "Turn Right";
      statusSub = "The safe route is to your right.";
      statusTitleColor = "text-amber-500";
      statusSubColor = "text-amber-300";
      bgColor = "bg-amber-900/10";
      iconColor = "#f59e0b"; // amber-500
    } else {
      statusTitle = "Wrong Way";
      statusSub = "Turn around to face the green safe route.";
      statusTitleColor = "text-red-500";
      statusSubColor = "text-red-300";
      bgColor = "bg-red-900/10";
      iconColor = "#dc2626"; // red-600
    }
  }

  // Arrow rotation style
  const arrowRotation = `${-heading}deg`; // Rotate arrow opposite to heading to keep it pointing North
  
  return (
    <View className="flex-1 bg-black">
      {/* Header */}
      <View className="pt-16 pb-4 px-6 flex-row justify-between items-center bg-neutral-900 border-b border-neutral-800">
        <View>
          <Text className="text-3xl font-extrabold text-red-500 uppercase tracking-widest">Evacuate</Text>
          <Text className="text-white">Room: {dashboardData?.roomNumber || "Unknown"}</Text>
        </View>
        <TouchableOpacity 
          onPress={onClose}
          className="bg-neutral-800 px-4 py-2 rounded-full border border-neutral-700"
        >
          <Text className="text-white font-bold">End</Text>
        </TouchableOpacity>
      </View>

      {/* Top Half: Map View */}
      <View className="flex-1 w-full bg-neutral-950 relative border-b-2 border-neutral-800">
        {dashboardData?.scannedPlanUrl ? (
          <Image 
            source={{ uri: dashboardData.scannedPlanUrl }} 
            style={{ width: '100%', height: '100%', opacity: 0.8 }} 
            resizeMode="contain"
          />
        ) : (
          <View className="flex-1 justify-center items-center">
            <Text className="text-neutral-500">No map available.</Text>
          </View>
        )}
      </View>

      {/* Bottom Half: Arrow and Status */}
      <View className={`flex-1 items-center justify-between py-8 px-6 ${bgColor}`}>
        
        {/* Dynamic Arrow */}
        <View className="flex-1 justify-center items-center">
          <Animated.View 
            style={{ transform: [{ rotate: arrowRotation }] }}
          >
            <MaterialCommunityIcons 
              name="arrow-up-thick" 
              size={240} 
              color={iconColor} 
              style={Platform.OS === 'web' ? { filter: 'drop-shadow(0px 8px 12px rgba(0,0,0,0.8))' } as any : { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.8, shadowRadius: 12 }}
            />
          </Animated.View>
        </View>

        {/* Status Footer */}
        <View className="items-center w-full mt-4">
          <Text className={`text-4xl font-black uppercase ${statusTitleColor}`} style={Platform.OS === 'web' ? { textShadow: '1px 1px 4px rgba(0,0,0,0.8)' } as any : { textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: {width: 1, height: 1}, textShadowRadius: 4 }}>
            {statusTitle}
          </Text>
          <Text className={`text-center mt-2 text-2xl font-bold ${statusSubColor}`} style={Platform.OS === 'web' ? { textShadow: '1px 1px 2px rgba(0,0,0,0.8)' } as any : { textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: {width: 1, height: 1}, textShadowRadius: 2 }}>
            {statusSub}
          </Text>
          {Platform.OS === 'web' && (
            <View className="bg-neutral-800/80 px-4 py-2 rounded-full border border-neutral-700 mt-6">
              <Text className="text-neutral-400 font-bold text-sm">Compass disabled on web simulator</Text>
            </View>
          )}
        </View>

      </View>
    </View>
  );
}
