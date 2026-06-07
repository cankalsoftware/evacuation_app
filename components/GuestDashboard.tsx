import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, TextInput, useWindowDimensions, Alert, Platform, Modal, Image } from "react-native";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../convex/_generated/api";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import ProfileSettingsScreen from "./ProfileSettingsScreen";
import EvacuationMode from "./EvacuationMode";

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
  const [isViewingPlan, setIsViewingPlan] = useState(false);
  const [isScanned, setIsScanned] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<Location.LocationObject | null>(null);
  const [isEvacuating, setIsEvacuating] = useState(false);

  // Draft state for confirmation modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [draftPlan, setDraftPlan] = useState<{storageId: any, lat: number, lon: number} | null>(null);
  const [draftRoom, setDraftRoom] = useState("");
  const [draftFloor, setDraftFloor] = useState("");

  const dashboardData = useQuery(api.portal.getDashboardData, { clerkId: user?.id });
  const updateProfile = useMutation(api.portal.updateProfile);
  const generateUploadUrl = useMutation(api.portal.generateUploadUrl);
  const uploadScannedPlan = useMutation(api.portal.uploadScannedPlan);
  const extractMapDetails = useAction(api.vision.extractMapDetails);

  const processImage = async (result: ImagePicker.ImagePickerResult, loc: Location.LocationObject, isCamera: boolean) => {
    if (result.canceled || !result.assets || result.assets.length === 0) return;
    
    const asset = result.assets[0];
    let imageLat = loc.coords.latitude;
    let imageLon = loc.coords.longitude;
    let dist = 0;

    if (!isCamera) {
      const exifLat = asset.exif?.GPSLatitude;
      const exifLon = asset.exif?.GPSLongitude;
      
      if (exifLat === undefined || exifLon === undefined) {
         if (Platform.OS === 'web') {
           // For testing on web, fallback to current location if no EXIF
           imageLat = loc.coords.latitude;
           imageLon = loc.coords.longitude;
         } else {
           Alert.alert("No Location Data", "The selected image does not contain EXIF GPS data. Please take a photo with the camera instead, or use an image with location data.");
           return;
         }
      } else {
        imageLat = exifLat;
        if (asset.exif?.GPSLatitudeRef === 'S') imageLat = -imageLat;
        imageLon = exifLon;
        if (asset.exif?.GPSLongitudeRef === 'W') imageLon = -imageLon;
      }

      dist = getDistance(loc.coords.latitude, loc.coords.longitude, imageLat, imageLon);
      
      if (dist > 50) {
        Alert.alert(
          "Location Mismatch",
          `Image location is too far from your current location (${Math.round(dist)} meters away). Maximum allowed distance is 50m.`
        );
        return;
      }
    }

    try {
      setIsUploading(true);
      const postUrl = await generateUploadUrl();
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const uploadResult = await fetch(postUrl, {
        method: "POST",
        headers: { "Content-Type": asset.mimeType || "image/jpeg" },
        body: blob,
      });
      const { storageId } = await uploadResult.json();
      
      setIsUploading(false);
      setIsAnalyzing(true);
      
      // Call AI to extract details
      const aiData = await extractMapDetails({ storageId });
      
      setDraftPlan({ storageId, lat: imageLat, lon: imageLon });
      setDraftRoom(aiData?.roomNumber || "");
      setDraftFloor(aiData?.floorLevel || "");
      
      setIsAnalyzing(false);
      setShowConfirmModal(true); // Open modal instead of saving directly

    } catch (err) {
      console.log(err);
      Alert.alert("Upload Error", "Failed to upload the image to the server.");
      setIsUploading(false);
      setIsAnalyzing(false);
    }
  };

  const handleConfirmPlan = async () => {
    if (!user?.id || !draftPlan) return;
    try {
      await uploadScannedPlan({
        clerkId: user.id,
        storageId: draftPlan.storageId,
        lat: draftPlan.lat,
        lon: draftPlan.lon,
        roomNumber: draftRoom,
        floorLevel: draftFloor,
      });
      setShowConfirmModal(false);
      setIsScanned(true);
      Alert.alert("Success", "Evacuation plan verified and uploaded!");
    } catch (e) {
      Alert.alert("Error", "Failed to save the plan.");
    }
  };

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

      if (Platform.OS === 'web') {
        const libPerm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (libPerm.granted === false) {
          Alert.alert("Permission Denied", "Library permission is required!");
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({ exif: true });
        processImage(result, loc!, false);
        return;
      }

      Alert.alert(
        "Scan Evacuation Plan",
        "Would you like to take a photo or upload from your library?",
        [
          {
            text: "Take Photo",
            onPress: async () => {
              const camPerm = await ImagePicker.requestCameraPermissionsAsync();
              if (camPerm.granted === false) {
                Alert.alert("Permission Denied", "Camera permission is required!");
                return;
              }
              const result = await ImagePicker.launchCameraAsync({ exif: true });
              processImage(result, loc!, true);
            }
          },
          {
            text: "Choose from Library",
            onPress: async () => {
              const libPerm = await ImagePicker.requestMediaLibraryPermissionsAsync();
              if (libPerm.granted === false) {
                Alert.alert("Permission Denied", "Library permission is required!");
                return;
              }
              const result = await ImagePicker.launchImageLibraryAsync({ exif: true });
              processImage(result, loc!, false);
            }
          },
          { text: "Cancel", style: "cancel" }
        ]
      );
    } catch (e) {
      console.log(e);
      Alert.alert("Error", "An error occurred while preparing the scanner.");
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

  // Validate the previous scan against current location
  useEffect(() => {
    if (dashboardData && currentLocation) {
      if (dashboardData.scannedPlanLat && dashboardData.scannedPlanLon) {
        const dist = getDistance(
          currentLocation.coords.latitude, 
          currentLocation.coords.longitude, 
          dashboardData.scannedPlanLat, 
          dashboardData.scannedPlanLon
        );
        
        // Valid if within 50 meters
        if (dist <= 50) {
          setIsScanned(true);
        } else {
          setIsScanned(false);
        }
      }
    }
  }, [dashboardData, currentLocation]);

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
          onPress={() => {
            if (!dashboardData?.scannedPlanUrl) {
              Alert.alert("No Plan", "Please scan a plan before evacuating.");
              return;
            }
            setIsEvacuating(true);
          }}
        >
          <Text style={{ fontSize: panicButtonSize * 0.3 }} className="mb-2">🚨</Text>
          <Text style={{ fontSize: panicButtonSize * 0.15 }} className="text-white font-black uppercase tracking-widest">Panic</Text>
        </TouchableOpacity>
      </View>

      {/* FOOTER (20%) */}
      <View style={{ flex: 1 }} className="px-6 pb-12 justify-end w-full items-center">
        <TouchableOpacity 
          className={`w-full max-w-2xl ${isScanned ? 'bg-green-600 border-green-500' : isUploading || isAnalyzing ? 'bg-blue-600 border-blue-500' : 'bg-amber-500 border-amber-400'} border-4 rounded-3xl p-6 items-center flex-row justify-center shadow-lg`}
          onPress={() => {
            if (isScanned) {
              setIsViewingPlan(true);
            } else {
              handleScanPlan();
            }
          }}
          disabled={isUploading || isAnalyzing}
        >
          {isUploading || isAnalyzing ? <ActivityIndicator color="white" size="large" className="mr-4" /> : <Text className="text-4xl mr-4">{isScanned ? "🗺️" : "📸"}</Text>}
          <Text className="text-white font-extrabold text-2xl">
            {isUploading ? "Uploading..." : isAnalyzing ? "AI Analyzing..." : isScanned ? "View Verified Plan" : "Scan Evacuation Plan"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Profile Settings Modal */}
      <ProfileSettingsScreen 
        visible={isViewingProfile} 
        onClose={() => setIsViewingProfile(false)} 
        dashboardData={dashboardData} 
      />

      {/* View Plan Modal */}
      <Modal visible={isViewingPlan} animationType="slide" presentationStyle="pageSheet">
        <View className="flex-1 bg-neutral-900 px-6 pt-12 pb-8">
          <View className="flex-row justify-between items-center mb-6">
            <Text className="text-3xl font-extrabold text-white">Evacuation Plan</Text>
            <TouchableOpacity onPress={() => setIsViewingPlan(false)} className="bg-neutral-800 w-10 h-10 rounded-full border border-neutral-700 items-center justify-center">
              <Text className="text-white text-lg font-bold">✕</Text>
            </TouchableOpacity>
          </View>

          {dashboardData?.scannedPlanUrl ? (
            <View className="flex-1 justify-center items-center bg-neutral-800 rounded-2xl overflow-hidden mb-6 border border-neutral-700">
              <Image 
                source={{ uri: dashboardData.scannedPlanUrl }} 
                style={{ width: '100%', height: '100%', resizeMode: 'contain' }} 
              />
              <View className="absolute bottom-4 left-4 right-4 bg-black/60 p-4 rounded-xl">
                <Text className="text-white font-bold text-lg">Room: {dashboardData.roomNumber || "Unknown"}</Text>
                <Text className="text-neutral-300">Floor: {dashboardData.floorLevel || "Unknown"}</Text>
              </View>
            </View>
          ) : (
            <View className="flex-1 justify-center items-center">
              <Text className="text-neutral-500 text-lg">No image found.</Text>
            </View>
          )}

          <TouchableOpacity 
            onPress={() => {
              setIsViewingPlan(false);
              setTimeout(() => handleScanPlan(), 500); // Wait for modal to close
            }}
            className="bg-amber-500 py-4 rounded-xl items-center shadow-lg border-2 border-amber-400"
          >
            <Text className="text-white font-extrabold text-lg uppercase tracking-wider">Scan New Plan</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Confirmation Modal */}
      <Modal visible={showConfirmModal} animationType="fade" transparent>
        <View className="flex-1 bg-black/80 justify-center items-center px-6">
          <View className="bg-neutral-900 border border-neutral-700 p-6 rounded-3xl w-full max-w-sm">
            <Text className="text-xl font-bold text-white mb-2">Confirm Location</Text>
            <Text className="text-neutral-400 mb-6">Our AI detected the following details from your map. Please confirm or edit them.</Text>
            
            <Text className="text-neutral-400 text-xs mb-1 uppercase font-bold">Room Number</Text>
            <TextInput
              className="bg-neutral-800 border border-neutral-700 rounded-xl p-4 text-white text-lg mb-4"
              value={draftRoom}
              onChangeText={setDraftRoom}
              placeholder="e.g. 204"
              placeholderTextColor="#525252"
            />

            <Text className="text-neutral-400 text-xs mb-1 uppercase font-bold">Floor Level</Text>
            <TextInput
              className="bg-neutral-800 border border-neutral-700 rounded-xl p-4 text-white text-lg mb-8"
              value={draftFloor}
              onChangeText={setDraftFloor}
              placeholder="e.g. 2"
              placeholderTextColor="#525252"
            />

            <View className="flex-row space-x-4">
              <TouchableOpacity 
                className="flex-1 bg-neutral-800 py-4 rounded-xl items-center border border-neutral-700"
                onPress={() => setShowConfirmModal(false)}
              >
                <Text className="text-white font-bold">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                className="flex-1 bg-green-600 py-4 rounded-xl items-center border border-green-500"
                onPress={handleConfirmPlan}
              >
                <Text className="text-white font-bold text-lg">Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Evacuation Mode Modal (Full Screen) */}
      <Modal visible={isEvacuating} animationType="fade" presentationStyle="fullScreen">
        <EvacuationMode 
          dashboardData={dashboardData} 
          onClose={() => setIsEvacuating(false)} 
        />
      </Modal>
    </View>
  );
}
