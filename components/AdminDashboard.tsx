import { showToast } from "./Toast";
import React from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Modal, TextInput, Platform, Image } from "react-native";
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

export default function AdminDashboard() {
  const { signOut } = useAuth();
  const { user } = useUser();
  const dashboardData = useQuery(api.portal.getDashboardData, { clerkId: user?.id });
  const saveBuilding = useMutation(api.portal.saveBuilding);
  const generateUploadUrl = useMutation(api.portal.generateUploadUrl);
  const updateBuildingImage = useMutation(api.portal.updateBuildingImage);
  const updateBuildingPolygon = useMutation(api.portal.updateBuildingPolygon);

  const [isRegistering, setIsRegistering] = React.useState(false);
  const [selectedBuilding, setSelectedBuilding] = React.useState<any>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [editingPins, setEditingPins] = React.useState<{lat: number, lon: number}[] | null>(null);

  const [bName, setBName] = React.useState("");
  const [bAddress, setBAddress] = React.useState("");
  const [bPins, setBPins] = React.useState<{lat: number, lon: number}[]>([]);

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
    if (bPins.length < 4) {
      showToast("Please drop at least 4 pins to create a polygon footprint.");
      return;
    }
    if (!bName || !user?.id) return;

    try {
      await saveBuilding({
        clerkId: user.id,
        name: bName,
        address: bAddress || "No Address Provided",
        latitude: bPins[0].lat,
        longitude: bPins[0].lon,
        polygon: bPins,
      });
      setIsRegistering(false);
      setBName("");
      setBAddress("");
      setBPins([]);
      showToast("Building registered successfully!");
    } catch (e) {
      console.log(e);
      showToast("Error saving building.", "error");
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
      <View className="px-6 flex-row justify-between items-center mb-6">
        <View>
          <Text className="text-3xl font-extrabold text-white">Admin Console</Text>
          <Text className="text-red-400 font-bold">{dashboardData.name || user?.primaryEmailAddress?.emailAddress}</Text>
        </View>
        <View className="flex-row items-center">
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
          dashboardData.buildings.map((building: any) => (
             <View key={building._id} className="bg-neutral-800 border border-neutral-700 p-4 rounded-2xl mb-4 flex-row justify-between items-center">
                <View className="flex-1">
                  <Text className="text-white font-bold text-lg">{building.name}</Text>
                  <Text className="text-neutral-400 text-sm mt-1">{building.address}</Text>
                </View>
                <TouchableOpacity 
                  className="bg-blue-600 px-4 py-2 rounded-lg ml-4"
                  onPress={() => {
                    setSelectedBuilding(building);
                    setEditingPins(building.polygon || []);
                  }}
                >
                  <Text className="text-white font-bold">Manage</Text>
                </TouchableOpacity>
             </View>
          ))
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
        <View className="flex-1 bg-neutral-900 pt-12 px-6">
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

          <Text className="text-neutral-300 font-bold mb-2">Draw Footprint ({bPins.length} pins)</Text>
          <Text className="text-neutral-500 text-xs mb-4">Tap on the map to drop pins around the perimeter of the building. Minimum 4 pins required.</Text>

          {!bName ? (
            <View className="flex-1 bg-neutral-800 rounded-2xl justify-center items-center p-6 border border-neutral-700 opacity-50">
              <Text className="text-2xl mb-2">🔒</Text>
              <Text className="text-white font-bold text-center">Enter a Building Name first</Text>
              <Text className="text-neutral-400 text-center text-xs mt-2">The map drawing tools will unlock once you name the building above.</Text>
            </View>
          ) : (
            <View className="flex-1 bg-neutral-800 rounded-2xl overflow-hidden mb-6 border border-neutral-700 relative">
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

          <TouchableOpacity 
            className={`py-4 rounded-xl items-center mb-8 ${bPins.length >= 4 && bName ? 'bg-green-600' : 'bg-neutral-800'}`}
            onPress={handleSaveBuilding}
            disabled={bPins.length < 4 || !bName}
          >
            <Text className="text-white font-bold text-lg">Save Building Footprint</Text>
          </TouchableOpacity>
        </View>
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
              <Text className="text-white text-xl font-bold mb-1">{selectedBuilding.name}</Text>
              <Text className="text-neutral-400">{selectedBuilding.address}</Text>
            </View>

            <Text className="text-white font-bold text-lg mb-4">Polygon Footprint</Text>
            <View className="bg-neutral-800 rounded-2xl overflow-hidden mb-6 border border-neutral-700 relative" style={{ height: 300 }}>
              {Platform.OS === 'web' || !MapView ? (
                <View className="flex-1 justify-center items-center p-6">
                  <Text className="text-white text-center mb-4">Interactive Maps are not supported in the Web Simulator.</Text>
                  <Text className="text-neutral-400 text-center text-sm mb-4">Please open this Admin Console on a physical mobile device via Expo Go to view or edit the Polygon pins.</Text>
                  <View className="flex-row items-center bg-green-900/50 p-4 rounded-xl border border-green-700">
                    <Text className="text-green-500 font-bold mr-2">✓</Text>
                    <Text className="text-green-500 text-xs flex-1">This building has {selectedBuilding.polygon?.length || 0} pins saved.</Text>
                  </View>
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
                  {editingPins && editingPins !== selectedBuilding.polygon && editingPins.length >= 4 && (
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

            <Text className="text-white font-bold text-lg mb-2">Manual Coordinate Editor</Text>
            <Text className="text-neutral-400 text-xs mb-4">You can manually fine-tune the exact GPS coordinates of your pins below. Useful for fixing inaccurate taps.</Text>
            
            <View className="bg-neutral-800 rounded-2xl p-4 border border-neutral-700 mb-6">
              {editingPins?.map((p: any, i: number) => (
                <View key={i} className="flex-row items-center mb-3">
                  <Text className="text-neutral-500 w-8 text-xs font-bold">P{i+1}</Text>
                  <TextInput
                    className="flex-1 bg-neutral-900 border border-neutral-700 text-white p-2 rounded-lg mr-2 text-xs"
                    value={p.lat.toString()}
                    keyboardType="numeric"
                    onChangeText={(val) => {
                      const newPins = [...(editingPins || [])];
                      newPins[i].lat = parseFloat(val) || 0;
                      setEditingPins(newPins);
                    }}
                  />
                  <TextInput
                    className="flex-1 bg-neutral-900 border border-neutral-700 text-white p-2 rounded-lg text-xs"
                    value={p.lon.toString()}
                    keyboardType="numeric"
                    onChangeText={(val) => {
                      const newPins = [...(editingPins || [])];
                      newPins[i].lon = parseFloat(val) || 0;
                      setEditingPins(newPins);
                    }}
                  />
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
                  <Text className="text-white font-bold text-xs">+ Add Pin</Text>
                </TouchableOpacity>

                {editingPins && editingPins !== selectedBuilding.polygon && editingPins.length >= 4 && (
                  <TouchableOpacity 
                    className="bg-green-600 px-6 py-2 rounded-lg"
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
                    <Text className="text-white font-bold text-xs">Save Changes</Text>
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

            <TouchableOpacity className="bg-red-900/30 border border-red-700 py-4 rounded-xl items-center mb-12">
              <Text className="text-red-400 font-bold">Delete Building</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </Modal>
    </View>
  );
}
