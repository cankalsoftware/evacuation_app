import React from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

export default function LiveRollCall({ incidentId, clerkId, onLocateUser }: { incidentId: any, clerkId: string, onLocateUser: (lat: number, lon: number, name: string) => void }) {
  const rollCall = useQuery(api.portal.getRollCall, { clerkId, incidentId }) || [];

  return (
    <View className="mt-4 bg-neutral-900 border border-neutral-700 rounded-xl p-4">
      <Text className="text-white font-bold text-lg mb-3">Live Roll Call</Text>
      
      {rollCall.length === 0 ? (
        <Text className="text-neutral-500 italic">No users have checked in yet.</Text>
      ) : (
        <ScrollView style={{ maxHeight: 200 }}>
          {rollCall.map((r: any) => (
            <View key={r._id} className="flex-row items-center justify-between py-2 border-b border-neutral-800">
              <View>
                <Text className={`font-bold ${r.status === 'PANIC' ? 'text-red-500 animate-pulse' : r.status === 'IN_BUILDING' ? 'text-neutral-300' : 'text-green-500'}`}>
                  {r.status === 'PANIC' ? `[ 🆘 ${r.userName} ]` : r.status === 'IN_BUILDING' ? `❌ ${r.userName}` : `✅ ${r.userName}`}
                </Text>
                {r.status !== 'SAFE' && r.lastLat && r.lastLon && (
                  <Text className="text-neutral-500 text-xs mt-1">
                    Lat: {r.lastLat.toFixed(6)}, Lon: {r.lastLon.toFixed(6)}
                  </Text>
                )}
              </View>
              {r.status !== 'SAFE' && (
                <TouchableOpacity 
                  className="bg-blue-600/20 border border-blue-500/50 px-3 py-1 rounded"
                  onPress={() => onLocateUser(r.lastLat, r.lastLon, r.userName)}
                >
                  <Text className="text-blue-400 text-xs font-bold">Locate</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
