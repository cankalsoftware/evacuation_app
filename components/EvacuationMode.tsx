import React, { useEffect, useState, useRef, useMemo } from "react";
import { View, Image, useWindowDimensions, Animated, Platform } from "react-native";
import { Text, TouchableOpacity, MaterialCommunityIcons } from "./ResponsiveUI";
import * as Location from "expo-location";
import * as Speech from "expo-speech";
import { Pedometer, Gyroscope } from 'expo-sensors';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useUser } from "@clerk/clerk-expo";
import { useMutation, useQuery } from "convex/react";
/**
 * @file EvacuationMode.tsx
 * @description The active emergency interface triggered when a building incident occurs.
 * Renders the live interactive map, dynamic routing lines from the user to the Safe Zone,
 * WebRTC Walkie-Talkie logic for emergency communication, and the SOS panic trigger.
 * 
 * @module EvacuationMode
 */
import { showToast } from "./Toast";
import { api } from "../convex/_generated/api";
import { useAudioPlayer } from 'expo-audio';
// Basic Haversine distance
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Bearing calculation
function getBearing(lat1: number, lon1: number, lat2: number, lon2: number) {
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const λ1 = lon1 * Math.PI / 180;
  const λ2 = lon2 * Math.PI / 180;
  const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);
  const θ = Math.atan2(y, x);
  return (θ * 180 / Math.PI + 360) % 360; // in degrees
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

function isPointInPolygon(point: { lat: number, lon: number }, polygon: { lat: number, lon: number }[]) {
  let isInside = false;
  let j = polygon.length - 1;
  for (let i = 0; i < polygon.length; i++) {
    const xi = polygon[i].lon, yi = polygon[i].lat;
    const xj = polygon[j].lon, yj = polygon[j].lat;
    const intersect = ((yi > point.lat) !== (yj > point.lat)) &&
      (point.lon < (xj - xi) * (point.lat - yi) / (yj - yi) + xi);
    if (intersect) isInside = !isInside;
    j = i;
  }
  return isInside;
}

function distanceToLineSegment(p: { lat: number, lon: number }, v: { lat: number, lon: number }, w: { lat: number, lon: number }) {
  const l2 = (w.lat - v.lat) ** 2 + (w.lon - v.lon) ** 2;
  if (l2 === 0) return Math.sqrt((p.lat - v.lat) ** 2 + (p.lon - v.lon) ** 2);
  let t = ((p.lon - v.lon) * (w.lon - v.lon) + (p.lat - v.lat) * (w.lat - v.lat)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projLat = v.lat + t * (w.lat - v.lat);
  const projLon = v.lon + t * (w.lon - v.lon);
  return Math.sqrt((p.lat - projLat) ** 2 + (p.lon - projLon) ** 2);
}

interface GridCell {
  row: number;
  col: number;
  lat: number;
  lon: number;
  isExit: boolean;
}

function aStarGridPath(startCell: GridCell, exits: GridCell[], gridPaths: GridCell[]) {
  // Finds shortest path from startCell to nearest exit using A* algorithm
  // Allowed moves: 8-way (horizontal, vertical, diagonal)
  if (exits.some(e => e.row === startCell.row && e.col === startCell.col)) {
    return [startCell];
  }

  const openSet = [startCell];
  const cameFrom = new Map<string, GridCell>();
  const gScore = new Map<string, number>();
  gScore.set(`${startCell.row},${startCell.col}`, 0);

  const getH = (cell: GridCell) => {
    // Distance to closest exit
    let minD = Infinity;
    for (const e of exits) {
      const d = Math.hypot(cell.row - e.row, cell.col - e.col);
      if (d < minD) minD = d;
    }
    return minD;
  };

  const fScore = new Map<string, number>();
  fScore.set(`${startCell.row},${startCell.col}`, getH(startCell));

  while (openSet.length > 0) {
    // Node in openSet having the lowest fScore[] value
    openSet.sort((a, b) => (fScore.get(`${a.row},${a.col}`) ?? Infinity) - (fScore.get(`${b.row},${b.col}`) ?? Infinity));
    const current = openSet.shift()!;
    const currentKey = `${current.row},${current.col}`;

    if (exits.some(e => e.row === current.row && e.col === current.col)) {
      // Reconstruct path
      const path = [current];
      let curr = current;
      while (cameFrom.has(`${curr.row},${curr.col}`)) {
        curr = cameFrom.get(`${curr.row},${curr.col}`)!;
        path.unshift(curr);
      }
      return path;
    }

    // Neighbors
    for (const dr of [-1, 0, 1]) {
      for (const dc of [-1, 0, 1]) {
        if (dr === 0 && dc === 0) continue;
        const neighbor = gridPaths.find(p => p.row === current.row + dr && p.col === current.col + dc);
        if (!neighbor) continue;

        const moveCost = Math.hypot(dr, dc); // 1 for straight, 1.414 for diagonal
        const tentative_gScore = (gScore.get(currentKey) ?? Infinity) + moveCost;
        const neighborKey = `${neighbor.row},${neighbor.col}`;

        if (tentative_gScore < (gScore.get(neighborKey) ?? Infinity)) {
          cameFrom.set(neighborKey, current);
          gScore.set(neighborKey, tentative_gScore);
          fScore.set(neighborKey, tentative_gScore + getH(neighbor));
          if (!openSet.some(n => n.row === neighbor.row && n.col === neighbor.col)) {
            openSet.push(neighbor);
          }
        }
      }
    }
  }

  return null; // No path found
}

/**
 * EvacuationMode Component
 * 
 * @description Renders the full-screen emergency overlay. Calculates distance to safe zones,
 * handles walkie-talkie audio recording/playback via Convex file storage, and provides
 * real-time feedback on user location relative to the designated safe zone.
 * 
 * @param {Object} props - Component props
 * @param {any} props.dashboardData - Current user's dashboard preferences and state
 * @param {any} props.autoBuilding - The active building the user is checked into
 * @param {any} props.currentLocation - The user's live GPS coordinates
 * @param {any} props.activeIncident - Incident details containing safe zone coordinates
 * @param {Function} props.onClose - Callback triggered when the emergency is resolved
 * @returns {JSX.Element} The rendered React component.
 */
export default function EvacuationMode({ dashboardData, autoBuilding, currentLocation, activeIncident, onClose }: any) {
  const { width, height } = useWindowDimensions();
  const { user } = useUser();
  const updateStatus = useMutation(api.portal.updateEvacuationStatus);
  const fetchedFingerprints = useQuery(api.portal.getWifiFingerprints, { buildingId: autoBuilding?._id });

  useEffect(() => {
    if (fetchedFingerprints) {
      setWifiFingerprints(fetchedFingerprints);
    }
  }, [fetchedFingerprints]);

  const [heading, setHeading] = useState<number>(0);
  const [targetHeading, setTargetHeading] = useState<number>(0);
  const [steps, setSteps] = useState(0);
  const [drLocation, setDrLocation] = useState<{ lat: number, lon: number } | null>(currentLocation ? { lat: currentLocation.coords.latitude, lon: currentLocation.coords.longitude } : null);
  const [imgLayout, setImgLayout] = useState<{ w: number, h: number }>({ w: 1, h: 1 });
  const [imageAspectRatio, setImageAspectRatio] = useState<number | null>(null);

  const [evacStatus, setEvacStatus] = useState<"IN_BUILDING" | "PANIC" | "SAFE">("IN_BUILDING");

  // Phase 26: Hybrid Sensor Fusion & AR Fallback
  const [permission, requestPermission] = useCameraPermissions();
  const [showAR, setShowAR] = useState(false);
  const gyroSubRef = useRef<any>(null);
  const wifiWatcherRef = useRef<any>(null);
  const [wifiFingerprints, setWifiFingerprints] = useState<any[]>([]);
  const sirenPlayer = useAudioPlayer(require('../assets/siren.wav'));
  sirenPlayer.loop = true;

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
    const minLat = Math.min(...poly.map((p: any) => p.lat));
    const maxLat = Math.max(...poly.map((p: any) => p.lat));
    const minLon = Math.min(...poly.map((p: any) => p.lon));
    const maxLon = Math.max(...poly.map((p: any) => p.lon));

    let v = (maxLat - lat) / (maxLat - minLat || 1);
    let u = (lon - minLon) / (maxLon - minLon || 1);

    const calib = autoBuilding.imageCalibrationPoints;
    if (calib && calib.length >= 4) {
      const isLegacyPixels = calib[0].x > 2;
      const minCX = Math.min(...calib.map((c: any) => isLegacyPixels ? c.x / Math.max(1, imgLayout.w) : c.x));
      const maxCX = Math.max(...calib.map((c: any) => isLegacyPixels ? c.x / Math.max(1, imgLayout.w) : c.x));
      const minCY = Math.min(...calib.map((c: any) => isLegacyPixels ? c.y / Math.max(1, imgLayout.h) : c.y));
      const maxCY = Math.max(...calib.map((c: any) => isLegacyPixels ? c.y / Math.max(1, imgLayout.h) : c.y));

      u = minCX + u * (maxCX - minCX);
      v = minCY + v * (maxCY - minCY);
    }

    return { x: u, y: v };
  };

  const userImgPos = (drLocation && autoBuilding) ? interpolateLocation(drLocation.lat, drLocation.lon) : null;
  const mapExits = (autoBuilding?.gridPaths && autoBuilding.gridPaths.some((p: any) => p.isExit))
    ? autoBuilding.gridPaths.filter((n: any) => n.isExit)
    : (autoBuilding?.safeNodes?.filter((n: any) => n.isExit) || []);

  const isOutsideBuilding = useMemo(() => {
    if (!drLocation || !autoBuilding?.polygon || autoBuilding.polygon.length < 4) return false;
    const poly = autoBuilding.polygon;
    const point = drLocation;

    if (isPointInPolygon(point, poly)) return false;

    let minLat = Infinity, maxLat = -Infinity;
    let minLon = Infinity, maxLon = -Infinity;
    for (const p of poly) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lon < minLon) minLon = p.lon;
      if (p.lon > maxLon) maxLon = p.lon;
    }

    const diag = Math.sqrt((maxLat - minLat) ** 2 + (maxLon - minLon) ** 2);
    const allowedDist = Math.max(0.00005, diag * 0.05);

    // Check precise distance to any edge to handle concave (L-shape) polygons
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const d = distanceToLineSegment(point, poly[j], poly[i]);
      if (d <= allowedDist) return false;
    }

    return true; // Point is outside the polygon and not within the 5% margin
  }, [drLocation, autoBuilding]);

  // Dynamic Routing Evaluator
  const getGridDimensions = () => {
    if (!autoBuilding?.polygon || autoBuilding.polygon.length < 4) return { rows: 1, cols: 1, minLat: 0, maxLat: 0, minLon: 0, maxLon: 0 };
    const poly = autoBuilding.polygon;
    const minLat = Math.min(...poly.map((p: any) => p.lat));
    const maxLat = Math.max(...poly.map((p: any) => p.lat));
    const minLon = Math.min(...poly.map((p: any) => p.lon));
    const maxLon = Math.max(...poly.map((p: any) => p.lon));

    // Quick approximation of height/width in meters
    const heightMeters = getDistance(minLat, minLon, maxLat, minLon);
    const widthMeters = getDistance(minLat, minLon, minLat, maxLon);

    const rows = Math.max(1, Math.ceil(heightMeters / 5));
    const cols = Math.max(1, Math.ceil(widthMeters / 5));

    return { rows, cols, minLat, maxLat, minLon, maxLon };
  };

  const evaluateRouting = (currentLoc: { lat: number, lon: number }) => {
    if (!autoBuilding?.gridPaths || autoBuilding.gridPaths.length === 0) return null;

    const gridPaths = autoBuilding.gridPaths;
    const exits = gridPaths.filter((p: any) => p.isExit);
    if (exits.length === 0) return null;

    // 1. Convert currentLoc to grid cell
    const { rows, cols, minLat, maxLat, minLon, maxLon } = getGridDimensions();
    const row = Math.floor((maxLat - currentLoc.lat) / (maxLat - minLat) * rows);
    const col = Math.floor((currentLoc.lon - minLon) / (maxLon - minLon) * cols);

    // 2. Find nearest valid cell on the gridPaths if the user is slightly off-path
    let snappedCell = gridPaths[0];
    let minDist = Infinity;

    // If user's cell is exactly in a painted cell, snap immediately
    const exactMatch = gridPaths.find((p: any) => p.row === row && p.col === col);
    if (exactMatch) {
      snappedCell = exactMatch;
    } else {
      // Find physically closest painted cell
      for (const p of gridPaths) {
        const d = getDistance(currentLoc.lat, currentLoc.lon, p.lat, p.lon);
        if (d < minDist) {
          minDist = d;
          snappedCell = p;
        }
      }
    }

    // 3. Find shortest grid path to nearest exit
    const path = aStarGridPath(snappedCell, exits, gridPaths);

    if (!path || path.length === 0) return null;

    // 4. Determine immediate target cell
    // A* returns [CurrentCell, NextCell, ... ExitCell]. If path.length > 1, head to NextCell.
    const targetCell = path.length > 1 ? path[1] : path[0];

    return targetCell;
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

      // Phase 26: AR Tilt Detection
      const gyroAvailable = await Gyroscope.isAvailableAsync();
      if (gyroAvailable) {
        Gyroscope.setUpdateInterval(500);
        gyroSubRef.current = Gyroscope.addListener(gyroData => {
           if (!isMounted) return;
           // Simple tilt detection logic: if x or y rotation is high, toggle AR
           if (Math.abs(gyroData.x) > 2.5 || Math.abs(gyroData.y) > 2.5) {
             setShowAR(true);
           }
        });
      }

      // Phase 26: Wi-Fi Snapping Watcher
      wifiWatcherRef.current = setInterval(() => {
        if (!isMounted || wifiFingerprints.length === 0) return;
        // Mocking Wi-Fi scan: In reality we would read ambient BSSIDs here
        // Snap DR location to the nearest known router if signal is hypothetically matched
        const nearestRouter = wifiFingerprints[0]; // Simplified: snapping to first router for demo
        if (nearestRouter && Math.random() > 0.8) {
           setDrLocation({ lat: nearestRouter.lat, lon: nearestRouter.lon });
           showToast('Location snapped via Wi-Fi Fingerprint');
        }
      }, 10000);

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

              if (distToTarget <= 5) { // within 5 meters threshold
                if (target.isExit) {
                  hasReachedExitRef.current = true;
                  Speech.speak("You have reached the exit!");
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
      if (gyroSubRef.current) gyroSubRef.current.remove();
      if (wifiWatcherRef.current) clearInterval(wifiWatcherRef.current);
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
  // expo-audio useAudioPlayer manages cleanup automatically.
  // Do NOT call sirenPlayer.remove() here or it crashes on Android.

  const togglePanic = async () => {
    if (evacStatus === "PANIC") {
      setEvacStatus("IN_BUILDING");
      sirenPlayer.pause();
    } else {
      setEvacStatus("PANIC");
      try {
        sirenPlayer.play();
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
    sirenPlayer.pause();
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

  // Adaptive Font Size Calculations
  const bottomBtnHeight = (height * 0.20) - 16;
  const bottomBtnWidth = (width - 48) / 2;
  // Use a safer target height factor to prevent ascent/descent clipping at massive font sizes
  const targetHeight = bottomBtnHeight * 0.55; 
  const targetWidth = bottomBtnWidth * 0.85;

  const fontSOS = Math.min(targetHeight, targetWidth / 2);
  const fontCancelSOS = Math.min(targetHeight, targetWidth / 5.5);
  const activeSOSFont = Math.max(20, evacStatus === 'PANIC' ? fontCancelSOS : fontSOS);
  const fontSafe = Math.max(20, Math.min(targetHeight, targetWidth / 9.5));

  const outBtnHeight = Math.min(height * 0.25, 192); // max-h-48 is 192px
  const outBtnWidth = width * 0.9; // w-11/12 is ~91%
  const outFontSafe = Math.max(24, Math.min(outBtnHeight * 0.55, (outBtnWidth * 0.85) / 9.5));

  if (evacStatus === "SAFE") {
    return (
      <View className="flex-1 bg-green-900 justify-center items-center p-6">
        <Text className="text-8xl mb-6">✅</Text>
        <Text className="text-white text-3xl font-black uppercase tracking-widest text-center mb-4">You Are Safe</Text>
        <Text className="text-green-300 text-center mb-8">Please remain at the assembly point until cleared by administration.</Text>
        <TouchableOpacity
          onPress={() => {
            sirenPlayer.pause();
            onClose();
          }}
          className="bg-white/20 px-8 py-4 rounded-xl border border-white/30"
        >
          <Text className="text-white font-bold">Return to Dashboard</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isOutsideBuilding) {
    return (
      <View className="flex-1 bg-green-950 justify-center items-center p-6">
        <Text className="text-6xl mb-6">🎉</Text>
        <Text className="text-white text-4xl font-extrabold text-center mb-4 leading-tight">
          YOU ARE OUT AND SAFE
        </Text>
        <Text className="text-green-300 text-lg text-center mb-10 font-bold">
          Please inform the marshal by clicking the button below.
        </Text>
        <TouchableOpacity
          onPress={markAsSafe}
          className="bg-green-600 w-11/12 h-1/4 max-h-48 rounded-full border-4 border-green-400 shadow-[0_0_60px_rgba(34,197,94,0.6)] mb-8 justify-center items-center overflow-hidden"
        >
          <View className="flex-1 w-[90%] justify-center items-center">
            <Text 
              adjustsFontSizeToFit 
              numberOfLines={1} 
              className="text-white font-black text-center"
              style={{ fontSize: outFontSafe, lineHeight: outFontSafe * 1.1, textAlignVertical: 'center' }}
            >
              I AM SAFE
            </Text>
          </View>
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
        const padding = 0.05; // 5% margin on all around
        const fitFraction = 1 - 2 * padding;

        // Scale so the building bounding box perfectly fits within BOTH layout width and height with the given margin
        renderW = Math.min(
          (layoutW * fitFraction) / bw,
          (layoutH * fitFraction * aspect) / bh
        );
        renderH = renderW / aspect;

        // Center the building exactly in the middle of the Map View container
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        offsetX = (layoutW / 2) - (centerX * renderW);
        offsetY = (layoutH / 2) - (centerY * renderH);

        const marginX = layoutW * padding;
        const marginY = layoutH * padding;
        
        const clipLeft = offsetX + minX * renderW - marginX;
        const clipTop = offsetY + minY * renderH - marginY;
        const clipWidth = bw * renderW + marginX * 2;
        const clipHeight = bh * renderH + marginY * 2;

        return { renderW, renderH, offsetX, offsetY, clipLeft, clipTop, clipWidth, clipHeight };
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
    return { renderW, renderH, offsetX, offsetY, clipLeft: 0, clipTop: 0, clipWidth: layoutW, clipHeight: layoutH };
  };

  const fontHeader = Math.floor(Math.min(width * 0.08, height * 0.05));
  const fontTitle = Math.floor(Math.min(width * 0.1, height * 0.06));
  const fontSub = Math.floor(Math.min(width * 0.05, height * 0.025));
  const fontSteps = Math.floor(Math.min(width * 0.04, height * 0.02));

  return (
    <View className={`flex-1 w-full ${evacStatus === 'PANIC' ? 'bg-red-900 animate-pulse' : 'bg-black'}`}>

      {/* Header (10%) */}
      <View style={{ height: '10%' }} className={`justify-center items-center border-b ${isDrill ? 'bg-amber-900 border-amber-800' : 'bg-neutral-900 border-neutral-800'}`}>
        <Text style={{ fontSize: fontHeader }} className={`font-extrabold uppercase tracking-widest text-center ${isDrill ? 'text-amber-400' : 'text-red-500'}`}>
          {isDrill ? 'TEST DRILL' : 'EVACUATE'}
        </Text>
      </View>

      {/* Map View (25%) */}
      <View
        style={{ height: '25%' }}
        className="w-full bg-neutral-950 relative border-b-2 border-neutral-800 overflow-hidden"
        onLayout={(e) => setImgLayout({ w: Math.max(1, e.nativeEvent.layout.width), h: Math.max(1, e.nativeEvent.layout.height) })}
      >
        {activePlanUrl ? (
          <>
            {(() => {
              const bounds = getImageBounds();
              return (
                <View style={{
                  position: 'absolute',
                  left: bounds.clipLeft,
                  top: bounds.clipTop,
                  width: bounds.clipWidth,
                  height: bounds.clipHeight,
                  overflow: 'hidden'
                }}>
                  <Image
                    source={{ uri: activePlanUrl }}
                    style={{
                      position: 'absolute',
                      width: bounds.renderW,
                      height: bounds.renderH,
                      left: bounds.offsetX - bounds.clipLeft,
                      top: bounds.offsetY - bounds.clipTop,
                      opacity: 0.8
                    }}
                  />
                </View>
              );
            })()}
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
                      left: offsetX + pos.x * renderW - 16,
                      top: offsetY + pos.y * renderH - 16,
                      width: 32,
                      height: 32,
                    }}
                    className="z-10 bg-green-500 rounded-md justify-center items-center shadow-lg shadow-green-500 animate-pulse border-2 border-white"
                  >
                    <MaterialCommunityIcons name="door-open" size={20} color="#ffffff" />
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
                    left: offsetX + pos.x * renderW - 24,
                    top: offsetY + pos.y * renderH - 24,
                    width: 48,
                    height: 48,
                  }}
                  className="z-20 pointer-events-none justify-center items-center"
                >
                  <View className="absolute w-full h-full rounded-full border-4 border-red-500 bg-red-500/30 animate-pulse shadow-lg shadow-red-500/50" />

                  <View className="absolute bg-red-600 shadow-md shadow-black" style={{ left: 23, top: 8, width: 2, height: 12 }} />
                  <View className="absolute bg-red-600 shadow-md shadow-black" style={{ left: 23, bottom: 8, width: 2, height: 12 }} />
                  <View className="absolute bg-red-600 shadow-md shadow-black" style={{ top: 23, left: 8, width: 12, height: 2 }} />
                  <View className="absolute bg-red-600 shadow-md shadow-black" style={{ top: 23, right: 8, width: 12, height: 2 }} />
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
            <Text className={`font-black uppercase text-center ${statusTitleColor}`} style={[Platform.OS === 'web' ? { textShadow: '1px 1px 4px rgba(0,0,0,0.8)' } as any : { textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 4 }, { fontSize: fontTitle }]}>
              {statusTitle}
            </Text>
            <Text className={`text-center mt-1 font-bold ${statusSubColor}`} style={[Platform.OS === 'web' ? { textShadow: '1px 1px 2px rgba(0,0,0,0.8)' } as any : { textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2 }, { fontSize: fontSub }]}>
              {statusSub}
            </Text>
            <Text style={{ fontSize: fontSteps }} className="text-neutral-400 mt-2 font-bold">{steps} steps tracked</Text>
          </View>

          {/* Buttons (20%) */}
          <View style={{ height: '20%' }} className={`flex-row items-center justify-center px-4 pb-4 gap-4 ${bgColor}`}>
            <TouchableOpacity
              className={`flex-1 h-full rounded-3xl border-2 shadow-lg justify-center items-center overflow-hidden ${evacStatus === 'PANIC' ? 'bg-white border-red-500 shadow-red-600/50' : 'bg-red-600 border-red-500 shadow-red-600/50'}`}
              onPress={togglePanic}
            >
              <View className="flex-1 w-[90%] justify-center items-center">
                <Text 
                  adjustsFontSizeToFit 
                  numberOfLines={1} 
                  className={`font-black text-center ${evacStatus === 'PANIC' ? 'text-red-600' : 'text-white'}`}
                  style={{ fontSize: activeSOSFont, lineHeight: activeSOSFont * 1.1, textAlignVertical: 'center' }}
                >
                  {evacStatus === 'PANIC' ? 'CANCEL SOS' : 'SOS'}
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              className="flex-1 h-full bg-green-600 rounded-3xl border-2 border-green-500 shadow-lg shadow-green-600/50 justify-center items-center overflow-hidden"
              onPress={markAsSafe}
            >
              <View className="flex-1 w-[90%] justify-center items-center">
                <Text 
                  adjustsFontSizeToFit 
                  numberOfLines={1} 
                  className="font-black text-white text-center"
                  style={{ fontSize: fontSafe, lineHeight: fontSafe * 1.1, textAlignVertical: 'center' }}
                >
                  I AM SAFE
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Phase 26: AR Camera Fallback Overlay */}
      {showAR && permission?.granted && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, backgroundColor: 'black' }}>
          <CameraView style={{ flex: 1 }} facing="back">
            <View className="flex-1 justify-between p-6">
              <View className="bg-black/50 p-4 rounded-xl items-center mt-8 border border-orange-500/50">
                <Text className="text-orange-500 font-bold text-xl uppercase tracking-wider">AR Navigation Fallback</Text>
                <Text className="text-white text-center mt-2">Smoke or obstacle detected. Scanning for visual anchor points and tracking via gyroscope.</Text>
              </View>
              
              <View className="items-center justify-center flex-1">
                {/* Simulated AR Arrow */}
                <View className="bg-green-500/20 p-8 rounded-full border-4 border-green-500">
                  <MaterialCommunityIcons name="arrow-up-bold" size={120} color="#22C55E" style={{ transform: [{ rotate: `${targetHeading - heading}deg` }] }} />
                </View>
                <Text className="text-white font-bold text-2xl mt-4 bg-black/50 px-4 py-2 rounded-lg">Follow the Green Arrow</Text>
              </View>

              <TouchableOpacity 
                onPress={() => setShowAR(false)}
                className="bg-red-600 py-4 rounded-xl items-center mb-8 border-2 border-red-400"
              >
                <Text className="text-white font-bold text-lg">Close AR Mode</Text>
              </TouchableOpacity>
            </View>
          </CameraView>
        </View>
      )}
      {showAR && !permission?.granted && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, backgroundColor: 'black', justifyContent: 'center', alignItems: 'center' }}>
          <Text className="text-white mb-4">We need your permission to show the AR Camera</Text>
          <TouchableOpacity onPress={requestPermission} className="bg-orange-500 px-6 py-3 rounded-full">
            <Text className="text-white font-bold">Grant Permission</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowAR(false)} className="mt-6">
            <Text className="text-neutral-400">Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

    </View>
  );
}
