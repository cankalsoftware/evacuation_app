import { showToast } from "./Toast";
import React from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Modal, TextInput, Platform, Image, Alert } from "react-native";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import * as ImagePicker from "expo-image-picker";

let MapView: any = null;
let Marker: any = null;
let Polygon: any = null;
if (Platform.OS !== 'web') {
  try {
    const Maps = require('react-native-maps');
    MapView = Maps.default;
    Marker = Maps.Marker;
    Polygon = Maps.Polygon;
  } catch (e) {}
}

// Math helpers to detect if polygon lines criss-cross (self-intersect)
function onSegment(p: any, q: any, r: any) {
  return q.lat <= Math.max(p.lat, r.lat) && q.lat >= Math.min(p.lat, r.lat) &&
         q.lon <= Math.max(p.lon, r.lon) && q.lon >= Math.min(p.lon, r.lon);
}

function orientation(p: any, q: any, r: any) {
  const val = (q.lon - p.lon) * (r.lat - q.lat) - (q.lat - p.lat) * (r.lon - q.lon);
  if (val === 0) return 0;
  return (val > 0) ? 1 : 2;
}

function doIntersect(p1: any, q1: any, p2: any, q2: any) {
  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, q2, q1)) return true;
  if (o3 === 0 && onSegment(p2, p1, q2)) return true;
  if (o4 === 0 && onSegment(p2, q1, q2)) return true;
  return false;
}

function hasSelfIntersection(polygon: {lat: number, lon: number}[]) {
  if (!polygon || polygon.length < 4) return false;
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const q1 = polygon[(i + 1) % polygon.length];
    for (let j = i + 2; j < polygon.length; j++) {
      if (i === 0 && j === polygon.length - 1) continue;
      const p2 = polygon[j];
      const q2 = polygon[(j + 1) % polygon.length];
      if (doIntersect(p1, q1, p2, q2)) return true;
    }
  }
  return false;
}

export default function AdminDashboard() {
  const { signOut } = useAuth();
  const { user } = useUser();
  const dashboardData = useQuery(api.portal.getDashboardData, { clerkId: user?.id });
  const saveBuilding = useMutation(api.portal.saveBuilding);
  const generateUploadUrl = useMutation(api.portal.generateUploadUrl);
  const updateBuildingImage = useMutation(api.portal.updateBuildingImage);
  const updateBuildingPolygon = useMutation(api.portal.updateBuildingPolygon);
  const updateBuildingInfo = useMutation(api.portal.updateBuildingInfo);
  const deleteBuilding = useMutation(api.portal.deleteBuilding);

  const [isRegistering, setIsRegistering] = React.useState(false);
  const [selectedBuilding, setSelectedBuilding] = React.useState<any>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [editingPins, setEditingPins] = React.useState<{lat: number, lon: number}[] | null>(null);
  const [editBName, setEditBName] = React.useState("");
  const [editBAddress, setEditBAddress] = React.useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);

  const [bName, setBName] = React.useState("");
  const [bAddress, setBAddress] = React.useState("");
  const [bPins, setBPins] = React.useState<{lat: number, lon: number}[]>([]);
  const [bImageUri, setBImageUri] = React.useState<string | null>(null);

  const [showSettings, setShowSettings] = React.useState(false);
  const [setupName, setSetupName] = React.useState("");
  const [setupPhone, setSetupPhone] = React.useState("");
  const [isSavingSetup, setIsSavingSetup] = React.useState(false);
  const updateAdminProfile = useMutation(api.users.updateAdminProfile);

  // Keep selectedBuilding in sync with database updates (like image uploads)
  React.useEffect(() => {
    if (selectedBuilding && dashboardData?.buildings) {
      const updated = dashboardData.buildings.find((b: any) => b._id === selectedBuilding._id);
      if (updated && updated.masterPlanUrl !== selectedBuilding.masterPlanUrl) {
        setSelectedBuilding(updated);
      }
    }
  }, [dashboardData, selectedBuilding]);

  const handleMapPress = (e: any) => {
    if (e.nativeEvent.coordinate) {
      setBPins([...bPins, { lat: e.nativeEvent.coordinate.latitude, lon: e.nativeEvent.coordinate.longitude }]);
    }
  };

  const handleSaveBuilding = async () => {
    if (bPins.length > 0 && bPins.length < 4) {
      showToast("Please drop at least 4 pins to create a polygon footprint, or leave it empty to configure later.");
      return;
    }
    if (!bName || !user?.id) return;

    try {
      setIsUploading(true);
      let storageId: string | undefined = undefined;
      
      // Upload the image first if provided
      if (bImageUri) {
        const postUrl = await generateUploadUrl();
        const response = await fetch(bImageUri);
        const blob = await response.blob();
        const uploadResult = await fetch(postUrl, {
          method: "POST",
          headers: { "Content-Type": blob.type },
          body: blob,
        });
        const result = await uploadResult.json();
        storageId = result.storageId;
      }

      await saveBuilding({
        clerkId: user.id,
        name: bName,
        address: bAddress || "No Address Provided",
        ...(bPins.length >= 4 && { 
          latitude: bPins[0].lat, 
          longitude: bPins[0].lon, 
          polygon: bPins 
        }),
        ...(storageId && { masterPlanId: storageId }),
      });
      
      setIsRegistering(false);
      setBName("");
      setBAddress("");
      setBPins([]);
      setBImageUri(null);
      showToast("Building registered successfully!");
    } catch (e) {
      console.log(e);
      showToast("Error saving building.", "error");
    } finally {
      setIsUploading(false);
    }
  };

  const handleUploadImage = async (buildingId: any) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;
      setIsUploading(true);

      const imageUri = result.assets[0].uri;
      const response = await fetch(imageUri);
      const blob = await response.blob();

      const uploadUrl = await generateUploadUrl();
      const uploadResult = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": result.assets[0].mimeType || "image/jpeg" },
        body: blob,
      });

      const { storageId } = await uploadResult.json();
      
      if (user?.id) {
        await updateBuildingImage({
          clerkId: user.id,
          buildingId,
          storageId
        });
      }
      showToast("Floor plan uploaded successfully!");
    } catch (e) {
      console.log(e);
      showToast("Upload failed.", "error");
    } finally {
      setIsUploading(false);
    }
  };

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

  const needsSetup = !dashboardData.name || !dashboardData.phone;
  if (needsSetup || showSettings) {
    return (
      <View className="flex-1 bg-neutral-900 pt-16 px-6">
        <View className="flex-row justify-between items-center mb-8">
          <Text className="text-3xl font-extrabold text-white">
            {needsSetup ? "Admin Setup" : "Admin Settings"}
          </Text>
          {!needsSetup && (
            <TouchableOpacity onPress={() => setShowSettings(false)} className="bg-neutral-800 p-2 rounded-full">
              <Text className="text-white font-bold">✕</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text className="text-neutral-400 mb-6">
          {needsSetup 
            ? "Welcome to FireVision Admin! Please provide your emergency contact details before continuing." 
            : "Update your emergency contact information below."}
        </Text>

        <View className="bg-neutral-800 p-6 rounded-3xl border border-neutral-700">
          <Text className="text-white font-bold mb-2">Full Name</Text>
          <TextInput
            className="bg-neutral-900 border border-neutral-700 text-white p-4 rounded-xl mb-6"
            placeholder="John Doe"
            placeholderTextColor="#666"
            value={setupName || dashboardData.name || ""}
            onChangeText={setSetupName}
          />

          <Text className="text-white font-bold mb-2">Emergency Phone Number</Text>
          <TextInput
            className="bg-neutral-900 border border-neutral-700 text-white p-4 rounded-xl mb-8"
            placeholder="+1 234 567 8900"
            placeholderTextColor="#666"
            keyboardType="phone-pad"
            value={setupPhone || dashboardData.phone || ""}
            onChangeText={setSetupPhone}
          />

          <TouchableOpacity 
            className={`bg-red-600 py-4 rounded-xl items-center mb-6 ${isSavingSetup ? 'opacity-50' : ''}`}
            disabled={isSavingSetup || (!setupName && !dashboardData.name) || (!setupPhone && !dashboardData.phone)}
            onPress={async () => {
              setIsSavingSetup(true);
              try {
                await updateAdminProfile({
                  clerkId: user?.id || "",
                  name: setupName || dashboardData.name || "",
                  phone: setupPhone || dashboardData.phone || "",
                });
                setShowSettings(false);
              } catch(e) {
                showToast("Error saving profile", "error");
              } finally {
                setIsSavingSetup(false);
              }
            }}
          >
            {isSavingSetup ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold text-lg">Save Details</Text>}
          </TouchableOpacity>

          {!needsSetup && (
            <TouchableOpacity 
              className="bg-neutral-800 border border-neutral-700 py-4 rounded-xl items-center flex-row justify-center"
              onPress={async () => {
                try {
                  const passkey = await user?.createPasskey();
                  if (passkey) showToast("Passkey created successfully! You can now use FaceID/TouchID to sign in.");
                } catch (e: any) {
                  showToast(e.errors?.[0]?.longMessage || e.message || "Error creating passkey. Your device might not support it.");
                }
              }}
            >
              <Text className="text-2xl mr-2">🔑</Text>
              <Text className="text-white font-bold text-lg">Create Biometric Passkey</Text>
            </TouchableOpacity>
          )}
        </View>

        {needsSetup && (
          <TouchableOpacity className="mt-8 self-center" onPress={() => signOut()}>
            <Text className="text-neutral-500">Sign Out</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View className="flex-1 bg-neutral-900 pt-16">
      {/* Header */}
      <View className="px-6 flex-row justify-between items-center mb-6 w-full">
        <View className="flex-1 mr-4">
          <Text className="text-2xl font-extrabold text-white" numberOfLines={1} adjustsFontSizeToFit>Admin Console</Text>
          <Text className="text-red-400 font-bold text-xs mt-1" numberOfLines={1} ellipsizeMode="tail">{dashboardData.name || user?.primaryEmailAddress?.emailAddress}</Text>
        </View>
        <View className="flex-row items-center shrink-0">
          <TouchableOpacity 
            className="bg-neutral-800 p-3 rounded-full border border-neutral-700 mr-2"
            onPress={() => setShowSettings(true)}
          >
            <Text className="text-white">⚙️</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            className="bg-neutral-800 p-3 rounded-full border border-neutral-700"
            onPress={() => signOut()}
          >
            <Text className="text-white text-sm">Sign Out</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1 px-6">
        
        {/* Quick Actions */}
        <View className="flex-row space-x-4 mb-8">
          <TouchableOpacity className="flex-1 bg-red-600/20 border border-red-500/50 p-4 rounded-2xl items-center">
            <Text className="text-2xl mb-1">📢</Text>
            <Text className="text-red-400 font-bold text-center text-xs">Evacuate All</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            className="flex-1 bg-neutral-800 border border-neutral-700 p-4 rounded-2xl items-center"
            onPress={() => setIsRegistering(true)}
          >
            <Text className="text-2xl mb-1">🗺️</Text>
            <Text className="text-white font-bold text-center text-xs">Add Location</Text>
          </TouchableOpacity>
        </View>



        {/* Managed Buildings */}
        <Text className="text-xl font-bold text-white mb-4">Managed Buildings</Text>
        {dashboardData.buildings && dashboardData.buildings.length > 0 ? (
          dashboardData.buildings.map((building: any) => {
             const isComplete = building.polygon && building.polygon.length >= 4 && building.masterPlanId;
             return (
               <View key={building._id} className="bg-neutral-800 border border-neutral-700 p-4 rounded-2xl mb-4 flex-row justify-between items-center">
                  <View className="flex-1">
                    <View className="flex-row items-center mb-1">
                      <Text className="text-white font-bold text-lg mr-2">{building.name}</Text>
                      {isComplete ? (
                        <View className="bg-green-900/30 px-2 py-1 rounded-md border border-green-500/30">
                          <Text className="text-green-400 text-[10px] font-bold">🟢 ACTIVE</Text>
                        </View>
                      ) : (
                        <View className="bg-red-900/30 px-2 py-1 rounded-md border border-red-500/30">
                          <Text className="text-red-400 text-[10px] font-bold">🔴 INCOMPLETE</Text>
                        </View>
                      )}
                    </View>
                    <Text className="text-neutral-400 text-sm">{building.address}</Text>
                    {!isComplete && (
                      <Text className="text-red-400/80 text-xs mt-1">Missing Map or GPS Polygon</Text>
                    )}
                  </View>
                  <TouchableOpacity 
                    className="bg-blue-600 px-4 py-2 rounded-lg ml-4"
                    onPress={() => {
                      setSelectedBuilding(building);
                      setEditingPins(building.polygon || []);
                      setEditBName(building.name);
                      setEditBAddress(building.address === "No Address Provided" ? "" : building.address);
                    }}
                  >
                    <Text className="text-white font-bold">Manage</Text>
                </TouchableOpacity>
             </View>
             );
          })
        ) : (
          <View className="bg-neutral-800 border border-neutral-700 p-6 rounded-2xl items-center mb-8">
             <Text className="text-neutral-400 text-center">You have not registered any buildings yet.</Text>
             <TouchableOpacity 
               className="mt-4 bg-white/10 px-4 py-2 rounded-lg"
               onPress={() => setIsRegistering(true)}
             >
               <Text className="text-white font-bold">Register Building</Text>
             </TouchableOpacity>
          </View>
        )}
        
        <View className="h-10" />
      </ScrollView>

      {/* Register Building Modal */}
      <Modal visible={isRegistering} animationType="slide" presentationStyle="pageSheet">
        <ScrollView className="flex-1 bg-neutral-900 pt-12 px-6">
          <View className="flex-row justify-between items-center mb-6">
            <Text className="text-2xl font-extrabold text-white">New Building</Text>
            <TouchableOpacity onPress={() => setIsRegistering(false)} className="bg-neutral-800 p-2 rounded-full border border-neutral-700">
              <Text className="text-white font-bold">✕</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            className="bg-neutral-800 border border-neutral-700 rounded-xl p-4 text-white mb-4"
            placeholder="Building Name (e.g. Warehouse A)"
            placeholderTextColor="#525252"
            value={bName}
            onChangeText={setBName}
          />
          <TextInput
            className="bg-neutral-800 border border-neutral-700 rounded-xl p-4 text-white mb-4"
            placeholder="Address (Optional)"
            placeholderTextColor="#525252"
            value={bAddress}
            onChangeText={setBAddress}
          />

          <View className="flex-row items-center mb-2">
            <Text className="text-neutral-300 font-bold">Draw Footprint ({bPins.length} pins)</Text>
            <TouchableOpacity 
              className="bg-red-900/40 w-6 h-6 rounded-full items-center justify-center ml-2 border border-red-500/50"
              onPress={() => alert("Draw the pins sequentially around the outside wall of the building. Do not mix up the order or criss-cross the lines across the middle of the building. If the lines cross, the detection will fail.")}
            >
              <Text className="text-red-500 font-bold text-xs">?</Text>
            </TouchableOpacity>
          </View>
          <Text className="text-neutral-500 text-xs mb-4">Tap on the map to drop pins sequentially around the perimeter. Minimum 4 pins required.</Text>

          {hasSelfIntersection(bPins) && (
            <View className="bg-red-900/30 p-3 rounded-xl border border-red-500/50 mb-4 flex-row items-center">
              <Text className="text-red-500 mr-2">⚠️</Text>
              <Text className="text-red-400 text-xs flex-1 font-bold">Polygon lines are criss-crossing! Please clear and draw the perimeter sequentially.</Text>
            </View>
          )}

          {!bName ? (
            <View className="bg-neutral-800 rounded-2xl justify-center items-center p-6 border border-neutral-700 opacity-50" style={{ height: 300 }}>
              <Text className="text-2xl mb-2">📸</Text>
              <Text className="text-white font-bold text-center">Enter a Building Name first</Text>
              <Text className="text-neutral-400 text-center text-xs mt-2">The map drawing tools will unlock once you name the building above.</Text>
            </View>
          ) : (
            <View className="bg-neutral-800 rounded-2xl overflow-hidden mb-6 border border-neutral-700 relative" style={{ height: 300 }}>
              {Platform.OS === 'web' || !MapView ? (
              <View className="flex-1 justify-center items-center p-6">
                <Text className="text-white text-center mb-4">Interactive Maps are not supported in the Web Simulator.</Text>
                <Text className="text-neutral-400 text-center text-sm mb-4">Please open this Admin Console on a physical mobile device via Expo Go to use the Pin Drop feature.</Text>
                <View className="flex-row items-center bg-yellow-900/50 p-4 rounded-xl border border-yellow-700">
                  <Text className="text-yellow-500 font-bold mr-2">⚠️</Text>
                  <Text className="text-yellow-500 text-xs flex-1">Web Fallback: We will generate 4 fake pins for testing.</Text>
                </View>
                <TouchableOpacity 
                  className={`mt-6 px-6 py-3 rounded-xl ${bPins.length > 0 ? 'bg-green-600' : 'bg-blue-600'}`}
                  onPress={() => {
                    setBPins([
                      {lat: 51.472, lon: -2.124},
                      {lat: 51.472, lon: -2.123},
                      {lat: 51.471, lon: -2.123},
                      {lat: 51.471, lon: -2.124}
                    ]);
                    showToast("4 Test Pins Generated! You can now save the building.");
                  }}
                >
                  <Text className="text-white font-bold">{bPins.length > 0 ? "Test Polygon Generated!" : "Generate Test Polygon"}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <MapView 
                  style={{ flex: 1 }}
                  onPress={handleMapPress}
                  initialRegion={{
                    latitude: 51.4717,
                    longitude: -2.1239,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                  }}
                >
                  {bPins.map((pin, i) => (
                    <Marker key={i} coordinate={{ latitude: pin.lat, longitude: pin.lon }} />
                  ))}
                  {bPins.length > 2 && (
                    <Polygon 
                      coordinates={bPins.map(p => ({ latitude: p.lat, longitude: p.lon }))}
                      fillColor="rgba(255, 0, 0, 0.3)"
                      strokeColor="rgba(255, 0, 0, 0.8)"
                      strokeWidth={2}
                    />
                  )}
                </MapView>
                <TouchableOpacity 
                  className="absolute bottom-4 left-4 bg-neutral-900/80 p-3 rounded-full border border-neutral-700"
                  onPress={() => setBPins([])}
                >
                  <Text className="text-white text-xs font-bold">Clear Pins</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
          )}

          <Text className="text-neutral-300 font-bold mb-2">Master Plan Image</Text>
          <TouchableOpacity 
            className="bg-neutral-800 border border-neutral-700 rounded-xl p-4 items-center mb-6"
            onPress={async () => {
              const libPerm = await ImagePicker.requestMediaLibraryPermissionsAsync();
              if (libPerm.granted === false) {
                showToast("Library permission is required!", "error");
                return;
              }
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                quality: 0.8,
              });
              if (!result.canceled) {
                setBImageUri(result.assets[0].uri);
              }
            }}
          >
            {bImageUri ? (
              <View className="w-full relative">
                <Image source={{ uri: bImageUri }} className="w-full h-40 rounded-lg mb-2 bg-neutral-900" resizeMode="cover" />
                {Platform.OS === 'web' && (
                  <View className="absolute inset-0 items-center justify-center bg-black/60 rounded-lg pointer-events-none">
                    <Text className="text-4xl mb-2">✅</Text>
                    <Text className="text-white font-bold text-center">Image Selected</Text>
                    <Text className="text-white/70 text-xs text-center px-4 mt-1">(Web preview may appear blank, but the file is attached)</Text>
                  </View>
                )}
              </View>
            ) : (
              <View className="items-center py-6">
                <Text className="text-3xl mb-2">📸</Text>
                <Text className="text-white font-bold">Select Master Plan</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity 
            className={`py-4 rounded-xl items-center mb-8 ${bName && !hasSelfIntersection(bPins) ? 'bg-green-600' : 'bg-neutral-800'}`}
            onPress={handleSaveBuilding}
            disabled={!bName || hasSelfIntersection(bPins) || isUploading}
          >
            {isUploading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-bold text-lg">Save Building</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </Modal>

      {/* Manage Building Modal */}
      <Modal visible={!!selectedBuilding} animationType="slide" presentationStyle="pageSheet">
        {selectedBuilding && (
          <ScrollView className="flex-1 bg-neutral-900 pt-12 px-6">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-2xl font-extrabold text-white">Manage Building</Text>
                  <TouchableOpacity onPress={() => { setSelectedBuilding(null); setEditingPins(null); }} className="bg-neutral-800 p-2 rounded-full border border-neutral-700">
                <Text className="text-white font-bold">✕</Text>
              </TouchableOpacity>
            </View>

              <View className="bg-neutral-800 p-6 rounded-2xl border border-neutral-700 mb-6">
                <Text className="text-white font-bold mb-2">Building Name</Text>
                <TextInput
                  className="bg-neutral-900 border border-neutral-700 rounded-xl p-4 text-white mb-4"
                  value={editBName}
                  onChangeText={setEditBName}
                  placeholder="Building Name"
                  placeholderTextColor="#525252"
                />
                <Text className="text-white font-bold mb-2">Address (Optional)</Text>
                <TextInput
                  className="bg-neutral-900 border border-neutral-700 rounded-xl p-4 text-white mb-4"
                  value={editBAddress}
                  onChangeText={setEditBAddress}
                  placeholder="Address"
                  placeholderTextColor="#525252"
                />
                <TouchableOpacity 
                  className={`py-3 rounded-xl items-center ${editBName !== selectedBuilding.name || editBAddress !== selectedBuilding.address ? 'bg-blue-600' : 'bg-neutral-700'}`}
                  disabled={editBName === selectedBuilding.name && (editBAddress === selectedBuilding.address || (editBAddress === "" && selectedBuilding.address === "No Address Provided"))}
                  onPress={async () => {
                    try {
                      const finalAddress = editBAddress || "No Address Provided";
                      await updateBuildingInfo({
                        clerkId: user?.id || "",
                        buildingId: selectedBuilding._id,
                        name: editBName,
                        address: finalAddress,
                      });
                      setSelectedBuilding({...selectedBuilding, name: editBName, address: finalAddress});
                      showToast("Building details updated!");
                    } catch(e) {
                      showToast("Error updating building", "error");
                    }
                  }}
                >
                  <Text className="text-white font-bold">Save Details</Text>
                </TouchableOpacity>
              </View>

            <Text className="text-white font-bold text-lg mb-4">Polygon Footprint</Text>
            <View className="bg-neutral-800 rounded-2xl overflow-hidden mb-6 border border-neutral-700 relative" style={{ height: 300 }}>
              {Platform.OS === 'web' || !MapView ? (
                <View className="flex-1 justify-center items-center p-6">
                  <Text className="text-white text-center mb-4">Interactive Maps are not supported in the Web Simulator.</Text>
                  <Text className="text-neutral-400 text-center text-sm mb-4">Please open this Admin Console on a physical mobile device via Expo Go to view or edit the Polygon pins.</Text>
                  <View className="flex-row items-center bg-green-900/50 p-4 rounded-xl border border-green-700 mb-4">
                    <Text className="text-green-500 font-bold mr-2">✅</Text>
                    <Text className="text-green-500 text-xs flex-1">This building has {selectedBuilding.polygon?.length || 0} pins saved.</Text>
                  </View>
                  <TouchableOpacity 
                    className={`px-6 py-3 rounded-xl ${editingPins?.length > 0 ? 'bg-green-600' : 'bg-blue-600'}`}
                    onPress={() => {
                      setEditingPins([
                        {lat: 51.472, lon: -2.124},
                        {lat: 51.472, lon: -2.123},
                        {lat: 51.471, lon: -2.123},
                        {lat: 51.471, lon: -2.124}
                      ]);
                      showToast("4 Test Pins Generated! You can now update the building footprint.");
                    }}
                  >
                    <Text className="text-white font-bold">{editingPins?.length > 0 ? "Test Polygon Generated!" : "Generate Test Polygon"}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <MapView 
                    style={{ flex: 1 }}
                    onPress={(e: any) => {
                      if (e.nativeEvent.coordinate && editingPins) {
                        setEditingPins([...editingPins, { lat: e.nativeEvent.coordinate.latitude, lon: e.nativeEvent.coordinate.longitude }]);
                      }
                    }}
                    initialRegion={
                      selectedBuilding.polygon && selectedBuilding.polygon.length > 0
                        ? {
                            latitude: selectedBuilding.polygon[0].lat,
                            longitude: selectedBuilding.polygon[0].lon,
                            latitudeDelta: 0.005,
                            longitudeDelta: 0.005,
                          }
                        : {
                            latitude: 51.4717,
                            longitude: -2.1239,
                            latitudeDelta: 0.01,
                            longitudeDelta: 0.01,
                          }
                    }
                  >
                    {editingPins?.map((pin: any, i: number) => (
                      <Marker key={i} coordinate={{ latitude: pin.lat, longitude: pin.lon }} />
                    ))}
                    {editingPins && editingPins.length > 2 && (
                      <Polygon 
                        coordinates={editingPins.map((p: any) => ({ latitude: p.lat, longitude: p.lon }))}
                        fillColor="rgba(255, 0, 0, 0.3)"
                        strokeColor="rgba(255, 0, 0, 0.8)"
                        strokeWidth={2}
                      />
                    )}
                  </MapView>
                  <TouchableOpacity 
                    className="absolute bottom-4 left-4 bg-neutral-900/80 p-3 rounded-full border border-neutral-700"
                    onPress={() => setEditingPins([])}
                  >
                    <Text className="text-white text-xs font-bold">Clear Pins</Text>
                  </TouchableOpacity>
                  {editingPins && editingPins !== selectedBuilding.polygon && editingPins.length >= 4 && !hasSelfIntersection(editingPins) && (
                    <TouchableOpacity 
                      className="absolute bottom-4 right-4 bg-green-600 p-3 rounded-full"
                      onPress={async () => {
                        try {
                          await updateBuildingPolygon({
                            clerkId: user?.id || "",
                            buildingId: selectedBuilding._id,
                            polygon: editingPins
                          });
                          setSelectedBuilding({...selectedBuilding, polygon: editingPins});
                          showToast("Polygon updated successfully!");
                        } catch(e) {
                          showToast("Error saving polygon", "error");
                        }
                      }}
                    >
                      <Text className="text-white text-xs font-bold">Save New Polygon</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>

            <View className="flex-row items-center mb-2">
              <Text className="text-white font-bold text-lg">Manual Coordinate Editor</Text>
              <TouchableOpacity 
                className="bg-red-900/40 w-6 h-6 rounded-full items-center justify-center ml-2 border border-red-500/50"
                onPress={() => alert("Ensure the coordinates trace the perimeter sequentially. Mixing the order will cause lines to criss-cross and break the detection math.")}
              >
                <Text className="text-red-500 font-bold text-xs">?</Text>
              </TouchableOpacity>
            </View>
            <Text className="text-neutral-400 text-sm mb-4">You can manually fine-tune the exact GPS coordinates of your pins below. Useful for fixing inaccurate taps.</Text>
            
            {hasSelfIntersection(editingPins) && (
              <View className="bg-red-900/30 p-3 rounded-xl border border-red-500/50 mb-4 flex-row items-center">
                <Text className="text-red-500 mr-2">⚠️</Text>
                <Text className="text-red-400 text-xs flex-1 font-bold">Polygon lines are criss-crossing! Please adjust the coordinates so they trace sequentially without crossing.</Text>
              </View>
            )}

            <View className="bg-neutral-800 rounded-2xl p-4 border border-neutral-700 mb-6">
              <View className="flex-row items-center mb-3 px-1">
                <Text className="text-neutral-500 w-10 text-sm font-bold"></Text>
                <Text className="flex-1 text-neutral-400 text-sm font-bold ml-1">Latitude ↕️</Text>
                <Text className="flex-1 text-neutral-400 text-sm font-bold ml-1">Longitude ↔️</Text>
                <View className="w-10 ml-2" />
              </View>
              {editingPins?.map((p: any, i: number) => (
                <View key={i} className="flex-row items-center mb-3 w-full">
                  <Text className="text-neutral-500 w-10 text-sm font-bold">P{i+1}</Text>
                  
                  <View className="flex-1 mr-2">
                    <TextInput
                      style={{ minWidth: 0 }}
                      className="bg-neutral-900 border border-neutral-700 text-white p-3 rounded-lg text-sm w-full"
                    value={p.lat.toString()}
                    keyboardType="numeric"
                    onChangeText={(val) => {
                      const newPins = [...(editingPins || [])];
                      newPins[i].lat = parseFloat(val) || 0;
                      setEditingPins(newPins);
                    }}
                  />
                  </View>

                  <View className="flex-1">
                    <TextInput
                      style={{ minWidth: 0 }}
                      className="bg-neutral-900 border border-neutral-700 text-white p-3 rounded-lg text-sm w-full"
                    value={p.lon.toString()}
                    keyboardType="numeric"
                    onChangeText={(val) => {
                      const newPins = [...(editingPins || [])];
                      newPins[i].lon = parseFloat(val) || 0;
                      setEditingPins(newPins);
                    }}
                  />
                  </View>

                  <TouchableOpacity 
                    className="ml-2 bg-red-900/50 p-2 rounded-lg"
                    onPress={() => {
                      const newPins = editingPins.filter((_, index) => index !== i);
                      setEditingPins(newPins);
                    }}
                  >
                    <Text className="text-red-500 font-bold">✕</Text>
                  </TouchableOpacity>
                </View>
              ))}

              <View className="flex-row justify-between mt-4">
                <TouchableOpacity 
                  className="bg-neutral-700 px-4 py-2 rounded-lg"
                  onPress={() => {
                    const newPins = [...(editingPins || []), {lat: 0, lon: 0}];
                    setEditingPins(newPins);
                  }}
                >
                  <Text className="text-white font-bold text-sm">+ Add Pin</Text>
                </TouchableOpacity>

                {editingPins && editingPins !== selectedBuilding.polygon && editingPins.length >= 4 && !hasSelfIntersection(editingPins) && (
                  <TouchableOpacity 
                    className="bg-green-600 px-6 py-3 rounded-lg"
                    onPress={async () => {
                      try {
                        await updateBuildingPolygon({
                          clerkId: user?.id || "",
                          buildingId: selectedBuilding._id,
                          polygon: editingPins
                        });
                        setSelectedBuilding({...selectedBuilding, polygon: editingPins});
                        showToast("Coordinates manually updated successfully!");
                      } catch(e) {
                        showToast("Error saving polygon", "error");
                      }
                    }}
                  >
                    <Text className="text-white font-bold text-sm">Save Changes</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <Text className="text-white font-bold text-lg mb-4">Master Floor Plan</Text>
            {selectedBuilding.masterPlanUrl ? (
              <View className="bg-neutral-800 border border-neutral-700 p-4 rounded-2xl items-center mb-6">
                <Image 
                  source={{ uri: selectedBuilding.masterPlanUrl }} 
                  className="w-full h-48 rounded-xl mb-4" 
                  resizeMode="contain"
                />
                <Text className="text-green-400 font-bold text-lg mb-1">✓ Floor Plan Active</Text>
                <Text className="text-neutral-400 text-xs text-center mb-4">This map will be pushed to Guests entering the footprint.</Text>
                
                <TouchableOpacity 
                  className="bg-neutral-700 border border-neutral-600 px-6 py-3 rounded-xl flex-row items-center w-full justify-center"
                  onPress={() => handleUploadImage(selectedBuilding._id)}
                  disabled={isUploading}
                >
                  {isUploading ? <ActivityIndicator color="white" className="mr-2" /> : <Text className="mr-2">🔄</Text>}
                  <Text className="text-white font-bold">{isUploading ? "Uploading..." : "Replace Floor Plan"}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View className="bg-neutral-800 border border-neutral-700 p-6 rounded-2xl items-center mb-6">
                <Text className="text-neutral-400 text-center mb-4">No floor plan image uploaded yet. Guests will not see a map.</Text>
                <TouchableOpacity 
                  className="bg-amber-600 px-6 py-3 rounded-xl flex-row items-center"
                  onPress={() => handleUploadImage(selectedBuilding._id)}
                  disabled={isUploading}
                >
                  {isUploading ? <ActivityIndicator color="white" className="mr-2" /> : <Text className="mr-2">📸</Text>}
                  <Text className="text-white font-bold">{isUploading ? "Uploading..." : "Upload Floor Plan"}</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity 
              className="bg-red-900/30 border border-red-700 py-4 rounded-xl items-center mb-12"
              onPress={() => setShowDeleteConfirm(true)}
            >
              <Text className="text-red-400 font-bold">Delete Building</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </Modal>
      {/* Delete Confirmation Modal */}
      <Modal visible={showDeleteConfirm} animationType="fade" transparent>
        <View className="flex-1 bg-black/80 justify-center items-center px-6">
          <View className="bg-neutral-900 border border-neutral-700 p-6 rounded-3xl w-full max-w-sm">
            <Text className="text-xl font-bold text-white mb-2">Delete Building</Text>
            <Text className="text-neutral-400 mb-6">Are you sure you want to delete {selectedBuilding?.name}? This action cannot be undone and will permanently remove all associated maps and layouts.</Text>
            
            <View className="flex-row space-x-4">
              <TouchableOpacity 
                className="flex-1 bg-neutral-800 py-4 rounded-xl items-center border border-neutral-700 mr-2"
                onPress={() => setShowDeleteConfirm(false)}
              >
                <Text className="text-white font-bold">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                className="flex-1 bg-red-600 py-4 rounded-xl items-center border border-red-500"
                onPress={async () => {
                  try {
                    await deleteBuilding({ clerkId: user?.id || "", buildingId: selectedBuilding._id });
                    setShowDeleteConfirm(false);
                    setSelectedBuilding(null);
                    showToast("Building deleted successfully");
                  } catch (e) {
                    setShowDeleteConfirm(false);
                    showToast("Failed to delete building", "error");
                  }
                }}
              >
                <Text className="text-white font-bold text-lg">Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}
