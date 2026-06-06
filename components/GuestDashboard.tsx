import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, TextInput, useWindowDimensions, Alert } from "react-native";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import ProfileSettingsScreen from "./ProfileSettingsScreen";

// Calculate distance between two coordinates in meters using Haversine formula
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

export default function GuestDashboard() {
  const { signOut } = useAuth();
  const { user } = useUser();
  const { width, height } = useWindowDimensions();
  const [isViewingProfile, setIsViewingProfile] = useState(false);
  const [isScanned, setIsScanned] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<Location.LocationObject | null>(null);

  const dashboardData = useQuery(api.portal.getDashboardData, { clerkId: user?.id });
  const updateProfile = useMutation(api.portal.updateProfile);

  const handleScanPlan = async () => {
    try {
      let loc = currentLocation;
      if (!loc) {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert("Permission Denied", "Location permission is required to verify the scan.");
          return;
        }
        loc = await Location.getCurrentPositionAsync({});
        setCurrentLocation(loc);
      }
      if (!loc) return;

      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permissionResult.granted === false) {
        Alert.alert("Permission Denied", "Permission to access camera roll is required!");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        exif: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const exifLat = asset.exif?.GPSLatitude;
        const exifLon = asset.exif?.GPSLongitude;
        
        if (exifLat === undefined || exifLon === undefined) {
           Alert.alert("No Location Data", "The selected image does not contain location data. Please use an image with EXIF GPS data.");
           return;
        }

        let imageLat = exifLat;
        if (asset.exif?.GPSLatitudeRef === 'S') imageLat = -imageLat;
        let imageLon = exifLon;
        if (asset.exif?.GPSLongitudeRef === 'W') imageLon = -imageLon;

        const dist = getDistance(loc.coords.latitude, loc.coords.longitude, imageLat, imageLon);
        
        // 100 meters buffer for building size (footprints usually 30-60m radius)
        if (dist > 100) {
          Alert.alert(
            "Location Mismatch",
            `Image location is too far from your current location (${Math.round(dist)} meters away). Maximum allowed distance is 100m.`
          );
          return;
        }
        
        setIsScanned(true);
        Alert.alert("Success", "Evacuation plan scanned and location verified successfully!");
      }
    } catch (e) {
      console.log(e);
      Alert.alert("Error", "An error occurred while scanning the plan.");
    }
  };

  const paddingTop = 40;
  const headerHeight = height * 0.2;
  const usableHeaderHeight = Math.max(headerHeight - paddingTop, 60);
  const headerButtonHeight = usableHeaderHeight * 0.33; // 1/3 of header height

  // Calculate dynamic font sizes so it fits perfectly
  // We use 2/3 of the screen width for the text section to give it plenty of room.
  const textSectionWidth = width * 0.66;
  const titleFontSize = textSectionWidth * 0.12; 
  const subFontSize = textSectionWidth * 0.06;

  // From a UI/UX perspective, the panic button should be the largest circle that safely fits 
  // inside the 60% Body view without ever overlapping. 
  // We cap it at 80% of width, or 45% of total screen height, up to 450px max.
  const panicButtonSize = Math.min(width * 0.8, height * 0.45, 450); 

  useEffect(() => {
    (async () => {
      let { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') return;
      let loc = await Location.getCurrentPositionAsync({});
      setCurrentLocation(loc);
    })();
  }, []);

  if (dashboardData === undefined) {
    return (
      <View className="flex-1 bg-neutral-900 justify-center items-center">
        <ActivityIndicator color="red" size="large" />
      </View>
    );
  }

  if (dashboardData === null) {
    return (
      <View className="flex-1 bg-neutral-900 justify-center items-center">
        <Text className="text-white">Profile not fully synced yet.</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-neutral-900">
      
      {/* HEADER (20%) */}
      <View style={{ flex: 1, paddingTop }} className="px-6 justify-center">
        <View className="flex-row w-full h-full">
          
          {/* LEFT 2/3: 3 Lines of Text */}
          <View style={{ flex: 2 }} className="justify-center pr-2">
            <Text style={{ fontSize: titleFontSize }} className="font-extrabold text-white leading-tight">FireVision</Text>
            <Text style={{ fontSize: titleFontSize }} className="font-extrabold text-white leading-tight">Evacuation</Text>
            <Text style={{ fontSize: subFontSize }} className="text-neutral-400 mt-1">
              Welcome, {dashboardData?.name || user?.primaryEmailAddress?.emailAddress}
            </Text>
          </View>

          {/* RIGHT 1/3: Buttons */}
          <View style={{ flex: 1 }} className="flex-row space-x-2 items-center justify-end">
            <TouchableOpacity 
              style={{ height: headerButtonHeight, width: headerButtonHeight, borderRadius: headerButtonHeight / 2 }}
              className="bg-neutral-800 border border-neutral-700 items-center justify-center mr-1"
              onPress={() => setIsViewingProfile(true)}
            >
              <Text style={{ fontSize: headerButtonHeight * 0.4 }} className="text-white">⚙️</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={{ height: headerButtonHeight, borderRadius: headerButtonHeight / 2, paddingHorizontal: headerButtonHeight * 0.4 }}
              className="bg-neutral-800 border border-neutral-700 items-center justify-center"
              onPress={() => signOut()}
            >
              <Text style={{ fontSize: headerButtonHeight * 0.4 }} className="text-white font-bold">Sign Out</Text>
            </TouchableOpacity>
          </View>
          
        </View>
      </View>

      {/* BODY (60%) */}
      <View style={{ flex: 3 }} className="justify-center items-center w-full">
        <TouchableOpacity 
          style={{ width: panicButtonSize, height: panicButtonSize, borderRadius: panicButtonSize / 2 }}
          className="bg-red-600 items-center justify-center shadow-[0_0_80px_rgba(220,38,38,0.6)] border-8 border-red-500"
          onPress={() => console.log("Panic Triggered at", currentLocation)}
        >
          <Text style={{ fontSize: panicButtonSize * 0.3 }} className="mb-2">🚨</Text>
          <Text style={{ fontSize: panicButtonSize * 0.15 }} className="text-white font-black uppercase tracking-widest">Panic</Text>
        </TouchableOpacity>
      </View>

      {/* FOOTER (20%) */}
      <View style={{ flex: 1 }} className="px-6 pb-12 justify-end w-full items-center">
        <TouchableOpacity 
          className={`w-full max-w-2xl ${isScanned ? 'bg-green-600 border-green-500' : 'bg-amber-500 border-amber-400'} border-4 rounded-3xl p-6 items-center flex-row justify-center shadow-lg`}
          onPress={handleScanPlan}
        >
          <Text className="text-4xl mr-4">📸</Text>
          <Text className="text-white font-extrabold text-2xl">
            {isScanned ? "Plan Scanned & Verified" : "Scan Evacuation Plan"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Profile Settings Modal */}
      <ProfileSettingsScreen 
        visible={isViewingProfile} 
        onClose={() => setIsViewingProfile(false)} 
        dashboardData={dashboardData} 
      />
    </View>
  );
}
