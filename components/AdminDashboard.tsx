import { showToast } from "./Toast";
import React from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Modal, TextInput, Platform, Image, Alert, useWindowDimensions } from "react-native";
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
  const { width } = useWindowDimensions();
  const { signOut } = useAuth();
  const { user } = useUser();
  const dashboardData = useQuery(api.portal.getDashboardData, { clerkId: user?.id });
  const saveBuilding = useMutation(api.portal.saveBuilding);
  const generateUploadUrl = useMutation(api.portal.generateUploadUrl);
  const updateBuildingImage = useMutation(api.portal.updateBuildingImage);
  const updateBuildingPolygon = useMutation(api.portal.updateBuildingPolygon);
  const updateBuildingInfo = useMutation(api.portal.updateBuildingInfo);
  const updateBuildingCalibration = useMutation(api.portal.updateBuildingCalibration);
  const updateBuildingSafeNodes = useMutation(api.portal.updateBuildingSafeNodes);
  const deleteBuilding = useMutation(api.portal.deleteBuilding);
  const triggerIncident = useMutation(api.portal.triggerIncident);
  const triggerSiteIncident = useMutation(api.portal.triggerSiteIncident);
  const resolveIncident = useMutation(api.portal.resolveIncident);
  const resolveSiteIncident = useMutation(api.portal.resolveSiteIncident);
  const activeIncidents = useQuery(api.portal.getActiveIncidents, { clerkId: user?.id }) || [];

  const [isRegistering, setIsRegistering] = React.useState(false);
  const [selectedBuilding, setSelectedBuilding] = React.useState<any>(null);
  
  const [isMapEditorOpen, setIsMapEditorOpen] = React.useState(false);
  const [mapEditorStep, setMapEditorStep] = React.useState<1 | 2>(1); // 1 = Calibration, 2 = Safe Routes
  const [routeNodeType, setRouteNodeType] = React.useState<"turn" | "exit">("exit");
  
  const [activeCalibIdx, setActiveCalibIdx] = React.useState(0);
  const [calibPoints, setCalibPoints] = React.useState<{x: number, y: number}[]>([]);
  const [routingNodes, setRoutingNodes] = React.useState<{lat: number, lon: number, isExit: boolean}[]>([]);
  const [activeRouteIdx, setActiveRouteIdx] = React.useState<number | null>(null);
  const [imgLayout, setImgLayout] = React.useState<{w: number, h: number}>({w: 1, h: 1});
  const [imageAspectRatio, setImageAspectRatio] = React.useState<number | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [editingPins, setEditingPins] = React.useState<{lat: number, lon: number, label?: string}[] | null>(null);
  const [editBName, setEditBName] = React.useState("");
  const [editBSite, setEditBSite] = React.useState("");
  const [editBAddress, setEditBAddress] = React.useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);

  const [manageSiteName, setManageSiteName] = React.useState<string | null>(null);
  const [siteDesc, setSiteDesc] = React.useState("");
  const [siteAdminName, setSiteAdminName] = React.useState("");
  const [sitePhone, setSitePhone] = React.useState("");
  const [siteEmergencyPhone, setSiteEmergencyPhone] = React.useState("");
  const [siteImageUri, setSiteImageUri] = React.useState<string | null>(null);
  const updateSiteInfo = useMutation(api.portal.updateSiteInfo);

  const [bName, setBName] = React.useState("");
  const [bSite, setBSite] = React.useState("");
  const [bAddress, setBAddress] = React.useState("");
  const [bPins, setBPins] = React.useState<{lat: number, lon: number, label?: string}[]>([]);
  const [bImageUri, setBImageUri] = React.useState<string | null>(null);

  const [showSettings, setShowSettings] = React.useState(false);
  const [setupName, setSetupName] = React.useState("");
  const [setupPhone, setSetupPhone] = React.useState("");
  const [isSavingSetup, setIsSavingSetup] = React.useState(false);
  const updateAdminProfile = useMutation(api.users.updateAdminProfile);

  const confirmAction = (title: string, message: string, onConfirm: () => void, isDestructive = false) => {
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${message}`)) {
        onConfirm();
      }
    } else {
      Alert.alert(title, message, [
        { text: "Cancel", style: "cancel" },
        { text: "Confirm", style: isDestructive ? "destructive" : "default", onPress: onConfirm }
      ]);
    }
  };

  // Keep selectedBuilding in sync with database updates (like image uploads)
  React.useEffect(() => {
    if (selectedBuilding && dashboardData?.buildings) {
      const updated = dashboardData.buildings.find((b: any) => b._id === selectedBuilding._id);
      if (updated && (
          updated.masterPlanUrl !== selectedBuilding.masterPlanUrl || 
          updated.imageCalibrationPoints?.length !== selectedBuilding.imageCalibrationPoints?.length ||
          updated.safeNodes?.length !== selectedBuilding.safeNodes?.length
      )) {
        setSelectedBuilding(updated);
      }
    }
  }, [dashboardData, selectedBuilding]);

  const mapImageToGPS = (x: number, y: number) => {
    if (!selectedBuilding?.polygon || selectedBuilding.polygon.length < 4) return {lat: 0, lon: 0};
    
    let u = x / imgLayout.w;
    let v = y / imgLayout.h;

    const calib = selectedBuilding.imageCalibrationPoints;
    if (calib && calib.length >= 4) {
      const minCX = Math.min(...calib.map((c:any)=>c.x));
      const maxCX = Math.max(...calib.map((c:any)=>c.x));
      const minCY = Math.min(...calib.map((c:any)=>c.y));
      const maxCY = Math.max(...calib.map((c:any)=>c.y));
      
      u = (x - minCX) / (maxCX - minCX);
      v = (y - minCY) / (maxCY - minCY);
    }

    const poly = selectedBuilding.polygon;
    const minLat = Math.min(...poly.map((p:any)=>p.lat));
    const maxLat = Math.max(...poly.map((p:any)=>p.lat));
    const minLon = Math.min(...poly.map((p:any)=>p.lon));
    const maxLon = Math.max(...poly.map((p:any)=>p.lon));

    const lat = maxLat - v * (maxLat - minLat);
    const lon = minLon + u * (maxLon - minLon);
    return { lat, lon };
  };

  const handleMapPress = (e: any) => {
    if (e.nativeEvent.coordinate) {
      const defaultLabels = ["Top Left", "Bottom Left", "Bottom Right", "Top Right"];
      const label = bPins.length < 4 ? defaultLabels[bPins.length] : `P${bPins.length + 1}`;
      setBPins([...bPins, { lat: e.nativeEvent.coordinate.latitude, lon: e.nativeEvent.coordinate.longitude, label }]);
    }
  };

  const handleSaveBuilding = async () => {
    if (bPins.length > 0 && bPins.length < 3) {
      showToast("Please drop at least 3 pins to create a polygon footprint, or leave it empty to configure later.");
      return;
    }
    if (!bName || !user?.id) return;

    try {
      setIsUploading(true);
      let storageId: any = undefined;
      
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
        ...(bSite ? { siteName: bSite } : {}),
        address: bAddress || "No Address Provided",
        ...(bPins.length >= 3 && { 
          latitude: bPins[0].lat, 
          longitude: bPins[0].lon, 
          polygon: bPins 
        }),
        ...(storageId && { masterPlanId: storageId }),
      });
      
      setIsRegistering(false);
      setBName("");
      setBSite("");
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
          <TouchableOpacity 
            className="flex-1 bg-neutral-800 border border-neutral-700 p-4 rounded-2xl items-center"
            onPress={() => setIsRegistering(true)}
          >
            <Text className="text-2xl mb-1">🗺️</Text>
            <Text className="text-white font-bold text-center text-xs">Add Location</Text>
          </TouchableOpacity>
        </View>

        {(() => {
          if (!dashboardData.buildings || dashboardData.buildings.length === 0) {
            return (
              <View className="bg-neutral-800 border border-neutral-700 p-6 rounded-2xl items-center mb-8">
                <Text className="text-neutral-400 text-center">You have not registered any buildings yet.</Text>
                <TouchableOpacity className="mt-4 bg-white/10 px-4 py-2 rounded-lg" onPress={() => setIsRegistering(true)}>
                  <Text className="text-white font-bold">Register Building</Text>
                </TouchableOpacity>
              </View>
            );
          }

          const sites: { [key: string]: any[] } = {};
          const independent: any[] = [];
          dashboardData.buildings.forEach((b: any) => {
            if (b.siteName && b.siteName.trim().length > 0) {
              if (!sites[b.siteName]) sites[b.siteName] = [];
              sites[b.siteName].push(b);
            } else {
              independent.push(b);
            }
          });

          const renderBuilding = (building: any) => {
            const isComplete = building.polygon && building.polygon.length >= 3 && 
                               building.masterPlanId && 
                               building.imageCalibrationPoints && building.imageCalibrationPoints.length >= 3 &&
                               building.safeNodes && building.safeNodes.some((n: any) => n.isExit);
            const isAlarming = activeIncidents.includes(building._id);

            return (
              <View key={building._id} className={`bg-neutral-800 border ${isAlarming ? 'border-red-500 shadow-[0_0_15px_rgba(220,38,38,0.5)]' : 'border-neutral-700'} p-4 rounded-2xl mb-4`}>
                <View className="flex-row justify-between items-center mb-3">
                  <View className="flex-1 pr-2">
                    <Text className="text-white font-bold text-lg mb-1">{building.name}</Text>
                    {(!building.address || building.address === "No Address Provided") ? (
                      <View className="bg-amber-900/30 p-2 rounded-md mb-2 border border-amber-500/30 self-start">
                        <Text className="text-amber-500 text-xs font-bold">⚠️ Missing Address</Text>
                      </View>
                    ) : (
                      <Text className="text-neutral-400 text-sm mb-2">{building.address}</Text>
                    )}
                    <View className="flex-row items-start">
                      {isComplete ? (
                        <View className="bg-green-900/30 px-2 py-1 rounded-md border border-green-500/30 self-start">
                          <Text className="text-green-400 text-[10px] font-bold">🟢 ACTIVE</Text>
                        </View>
                      ) : (
                        <View className="bg-red-900/30 px-2 py-1 rounded-md border border-red-500/30 self-start">
                          <Text className="text-red-400 text-[10px] font-bold">🔴 INCOMPLETE: Missing Setup</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <TouchableOpacity 
                    className="bg-blue-600 px-4 py-2 rounded-lg ml-4"
                    onPress={() => {
                      const defaultLabels = ["Top Left", "Bottom Left", "Bottom Right", "Top Right"];
                      const populatedPolygon = (building.polygon || []).map((p: any, i: number) => ({
                        ...p,
                        label: p.label || (i < 4 ? defaultLabels[i] : `P${i+1}`)
                      }));
                      setSelectedBuilding({ ...building, polygon: populatedPolygon });
                      setEditingPins(populatedPolygon);
                      setEditBName(building.name);
                      setEditBSite(building.siteName || "");
                      setEditBAddress(building.address === "No Address Provided" ? "" : building.address);
                    }}
                  >
                    <Text className="text-white font-bold">Manage</Text>
                  </TouchableOpacity>
                </View>

                {isComplete && (
                  <View className="border-t border-neutral-700 pt-3 mt-1">
                    {isAlarming ? (
                      <TouchableOpacity 
                        className="bg-green-600 w-full py-3 rounded-lg flex-row items-center justify-center"
                        onPress={() => confirmAction("Resolve Evacuation", `Are you sure you want to end the evacuation for ${building.name}?`, () => resolveIncident({ clerkId: user?.id || "", buildingId: building._id }))}
                      >
                        <Text className="text-white font-bold text-center">✅ Resolve Evacuation</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity 
                        className="bg-red-600 w-full py-3 rounded-lg flex-row items-center justify-center border border-red-500"
                        onPress={() => confirmAction("Trigger Evacuation", `Are you sure you want to trigger the evacuation for ${building.name}? This will alert all guests.`, () => triggerIncident({ clerkId: user?.id || "", buildingId: building._id }), true)}
                      >
                        <Text className="text-white font-bold text-center">🚨 Evacuate Building</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            );
          };

          return (
            <View>
              {Object.keys(sites).map(siteName => {
                const siteBuildings = sites[siteName];
                const activeCount = siteBuildings.filter(b => activeIncidents.includes(b._id)).length;
                const activeInSite = activeCount > 0;
                const allInSiteActive = activeCount === siteBuildings.length;
                const siteDetail = dashboardData?.sites?.find((s: any) => s.name === siteName);
                
                return (
                  <View key={siteName} className="mb-10 bg-neutral-800/40 border border-neutral-700/60 rounded-[32px] overflow-hidden shadow-lg -mx-2">
                    <View className="flex-row justify-between items-center bg-neutral-800/60 p-5 border-b border-neutral-700/50">
                      <View className="flex-row items-center">
                        <Text className="text-2xl font-black text-white tracking-wide mr-3">{siteName}</Text>
                        <TouchableOpacity 
                          className="bg-neutral-700/50 p-2 rounded-full"
                          onPress={() => {
                            setManageSiteName(siteName);
                            setSiteDesc(siteDetail?.description || "");
                            setSiteAdminName(siteDetail?.adminContactName || "");
                            setSitePhone(siteDetail?.contactPhone || "");
                            setSiteEmergencyPhone(siteDetail?.emergencyServicesPhone || "");
                          }}
                        >
                          <Text className="text-lg">⚙️</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    
                    {(!siteDetail || !siteDetail.description || !siteDetail.contactPhone) && (
                      <View className="bg-amber-900/40 p-4 border-b border-neutral-700/50 flex-row items-center">
                        <Text className="text-amber-500 text-xl mr-3">⚠️</Text>
                        <View className="flex-1">
                          <Text className="text-amber-500 font-bold mb-1">Missing Site Details</Text>
                          <Text className="text-amber-400/80 text-xs">Tap the ⚙️ icon to configure the fire service info for this site.</Text>
                        </View>
                      </View>
                    )}

                    <View className="p-4 pt-6">
                      {siteBuildings.map(b => renderBuilding(b))}
                    </View>
                    
                    {/* Separated Evacuate Footer */}
                    {siteBuildings.length > 0 && (
                      <View className="bg-neutral-800/80 p-5 border-t border-neutral-700/50">
                        {allInSiteActive ? (
                          <TouchableOpacity 
                            className="bg-green-600 w-full py-4 rounded-xl shadow-sm items-center justify-center" 
                            onPress={() => confirmAction("Resolve Site", `Are you sure you want to end the evacuation for all buildings in ${siteName}?`, () => resolveSiteIncident({ clerkId: user?.id || "", siteName }))}
                          >
                            <Text className="text-white text-base font-bold text-center">✅ Resolve Entire Site</Text>
                          </TouchableOpacity>
                        ) : activeInSite ? (
                          <TouchableOpacity 
                            className="bg-amber-500 w-full py-4 rounded-xl shadow-sm items-center justify-center" 
                            onPress={() => confirmAction("Evacuate Rest of Site", `Some buildings are already evacuating. Trigger alarms for the remaining buildings in ${siteName}?`, () => triggerSiteIncident({ clerkId: user?.id || "", siteName }), true)}
                          >
                            <Text className="text-white text-base font-bold text-center">⚠️ Partial Evac in Progress{'\n'}Evacuate Rest of Site</Text>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity 
                            className="bg-red-600 w-full py-4 rounded-xl shadow-sm items-center justify-center" 
                            onPress={() => confirmAction("Evacuate Site", `Are you sure you want to trigger a mass evacuation for ALL buildings in ${siteName}?`, () => triggerSiteIncident({ clerkId: user?.id || "", siteName }), true)}
                          >
                            <Text className="text-white text-base font-bold text-center">🚨 Evacuate Entire Site</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}

              {independent.length > 0 && (
                <View className="mb-10 bg-neutral-900 border border-neutral-800 rounded-[32px] p-5 shadow-lg -mx-2">
                  <Text className="text-xl font-bold text-white mb-5 border-b border-neutral-800 pb-3 px-1">Independent Buildings</Text>
                  {independent.map(b => renderBuilding(b))}
                </View>
              )}
            </View>
          );
        })()}
        
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
            placeholder="Site Name (Optional) - e.g. North Campus"
            placeholderTextColor="#525252"
            value={bSite}
            onChangeText={setBSite}
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
                      {lat: 51.472, lon: -2.124, label: "Top Left"},
                      {lat: 51.471, lon: -2.124, label: "Bottom Left"},
                      {lat: 51.471, lon: -2.123, label: "Bottom Right"},
                      {lat: 51.472, lon: -2.123, label: "Top Right"}
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
                  <View className="absolute inset-0 items-center justify-center bg-black/60 rounded-lg" style={{ pointerEvents: 'none' }}>
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
            
            {(() => {
              const isActive = selectedBuilding.polygon && selectedBuilding.polygon.length >= 3 && 
                               selectedBuilding.masterPlanId && 
                               selectedBuilding.imageCalibrationPoints && selectedBuilding.imageCalibrationPoints.length >= 3 &&
                               selectedBuilding.safeNodes && selectedBuilding.safeNodes.some((n: any) => n.isExit);
              if (!isActive) {
                return (
                  <View className="bg-red-900/30 p-4 rounded-xl border border-red-500/50 mb-6 flex-row items-center">
                    <Text className="text-red-500 mr-3 text-2xl">⚠️</Text>
                    <View className="flex-1">
                      <Text className="text-red-500 font-bold mb-1">Building Not Active</Text>
                      <Text className="text-red-400 text-xs">This building will not be pushed to guests until the Polygon, Master Plan, Calibration, and Safe Routes are fully set.</Text>
                    </View>
                  </View>
                )
              } else {
                return (
                  <View className="bg-green-900/30 p-4 rounded-xl border border-green-700/50 mb-6 flex-row items-center">
                    <Text className="text-green-500 mr-3 text-2xl">✅</Text>
                    <View className="flex-1">
                      <Text className="text-green-500 font-bold mb-1">Building is Active</Text>
                      <Text className="text-green-400 text-xs">This building is fully configured and is actively being pushed to guests.</Text>
                    </View>
                  </View>
                )
              }
            })()}

              <View className="bg-neutral-800 p-6 rounded-2xl border border-neutral-700 mb-6">
                <Text className="text-white font-bold mb-2">Building Name</Text>
                <TextInput
                  className="bg-neutral-900 border border-neutral-700 rounded-xl p-4 text-white mb-4"
                  value={editBName}
                  onChangeText={setEditBName}
                  placeholder="Building Name"
                  placeholderTextColor="#525252"
                />
                <Text className="text-white font-bold mb-2">Site Name (Optional)</Text>
                <TextInput
                  className="bg-neutral-900 border border-neutral-700 rounded-xl p-4 text-white mb-4"
                  value={editBSite}
                  onChangeText={setEditBSite}
                  placeholder="Site Name"
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
                  className={`py-3 rounded-xl items-center ${editBName !== selectedBuilding.name || editBSite !== (selectedBuilding.siteName || "") || editBAddress !== selectedBuilding.address ? 'bg-blue-600' : 'bg-neutral-700'}`}
                  disabled={editBName === selectedBuilding.name && editBSite === (selectedBuilding.siteName || "") && (editBAddress === selectedBuilding.address || (editBAddress === "" && selectedBuilding.address === "No Address Provided"))}
                  onPress={async () => {
                    try {
                      const finalAddress = editBAddress || "No Address Provided";
                      await updateBuildingInfo({
                        clerkId: user?.id || "",
                        buildingId: selectedBuilding._id,
                        name: editBName,
                        ...(editBSite ? { siteName: editBSite } : { siteName: "" }),
                        address: finalAddress,
                      });
                      setSelectedBuilding({...selectedBuilding, name: editBName, siteName: editBSite, address: finalAddress});
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
                    className={`px-6 py-3 rounded-xl ${editingPins && editingPins.length > 0 ? 'bg-green-600' : 'bg-blue-600'}`}
                    onPress={() => {
                      setEditingPins([
                        {lat: 51.472, lon: -2.124, label: "Top Left"},
                        {lat: 51.471, lon: -2.124, label: "Bottom Left"},
                        {lat: 51.471, lon: -2.123, label: "Bottom Right"},
                        {lat: 51.472, lon: -2.123, label: "Top Right"}
                      ]);
                      showToast("4 Test Pins Generated! You can now update the building footprint.");
                    }}
                  >
                    <Text className="text-white font-bold">{editingPins && editingPins.length > 0 ? "Test Polygon Generated!" : "Generate Test Polygon"}</Text>
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
            
            {editingPins && hasSelfIntersection(editingPins) && (
              <View className="bg-red-900/30 p-3 rounded-xl border border-red-500/50 mb-4 flex-row items-center">
                <Text className="text-red-500 mr-2">⚠️</Text>
                <Text className="text-red-400 text-xs flex-1 font-bold">Polygon lines are criss-crossing! Please adjust the coordinates so they trace sequentially without crossing.</Text>
              </View>
            )}

            <View className="bg-neutral-800 rounded-2xl p-4 border border-neutral-700 mb-6">
              <View className="flex-row items-center mb-3 px-1">
                <Text className="flex-1 text-neutral-400 text-sm font-bold ml-1">Label</Text>
                <Text className="flex-1 text-neutral-400 text-sm font-bold ml-1">Latitude ↕️</Text>
                <Text className="flex-1 text-neutral-400 text-sm font-bold ml-1">Longitude ↔️</Text>
                <View className="w-10 ml-2" />
              </View>
              {editingPins?.map((p: any, i: number) => (
                <View key={i} className="flex-row items-center mb-3 w-full">
                  <View className="flex-1 mr-2">
                    <TextInput
                      style={{ minWidth: 0 }}
                      className="bg-neutral-900 border border-neutral-700 text-white p-3 rounded-lg text-sm w-full"
                      value={p.label !== undefined ? p.label : `P${i+1}`}
                      placeholder={`P${i+1}`}
                      placeholderTextColor="#525252"
                      onChangeText={(val) => {
                        const newPins = [...(editingPins || [])];
                        newPins[i].label = val;
                        setEditingPins(newPins);
                      }}
                    />
                  </View>
                  
                  <View className="flex-1 mr-2">
                    <TextInput
                      style={{ minWidth: 0 }}
                      className="bg-neutral-900 border border-neutral-700 text-white p-3 rounded-lg text-sm w-full"
                    value={p.lat?.toString()}
                    keyboardType="numeric"
                    onChangeText={(val) => {
                      const newPins = [...(editingPins || [])];
                      newPins[i].lat = val as any;
                      setEditingPins(newPins);
                    }}
                  />
                  </View>

                  <View className="flex-1">
                    <TextInput
                      style={{ minWidth: 0 }}
                      className="bg-neutral-900 border border-neutral-700 text-white p-3 rounded-lg text-sm w-full"
                    value={p.lon?.toString()}
                    keyboardType="numeric"
                    onChangeText={(val) => {
                      const newPins = [...(editingPins || [])];
                      newPins[i].lon = val as any;
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

                {editingPins && editingPins.length >= 4 && !hasSelfIntersection(editingPins.map((p: any) => ({...p, lat: parseFloat(p.lat)||0, lon: parseFloat(p.lon)||0}))) && (
                  <TouchableOpacity 
                    className="bg-green-600 px-6 py-3 rounded-lg"
                    onPress={async () => {
                      try {
                        const parsedPins = editingPins.map((p: any) => ({...p, lat: parseFloat(p.lat)||0, lon: parseFloat(p.lon)||0}));
                        await updateBuildingPolygon({
                          clerkId: user?.id || "",
                          buildingId: selectedBuilding._id,
                          polygon: parsedPins
                        });
                        setSelectedBuilding({...selectedBuilding, polygon: parsedPins});
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

                <View className="w-full mt-4">
                  <TouchableOpacity 
                    className="w-full bg-blue-600 py-4 rounded-xl items-center flex-row justify-center shadow-lg"
                    onPress={() => {
                      setCalibPoints(selectedBuilding.imageCalibrationPoints || []);
                      setRoutingNodes(selectedBuilding.safeNodes || []);
                      setMapEditorStep(1);
                      setRouteNodeType("exit");
                      setIsMapEditorOpen(true);
                    }}
                  >
                    <Text className="text-white font-extrabold text-lg uppercase tracking-wider">🗺️ Open Map Editor</Text>
                  </TouchableOpacity>
                  {selectedBuilding.imageCalibrationPoints?.length !== selectedBuilding.polygon?.length && (
                    <Text className="text-orange-400 text-xs text-center mt-2">⚠️ Calibration required before routing.</Text>
                  )}
                </View>
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

      {/* Unified Map Editor Modal */}
      <Modal visible={isMapEditorOpen} animationType="slide">
        <View className="flex-1 bg-neutral-900 pt-16 px-4">
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-xl font-bold text-white">Manage Map Layout</Text>
            <TouchableOpacity onPress={() => setIsMapEditorOpen(false)} className="bg-neutral-800 p-2 rounded-full border border-neutral-700">
              <Text className="text-white font-bold">✕</Text>
            </TouchableOpacity>
          </View>
          
          {/* Tabs */}
          <View className="flex-row mb-6 bg-neutral-800 rounded-xl p-1">
            <TouchableOpacity 
              className={`flex-1 py-3 rounded-lg items-center ${mapEditorStep === 1 ? 'bg-neutral-700 shadow' : ''}`}
              onPress={() => setMapEditorStep(1)}
            >
              <Text className={`font-bold ${mapEditorStep === 1 ? 'text-white' : 'text-neutral-400'}`}>Step 1: Calibrate</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              className={`flex-1 py-3 rounded-lg items-center ${mapEditorStep === 2 ? 'bg-neutral-700 shadow' : ''}`}
              onPress={() => setMapEditorStep(2)}
            >
              <Text className={`font-bold ${mapEditorStep === 2 ? 'text-white' : 'text-neutral-400'}`}>Step 2: Safe Routes</Text>
            </TouchableOpacity>
          </View>

          {mapEditorStep === 1 ? (
            <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              <Text className="text-neutral-400 text-sm mb-4">Select a GPS pin from the list below, then tap its matching corner on the floor plan.</Text>
              
              <View className="flex-row flex-wrap mb-4 justify-center">
                {selectedBuilding?.polygon?.map((p: any, i: number) => {
                  return (
                    <TouchableOpacity 
                      key={i} 
                      className={`px-3 py-2 rounded-lg border mr-2 mb-2 ${activeCalibIdx === i ? 'bg-blue-600 border-blue-400' : 'bg-neutral-800 border-neutral-600'}`}
                      onPress={() => setActiveCalibIdx(i)}
                    >
                      <Text className="text-white font-bold text-xs">{p.label || `P${i+1}`}</Text>
                      {calibPoints[i] && <Text className="text-green-400 text-[10px] mt-1 font-bold">✓ Placed</Text>}
                    </TouchableOpacity>
                  )
                })}
              </View>

              <View className="bg-neutral-800 rounded-xl overflow-hidden mb-6 w-full" style={{ height: 400 }}>
                {selectedBuilding?.masterPlanUrl && (
                  <TouchableOpacity 
                    activeOpacity={1}
                    className="flex-1"
                    onLayout={(e) => setImgLayout({w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height})}
                    onPress={(e) => {
                      const x = Platform.OS === 'web' && (e.nativeEvent as any).offsetX !== undefined ? (e.nativeEvent as any).offsetX : e.nativeEvent.locationX;
                      const y = Platform.OS === 'web' && (e.nativeEvent as any).offsetY !== undefined ? (e.nativeEvent as any).offsetY : e.nativeEvent.locationY;
                      const isNewPlacement = !calibPoints[activeCalibIdx];
                      const newPoints = [...calibPoints];
                      newPoints[activeCalibIdx] = {x, y};
                      setCalibPoints(newPoints);
                      if (isNewPlacement && activeCalibIdx < (selectedBuilding?.polygon?.length || 4) - 1) {
                        setActiveCalibIdx(activeCalibIdx + 1);
                      }
                    }}
                  >
                    <Image source={{ uri: selectedBuilding.masterPlanUrl }} className="w-full h-full" resizeMode="contain" />
                    {calibPoints.map((p, i) => {
                      if (!p) return null;
                      const labelStr = selectedBuilding?.polygon?.[i]?.label;
                      const labelShort = labelStr ? labelStr.split(' ').map((w: string)=>w[0]).join('').substring(0,2).toUpperCase() : `P${i+1}`;
                      return (
                        <TouchableOpacity 
                          key={i} 
                          activeOpacity={0.8}
                          className={`absolute w-8 h-8 rounded-full items-center justify-center border-2 border-white ${activeCalibIdx === i ? 'bg-blue-500 z-10 scale-125' : 'bg-green-500'}`} 
                          style={{ left: p.x - 16, top: p.y - 16 }}
                          onPress={(e) => {
                            e.stopPropagation();
                            setActiveCalibIdx(i);
                          }}
                        >
                          <Text className="text-white text-xs font-bold">{labelShort}</Text>
                        </TouchableOpacity>
                      )
                    })}
                  </TouchableOpacity>
                )}
              </View>

              <View className="flex-row justify-between mb-4">
                <TouchableOpacity className="bg-neutral-700 px-6 py-3 rounded-xl flex-1 mr-2 items-center" onPress={() => { setCalibPoints([]); setActiveCalibIdx(0); }}>
                  <Text className="text-white font-bold">Clear Points</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  className={`px-6 py-3 rounded-xl flex-1 ml-2 items-center bg-green-600`}
                  onPress={async () => {
                    try {
                      if (calibPoints.filter(Boolean).length !== selectedBuilding?.polygon?.length) {
                        showToast("Please place all GPS pins on the map first to calibrate.");
                        return;
                      }
                      await updateBuildingCalibration({ clerkId: user?.id || "", buildingId: selectedBuilding._id, calibrationPoints: calibPoints });
                      setMapEditorStep(2);
                      showToast("Image calibrated successfully!");
                    } catch(e) { showToast("Error saving calibration", "error"); }
                  }}
                >
                  <Text className="text-white font-bold">Next: Safe Routes ➔</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          ) : (
            <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              <Text className="text-neutral-400 text-sm mb-4">Select a node type, then tap the map to draw routes.</Text>

              {/* Toolbar */}
              <View className="flex-row space-x-2 mb-4">
                <TouchableOpacity 
                  className={`flex-1 py-3 rounded-xl items-center border-2 ${routeNodeType === "exit" ? 'bg-green-600 border-green-400' : 'bg-neutral-800 border-neutral-700'}`}
                  onPress={() => setRouteNodeType("exit")}
                >
                  <Text className="text-white font-bold">🚪 Exit</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  className={`flex-1 py-3 rounded-xl items-center border-2 ${routeNodeType === "turn" ? 'bg-blue-600 border-blue-400' : 'bg-neutral-800 border-neutral-700'} ${!routingNodes.some(n => n.isExit) ? 'opacity-50' : ''}`}
                  onPress={() => {
                    if (!routingNodes.some(n => n.isExit)) {
                      showToast("Please add an Exit to the map first!");
                      return;
                    }
                    setRouteNodeType("turn");
                  }}
                  disabled={!routingNodes.some(n => n.isExit)}
                >
                  <Text className="text-white font-bold">🔵 Turn Point</Text>
                </TouchableOpacity>
              </View>
              
              <View className="bg-neutral-800 rounded-xl overflow-hidden mb-4 w-full" style={{ height: 400 }}>
                {selectedBuilding?.masterPlanUrl && (
                  <TouchableOpacity 
                    activeOpacity={1}
                    className="flex-1 relative"
                    onLayout={(e) => setImgLayout({w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height})}
                    onPress={(e) => {
                      const x = Platform.OS === 'web' && (e.nativeEvent as any).offsetX !== undefined ? (e.nativeEvent as any).offsetX : e.nativeEvent.locationX;
                      const y = Platform.OS === 'web' && (e.nativeEvent as any).offsetY !== undefined ? (e.nativeEvent as any).offsetY : e.nativeEvent.locationY;
                      const gps = mapImageToGPS(x, y);
                      
                      if (activeRouteIdx !== null) {
                        const newNodes = [...routingNodes];
                        newNodes[activeRouteIdx].lat = gps.lat;
                        newNodes[activeRouteIdx].lon = gps.lon;
                        setRoutingNodes(newNodes);
                        setActiveRouteIdx(null);
                      } else {
                        if (routeNodeType === "turn" && !routingNodes.some(n => n.isExit)) {
                          showToast("Please add an Exit to the map first!");
                          return;
                        }
                        setRoutingNodes([...routingNodes, { lat: gps.lat, lon: gps.lon, isExit: routeNodeType === "exit" }]);
                      }
                    }}
                  >
                    <Image source={{ uri: selectedBuilding.masterPlanUrl }} className="w-full h-full opacity-70" resizeMode="contain" />
                    
                    {/* Show Calibration Points faded */}
                    {calibPoints.map((p, i) => {
                      if (!p) return null;
                      const labelStr = selectedBuilding?.polygon?.[i]?.label;
                      const labelShort = labelStr ? labelStr.split(' ').map((w: string)=>w[0]).join('').substring(0,2).toUpperCase() : `P${i+1}`;
                      return (
                        <View key={`calib-${i}`} className="absolute w-8 h-8 rounded-full bg-green-500 border-2 border-white items-center justify-center pointer-events-none" style={{ left: p.x - 16, top: p.y - 16, opacity: 0.5 }}>
                          <Text className="text-white text-xs font-bold">{labelShort}</Text>
                        </View>
                      )
                    })}

                    {/* Show Routing Nodes */}
                    {(() => {
                      let turnCount = 0;
                      return routingNodes.map((node, i) => {
                        if (!node.isExit) turnCount++;
                        const displayNum = node.isExit ? 'E' : turnCount;
                      // Inverse mapping for visual display (simplified)
                      const poly = selectedBuilding.polygon;
                      if (!poly) return null;
                      const minLat = Math.min(...poly.map((p:any)=>p.lat));
                      const maxLat = Math.max(...poly.map((p:any)=>p.lat));
                      const minLon = Math.min(...poly.map((p:any)=>p.lon));
                      const maxLon = Math.max(...poly.map((p:any)=>p.lon));
                      
                      let v = (maxLat - node.lat) / (maxLat - minLat);
                      let u = (node.lon - minLon) / (maxLon - minLon);

                      let sx = u * imgLayout.w;
                      let sy = v * imgLayout.h;

                      const calib = calibPoints;
                      if (calib && calib.length >= 4) {
                         const minCX = Math.min(...calib.map((c:any)=>c.x));
                         const maxCX = Math.max(...calib.map((c:any)=>c.x));
                         const minCY = Math.min(...calib.map((c:any)=>c.y));
                         const maxCY = Math.max(...calib.map((c:any)=>c.y));
                         sx = (u * (maxCX - minCX)) + minCX;
                         sy = (v * (maxCY - minCY)) + minCY;
                      }

                      return (
                        <TouchableOpacity 
                          key={i} 
                          activeOpacity={0.8}
                          className={`absolute w-8 h-8 rounded-full items-center justify-center border-2 border-white ${node.isExit ? 'bg-green-500 z-10' : 'bg-blue-500'} ${activeRouteIdx === i ? 'scale-125 border-yellow-400' : ''}`} 
                          style={{ left: sx - 16, top: sy - 16 }}
                          onPress={(e) => {
                            e.stopPropagation();
                            setActiveRouteIdx(activeRouteIdx === i ? null : i);
                          }}
                        >
                          <Text className="text-white text-xs font-bold">{displayNum}</Text>
                        </TouchableOpacity>
                      )
                    })})()}
                  </TouchableOpacity>
                )}
              </View>

              {routingNodes.length > 0 && (
                <View className="mb-6">
                  <Text className="text-white font-bold mb-2">Manage Route Nodes</Text>
                  
                  <View className="bg-blue-900/30 p-4 rounded-xl border border-blue-600/50 mb-4 flex-row">
                    <Text className="text-blue-500 mr-3 text-2xl">💡</Text>
                    <View className="flex-1">
                      <Text className="text-blue-400 font-bold mb-1 uppercase tracking-wider text-xs">Routing Strategy</Text>
                      <Text className="text-blue-300 text-xs">For best guidance, add Turn Points at all <Text className="font-bold text-white">critical corners</Text> and intersections. In long corridors, place a repeated Turn Point every <Text className="font-bold text-white">4-5 meters</Text> to ensure guests are continuously guided smoothly toward the exit.</Text>
                    </View>
                  </View>
                  
                  {/* Exits Group */}
                  {routingNodes.map((n, i) => ({ n, i })).filter(({ n }) => n.isExit).map(({ n, i }) => (
                    <View key={i} className={`flex-row items-center p-3 rounded-xl mb-2 ${activeRouteIdx === i ? 'bg-neutral-700 border border-neutral-500' : 'bg-neutral-800'}`}>
                      <Text className="text-white flex-1 font-bold">🚪 Exit</Text>
                      
                      <TouchableOpacity 
                        onPress={() => setActiveRouteIdx(activeRouteIdx === i ? null : i)} 
                        className={`px-3 py-2 rounded-lg mr-2 ${activeRouteIdx === i ? 'bg-blue-600' : 'bg-neutral-700'}`}
                      >
                        <Text className="text-white text-xs">{activeRouteIdx === i ? 'Repositioning...' : 'Reposition'}</Text>
                      </TouchableOpacity>
                      
                      <TouchableOpacity 
                        onPress={() => {
                          const newNodes = routingNodes.filter((_, idx) => idx !== i);
                          setRoutingNodes(newNodes);
                          if (activeRouteIdx === i) setActiveRouteIdx(null);
                          else if (activeRouteIdx !== null && activeRouteIdx > i) setActiveRouteIdx(activeRouteIdx - 1);
                        }} 
                        className="bg-red-900/50 p-2 rounded-lg"
                      >
                        <Text className="text-red-500 font-bold text-xs">✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}

                  {/* Turn Points Group */}
                  {routingNodes.map((n, i) => ({ n, i })).filter(({ n }) => !n.isExit).map(({ n, i }, turnIndex) => (
                    <View key={i} className={`flex-row items-center p-3 rounded-xl mb-2 ${activeRouteIdx === i ? 'bg-neutral-700 border border-neutral-500' : 'bg-neutral-800'}`}>
                      <Text className="text-white flex-1 font-bold">🔵 Turn Point {turnIndex + 1}</Text>
                      
                      <TouchableOpacity 
                        onPress={() => setActiveRouteIdx(activeRouteIdx === i ? null : i)} 
                        className={`px-3 py-2 rounded-lg mr-2 ${activeRouteIdx === i ? 'bg-blue-600' : 'bg-neutral-700'}`}
                      >
                        <Text className="text-white text-xs">{activeRouteIdx === i ? 'Repositioning...' : 'Reposition'}</Text>
                      </TouchableOpacity>
                      
                      <TouchableOpacity 
                        onPress={() => {
                          const newNodes = routingNodes.filter((_, idx) => idx !== i);
                          setRoutingNodes(newNodes);
                          if (activeRouteIdx === i) setActiveRouteIdx(null);
                          else if (activeRouteIdx !== null && activeRouteIdx > i) setActiveRouteIdx(activeRouteIdx - 1);
                        }} 
                        className="bg-red-900/50 p-2 rounded-lg"
                      >
                        <Text className="text-red-500 font-bold text-xs">✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              <View className="flex-row justify-between mb-4">
                <TouchableOpacity className="flex-1 bg-neutral-700 py-3 rounded-xl items-center mr-2" onPress={() => setRoutingNodes([])}>
                  <Text className="text-white font-bold">Clear All</Text>
                </TouchableOpacity>
                <TouchableOpacity className="flex-1 bg-neutral-700 py-3 rounded-xl items-center mr-2" onPress={() => setRoutingNodes(prev => prev.slice(0, -1))}>
                  <Text className="text-white font-bold">Undo</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  className="flex-1 bg-green-600 py-3 rounded-xl items-center"
                  onPress={async () => {
                    if (calibPoints.filter(Boolean).length !== selectedBuilding?.polygon?.length) {
                      showToast("Please complete Step 1 (Calibration) before saving.");
                      setMapEditorStep(1);
                      return;
                    }
                    if (!routingNodes.some(n => n.isExit)) {
                      showToast("Please add at least one Exit.");
                      return;
                    }

                    const doSave = async () => {
                      try {
                        await updateBuildingSafeNodes({ clerkId: user?.id || "", buildingId: selectedBuilding._id, safeNodes: routingNodes });
                        setIsMapEditorOpen(false);
                        showToast("Safe Routes saved!");
                      } catch(e) { showToast("Error saving routes", "error"); }
                    };

                    if (!routingNodes.some(n => !n.isExit)) {
                      if (Platform.OS === 'web') {
                        if (window.confirm("You have not added any turn points. Is that OK?")) {
                          doSave();
                        }
                      } else {
                        Alert.alert("No Turn Points", "You have not added any turn points. Is that OK?", [
                          { text: "Cancel", style: "cancel" },
                          { text: "Yes, Save", onPress: doSave }
                        ]);
                      }
                    } else {
                      doSave();
                    }
                  }}
                >
                  <Text className="text-white font-bold">Save All</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* Manage Site Modal */}
      <Modal visible={manageSiteName !== null} animationType="slide" presentationStyle="pageSheet">
        {manageSiteName && (
          <ScrollView className="flex-1 bg-neutral-900 pt-12 px-6">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-2xl font-extrabold text-white">Manage Site Details</Text>
              <TouchableOpacity onPress={() => setManageSiteName(null)} className="bg-neutral-800 p-2 rounded-full border border-neutral-700">
                <Text className="text-white font-bold">✕</Text>
              </TouchableOpacity>
            </View>
            <View className="bg-neutral-800 p-6 rounded-2xl border border-neutral-700 mb-6">
              <Text className="text-white font-bold mb-2">Site Name</Text>
              <TextInput
                className="bg-neutral-700 border border-neutral-600 rounded-xl p-4 text-white mb-4 opacity-50"
                value={manageSiteName}
                editable={false}
              />
              <Text className="text-white font-bold mb-2">Fire Service Description (Hazards & Assembly)</Text>
              <TextInput
                className="bg-neutral-900 border border-neutral-700 rounded-xl p-4 text-white mb-4"
                value={siteDesc}
                onChangeText={setSiteDesc}
                placeholder="Details of the site, hazards, assembly points..."
                placeholderTextColor="#525252"
                multiline
                numberOfLines={4}
                style={{ height: 100, textAlignVertical: 'top' }}
              />
              <Text className="text-white font-bold mb-2">Site Admin Name (Responsible Person)</Text>
              <TextInput
                className="bg-neutral-900 border border-neutral-700 rounded-xl p-4 text-white mb-4"
                value={siteAdminName}
                onChangeText={setSiteAdminName}
                placeholder="e.g., John Doe"
                placeholderTextColor="#525252"
              />
              <Text className="text-white font-bold mb-2">Site Admin Contact Phone</Text>
              <TextInput
                className="bg-neutral-900 border border-neutral-700 rounded-xl p-4 text-white mb-4"
                value={sitePhone}
                onChangeText={setSitePhone}
                placeholder="e.g., +44 123 456789"
                placeholderTextColor="#525252"
                keyboardType="phone-pad"
              />
              <Text className="text-white font-bold mb-2">Local Emergency Services / Fire Brigade Phone</Text>
              <TextInput
                className="bg-neutral-900 border border-neutral-700 rounded-xl p-4 text-white mb-6"
                value={siteEmergencyPhone}
                onChangeText={setSiteEmergencyPhone}
                placeholder="e.g., 999 or Local Dispatch Number"
                placeholderTextColor="#525252"
                keyboardType="phone-pad"
              />
              <TouchableOpacity 
                className={`py-4 rounded-xl items-center ${isUploading ? 'bg-neutral-700' : 'bg-blue-600'}`}
                disabled={isUploading}
                onPress={async () => {
                  try {
                    await updateSiteInfo({
                      clerkId: user?.id || "",
                      siteName: manageSiteName,
                      description: siteDesc,
                      adminContactName: siteAdminName,
                      contactPhone: sitePhone,
                      emergencyServicesPhone: siteEmergencyPhone,
                    });
                    setManageSiteName(null);
                    showToast("Site details saved successfully!");
                  } catch(e) {
                    showToast("Error updating site", "error");
                  }
                }}
              >
                <Text className="text-white font-bold text-lg">Save Site Details</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}
      </Modal>

    </View>
  );
}
