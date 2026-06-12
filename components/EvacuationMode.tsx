import React, { useEffect, useState, useRef } from "react";
import { View, Text, TouchableOpacity, Image, useWindowDimensions, Animated, Platform } from "react-native";
import * as Location from "expo-location";
import * as Speech from "expo-speech";
import { Pedometer } from 'expo-sensors';
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useUser } from "@clerk/clerk-expo";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Audio } from 'expo-av';

// Basic Haversine distance
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // meters
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; 
}

// Bearing calculation
function getBearing(lat1: number, lon1: number, lat2: number, lon2: number) {
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const λ1 = lon1 * Math.PI/180;
  const λ2 = lon2 * Math.PI/180;
  const y = Math.sin(λ2-λ1) * Math.cos(φ2);
  const x = Math.cos(φ1)*Math.sin(φ2) - Math.sin(φ1)*Math.cos(φ2)*Math.cos(λ2-λ1);
  const θ = Math.atan2(y, x);
  return (θ*180/Math.PI + 360) % 360; // in degrees
}

// Dead Reckoning Step update
function updateLocationWithStep(lat: number, lon: number, heading: number, stepDistance = 0.762) {
  const R = 6378137;
  const dLat = stepDistance * Math.cos(heading * Math.PI / 180) / R;
  const dLon = stepDistance * Math.sin(heading * Math.PI / 180) / (R * Math.cos(lat * Math.PI / 180));
  return {
    lat: lat + dLat * 180 / Math.PI,
    lon: lon + dLon * 180 / Math.PI
  };
}

export default function EvacuationMode({ dashboardData, autoBuilding, currentLocation, activeIncident, onClose }: any) {
  const { width, height } = useWindowDimensions();
  const { user } = useUser();
  const updateStatus = useMutation(api.portal.updateEvacuationStatus);
  const [heading, setHeading] = useState<number>(0);
  const [targetHeading, setTargetHeading] = useState<number>(0);
  const [steps, setSteps] = useState(0);
  const [drLocation, setDrLocation] = useState<{lat: number, lon: number} | null>(currentLocation ? { lat: currentLocation.coords.latitude, lon: currentLocation.coords.longitude } : null);
  
  const [evacStatus, setEvacStatus] = useState<"IN_BUILDING" | "PANIC" | "SAFE">("IN_BUILDING");
  const [sirenSound, setSirenSound] = useState<Audio.Sound | null>(null);
  
  const visitedNodeIdsRef = useRef<Set<number>>(new Set());
  const hasReachedExitRef = useRef<boolean>(false);

  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const pedoSubRef = useRef<any>(null);
  const lastSpokenRef = useRef<number>(0);
  
  const HEADING_TOLERANCE = 45;

  const activePlanUrl = autoBuilding?.masterPlanUrl || dashboardData?.scannedPlanUrl;

  // Dynamic Routing Evaluator
  const evaluateRouting = (currentLoc: {lat: number, lon: number}) => {
    if (!autoBuilding?.safeNodes || autoBuilding.safeNodes.length === 0) return null;

    const exits = autoBuilding.safeNodes.map((n: any, i: number) => ({...n, _id: i})).filter((n: any) => n.isExit);
    const turns = autoBuilding.safeNodes.map((n: any, i: number) => ({...n, _id: i})).filter((n: any) => !n.isExit);

    if (exits.length === 0) return null;

    // 1. Find Nearest Exit
    let nearestExit = exits[0];
    let minExitDist = Infinity;
    for (const e of exits) {
      const d = getDistance(currentLoc.lat, currentLoc.lon, e.lat, e.lon);
      if (d < minExitDist) {
        minExitDist = d;
        nearestExit = e;
      }
    }

    // 2. Find Nearest Unvisited Turn Point
    const unvisitedTurns = turns.filter((t: any) => !visitedNodeIdsRef.current.has(t._id));
    let nearestTurn: any = null;
    let minTurnDist = Infinity;
    for (const t of unvisitedTurns) {
      const d = getDistance(currentLoc.lat, currentLoc.lon, t.lat, t.lon);
      if (d < minTurnDist) {
        minTurnDist = d;
        nearestTurn = t;
      }
    }

    // 3. Route to nearest valid node (favors turn point if it's closer than the exit)
    let bestNode = nearestExit;
    if (nearestTurn && minTurnDist <= minExitDist) {
      bestNode = nearestTurn;
    }

    return bestNode;
  };

  useEffect(() => {
    let isMounted = true;

    // Initialize immediate target heading based on current location
    if (drLocation) {
      const initTarget = evaluateRouting(drLocation);
      if (initTarget) {
        setTargetHeading(getBearing(drLocation.lat, drLocation.lon, initTarget.lat, initTarget.lon));
      }
    }

    const startCompassAndPedometer = async () => {
      if (Platform.OS === 'web') return;

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      subscriptionRef.current = await Location.watchHeadingAsync((data) => {
        if (!isMounted) return;
        const currentHeading = data.magHeading;
        setHeading(currentHeading);
      });

      const pedoAvailable = await Pedometer.isAvailableAsync();
      if (pedoAvailable) {
         pedoSubRef.current = Pedometer.watchStepCount(result => {
           if (!isMounted) return;
           setSteps(result.steps);
           
           // Apply Dead Reckoning & Dynamic Routing
           setDrLocation(prev => {
             if (!prev) return prev;
             const nextLoc = updateLocationWithStep(prev.lat, prev.lon, heading);
             
             const target = evaluateRouting(nextLoc);
             if (target && !hasReachedExitRef.current) {
               const distToTarget = getDistance(nextLoc.lat, nextLoc.lon, target.lat, target.lon);
               
               if (distToTarget < 3) { // within 3 meters threshold
                 if (target.isExit) {
                   hasReachedExitRef.current = true;
                   Speech.speak("You have reached the exit!");
                 } else {
                   // Mark the turn point as visited so we don't route back to it
                   visitedNodeIdsRef.current.add(target._id);
                   Speech.speak("Safe point reached. Continue following the arrow.");
                 }
               }
               
               // Update target bearing dynamically
               setTargetHeading(getBearing(nextLoc.lat, nextLoc.lon, target.lat, target.lon));
             }

             return nextLoc;
           });
         });
      }
    };

    startCompassAndPedometer();
    
    if (activeIncident?.isDrill) {
      Speech.speak("This is a test drill. Please follow the evacuation route calmly.");
    } else {
      Speech.speak("Evacuation initiated. Follow the green arrow on your screen.");
    }

    return () => {
      isMounted = false;
      if (subscriptionRef.current) subscriptionRef.current.remove();
      if (pedoSubRef.current) pedoSubRef.current.remove();
      Speech.stop();
    };
  }, []);

  // Auto-Ping Location and Status
  useEffect(() => {
    if (!user?.id || !activeIncident?._id) return;
    
    const pingStatus = async () => {
      try {
        await updateStatus({
          clerkId: user.id,
          incidentId: activeIncident._id,
          setPanic: evacStatus === "PANIC",
          setSafe: evacStatus === "SAFE",
          lat: drLocation?.lat ?? currentLocation?.coords.latitude ?? 0,
          lon: drLocation?.lon ?? currentLocation?.coords.longitude ?? 0
        });
      } catch (e) {
        console.log("Failed to ping status", e);
      }
    };

    pingStatus(); // initial ping
    const interval = setInterval(pingStatus, 5000); // ping every 5 seconds
    
    return () => clearInterval(interval);
  }, [user?.id, activeIncident?._id, evacStatus, drLocation]);

  // Audio Cleanup
  useEffect(() => {
    return () => {
      if (sirenSound) {
        sirenSound.unloadAsync();
      }
    };
  }, [sirenSound]);

  const togglePanic = async () => {
    if (evacStatus === "PANIC") {
      setEvacStatus("IN_BUILDING");
      if (sirenSound) {
        await sirenSound.stopAsync();
      }
    } else {
      setEvacStatus("PANIC");
      try {
        // Play siren loop
        const { sound } = await Audio.Sound.createAsync(
          require('../assets/siren.wav'),
          { isLooping: true, volume: 1.0 }
        );
        setSirenSound(sound);
        await sound.playAsync();
      } catch (e) {
        console.log("Could not play siren", e);
      }
      
      // Update immediately
      if (user?.id && activeIncident?._id) {
        await updateStatus({
          clerkId: user.id,
          incidentId: activeIncident._id,
          setPanic: true,
          setSafe: false,
          lat: drLocation?.lat ?? currentLocation?.coords.latitude ?? 0,
          lon: drLocation?.lon ?? currentLocation?.coords.longitude ?? 0
        });
      }
    }
  };

  const markAsSafe = async () => {
    setEvacStatus("SAFE");
    if (sirenSound) {
      await sirenSound.stopAsync();
    }
    if (user?.id && activeIncident?._id) {
      await updateStatus({
        clerkId: user.id,
        incidentId: activeIncident._id,
        setPanic: false,
        setSafe: true,
        lat: drLocation?.lat ?? currentLocation?.coords.latitude ?? 0,
        lon: drLocation?.lon ?? currentLocation?.coords.longitude ?? 0
      });
    }
  };

  // Voice Guidance Loop based on Target Heading
  useEffect(() => {
    let diff = heading - targetHeading;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;

    const isSafe = Math.abs(diff) <= HEADING_TOLERANCE;
    const now = Date.now();
    
    if (!isSafe && (now - lastSpokenRef.current > 5000)) {
      if (diff > 45 && diff <= 135) Speech.speak("Turn Left.");
      else if (diff < -45 && diff >= -135) Speech.speak("Turn Right.");
      else Speech.speak("You are facing the wrong direction. Turn around.");
      lastSpokenRef.current = now;
    }
  }, [heading, targetHeading]);


  let normalizedDiff = heading - targetHeading;
  while (normalizedDiff > 180) normalizedDiff -= 360;
  while (normalizedDiff < -180) normalizedDiff += 360;

  const absDiff = Math.abs(normalizedDiff);
  const isSafeDirection = absDiff <= HEADING_TOLERANCE;

  let statusTitle = "Safe Route";
  let statusSub = "Keep moving in this direction to proceed along the safe route.";
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

  const arrowAngle = targetHeading - heading;
  const arrowRotation = `${arrowAngle}deg`; 
  
  const isDrill = activeIncident?.isDrill;
  
  if (evacStatus === "SAFE") {
    return (
      <View className="flex-1 bg-green-900 justify-center items-center px-6">
        <Text className="text-8xl mb-4">✅</Text>
        <Text className="text-4xl font-black text-white mb-2 text-center">YOU ARE SAFE</Text>
        <Text className="text-green-300 text-center mb-8 text-lg">Your status has been updated. Please wait for further instructions from the authorities.</Text>
        <TouchableOpacity 
          onPress={onClose}
          className="bg-neutral-800 px-8 py-4 rounded-full border border-neutral-700"
        >
          <Text className="text-white font-bold text-xl">Close</Text>
        </TouchableOpacity>
      </View>
    );
  }
  
  return (
    <View className={`flex-1 ${evacStatus === 'PANIC' ? 'bg-red-900 animate-pulse' : 'bg-black'}`}>
      {/* Header */}
      <View className={`pt-16 pb-4 px-6 flex-row justify-between items-center border-b ${isDrill ? 'bg-amber-900 border-amber-800' : 'bg-neutral-900 border-neutral-800'}`}>
        <View>
          <Text className={`text-3xl font-extrabold uppercase tracking-widest ${isDrill ? 'text-amber-400' : 'text-red-500'}`}>
            {isDrill ? 'TEST DRILL' : 'EVACUATE'}
          </Text>
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
        {activePlanUrl ? (
          <Image 
            source={{ uri: activePlanUrl }} 
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
          <Animated.View style={{ transform: [{ rotate: arrowRotation }] }}>
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
          <Text className="text-neutral-400 mt-2 font-bold">{steps} steps tracked</Text>
          {Platform.OS === 'web' && (
            <View className="bg-neutral-800/80 px-4 py-2 rounded-full border border-neutral-700 mt-4">
              <Text className="text-neutral-400 font-bold text-sm">Sensors disabled on web simulator</Text>
            </View>
          )}
        </View>
        
        {/* Buttons Overlay */}
        <View className="absolute bottom-10 left-6 right-6 flex-row justify-between">
          <TouchableOpacity 
            className={`w-20 h-20 rounded-full items-center justify-center border-4 shadow-lg ${evacStatus === 'PANIC' ? 'bg-white border-red-500' : 'bg-red-600 border-red-800'}`}
            onPress={togglePanic}
          >
            <Text className={`font-black text-xs ${evacStatus === 'PANIC' ? 'text-red-600' : 'text-white'}`}>{evacStatus === 'PANIC' ? 'CANCEL' : 'SOS'}</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            className="w-20 h-20 rounded-full items-center justify-center bg-green-600 border-4 border-green-800 shadow-lg"
            onPress={markAsSafe}
          >
            <Text className="font-black text-xs text-white text-center">I AM SAFE</Text>
          </TouchableOpacity>
        </View>

      </View>
    </View>
  );
}
