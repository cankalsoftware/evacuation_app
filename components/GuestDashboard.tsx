/**
 * @file GuestDashboard.tsx
 * @description The primary interface for end-users (guests) to interact with the evacuation system.
 * Handles permissions, background location syncing, panic button interactions, and emergency
 * evacuation mode transitions.
 * 
 * @module GuestDashboard
 */
import { showToast } from "./Toast";
import React, { useState, useEffect } from "react";
import { View, ActivityIndicator, useWindowDimensions, Alert, Platform, Modal, Image, ScrollView } from "react-native";
import { Text, TouchableOpacity, TextInput, FooterLinks } from "./ResponsiveUI";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../convex/_generated/api";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
import ProfileSettingsScreen from "./ProfileSettingsScreen";
import EvacuationMode from "./EvacuationMode";

/**
 * Calculate distance between two coordinates in meters using the Haversine formula.
 * Used to ensure guests are physically near the evacuation plan they are trying to scan.
 * 
 * @param {number} lat1 - Latitude of first coordinate
 * @param {number} lon1 - Longitude of first coordinate
 * @param {number} lat2 - Latitude of second coordinate
 * @param {number} lon2 - Longitude of second coordinate
 * @returns {number} Distance in meters
 */
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

/**
 * GuestDashboard Component
 * 
 * @description Main functional component for the guest user interface.
 * Manages location polling, AI plan scanning validation, and checks Convex backend
 * for active incidents in their current building to trigger the EvacuationMode overlay.
 * 
 * @returns {JSX.Element} The rendered React component.
 */
export default function GuestDashboard() {
  const { signOut } = useAuth();
  const { user } = useUser();
  const { width, height } = useWindowDimensions();
  const [hasPermissions, setHasPermissions] = useState(true);
  const [isViewingProfile, setIsViewingProfile] = useState(false);
  const [isViewingPlan, setIsViewingPlan] = useState(false);
  const [isScanned, setIsScanned] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<Location.LocationObject | null>(null);
  const [isEvacuating, setIsEvacuating] = useState(false);
  const [lockedIncident, setLockedIncident] = useState<any>(null);
  const [lockedBuilding, setLockedBuilding] = useState<any>(null);

  // Draft state for confirmation modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [draftPlan, setDraftPlan] = useState<{ storageId: any, lat: number, lon: number } | null>(null);
  const [draftRoom, setDraftRoom] = useState("");
  const [draftFloor, setDraftFloor] = useState("");
  const [draftImageUri, setDraftImageUri] = useState<string | null>(null);
  const [draftExitNode, setDraftExitNode] = useState<{ x: number, y: number } | null>(null);
  const [draftImgLayout, setDraftImgLayout] = useState<{ w: number, h: number }>({ w: 1, h: 1 });
  const [draftImageAspectRatio, setDraftImageAspectRatio] = useState<number | null>(null);

  const savePushToken = useMutation(api.portal.savePushToken);
  const checkInUser = useMutation(api.portal.checkInUser);
  const recentAnnouncements = useQuery(api.portal.getRecentAnnouncements) || [];

  useEffect(() => {
    async function registerForPushNotificationsAsync() {
      let token;
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
      }
      if (Device.isDevice) {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus !== 'granted') {
          return;
        }
        try {
          token = (await Notifications.getExpoPushTokenAsync({ projectId: Constants.expoConfig?.extra?.eas?.projectId })).data;
        } catch (e) {
          console.warn("Failed to get push token (expected on Web simulator without VAPID):", e);
        }
      }
      return token;
    }

    if (user?.id) {
      registerForPushNotificationsAsync().then(token => {
        if (token) savePushToken({ clerkId: user.id, token });
      });
    }
  }, [user?.id]);

  const dashboardData = useQuery(api.portal.getDashboardData, { clerkId: user?.id });
  const autoBuilding = useQuery(
    api.portal.getAutoPushedBuilding,
    currentLocation ? { lat: currentLocation.coords.latitude, lon: currentLocation.coords.longitude } : "skip"
  );

  const activeIncident = useQuery(
    api.portal.getActiveIncident,
    autoBuilding?.buildingId ? { buildingId: autoBuilding.buildingId } : "skip"
  );

  // Background Check-In sync
  useEffect(() => {
    if (user?.id) {
      checkInUser({
        clerkId: user.id,
        buildingId: autoBuilding?.buildingId || null
      }).catch(console.error);
    }
  }, [user?.id, autoBuilding?.buildingId]);

  useEffect(() => {
    if (activeIncident && activeIncident.isActive) {
      setIsEvacuating(true);
      setLockedIncident(activeIncident);
      setLockedBuilding(autoBuilding);
    } else if (activeIncident && !activeIncident.isActive && isEvacuating) {
      showToast("The evacuation has been resolved by the administrator.", "success");
    }
  }, [activeIncident, autoBuilding]);

  useEffect(() => {
    setHasPermissions(dashboardData?.locationGranted === true && dashboardData?.notificationsGranted === true);
  }, [isViewingProfile, dashboardData]);

  useEffect(() => {
    if (dashboardData !== undefined && dashboardData !== null) {
      if (!dashboardData.agreedToTandC) {
        setIsViewingProfile(true);
      }
    }
  }, [dashboardData]);

  const updateProfile = useMutation(api.portal.updateProfile);
  const generateUploadUrl = useMutation(api.portal.generateUploadUrl);
  const uploadScannedPlan = useMutation(api.portal.uploadScannedPlan);
  const deleteStorageImage = useMutation(api.portal.deleteStorageImage);
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
          showToast("The selected image does not contain EXIF GPS data. Please take a photo with the camera instead, or use an image with location data.", "error");
          return;
        }
      } else {
        imageLat = exifLat;
        if (asset.exif?.GPSLatitudeRef === 'S') imageLat = -imageLat;
        imageLon = exifLon;
        if (asset.exif?.GPSLongitudeRef === 'W') imageLon = -imageLon;
      }

      dist = getDistance(loc.coords.latitude, loc.coords.longitude, imageLat, imageLon);

      if (dist > 500) {
        showToast(`Image location is too far from your current location (${Math.round(dist)} meters away). Maximum allowed distance is 500m.`, "error");
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
      setDraftImageUri(asset.uri);

      setIsAnalyzing(false);
      setShowConfirmModal(true); // Open modal instead of saving directly

    } catch (err) {
      console.log(err);
      showToast("Failed to upload the image to the server.", "error");
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
        exitNode: draftExitNode || undefined,
      });
      setShowConfirmModal(false);
      setDraftImageUri(null);
      setDraftExitNode(null);
      setIsScanned(true);
      showToast("Evacuation plan verified and uploaded!");
    } catch (e) {
      showToast("Failed to save the plan.", "error");
    }
  };

  const handleScanPlan = async () => {
    try {
      let loc = currentLocation;
      if (!loc) {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') {
          showToast("Location permission is required to verify the scan.", "error");
          return;
        }
        loc = await Location.getCurrentPositionAsync({});
        setCurrentLocation(loc);
      }
      if (!loc) return;

      if (Platform.OS === 'web') {
        const libPerm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (libPerm.granted === false) {
          showToast("Library permission is required!", "error");
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({ exif: true });
        processImage(result, loc!, false);
        return;
      }

      Alert.alert(
        "Scan Evacuation Plan",
        "Would you like to take a photo or upload an existing file?",
        [
          {
            text: "Take Photo",
            onPress: async () => {
              const camPerm = await ImagePicker.requestCameraPermissionsAsync();
              if (camPerm.granted === false) {
                showToast("Camera permission is required!", "error");
                return;
              }
              const result = await ImagePicker.launchCameraAsync({ exif: true });
              processImage(result, loc!, true);
            }
          },
          {
            text: "Upload Existing",
            onPress: () => {
              Alert.alert(
                "Select Source",
                "Where is your file located?",
                [
                  {
                    text: "Photo Library",
                    onPress: async () => {
                      const libPerm = await ImagePicker.requestMediaLibraryPermissionsAsync();
                      if (libPerm.granted === false) {
                        showToast("Library permission is required!", "error");
                        return;
                      }
                      const result = await ImagePicker.launchImageLibraryAsync({ exif: true });
                      processImage(result, loc!, false);
                    }
                  },
                  {
                    text: "Files / Cloud (Drive)",
                    onPress: async () => {
                      const result = await DocumentPicker.getDocumentAsync({
                        type: ['image/*'],
                        copyToCacheDirectory: true,
                      });
                      if (!result.canceled && result.assets && result.assets.length > 0) {
                        const docAsset = result.assets[0];
                        const fakeImagePickerResult = {
                          canceled: false,
                          assets: [{
                            uri: docAsset.uri,
                            width: 1000,
                            height: 1000,
                            mimeType: docAsset.mimeType
                          }]
                        };
                        processImage(fakeImagePickerResult as any, loc!, true);
                      }
                    }
                  },
                  { text: "Cancel", style: "cancel" }
                ]
              );
            }
          },
          { text: "Cancel", style: "cancel" }
        ]
      );
    } catch (e) {
      console.log(e);
      showToast("An error occurred while preparing the scanner.", "error");
    }
  };

  const paddingTop = Math.max(20, height * 0.04);
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
  // We cap it at 80% of width, or 45% of total screen height, up to 800px max.
  const panicButtonSize = Math.min(width * 0.8, height * 0.45, 800);

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      if (!hasPermissions) {
        setCurrentLocation(null);
        return;
      }

      let { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') return;

      try {
        let loc = await Location.getCurrentPositionAsync({});
        setCurrentLocation(loc);

        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 1 },
          (newLoc) => setCurrentLocation(newLoc)
        );
      } catch (e) {
        console.warn("Location fetch blocked or failed:", e);
      }
    })();

    return () => {
      if (sub) {
        sub.remove();
      }
    };
  }, [hasPermissions]);

  // Validate the previous scan against current location, or use autoBuilding
  useEffect(() => {
    if (autoBuilding) {
      setIsScanned(true);
    } else if (dashboardData && currentLocation) {
      if (dashboardData.scannedPlanLat && dashboardData.scannedPlanLon) {
        const dist = getDistance(
          currentLocation.coords.latitude,
          currentLocation.coords.longitude,
          dashboardData.scannedPlanLat,
          dashboardData.scannedPlanLon
        );

        // Valid if within 500 meters
        if (dist <= 500) {
          setIsScanned(true);
        } else {
          setIsScanned(false);
        }
      } else {
        setIsScanned(false);
      }
    }
  }, [autoBuilding, dashboardData, currentLocation]);

  const activePlanUrl = autoBuilding?.masterPlanUrl || dashboardData?.scannedPlanUrl;
  const activeRoom = autoBuilding ? "General Building Area" : (dashboardData?.roomNumber || "Unknown");
  const activeFloor = autoBuilding ? "Auto-detected" : (dashboardData?.floorLevel || "Unknown");

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

      {/* Top Warning Banner */}
      {!hasPermissions && (
        <View className="bg-red-900/80 p-3 mt-8 mx-6 rounded-lg border border-red-500">
          <Text className="text-white text-center text-xs font-bold">You must approve location and notification permissions in settings.</Text>
        </View>
      )}

      {/* HEADER */}
      <View style={{ paddingTop: hasPermissions ? paddingTop : 10 }} className="px-6 justify-center w-full pb-4">
        <View className="flex-row w-full items-center">

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
              className={`border items-center justify-center mr-1 ${!hasPermissions ? 'bg-red-600 border-red-400 shadow-[0_0_15px_rgba(220,38,38,0.8)]' : 'bg-neutral-800 border-neutral-700'}`}
              onPress={() => setIsViewingProfile(true)}
            >
              <Text style={{ fontSize: headerButtonHeight * 0.4 }} className="text-white">⚙️</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ height: headerButtonHeight, borderRadius: headerButtonHeight / 2, paddingHorizontal: 10 }}
              className="bg-neutral-800 border border-neutral-700 items-center justify-center shrink flex-1 max-w-[100px]"
              onPress={() => signOut()}
            >
              <Text adjustsFontSizeToFit numberOfLines={1} style={{ fontSize: headerButtonHeight * 0.4 }} className="text-white font-bold text-center">Sign Out</Text>
            </TouchableOpacity>
          </View>

        </View>
      </View>

      {/* BODY / PANIC BUTTON */}
      <View className="flex-1 justify-center items-center w-full relative min-h-[300px]">
        {/* NOTICES BANNER positioned absolutely above panic button if exists */}
        {recentAnnouncements && recentAnnouncements.length > 0 && (
          <View className="absolute top-4 bg-amber-900/30 border border-amber-500/50 rounded-2xl p-4 w-[90%] max-w-2xl z-10">
            <View className="flex-row items-center mb-1">
              <Text className="text-amber-500 mr-2">📢</Text>
              <Text className="text-amber-500 font-bold tracking-widest uppercase text-xs">Active Notice</Text>
            </View>
            <Text className="text-white font-bold text-lg mb-1">{recentAnnouncements[0].title}</Text>
            <Text className="text-neutral-300 text-sm">{recentAnnouncements[0].message}</Text>
          </View>
        )}

        <TouchableOpacity
          style={{ width: panicButtonSize, height: panicButtonSize, borderRadius: panicButtonSize * 0.22 }}
          className={`items-center justify-center shadow-[0_0_80px_rgba(220,38,38,0.6)] bg-white ${!hasPermissions ? 'opacity-50' : ''}`}
          onPress={() => {
            if (!hasPermissions) {
              showToast("Permissions required to use the Panic Button", "error");
              return;
            }
            if (!activePlanUrl) {
              showToast("Please scan a plan or enter a building before evacuating.", "error");
              return;
            }
            setIsEvacuating(true);
          }}
          disabled={!hasPermissions}
        >
          <Image
            source={require('../assets/icon.png')}
            style={{ width: '100%', height: '100%', borderRadius: panicButtonSize * 0.22, resizeMode: 'cover' }}
          />
        </TouchableOpacity>
      </View>

      {/* BOTTOM ACTION AREA */}
      <View className="px-6 w-full items-center pb-8 pt-4">
        {/* ADD MAP / SCAN PLAN */}
        <TouchableOpacity
          className={`w-full max-w-2xl ${!hasPermissions ? 'bg-amber-900 border-amber-800 opacity-50' : isScanned ? 'bg-green-600 border-green-500' : isUploading || isAnalyzing ? 'bg-blue-600 border-blue-500' : 'bg-amber-500 border-amber-400'} border-4 rounded-3xl py-4 px-6 items-center flex-row justify-center shadow-lg`}
          onPress={() => {
            if (!hasPermissions) {
              showToast("Permissions required to scan map", "error");
              return;
            }
            if (isScanned) {
              setIsViewingPlan(true);
            } else {
              handleScanPlan();
            }
          }}
          disabled={!hasPermissions || isUploading || isAnalyzing}
        >
          {isUploading || isAnalyzing ? <ActivityIndicator color="white" size="large" className="mr-3" /> : <Text className="text-3xl mr-3">{isScanned ? "🗺️" : "📸"}</Text>}
          <Text className="text-white font-extrabold text-xl text-center flex-1">
            {isUploading ? "Uploading..." : isAnalyzing ? "AI Analyzing..." : autoBuilding ? `Auto-Connected:\n${autoBuilding.name}` : isScanned ? "View Verified Plan" : "Scan Evacuation Plan"}
          </Text>
        </TouchableOpacity>

        {/* FOOTER */}
        <View className="justify-center items-center w-full pt-8 pb-12">
          <FooterLinks />
        </View>
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

          {activePlanUrl ? (
            <View className="flex-1 justify-center items-center bg-neutral-800 rounded-2xl overflow-hidden mb-6 border border-neutral-700">
              <Image
                source={{ uri: activePlanUrl }}
                style={{ width: '100%', height: '100%' }}
                resizeMode="contain"
              />
              <View className="absolute bottom-4 left-4 right-4 bg-black/60 p-4 rounded-xl">
                <Text className="text-white font-bold text-lg">Room: {activeRoom}</Text>
                <Text className="text-neutral-300">Floor: {activeFloor}</Text>
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
            <Text className="text-white font-extrabold text-lg uppercase tracking-wider">
              {autoBuilding ? "Manually Scan Plan Instead" : "Scan New Plan"}
            </Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Confirmation Modal */}
      <Modal visible={showConfirmModal} animationType="fade" transparent>
        <View className="flex-1 bg-black/90 justify-center items-center px-4 py-12">
          <View className="bg-neutral-900 border border-neutral-700 p-6 rounded-3xl w-full flex-1 max-w-lg">
            <Text className="text-xl font-bold text-white mb-2">Confirm Details</Text>

            <View className="bg-neutral-800/60 p-3 rounded-xl mb-4">
              <Text className="text-neutral-400 text-xs text-center italic">
                We never track your movement. Location services are purely for your safety to confirm if you are inside a registered building during an emergency.
              </Text>
            </View>

            <View className="bg-yellow-900/30 p-3 rounded-xl border border-yellow-700/50 mb-4 flex-row items-start">
              <Text className="text-yellow-500 mr-2 mt-0.5">⚠️</Text>
              <Text className="text-yellow-500 text-xs flex-1">
                <Text className="font-bold">Disclaimer: </Text>
                Manual scans provide basic compass direction. For accurate turn-by-turn guidance, ask your building manager to register on FireVision. Use at your own risk.
              </Text>
            </View>

            <Text className="text-neutral-400 text-xs mb-1 uppercase font-bold">1. Tap Map to Pin Exit Location</Text>
            <View className="bg-neutral-800 rounded-xl overflow-hidden mb-4 border border-neutral-700 flex-1 relative w-full" style={{ height: 300 }}>
              {draftImageUri && (
                <TouchableOpacity
                  activeOpacity={1}
                  className="flex-1"
                  onLayout={(e) => setDraftImgLayout({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
                  onPress={(e) => {
                    const x = Platform.OS === 'web' && (e.nativeEvent as any).offsetX !== undefined ? (e.nativeEvent as any).offsetX : e.nativeEvent.locationX;
                    const y = Platform.OS === 'web' && (e.nativeEvent as any).offsetY !== undefined ? (e.nativeEvent as any).offsetY : e.nativeEvent.locationY;
                    const w = draftImgLayout.w || 1;
                    const h = draftImgLayout.h || 1;
                    setDraftExitNode({
                      x: x / w,
                      y: y / h
                    });
                  }}
                >
                  <Image source={{ uri: draftImageUri }} className="w-full h-full" resizeMode="contain" />
                  {draftExitNode && (
                    <View className="absolute bg-green-500 w-8 h-8 rounded-full items-center justify-center border-2 border-white" style={{ left: draftExitNode.x * draftImgLayout.w - 16, top: draftExitNode.y * draftImgLayout.h - 16 }}>
                      <Text className="text-white font-bold text-xs">E</Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}
            </View>

            <Text className="text-neutral-400 text-xs mb-1 uppercase font-bold">2. Room & Floor</Text>
            <View className="flex-row space-x-2 mb-6">
              <TextInput
                className="flex-1 bg-neutral-800 border border-neutral-700 rounded-xl p-4 text-white text-lg"
                value={draftRoom}
                onChangeText={setDraftRoom}
                placeholder="Room (e.g. 204)"
                placeholderTextColor="#525252"
              />
              <TextInput
                className="flex-1 bg-neutral-800 border border-neutral-700 rounded-xl p-4 text-white text-lg"
                value={draftFloor}
                onChangeText={setDraftFloor}
                placeholder="Floor (e.g. 2)"
                placeholderTextColor="#525252"
              />
            </View>

            <View className="flex-row space-x-4">
              <TouchableOpacity
                className="flex-1 bg-neutral-800 py-4 rounded-xl items-center border border-neutral-700 mr-2"
                onPress={() => {
                  if (draftPlan?.storageId) {
                    deleteStorageImage({ storageId: draftPlan.storageId }).catch(console.error);
                  }
                  setShowConfirmModal(false);
                  setDraftImageUri(null);
                  setDraftExitNode(null);
                  setDraftPlan(null);
                }}
              >
                <Text className="text-white font-bold">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className={`flex-1 py-4 rounded-xl items-center border ${draftExitNode ? 'bg-green-600 border-green-500' : 'bg-neutral-800 border-neutral-700 opacity-50'}`}
                disabled={!draftExitNode}
                onPress={handleConfirmPlan}
              >
                <Text className="text-white font-bold text-lg">Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={isEvacuating} animationType="fade" presentationStyle="fullScreen">
        <EvacuationMode
          dashboardData={dashboardData}
          autoBuilding={lockedBuilding || autoBuilding}
          currentLocation={currentLocation}
          activeIncident={lockedIncident || activeIncident}
          onClose={() => {
            setIsEvacuating(false);
            setLockedIncident(null);
            setLockedBuilding(null);
          }}
        />
      </Modal>
    </View>
  );
}
