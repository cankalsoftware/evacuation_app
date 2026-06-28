import React, { useState, useRef } from "react";
import { View, Modal, ActivityIndicator, Alert, Image, Platform, ScrollView } from "react-native";
import { Text, TouchableOpacity } from "./ResponsiveUI";
import MapView, { Marker } from "react-native-maps";
import * as Location from "expo-location";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

type Props = {
  visible: boolean;
  onClose: () => void;
  buildingId: string;
  imageUrl?: string;
  calibPoints?: Array<{ x: number; y: number; lat: number; lng: number }>;
  doorPins?: Array<{ x: number; y: number; type: string }>;
};

export default function AdminCalibrationWalk({ visible, onClose, buildingId, imageUrl, calibPoints = [], doorPins = [] }: Props) {
  const { userId } = useAuth();
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [fingerprints, setFingerprints] = useState<any[]>([]);
  const [currentRegion, setCurrentRegion] = useState<any>(null);
  const [panMode, setPanMode] = useState(false);
  const [loadedFromDb, setLoadedFromDb] = useState(false);

  // Map state
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [imgLayout, setImgLayout] = useState({ w: 0, h: 0 });
  const [imgOriginalSize, setImgOriginalSize] = useState({ w: 0, h: 0 });
  const [activePinIdx, setActivePinIdx] = useState(-1);
  const [isMapInteracting, setIsMapInteracting] = useState(false);

  React.useEffect(() => {
    if (imageUrl) {
      Image.getSize(imageUrl, (w, h) => {
        setImgOriginalSize({ w, h });
      });
    }
  }, [imageUrl]);

  const getRenderedImageBounds = () => {
    const layoutW = Math.max(1, imgLayout.w);
    const layoutH = Math.max(1, imgLayout.h);
    const aspect = imgOriginalSize.w > 0 ? imgOriginalSize.w / imgOriginalSize.h : 1;
    const layoutAspect = layoutW / layoutH;
    let renderW, renderH, offsetX, offsetY;
    if (layoutAspect > aspect) {
      renderH = layoutH;
      renderW = layoutH * aspect;
      offsetX = (layoutW - renderW) / 2;
      offsetY = 0;
    } else {
      renderW = layoutW;
      renderH = layoutW / aspect;
      offsetX = 0;
      offsetY = (layoutH - renderH) / 2;
    }
    return { renderW, renderH, offsetX, offsetY };
  };

  const gestureState = useRef({
    initialDistance: 0,
    initialZoom: 1,
    lastCenter: { x: 0, y: 0 },
    lastPan: { x: 0, y: 0 },
    isTwoFinger: false,
  });

  const saveWifiFingerprints = useMutation(api.portal.saveWifiFingerprints);
  const existingFingerprints = useQuery(api.portal.getWifiFingerprints, { buildingId: buildingId as any });

  React.useEffect(() => {
    if (existingFingerprints && existingFingerprints.length > 0 && !loadedFromDb) {
      setFingerprints(existingFingerprints);
      setScanning(true);
      setLoadedFromDb(true);
    }
  }, [existingFingerprints, loadedFromDb]);

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
    if (activePinIdx !== -1) {
      Alert.alert("Please confirm the current pin (green tick) before capturing another.");
      return;
    }

    let location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Highest,
    });

    // Mocking BSSID for Expo Go environment (real implementation would use react-native-wifi-reborn)
    const mockBssid = "00:1A:2B:3C:" + Math.floor(Math.random() * 99) + ":" + Math.floor(Math.random() * 99);
    
    // Spawn pin in the center of the screen based on current pan and zoom
    const px = (imgLayout.w / 2) - panOffset.x;
    const py = (imgLayout.h / 2) - panOffset.y;
    const bounds = getRenderedImageBounds();
    const centerX = (px - bounds.offsetX) / bounds.renderW;
    const centerY = (py - bounds.offsetY) / bounds.renderH;

    const newFp = {
      bssid: mockBssid,
      lat: location.coords.latitude,
      lon: location.coords.longitude,
      signalStrength: - (Math.floor(Math.random() * 40) + 30),
      x: centerX,
      y: centerY,
    };

    const newFingerprints = [...fingerprints, newFp];
    setFingerprints(newFingerprints);
    
    if (imageUrl) {
      setActivePinIdx(newFingerprints.length - 1);
    } else {
      Alert.alert("Success", "Wi-Fi Router Fingerprint captured at this location!");
    }
  };

  const finishWalk = async () => {
    if (fingerprints.length === 0) {
      Alert.alert("Error", "No fingerprints captured. Please walk and scan.");
      return;
    }

    if (activePinIdx !== -1) {
      Alert.alert("Please confirm the current pin placement (green tick) before saving.");
      return;
    }

    setLoading(true);
    try {
      await saveWifiFingerprints({
        clerkId: userId || "",
        buildingId: buildingId as any,
        fingerprints: fingerprints.map((fp) => ({
          bssid: fp.bssid,
          lat: fp.lat,
          lon: fp.lon,
          signalStrength: fp.signalStrength,
          nodeType: fp.nodeType,
          gpsLat: fp.gpsLat,
          gpsLon: fp.gpsLon,
          x: fp.x,
          y: fp.y,
        })),
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

  // Map gestures
  const handleTouchStart = (e: any) => {
    const touches = e.nativeEvent.touches;
    if (touches && touches.length >= 2) {
      gestureState.current.isTwoFinger = true;
      const dx = touches[0].pageX - touches[1].pageX;
      const dy = touches[0].pageY - touches[1].pageY;
      gestureState.current.initialDistance = Math.sqrt(dx * dx + dy * dy);
      gestureState.current.initialZoom = zoom;
      gestureState.current.lastCenter = {
        x: (touches[0].pageX + touches[1].pageX) / 2,
        y: (touches[0].pageY + touches[1].pageY) / 2,
      };
      gestureState.current.lastPan = panOffset;
    } else {
      gestureState.current.isTwoFinger = false;
      const touch = touches && touches.length === 1 ? touches[0] : e.nativeEvent;
      gestureState.current.lastCenter = { x: touch.pageX || 0, y: touch.pageY || 0 };
      gestureState.current.lastPan = panOffset;
    }
  };

  const handleTouchMove = (e: any) => {
    const touches = e.nativeEvent.touches;
    if (touches && touches.length >= 2) {
      if (!gestureState.current.isTwoFinger) {
        handleTouchStart(e);
        return;
      }
      const dx = touches[0].pageX - touches[1].pageX;
      const dy = touches[0].pageY - touches[1].pageY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const scaleFactor = dist / Math.max(1, gestureState.current.initialDistance);
      let newZoom = gestureState.current.initialZoom * scaleFactor;
      newZoom = Math.max(1, Math.min(5, newZoom));
      setZoom(newZoom);

      const center = {
        x: (touches[0].pageX + touches[1].pageX) / 2,
        y: (touches[0].pageY + touches[1].pageY) / 2,
      };
      const diffX = center.x - gestureState.current.lastCenter.x;
      const diffY = center.y - gestureState.current.lastCenter.y;
      setPanOffset({
        x: gestureState.current.lastPan.x + diffX / newZoom,
        y: gestureState.current.lastPan.y + diffY / newZoom,
      });
    } else if (!gestureState.current.isTwoFinger) {
      if (!panMode) return;
      // 1 finger pan
      const touch = touches && touches.length === 1 ? touches[0] : e.nativeEvent;
      const diffX = (touch.pageX || 0) - gestureState.current.lastCenter.x;
      const diffY = (touch.pageY || 0) - gestureState.current.lastCenter.y;
      setPanOffset({
        x: gestureState.current.lastPan.x + diffX / zoom,
        y: gestureState.current.lastPan.y + diffY / zoom,
      });
    }
  };

  const handleNudgePin = (idx: number, dx: number, dy: number) => {
    if (idx < 0 || idx >= fingerprints.length) return;
    const newFps = [...fingerprints];
    newFps[idx] = {
      ...newFps[idx],
      x: newFps[idx].x + dx * 0.001,
      y: newFps[idx].y + dy * 0.001,
    };
    setFingerprints(newFps);
  };

  const handlePaint = (e: any) => {
    if (activePinIdx === -1 || panMode) return;
    const touch = e.nativeEvent.touches && e.nativeEvent.touches.length > 0 ? e.nativeEvent.touches[0] : e.nativeEvent;
    if (!touch) return;
    
    // We get touch coordinates relative to the map container View
    const rawX = touch.locationX !== undefined ? touch.locationX : touch.pageX || 0;
    const rawY = touch.locationY !== undefined ? touch.locationY : touch.pageY || 0;
    
    const px = (rawX - imgLayout.w / 2) / zoom - panOffset.x + imgLayout.w / 2;
    const py = (rawY - imgLayout.h / 2) / zoom - panOffset.y + imgLayout.h / 2;
    
    const bounds = getRenderedImageBounds();
    const normX = (px - bounds.offsetX) / bounds.renderW;
    const normY = (py - bounds.offsetY) / bounds.renderH;
    
    const newFps = [...fingerprints];
    newFps[activePinIdx] = {
      ...newFps[activePinIdx],
      x: normX,
      y: normY,
    };
    setFingerprints(newFps);
  };

  return (
    <Modal visible={visible} animationType="slide">
      <ScrollView className="flex-1 bg-neutral-900 pt-12" contentContainerStyle={{ flexGrow: 1, paddingBottom: 40 }} scrollEnabled={!isMapInteracting}>
        <View className="flex-row items-center justify-between px-6 mb-4">
          <Text className="text-white text-xl font-bold">Calibration Walk</Text>
          <TouchableOpacity onPress={onClose} className="p-2">
            <Ionicons name="close" size={24} color="#FFF" />
          </TouchableOpacity>
        </View>

        <View className="px-6 mb-4">
          <Text className="text-neutral-400 text-sm mb-2">
            Walk through your building. Press "Capture" to drop a Wi-Fi pin, then move it to your exact physical location and confirm.
          </Text>
        </View>

        <View className="rounded-2xl overflow-hidden mx-4 mb-4 border border-neutral-700" style={{ height: 450 }}>
          {!scanning ? (
            <View className="flex-1 items-center justify-center bg-neutral-800">
              <Ionicons name="walk" size={64} color="#F97316" />
              <Text className="text-white text-lg mt-4 font-semibold">Ready to start?</Text>
              <TouchableOpacity onPress={startWalk} className="bg-orange-500 px-6 py-3 rounded-full mt-6">
                <Text className="text-white font-bold">Start Walk</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View className="flex-1 bg-neutral-900 justify-center items-center relative">
              {imageUrl ? (
                <View
                  style={{ flex: 1, width: "100%", overflow: "hidden", position: "relative" }}
                  onLayout={(e) => setImgLayout({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
                >
                  <View
                    style={{
                      position: "absolute",
                      top: 0, left: 0, width: "100%", height: "100%", zIndex: 1,
                    }}
                    onStartShouldSetResponder={() => true}
                    onMoveShouldSetResponder={() => true}
                    onResponderTerminationRequest={() => false}
                    onResponderGrant={(e) => {
                      setIsMapInteracting(true);
                      handleTouchStart(e);
                      if (!panMode) handlePaint(e);
                    }}
                    onResponderMove={(e) => {
                      handleTouchMove(e);
                      if (!panMode && !gestureState.current.isTwoFinger) handlePaint(e);
                    }}
                    onResponderRelease={() => setIsMapInteracting(false)}
                    onResponderTerminate={() => setIsMapInteracting(false)}
                  />

                  <View
                    style={{
                      position: "absolute",
                      left: 0, top: 0, width: imgLayout.w, height: imgLayout.h,
                      transform: [
                        { scale: zoom },
                        { translateX: panOffset.x },
                        { translateY: panOffset.y },
                      ],
                      pointerEvents: "none",
                    }}
                  >
                    <Image 
                      source={{ uri: imageUrl }} 
                      style={{ width: "100%", height: "100%", resizeMode: "contain" }} 
                    />
                  </View>

                  {/* Pins Overlay (Unscaled) */}
                  <View style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", zIndex: 2, pointerEvents: "box-none" }}>
                    
                    {/* Render Calib Points (Step 1) */}
                    {calibPoints.map((p, i) => {
                      if (!p) return null;
                      const bounds = getRenderedImageBounds();
                      const px = p.x > 2 ? p.x : bounds.offsetX + p.x * bounds.renderW;
                      const py = p.y > 2 ? p.y : bounds.offsetY + p.y * bounds.renderH;
                      const screenX = (px - imgLayout.w / 2 + panOffset.x) * zoom + imgLayout.w / 2;
                      const screenY = (py - imgLayout.h / 2 + panOffset.y) * zoom + imgLayout.h / 2;
                      return (
                        <View
                          key={`calib-${i}`}
                          className="absolute items-center justify-center pointer-events-none"
                          style={{ left: screenX - 20, top: screenY - 20, width: 40, height: 40, zIndex: 1 }}
                        >
                          <MaterialCommunityIcons name="map-marker" size={40} color="#22c55e" />
                        </View>
                      );
                    })}

                    {/* Render Door Pins (Step 2) */}
                    {doorPins.map((p, i) => {
                      const bounds = getRenderedImageBounds();
                      const px = p.x > 2 ? p.x : bounds.offsetX + p.x * bounds.renderW;
                      const py = p.y > 2 ? p.y : bounds.offsetY + p.y * bounds.renderH;
                      const screenX = (px - imgLayout.w / 2 + panOffset.x) * zoom + imgLayout.w / 2;
                      const screenY = (py - imgLayout.h / 2 + panOffset.y) * zoom + imgLayout.h / 2;
                      return (
                        <View
                          key={`door-${i}`}
                          className="absolute items-center justify-center pointer-events-none"
                          style={{ left: screenX - 20, top: screenY - 20, width: 40, height: 40, zIndex: 1 }}
                        >
                          <MaterialCommunityIcons
                            name="crosshairs-gps"
                            size={40}
                            color={p.type === "entrance" ? "#3b82f6" : "#ef4444"}
                          />
                          <Text className="text-white text-[10px] font-bold absolute top-2">
                            {p.type === "entrance" ? "ENTR" : "EXIT"}
                          </Text>
                        </View>
                      );
                    })}

                    {fingerprints.map((fp, i) => {
                      const bounds = getRenderedImageBounds();
                      const px = fp.x > 2 ? fp.x : bounds.offsetX + fp.x * bounds.renderW;
                      const py = fp.y > 2 ? fp.y : bounds.offsetY + fp.y * bounds.renderH;
                      const screenX = (px - imgLayout.w / 2 + panOffset.x) * zoom + imgLayout.w / 2;
                      const screenY = (py - imgLayout.h / 2 + panOffset.y) * zoom + imgLayout.h / 2;
                      
                      return (
                        <TouchableOpacity
                          key={`wifi-${i}`}
                          activeOpacity={0.8}
                          className="absolute items-center justify-center"
                          style={{
                            left: screenX - 20,
                            top: screenY - 20,
                            width: 40,
                            height: 40,
                            zIndex: activePinIdx === i ? 10 : 1,
                          }}
                          onPress={(e) => {
                            e.stopPropagation();
                            if (activePinIdx === i) {
                              setActivePinIdx(-1);
                            } else {
                              setActivePinIdx(i);
                            }
                          }}
                        >
                          {activePinIdx === i ? (
                            <View className="absolute pointer-events-none" style={{ left: 4, top: 4, width: 32, height: 32 }}>
                              <View className="absolute shadow-md shadow-black bg-orange-500" style={{ left: 15, top: 0, width: 2, height: 12 }} />
                              <View className="absolute shadow-md shadow-black bg-orange-500" style={{ left: 15, bottom: 0, width: 2, height: 12 }} />
                              <View className="absolute shadow-md shadow-black bg-orange-500" style={{ top: 15, left: 0, width: 12, height: 2 }} />
                              <View className="absolute shadow-md shadow-black bg-orange-500" style={{ top: 15, right: 0, width: 12, height: 2 }} />
                              <View style={{ position: "absolute", top: -8, right: -8, zIndex: 100 }} className="bg-red-600 rounded-full w-5 h-5 items-center justify-center border-2 border-white shadow-md z-10">
                                <Text className="text-white text-[10px] font-bold">{i + 1}</Text>
                              </View>
                            </View>
                          ) : (
                            <>
                              <MaterialCommunityIcons name="wifi-marker" size={32} color="#F97316" />
                              <View style={{ position: "absolute", top: -4, right: 0, zIndex: 100 }} className="bg-red-600 rounded-full w-4 h-4 items-center justify-center border border-white shadow-sm">
                                <Text className="text-white text-[9px] font-bold">{i + 1}</Text>
                              </View>
                            </>
                          )}

                          {activePinIdx === i && (() => {
                            const dpadBaseLeft = screenX > imgLayout.w - 140 ? -125 : 75;
                            const dpadBaseTop = screenY < 100 ? 40 : screenY > imgLayout.h - 100 ? -90 : -25;
                            return (
                              <View
                                className="absolute bg-neutral-900/90 rounded-full border border-neutral-600 shadow-xl z-50 flex-row items-center justify-center"
                                style={{ width: 90, height: 90, left: dpadBaseLeft, top: dpadBaseTop }}
                              >
                                <TouchableOpacity onPress={(e) => { e.stopPropagation(); handleNudgePin(i, 0, -1); }} className="absolute top-1 p-2 bg-neutral-700 rounded-full">
                                  <MaterialCommunityIcons name="chevron-up" size={24} color="white" />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={(e) => { e.stopPropagation(); handleNudgePin(i, 0, 1); }} className="absolute bottom-1 p-2 bg-neutral-700 rounded-full">
                                  <MaterialCommunityIcons name="chevron-down" size={24} color="white" />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={(e) => { e.stopPropagation(); handleNudgePin(i, -1, 0); }} className="absolute left-1 p-2 bg-neutral-700 rounded-full">
                                  <MaterialCommunityIcons name="chevron-left" size={24} color="white" />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={(e) => { e.stopPropagation(); handleNudgePin(i, 1, 0); }} className="absolute right-1 p-2 bg-neutral-700 rounded-full">
                                  <MaterialCommunityIcons name="chevron-right" size={24} color="white" />
                                </TouchableOpacity>
                                
                                <TouchableOpacity
                                  onPress={(e) => {
                                    e.stopPropagation();
                                    setActivePinIdx(-1);
                                  }}
                                  className="w-8 h-8 bg-green-500 rounded-full border border-white items-center justify-center"
                                >
                                  <MaterialCommunityIcons name="check-bold" size={16} color="white" />
                                </TouchableOpacity>
                                
                                {/* Delete Button */}
                                <TouchableOpacity
                                  onPress={(e) => {
                                    e.stopPropagation();
                                    const newFps = [...fingerprints];
                                    newFps.splice(i, 1);
                                    setFingerprints(newFps);
                                    setActivePinIdx(-1);
                                  }}
                                  className="absolute bg-red-500 rounded-full border-2 border-white items-center justify-center shadow-lg"
                                  style={{ width: 36, height: 36, top: -10, right: -10, zIndex: 60 }}
                                >
                                  <MaterialCommunityIcons name="trash-can-outline" size={18} color="white" />
                                </TouchableOpacity>
                              </View>
                            );
                          })()}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ) : (
                <MapView
                  style={{ flex: 1, width: "100%" }}
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
              
              {imageUrl && fingerprints.length > 0 && (
                <View className="absolute top-4 bg-orange-600/90 px-4 py-2 rounded-full border border-orange-400 pointer-events-none">
                  <Text className="text-white font-bold text-center">
                    {fingerprints.length} Wi-Fi Points Captured
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>

        {scanning && (
          <View className="px-6 mb-8 flex-row justify-between">
            <TouchableOpacity 
              onPress={() => setPanMode(!panMode)} 
              className={`flex-1 py-4 rounded-xl items-center mr-1 border ${panMode ? "bg-amber-600 border-amber-400" : "bg-neutral-800 border-neutral-700"}`}
            >
              <MaterialCommunityIcons name="hand-back-right" size={24} color={panMode ? "white" : "#a3a3a3"} />
              <Text className={`${panMode ? "text-white" : "text-neutral-400"} font-bold mt-1`}>Pan</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={captureFingerprint} 
              className="bg-neutral-700 flex-1 py-4 rounded-xl items-center mx-1 border border-orange-500/30"
            >
              <Ionicons name="wifi" size={24} color="#F97316" />
              <Text className="text-orange-500 font-bold mt-1 text-center">Capture</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={finishWalk} 
              disabled={loading}
              className="bg-orange-500 flex-1 py-4 rounded-xl items-center ml-1 flex-row justify-center"
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

        {scanning && fingerprints.length > 0 && (
          <View className="px-6 pb-12">
            <Text className="text-white text-lg font-bold mb-2">Captured Points</Text>
            {fingerprints.map((fp, i) => (
              <View key={i} className="flex-row items-center py-3 border-b border-neutral-800">
                <View className="bg-orange-600 rounded-full w-8 h-8 items-center justify-center mr-4">
                  <Text className="text-white text-sm font-bold">{i + 1}</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-white font-bold text-base" numberOfLines={1}>{fp.bssid}</Text>
                  <Text className="text-neutral-400 text-xs mt-1">
                    Lat: {fp.lat.toFixed(6)}, Lon: {fp.lon.toFixed(6)}
                  </Text>
                  <Text className="text-neutral-400 text-xs">
                    Signal Strength: {fp.signalStrength} dBm
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </Modal>
  );
}
