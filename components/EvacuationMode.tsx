import React, { useEffect, useState, useRef, useMemo } from "react";
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
  const [imgLayout, setImgLayout] = useState<{w: number, h: number}>({w: 1, h: 1});
  const [imageAspectRatio, setImageAspectRatio] = useState<number | null>(null);
  
  const [evacStatus, setEvacStatus] = useState<"IN_BUILDING" | "PANIC" | "SAFE">("IN_BUILDING");
  const [sirenSound, setSirenSound] = useState<Audio.Sound | null>(null);
  
  const visitedNodeIdsRef = useRef<Set<number>>(new Set());
  const hasReachedExitRef = useRef<boolean>(false);

  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const pedoSubRef = useRef<any>(null);
  const lastSpokenRef = useRef<number>(0);
  
  const HEADING_TOLERANCE = 45;

  const activePlanUrl = autoBuilding?.masterPlanUrl || dashboardData?.scannedPlanUrl;

  useEffect(() => {
    if (activePlanUrl) {
      Image.getSize(activePlanUrl, (width, height) => {
        if (width && height) setImageAspectRatio(width / height);
      }, (error) => {
        console.warn("Failed to get image size", error);
      });
    }
  }, [activePlanUrl]);

  const interpolateLocation = (lat: number, lon: number) => {
    if (!autoBuilding?.polygon || autoBuilding.polygon.length < 4) return null;
    
    const poly = autoBuilding.polygon;
    const minLat = Math.min(...poly.map((p:any)=>p.lat));
    const maxLat = Math.max(...poly.map((p:any)=>p.lat));
    const minLon = Math.min(...poly.map((p:any)=>p.lon));
    const maxLon = Math.max(...poly.map((p:any)=>p.lon));
    
    let v = (maxLat - lat) / (maxLat - minLat || 1);
    let u = (lon - minLon) / (maxLon - minLon || 1);
    
    const calib = autoBuilding.imageCalibrationPoints;
    if (calib && calib.length >= 4) {
      const isLegacyPixels = calib[0].x > 2;
      const minCX = Math.min(...calib.map((c:any)=> isLegacyPixels ? c.x / Math.max(1, imgLayout.w) : c.x));
      const maxCX = Math.max(...calib.map((c:any)=> isLegacyPixels ? c.x / Math.max(1, imgLayout.w) : c.x));
      const minCY = Math.min(...calib.map((c:any)=> isLegacyPixels ? c.y / Math.max(1, imgLayout.h) : c.y));
      const maxCY = Math.max(...calib.map((c:any)=> isLegacyPixels ? c.y / Math.max(1, imgLayout.h) : c.y));
      
      u = minCX + u * (maxCX - minCX);
      v = minCY + v * (maxCY - minCY);
    }
    
    return { x: u, y: v };
  };

  const userImgPos = (drLocation && autoBuilding) ? interpolateLocation(drLocation.lat, drLocation.lon) : null;
  const mapExits = autoBuilding?.safeNodes?.filter((n: any) => n.isExit) || [];

  const isOutsideBuilding = useMemo(() => {
    if (!drLocation || !autoBuilding?.polygon || autoBuilding.polygon.length < 4) return false;
    const poly = autoBuilding.polygon;
      const minLat = Math.min(...poly.map((p:any)=>p.lat));
      const maxLat = Math.max(...poly.map((p:any)=>p.lat));
      const minLon = Math.min(...poly.map((p:any)=>p.lon));
      const maxLon = Math.max(...poly.map((p:any)=>p.lon));
      
      const latDiff = maxLat - minLat;
      const lonDiff = maxLon - minLon;
      
      // Add 5% tolerance based on the total dimensions of the building boundaries,
      // but enforce a minimum tolerance of ~11 meters (0.0001 degrees) for GPS jitter.
      const tolLat = Math.max(0.0001, latDiff * 0.05);
      const tolLon = Math.max(0.0001, lonDiff * 0.05);
      
      return (
        drLocation.lat < minLat - tolLat ||
        drLocation.lat > maxLat + tolLat ||
        drLocation.lon < minLon - tolLon ||
        drLocation.lon > maxLon + tolLon
      );
  }, [drLocation, autoBuilding]);

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

  // Sync drLocation for Web DevTools Sensor override
  useEffect(() => {
    if (Platform.OS === 'web' && currentLocation) {
      setDrLocation(prev => {
        if (!prev) return { lat: currentLocation.coords.latitude, lon: currentLocation.coords.longitude };
        if (prev.lat === currentLocation.coords.latitude && prev.lon === currentLocation.coords.longitude) return prev;
        return { lat: currentLocation.coords.latitude, lon: currentLocation.coords.longitude };
      });
    }
  }, [currentLocation]);

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
  
  const getImageBounds = () => {
    const layoutW = Math.max(1, imgLayout.w);
    const layoutH = Math.max(1, imgLayout.h);
    const aspect = imageAspectRatio || 1;
    const layoutAspect = layoutW / layoutH;
    let renderW, renderH, offsetX, offsetY;
    
    // ZOOM TO BUILDING BOUNDING BOX
    if (autoBuilding?.polygon && autoBuilding.polygon.length >= 4) {
      const poly = autoBuilding.polygon;
      const xs: number[] = [];
      const ys: number[] = [];
      for (const p of poly) {
        const pt = interpolateLocation(p.lat, p.lon);
        if (pt) {
          xs.push(pt.x);
          ys.push(pt.y);
        }
      }
      if (xs.length >= 3) {
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        
        const bw = Math.max(0.001, maxX - minX);
        const bh = Math.max(0.001, maxY - minY);
        const padding = 0.10; // 10% padding
        
        // Target bounded area we want to fit inside the layout
        const targetW = bw * (1 + padding * 2);
        const targetH = bh * (1 + padding * 2);
        
        // Scale so the target bounds perfectly fit within BOTH layout width and height
        renderW = Math.min(layoutW / targetW, (layoutH * aspect) / targetH);
        renderH = renderW / aspect;
        
        // Center the building exactly in the middle of the Map View container
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        offsetX = (layoutW / 2) - (centerX * renderW);
        offsetY = (layoutH / 2) - (centerY * renderH);
        
        return { renderW, renderH, offsetX, offsetY };
      }
    }
    
    // FALLBACK: Cover math
    if (layoutAspect > aspect) { // Container is wider. Cover fits width, crops height.
      renderW = layoutW;
      renderH = layoutW / aspect;
      offsetX = 0;
      offsetY = (layoutH - renderH) / 2;
    } else { // Container is taller. Cover fits height, crops width.
      renderH = layoutH;
      renderW = layoutH * aspect;
      offsetX = (layoutW - renderW) / 2;
      offsetY = 0;
    }
    return { renderW, renderH, offsetX, offsetY };
  };

  return (
    <View className={`flex-1 w-full ${evacStatus === 'PANIC' ? 'bg-red-900 animate-pulse' : 'bg-black'}`}>
      
      {/* Header (10%) */}
      <View style={{ height: '10%' }} className={`justify-center items-center border-b ${isDrill ? 'bg-amber-900 border-amber-800' : 'bg-neutral-900 border-neutral-800'}`}>
        <Text className={`text-2xl font-extrabold uppercase tracking-widest text-center ${isDrill ? 'text-amber-400' : 'text-red-500'}`}>
          {isDrill ? 'TEST DRILL' : 'EVACUATE'}
        </Text>
      </View>

      {/* Map View (25%) */}
      <View 
        style={{ height: '25%' }}
        className="w-full bg-neutral-950 relative border-b-2 border-neutral-800 overflow-hidden"
        onLayout={(e) => setImgLayout({w: Math.max(1, e.nativeEvent.layout.width), h: Math.max(1, e.nativeEvent.layout.height)})}
      >
        {isOutsideBuilding ? (
          <View className="flex-1 justify-center items-center px-8 bg-neutral-900">
            <Text className="text-green-500 text-4xl font-extrabold text-center mb-4">
              YOU ARE OUT AND SAFE
            </Text>
            <Text className="text-white text-lg text-center mb-8 font-bold">
              Please inform the marshal by clicking the button below.
            </Text>
            <TouchableOpacity 
              onPress={() => updateStatus({
                clerkId: user?.id || '',
                incidentId: activeIncident._id,
                setPanic: false,
                setSafe: true,
                lat: drLocation?.lat ?? 0,
                lon: drLocation?.lon ?? 0
              })}
              className="bg-green-600 px-10 py-5 rounded-full border-2 border-green-400 shadow-lg shadow-green-600/50 mb-8"
            >
              <Text className="text-white font-black text-2xl">I AM SAFE</Text>
            </TouchableOpacity>

            <View className="bg-black/50 p-4 rounded-xl w-full border border-neutral-800">
              <Text className="text-neutral-400 text-xs font-bold mb-1">DEBUG DIAGNOSTICS:</Text>
              <Text className="text-neutral-500 text-xs">Your Lat: {drLocation?.lat?.toFixed(6)}</Text>
              <Text className="text-neutral-500 text-xs">Your Lon: {drLocation?.lon?.toFixed(6)}</Text>
              {autoBuilding?.polygon && (
                <>
                  <Text className="text-neutral-500 text-xs mt-2">Building Lat: {Math.min(...autoBuilding.polygon.map((p:any)=>p.lat)).toFixed(5)} to {Math.max(...autoBuilding.polygon.map((p:any)=>p.lat)).toFixed(5)}</Text>
                  <Text className="text-neutral-500 text-xs">Building Lon: {Math.min(...autoBuilding.polygon.map((p:any)=>p.lon)).toFixed(5)} to {Math.max(...autoBuilding.polygon.map((p:any)=>p.lon)).toFixed(5)}</Text>
                </>
              )}
            </View>
          </View>
        ) : activePlanUrl ? (
          <>
            <Image 
              source={{ uri: activePlanUrl }} 
              style={{ 
                position: 'absolute',
                width: getImageBounds().renderW, 
                height: getImageBounds().renderH, 
                left: getImageBounds().offsetX, 
                top: getImageBounds().offsetY,
                opacity: 0.8 
              }} 
            />
            {/* Exit Nodes */}
            {(() => {
              const { renderW, renderH, offsetX, offsetY } = getImageBounds();
              return mapExits.map((exit: any, i: number) => {
                const pos = interpolateLocation(exit.lat, exit.lon);
                if (!pos) return null;
                return (
                  <View 
                    key={`exit-${i}`}
                    style={{
                      position: 'absolute',
                      left: offsetX + pos.x * renderW - 20,
                      top: offsetY + pos.y * renderH - 40,
                      width: 40,
                      height: 40,
                      alignItems: 'center'
                    }}
                    className="z-10"
                  >
                    <MaterialCommunityIcons name="map-marker" size={40} color="#22c55e" />
                  </View>
                );
              });
            })()}

            {/* User Location */}
            {userImgPos && (() => {
              const { renderW, renderH, offsetX, offsetY } = getImageBounds();
              const pos = userImgPos;
              return (
                <View 
                  style={{
                    position: 'absolute',
                    left: offsetX + pos.x * renderW - 20,
                    top: offsetY + pos.y * renderH - 40,
                    width: 40,
                    height: 40,
                    alignItems: 'center'
                  }}
                  className="z-20"
                >
                  <MaterialCommunityIcons name="map-marker" size={40} color="#3b82f6" />
                </View>
              );
            })()}
          </>
        ) : (
          <View className="flex-1 justify-center items-center">
            <Text className="text-neutral-500">No map available.</Text>
          </View>
        )}
      </View>

      {/* Bottom Interface (65%) */}
      {!isOutsideBuilding && (
        <>
          {/* Arrow (25%) */}
          <View style={{ height: '25%' }} className={`justify-center items-center ${bgColor}`}>
            <Animated.View style={{ transform: [{ rotate: arrowRotation }] }}>
              <MaterialCommunityIcons 
                name="arrow-up-thick" 
                size={Math.min(height * 0.25, width) * 1.0} 
                color={iconColor} 
                style={Platform.OS === 'web' ? { filter: 'drop-shadow(0px 8px 12px rgba(0,0,0,0.8))' } as any : { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.8, shadowRadius: 12 }}
              />
            </Animated.View>
          </View>

          {/* Status Message (20%) */}
          <View style={{ height: '20%' }} className={`justify-center items-center px-4 ${bgColor}`}>
            <Text className={`text-3xl font-black uppercase text-center ${statusTitleColor}`} style={Platform.OS === 'web' ? { textShadow: '1px 1px 4px rgba(0,0,0,0.8)' } as any : { textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: {width: 1, height: 1}, textShadowRadius: 4 }}>
              {statusTitle}
            </Text>
            <Text className={`text-center mt-1 text-xl font-bold ${statusSubColor}`} style={Platform.OS === 'web' ? { textShadow: '1px 1px 2px rgba(0,0,0,0.8)' } as any : { textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: {width: 1, height: 1}, textShadowRadius: 2 }}>
              {statusSub}
            </Text>
            <Text className="text-neutral-400 mt-2 font-bold">{steps} steps tracked</Text>
          </View>

          {/* Buttons (20%) */}
          <View style={{ height: '20%' }} className={`flex-row items-center justify-center px-4 pb-4 gap-4 ${bgColor}`}>
            <TouchableOpacity 
              className={`flex-1 h-full rounded-3xl border-2 shadow-lg justify-center items-center ${evacStatus === 'PANIC' ? 'bg-white border-red-500 shadow-red-600/50' : 'bg-red-600 border-red-500 shadow-red-600/50'}`}
              onPress={togglePanic}
            >
              <Text className={`font-black text-xl text-center ${evacStatus === 'PANIC' ? 'text-red-600' : 'text-white'}`}>{evacStatus === 'PANIC' ? 'CANCEL SOS' : 'SOS'}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              className="flex-1 h-full bg-green-600 rounded-3xl border-2 border-green-500 shadow-lg shadow-green-600/50 justify-center items-center"
              onPress={markAsSafe}
            >
              <Text className="font-black text-xl text-white text-center">I AM SAFE</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}
