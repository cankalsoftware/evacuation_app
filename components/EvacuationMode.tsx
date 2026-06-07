import React, { useEffect, useState, useRef } from "react";
import { View, Text, TouchableOpacity, Image, useWindowDimensions, Animated, Platform } from "react-native";
import * as Location from "expo-location";
import * as Speech from "expo-speech";

export default function EvacuationMode({ dashboardData, onClose }: { dashboardData: any, onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const [heading, setHeading] = useState<number>(0);
  const [isSafeDirection, setIsSafeDirection] = useState(true);
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const lastSpokenRef = useRef<number>(0);
  
  // For prototype, we assume the exit is due North (0 degrees).
  // In future phases, this will come from Convex routing algorithm.
  const TARGET_HEADING = 0; 
  const HEADING_TOLERANCE = 60; // Degrees

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
        let diff = Math.abs(currentHeading - TARGET_HEADING);
        if (diff > 180) diff = 360 - diff;

        const isSafe = diff <= HEADING_TOLERANCE;
        setIsSafeDirection(isSafe);

        // Voice Warnings (throttle to once every 5 seconds)
        const now = Date.now();
        if (!isSafe && (now - lastSpokenRef.current > 5000)) {
          Speech.speak("You are facing the wrong direction. Turn around.");
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

  // Arrow rotation style
  const arrowRotation = `${-heading}deg`; // Rotate arrow opposite to heading to keep it pointing North
  
  return (
    <View className="flex-1 bg-black">
      {/* Header */}
      <View className="pt-16 pb-4 px-6 flex-row justify-between items-center bg-black/80 z-10 absolute top-0 left-0 right-0">
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

      {/* Map View */}
      <View className="flex-1 justify-center items-center">
        {dashboardData?.scannedPlanUrl ? (
          <Image 
            source={{ uri: dashboardData.scannedPlanUrl }} 
            style={{ width: '100%', height: '100%', resizeMode: 'contain', opacity: 0.6 }} 
          />
        ) : (
          <Text className="text-white">No map available.</Text>
        )}
      </View>

      {/* Compass Overlay */}
      <View className="absolute inset-0 justify-center items-center pointer-events-none">
        {/* Dynamic Arrow */}
        <Animated.View 
          style={{ transform: [{ rotate: arrowRotation }] }}
          className="items-center justify-center"
        >
          {/* Arrow pointing up */}
          <View className={`w-0 h-0 border-l-[30px] border-l-transparent border-r-[30px] border-r-transparent border-b-[80px] ${isSafeDirection ? 'border-b-green-500' : 'border-b-red-600'}`} />
          {/* Arrow base */}
          <View className={`w-[20px] h-[60px] ${isSafeDirection ? 'bg-green-500' : 'bg-red-600'}`} />
        </Animated.View>
      </View>

      {/* Status Footer */}
      <View className={`absolute bottom-0 left-0 right-0 p-8 pt-12 items-center ${isSafeDirection ? 'bg-gradient-to-t from-green-900/80 to-transparent' : 'bg-gradient-to-t from-red-900/80 to-transparent'}`}>
        <Text className={`text-3xl font-black uppercase ${isSafeDirection ? 'text-green-400' : 'text-red-500'}`}>
          {isSafeDirection ? "Safe Route" : "Wrong Way"}
        </Text>
        <Text className="text-neutral-300 text-center mt-2">
          {isSafeDirection ? "Keep moving in this direction towards the exit." : "Turn around to face the green safe route."}
        </Text>
        {Platform.OS === 'web' && (
          <Text className="text-neutral-500 text-xs mt-4">(Compass disabled on web simulator)</Text>
        )}
      </View>
    </View>
  );
}
