import React, { useState } from "react";
import {
  View,
  Modal,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { Text, TouchableOpacity } from "./ResponsiveUI";
import MapView, { Marker } from "react-native-maps";
import * as Location from "expo-location";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  buildingId: string;
  onStartCalibrationWalk: () => void;
};

export default function MasterFloorPlanV2({
  buildingId,
  onStartCalibrationWalk,
}: Props) {
  const { userId } = useAuth();
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [fingerprints, setFingerprints] = useState<any[]>([]);
  const [currentRegion, setCurrentRegion] = useState<any>(null);

  const [captureMode, setCaptureMode] = useState<"ENTRANCE" | "FIRE_EXIT">(
    "ENTRANCE",
  );
  const [step, setStep] = useState<1 | 2>(1); // 1 = GPS, 2 = Wi-Fi
  const [tempGps, setTempGps] = useState<{ lat: number; lon: number } | null>(
    null,
  );

  const saveWifiFingerprints = useMutation(api.portal.saveWifiFingerprints);

  const startSession = async () => {
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission to access location was denied");
      return;
    }

    setScanning(true);
    let location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Highest,
    });

    setCurrentRegion({
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      latitudeDelta: 0.001,
      longitudeDelta: 0.001,
    });
  };

  const capturePoint = async () => {
    let location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Highest,
    });

    // Dual-pin capture logic
    if (
      (captureMode === "ENTRANCE" || captureMode === "FIRE_EXIT") &&
      step === 1
    ) {
      setTempGps({
        lat: location.coords.latitude,
        lon: location.coords.longitude,
      });
      setStep(2);
      Alert.alert(
        "Step 1 Complete",
        `Captured OUTSIDE GPS. Now step INSIDE the doorway and press capture again for Wi-Fi.`,
      );
      return;
    }

    // Capture Wi-Fi
    const mockBssid =
      "00:1A:2B:3C:" +
      Math.floor(Math.random() * 99) +
      ":" +
      Math.floor(Math.random() * 99);

    setFingerprints([
      ...fingerprints,
      {
        bssid: mockBssid,
        lat: location.coords.latitude,
        lon: location.coords.longitude,
        signalStrength: -(Math.floor(Math.random() * 40) + 30),
        nodeType: captureMode,
        gpsLat: tempGps ? tempGps.lat : undefined,
        gpsLon: tempGps ? tempGps.lon : undefined,
      },
    ]);

    setTempGps(null);
    setStep(1);
    Alert.alert("Success", `${captureMode} node captured successfully!`);
  };

  const finishSession = async () => {
    if (fingerprints.length === 0) {
      Alert.alert("Error", "No fingerprints captured.");
      return;
    }

    setLoading(true);
    try {
      await saveWifiFingerprints({
        clerkId: userId || "",
        buildingId: buildingId as any,
        fingerprints: fingerprints,
      });
      Alert.alert(
        "Success",
        "Saved " + fingerprints.length + " routing nodes to the database.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 pt-4">
      <View className="flex-row items-center justify-between px-6 mb-4">
        <Text className="text-white text-xl font-bold">
          Phase 27: GPS/Wi-Fi Calibration
        </Text>
      </View>

      <View className="px-6 mb-4">
        <Text className="text-neutral-400 text-sm mb-2">
          Map Entrance points, Fire Exits, and Safe Paths using Dual-Pin (GPS +
          Wi-Fi) technology.
        </Text>
      </View>

      {!scanning ? (
        <View className="flex-1 items-center justify-center px-4">
          <Ionicons name="map" size={64} color="#818CF8" />
          <Text className="text-white text-lg mt-4 text-center">
            Ready to map GPS-to-Wi-Fi handoffs?
          </Text>
          <TouchableOpacity
            onPress={startSession}
            className="bg-indigo-600 px-8 py-4 rounded-full mt-8"
          >
            <Text className="text-white font-bold text-lg">
              Start Mapping Phase 2
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View className="px-4 mb-4">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="flex-row"
            >
              <TouchableOpacity
                onPress={() => {
                  setCaptureMode("ENTRANCE");
                  setStep(1);
                  setTempGps(null);
                }}
                className={`px-4 py-2 rounded-full mr-2 ${captureMode === "ENTRANCE" ? "bg-green-600" : "bg-neutral-800"}`}
              >
                <Text className="text-white font-bold">📍 Entrance</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setCaptureMode("FIRE_EXIT");
                  setStep(1);
                  setTempGps(null);
                }}
                className={`px-4 py-2 rounded-full mr-2 ${captureMode === "FIRE_EXIT" ? "bg-red-600" : "bg-neutral-800"}`}
              >
                <Text className="text-white font-bold">🚪 Fire Exit</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          <View className="flex-1 rounded-2xl overflow-hidden mx-4 mb-4 border border-neutral-700">
            <MapView
              style={{ flex: 1 }}
              region={currentRegion}
              showsUserLocation={true}
              followsUserLocation={true}
            >
              {fingerprints.map((fp, i) => (
                <Marker
                  key={i}
                  coordinate={{ latitude: fp.lat, longitude: fp.lon }}
                  pinColor={
                    fp.nodeType === "ENTRANCE"
                      ? "green"
                      : fp.nodeType === "FIRE_EXIT"
                        ? "red"
                        : "blue"
                  }
                  title={fp.nodeType}
                />
              ))}
            </MapView>
          </View>

          <View className="bg-neutral-800 border border-neutral-700 p-4 rounded-2xl mx-4 mb-4 items-center">
            <Text className="text-white font-bold mb-2">
              Indoor GPS Calibration (Wi-Fi)
            </Text>
            <Text className="text-neutral-400 text-xs text-center mb-3">
              Walk the safe routes to map Wi-Fi signals for accuracy.
            </Text>
            <TouchableOpacity
              className="bg-indigo-600 px-6 py-3 rounded-xl flex-row items-center shadow-lg w-full justify-center"
              onPress={onStartCalibrationWalk}
            >
              <Text className="mr-2">📶</Text>
              <Text className="text-white font-bold uppercase tracking-wide">
                Start Calibration Walk
              </Text>
            </TouchableOpacity>
          </View>

          <View className="px-6 pb-12 flex-row justify-between items-center">
            <TouchableOpacity
              onPress={capturePoint}
              className="bg-neutral-700 flex-1 py-4 rounded-xl items-center mr-2 border border-indigo-500/30"
            >
              <Text className="text-indigo-400 font-bold mb-1">
                {step === 1
                  ? "1. Step OUTSIDE & Capture"
                  : "2. Step INSIDE & Capture"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={finishSession}
              disabled={loading}
              className="bg-indigo-600 flex-1 py-4 rounded-xl items-center ml-2 flex-row justify-center"
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-bold">
                  Save ({fingerprints.length})
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}
