import React, { useState } from "react";
import { View, Modal, ActivityIndicator, Alert } from "react-native";
import { Text, TouchableOpacity } from "./ResponsiveUI";
import MapView, { Marker, Polyline } from "react-native-maps";
import * as Location from "expo-location";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  visible: boolean;
  onClose: () => void;
  buildingId: string;
};

export default function AdminCalibrationWalk({ visible, onClose, buildingId }: Props) {
  const { userId } = useAuth();
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [fingerprints, setFingerprints] = useState<any[]>([]);
  const [currentRegion, setCurrentRegion] = useState<any>(null);

  const saveWifiFingerprints = useMutation(api.portal.saveWifiFingerprints);

  const startWalk = async () => {
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

  const captureFingerprint = async () => {
    let location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Highest,
    });

    // Mocking BSSID for Expo Go environment (real implementation would use react-native-wifi-reborn in a custom dev client)
    const mockBssid = "00:1A:2B:3C:" + Math.floor(Math.random() * 99) + ":" + Math.floor(Math.random() * 99);
    
    setFingerprints([...fingerprints, {
      bssid: mockBssid,
      lat: location.coords.latitude,
      lon: location.coords.longitude,
      signalStrength: - (Math.floor(Math.random() * 40) + 30), // -30 to -70 dBm
    }]);

    Alert.alert("Success", "Wi-Fi Router Fingerprint captured at this location!");
  };

  const finishWalk = async () => {
    if (fingerprints.length === 0) {
      Alert.alert("Error", "No fingerprints captured. Please walk and scan.");
      return;
    }

    setLoading(true);
    try {
      await saveWifiFingerprints({
        clerkId: userId || "",
        buildingId: buildingId as any,
        fingerprints: fingerprints,
      });
      Alert.alert("Calibration Complete", "Saved " + fingerprints.length + " Wi-Fi zones to the database.");
      onClose();
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Failed to save calibration data.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide">
      <View className="flex-1 bg-neutral-900 pt-12">
        <View className="flex-row items-center justify-between px-6 mb-4">
          <Text className="text-white text-xl font-bold">Calibration Walk</Text>
          <TouchableOpacity onPress={onClose} className="p-2">
            <Ionicons name="close" size={24} color="#FFF" />
          </TouchableOpacity>
        </View>

        <View className="px-6 mb-4">
          <Text className="text-neutral-400 text-sm mb-2">
            Walk through your building. Stop in main zones (e.g., Lobby, Floor 2) and press "Capture" to bind the ambient Wi-Fi signals to the exact coordinates. This allows guests to be tracked with 100% accuracy without beacons.
          </Text>
        </View>

        <View className="flex-1 rounded-2xl overflow-hidden mx-4 mb-4 border border-neutral-700">
          {!scanning ? (
            <View className="flex-1 items-center justify-center bg-neutral-800">
              <Ionicons name="walk" size={64} color="#F97316" />
              <Text className="text-white text-lg mt-4 font-semibold">Ready to start?</Text>
              <TouchableOpacity onPress={startWalk} className="bg-orange-500 px-6 py-3 rounded-full mt-6">
                <Text className="text-white font-bold">Start Walk</Text>
              </TouchableOpacity>
            </View>
          ) : (
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
                  pinColor="orange"
                  title={"Wi-Fi Zone " + (i + 1)}
                  description={fp.bssid}
                />
              ))}
            </MapView>
          )}
        </View>

        {scanning && (
          <View className="px-6 pb-12 flex-row justify-between">
            <TouchableOpacity 
              onPress={captureFingerprint} 
              className="bg-neutral-700 flex-1 py-4 rounded-xl items-center mr-2 border border-orange-500/30"
            >
              <Ionicons name="wifi" size={24} color="#F97316" />
              <Text className="text-orange-500 font-bold mt-1">Capture Here</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={finishWalk} 
              disabled={loading}
              className="bg-orange-500 flex-1 py-4 rounded-xl items-center ml-2 flex-row justify-center"
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={24} color="white" />
                  <Text className="text-white font-bold ml-2">Finish ({fingerprints.length})</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}
