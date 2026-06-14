import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ScrollView, Platform } from "react-native";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";

export default function LiveRollCall({ incidentId, clerkId, onLocateUser, buildingPolygon }: { incidentId: any, clerkId: string, onLocateUser: (lat: number, lon: number, name: string) => void, buildingPolygon?: any[] }) {
  const rollCall = useQuery(api.portal.getRollCall, { clerkId, incidentId }) || [];
  const removeRollCallUsers = useMutation(api.portal.removeRollCallUsers);
  
  const [countdown, setCountdown] = useState(5);

  const isInsidePolygon = (lat: number, lon: number, poly: any[]) => {
    let isInside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].lon, yi = poly[i].lat;
      const xj = poly[j].lon, yj = poly[j].lat;
      const intersect = ((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi);
      if (intersect) isInside = !isInside;
    }
    return isInside;
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev === 1) {
          // When countdown finishes, perform the database cleanup if needed
          if (buildingPolygon && buildingPolygon.length >= 3) {
            const outsideIds = rollCall
              .filter((r: any) => r.status === 'IN_BUILDING')
              .filter((r: any) => r.lastLat && r.lastLon && !isInsidePolygon(r.lastLat, r.lastLon, buildingPolygon))
              .map((r: any) => r._id);
            
            if (outsideIds.length > 0) {
              removeRollCallUsers({ clerkId, rollCallIds: outsideIds }).catch(e => console.error("Failed to clean up outside users", e));
            }
          }
          return 5;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [buildingPolygon, rollCall, clerkId, removeRollCallUsers]);

  // Group roll call by status
  const panicUsers = rollCall.filter((r: any) => r.status === 'PANIC');
  const inBuildingUsers = rollCall.filter((r: any) => r.status === 'IN_BUILDING');
  const safeUsers = rollCall.filter((r: any) => r.status === 'SAFE');

  const totalIn = panicUsers.length + inBuildingUsers.length;
  const totalOut = safeUsers.length;

  const handleExportCSV = () => {
    if (Platform.OS !== 'web') {
      alert("Export is only supported on web right now.");
      return;
    }
    
    // Generate CSV string
    const headers = "Name,Status,Last Latitude,Last Longitude,Updated At\n";
    const rows = rollCall.map((r: any) => `"${r.userName}","${r.status}",${r.lastLat || ""},${r.lastLon || ""},"${new Date(r.updatedAt).toLocaleString()}"`).join("\n");
    const csvContent = headers + rows;
    
    // Create Blob and download
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `evacuation_roll_call_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
          className="shrink-0 bg-blue-600/20 border border-blue-500/50 px-3 py-1 rounded"
          onPress={() => onLocateUser(r.lastLat, r.lastLon, r.userName)}
        >
          <Text className="text-blue-400 text-xs font-bold">Locate</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View className="mt-4 bg-neutral-900 border border-neutral-700 rounded-xl p-4">
      <View className="flex-row justify-between items-center mb-3">
        <Text className="text-white font-bold text-lg">Live Locations</Text>
        <TouchableOpacity onPress={handleExportCSV} className="bg-neutral-800 px-3 py-1 rounded border border-neutral-700">
          <Text className="text-white text-xs font-bold">Export CSV</Text>
        </TouchableOpacity>
      </View>

      {/* Totals Banner */}
      <View className="flex-row bg-neutral-950 rounded-lg overflow-hidden mb-4 border border-neutral-800">
        <View className="flex-1 items-center justify-center py-2 bg-red-900/20 border-r border-neutral-800">
          <Text className="text-red-500 font-black text-xl">{totalIn}</Text>
          <Text className="text-red-400/80 text-xs font-bold tracking-widest uppercase">Inside</Text>
        </View>
        <View className="flex-1 items-center justify-center py-2 bg-green-900/20">
          <Text className="text-green-500 font-black text-xl">{totalOut}</Text>
          <Text className="text-green-400/80 text-xs font-bold tracking-widest uppercase">Outside</Text>
        </View>
      </View>
      
      {rollCall.length === 0 ? (
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
                <Text className="text-amber-400 text-[10px] font-bold">Refresh in {countdown}s</Text>
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
