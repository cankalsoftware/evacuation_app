import React, { useState, useEffect, useRef } from "react";
import { View, ScrollView, Platform } from "react-native";
import { useAudioPlayer } from 'expo-audio';
import { Text, TouchableOpacity } from "./ResponsiveUI";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export default function LiveRollCall({ incidentId, clerkId, onLocateUser, buildingPolygon }: { incidentId: any, clerkId: string, onLocateUser: (lat: number, lon: number, name: string) => void, buildingPolygon?: any[] }) {
  const evacData = useQuery(api.portal.getEvacuationData, { clerkId, incidentId }) || { inside: [], outside: [] };
  const moveToOutside = useMutation(api.portal.moveToOutside);
  const [countdown, setCountdown] = useState(5);
  const [isMuted, setIsMuted] = useState(false);
  const sirenPlayer = useAudioPlayer(require('../assets/siren.wav'));
  sirenPlayer.loop = true;

  const panicUsers = evacData.inside.filter((r: any) => r.status === 'PANIC');
  const inBuildingUsers = evacData.inside.filter((r: any) => r.status === 'IN_BUILDING');
  const safeUsers = evacData.outside;

  useEffect(() => {
    if (panicUsers.length === 0 && isMuted) {
      setIsMuted(false);
    }
  }, [panicUsers.length, isMuted]);

  useEffect(() => {
    let isMounted = true;

    const manageSiren = async () => {
      try {
        if (panicUsers.length > 0 && !isMuted) {
          sirenPlayer.play();
        } else {
          sirenPlayer.pause();
        }
      } catch (e) {
        console.log("Admin Dashboard Siren Error:", e);
      }
    };

    manageSiren();

    return () => {
      isMounted = false;
    };
  }, [panicUsers.length, isMuted]);

  useEffect(() => {
    return () => {
      sirenPlayer.remove();
    };
  }, [sirenPlayer]);

  const isInsidePolygon = (lat: number, lon: number, poly: any[]) => {
    let isInside = false;
    let minLat = Infinity, maxLat = -Infinity;
    let minLon = Infinity, maxLon = -Infinity;
    for (const p of poly) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lon < minLon) minLon = p.lon;
      if (p.lon > maxLon) maxLon = p.lon;
    }

    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].lon, yi = poly[i].lat;
      const xj = poly[j].lon, yj = poly[j].lat;
      const intersect = ((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi);
      if (intersect) isInside = !isInside;
    }
    
    if (!isInside) {
      const diag = Math.sqrt((maxLat - minLat)**2 + (maxLon - minLon)**2);
      const allowedDist = Math.max(0.00005, diag * 0.05);
      
      const distanceToLineSegment = (p: any, v: any, w: any) => {
        const l2 = (w.lat - v.lat)**2 + (w.lon - v.lon)**2;
        if (l2 === 0) return Math.sqrt((p.lat - v.lat)**2 + (p.lon - v.lon)**2);
        let t = ((p.lon - v.lon) * (w.lon - v.lon) + (p.lat - v.lat) * (w.lat - v.lat)) / l2;
        t = Math.max(0, Math.min(1, t));
        const projLat = v.lat + t * (w.lat - v.lat);
        const projLon = v.lon + t * (w.lon - v.lon);
        return Math.sqrt((p.lat - projLat)**2 + (p.lon - projLon)**2);
      };

      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const d = distanceToLineSegment({lat, lon}, poly[j], poly[i]);
        if (d <= allowedDist) return true;
      }
    }
    
    return isInside;
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev === 1) {
          // When countdown finishes, perform the database cleanup if needed
          if (buildingPolygon && buildingPolygon.length >= 3) {
            const outsideIds = evacData.inside
              .filter((r: any) => r.status === 'IN_BUILDING')
              .filter((r: any) => r.lastLat && r.lastLon && !isInsidePolygon(r.lastLat, r.lastLon, buildingPolygon))
              .map((r: any) => r._id);
            
            if (outsideIds.length > 0) {
              moveToOutside({ clerkId, insideIds: outsideIds }).catch(e => console.error("Failed to move users outside", e));
            }
          }
          return 5;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [buildingPolygon, evacData.inside, clerkId, moveToOutside]);


  const totalIn = panicUsers.length + inBuildingUsers.length;
  const totalOut = safeUsers.length;

  const handleExportCSV = async (list: any[], title: string) => {
    const headers = "Name,Status,Last Latitude,Last Longitude,Updated At\n";
    const rows = list.map((r: any) => `"${r.userName}","${r.status}",${r.lastLat || ""},${r.lastLon || ""},"${new Date(r.updatedAt).toLocaleString()}"`).join("\n");
    const csvContent = headers + rows;
    const fileName = `evacuation_${title}_${new Date().toISOString().slice(0,10)}.csv`;
    
    try {
      const fileUri = `${(FileSystem as any).documentDirectory}${fileName}`;
      await (FileSystem as any).writeAsStringAsync(fileUri, csvContent, { encoding: (FileSystem as any).EncodingType.UTF8 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Export Evacuation List' });
      } else {
        alert("Sharing is not available on this device");
      }
    } catch (e) {
      console.error(e);
      alert("Failed to export logs");
    }
  };

  const renderUser = (r: any) => (
    <View key={r._id} className="flex-row items-center justify-between py-2 border-b border-neutral-800">
      <View className="flex-1 mr-2">
        <Text 
          numberOfLines={1} 
          ellipsizeMode="tail"
          className={`font-bold ${r.status === 'PANIC' ? 'text-red-500 animate-pulse' : r.status === 'IN_BUILDING' ? 'text-neutral-300' : 'text-green-500'}`}
        >
          {r.status === 'PANIC' ? `[ 🆘 ${r.userName} ]` : r.status === 'IN_BUILDING' ? `❌ ${r.userName}` : `✅ ${r.userName}`}
        </Text>
        {r.status !== 'SAFE' && r.lastLat && r.lastLon && (
          <Text className="text-neutral-500 text-xs mt-1">
            Lat: {r.lastLat.toFixed(6)}, Lon: {r.lastLon.toFixed(6)}
          </Text>
        )}
      </View>
      {r.status !== 'SAFE' && r.lastLat && r.lastLon && (
        <TouchableOpacity 
          className="shrink-0 bg-blue-600/30 border border-blue-500/80 px-4 py-3 md:px-6 md:py-4 rounded-xl ml-2 shadow-[0_0_10px_rgba(59,130,246,0.3)]"
          onPress={() => onLocateUser(r.lastLat, r.lastLon, r.userName)}
        >
          <Text className="text-blue-300 text-base md:text-lg font-black uppercase tracking-wider">📍 Locate</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View className="mt-4 bg-neutral-800/50 rounded-xl p-4 border border-neutral-700/50">
      <View className="flex-row justify-between items-center mb-4">
        <Text className="text-white font-bold text-lg">Live Roll Call</Text>
        <TouchableOpacity onPress={() => handleExportCSV([...panicUsers, ...inBuildingUsers, ...safeUsers], "Live Roll Call")}>
          <Text className="text-blue-400 text-sm font-bold">Export CSV</Text>
        </TouchableOpacity>
      </View>

      {panicUsers.length > 0 && (
        <View className="bg-red-600 p-4 rounded-xl mb-4 border-2 border-red-400 shadow-[0_0_20px_rgba(220,38,38,0.8)] animate-pulse">
          <Text className="text-white font-black text-2xl text-center mb-1">🚨 EMERGENCY: SOS ACTIVE 🚨</Text>
          <Text className="text-white font-bold text-center text-lg mb-3">A user is in distress. Locate them immediately!</Text>
          
          {!isMuted ? (
            <TouchableOpacity 
              className="bg-black/40 py-3 px-6 rounded-xl self-center border border-white/20"
              onPress={() => setIsMuted(true)}
            >
              <Text className="text-white font-bold text-base text-center">🔕 Mute Siren for this incident</Text>
            </TouchableOpacity>
          ) : (
            <View className="bg-black/20 py-2 px-6 rounded-xl self-center border border-red-400/50">
              <Text className="text-red-200/80 italic text-sm text-center">Siren muted. Stay vigilant.</Text>
            </View>
          )}
        </View>
      )}

      {/* Totals Banner - Now acts as CSV Export Buttons */}
      <View className="flex-row bg-neutral-950 rounded-lg overflow-hidden mb-4 border border-neutral-800">
        <TouchableOpacity 
          className="flex-1 items-center justify-center py-2 bg-red-900/20 border-r border-neutral-800"
          onPress={() => handleExportCSV(evacData.inside, 'inside_users')}
        >
          <Text className="text-red-500 font-black text-xl">{totalIn}</Text>
          <Text className="text-red-400/80 text-xs font-bold tracking-widest uppercase mb-1">Inside</Text>
          <Text className="text-red-400/50 text-[10px]">Tap to Export CSV</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          className="flex-1 items-center justify-center py-2 bg-green-900/20"
          onPress={() => handleExportCSV(evacData.outside, 'outside_users')}
        >
          <Text className="text-green-500 font-black text-xl">{totalOut}</Text>
          <Text className="text-green-400/80 text-xs font-bold tracking-widest uppercase mb-1">Outside</Text>
          <Text className="text-green-400/50 text-[10px]">Tap to Export CSV</Text>
        </TouchableOpacity>
      </View>
      
      {totalIn === 0 && totalOut === 0 ? (
        <Text className="text-neutral-500 italic">No users checked in.</Text>
      ) : (
        <ScrollView style={{ maxHeight: 300 }}>
          {panicUsers.length > 0 && (
            <View className="mb-4">
              <Text className="text-red-500 font-black tracking-widest text-xs uppercase mb-1 bg-red-900/30 px-2 py-1 rounded">🚨 In Distress</Text>
              {panicUsers.map(renderUser)}
            </View>
          )}

          {inBuildingUsers.length > 0 && (
            <View className="mb-4">
              <View className="flex-row items-center justify-between mb-1 bg-amber-900/30 px-2 py-1 rounded">
                <Text className="text-amber-500 font-black tracking-widest text-xs uppercase">🏢 Inside Building</Text>
                <Text className="text-amber-400 text-xl font-black">{countdown}</Text>
              </View>
              {inBuildingUsers.map(renderUser)}
            </View>
          )}

          {safeUsers.length > 0 && (
            <View className="mb-4">
              <Text className="text-green-500 font-black tracking-widest text-xs uppercase mb-1 bg-green-900/30 px-2 py-1 rounded">✅ Safe / Outside</Text>
              {safeUsers.map(renderUser)}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
