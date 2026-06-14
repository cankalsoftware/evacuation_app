import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ScrollView, Platform } from "react-native";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";

export default function LiveRollCall({ incidentId, clerkId, onLocateUser, buildingPolygon }: { incidentId: any, clerkId: string, onLocateUser: (lat: number, lon: number, name: string) => void, buildingPolygon?: any[] }) {
  const evacData = useQuery(api.portal.getEvacuationData, { clerkId, incidentId }) || { inside: [], outside: [] };
  const moveToOutside = useMutation(api.portal.moveToOutside);
  
  const [countdown, setCountdown] = useState(5);

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

  const panicUsers = evacData.inside.filter((r: any) => r.status === 'PANIC');
  const inBuildingUsers = evacData.inside.filter((r: any) => r.status === 'IN_BUILDING');
  const safeUsers = evacData.outside;

  const totalIn = panicUsers.length + inBuildingUsers.length;
  const totalOut = safeUsers.length;

  const handleExportCSV = (list: any[], title: string) => {
    if (Platform.OS !== 'web') {
      alert("Export is only supported on web right now.");
      return;
    }
    
    const headers = "Name,Status,Last Latitude,Last Longitude,Updated At\n";
    const rows = list.map((r: any) => `"${r.userName}","${r.status}",${r.lastLat || ""},${r.lastLon || ""},"${new Date(r.updatedAt).toLocaleString()}"`).join("\n");
    const csvContent = headers + rows;
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `evacuation_${title}_${new Date().toISOString().slice(0,10)}.csv`);
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
      <View className="mb-3">
        <Text className="text-white font-bold text-lg">Live Locations</Text>
      </View>

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
