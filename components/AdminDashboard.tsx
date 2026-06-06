import React from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

export default function AdminDashboard() {
  const { signOut } = useAuth();
  const { user } = useUser();
  const dashboardData = useQuery(api.portal.getDashboardData, { clerkId: user?.id });

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
    <View className="flex-1 bg-neutral-900 pt-16">
      {/* Header */}
      <View className="px-6 flex-row justify-between items-center mb-6">
        <View>
          <Text className="text-3xl font-extrabold text-white">Admin Console</Text>
          <Text className="text-red-400 font-bold">{user?.primaryEmailAddress?.emailAddress}</Text>
        </View>
        <TouchableOpacity 
          className="bg-neutral-800 p-3 rounded-full border border-neutral-700"
          onPress={() => signOut()}
        >
          <Text className="text-white text-sm">Sign Out</Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 px-6">
        
        {/* Quick Actions */}
        <View className="flex-row space-x-4 mb-8">
          <TouchableOpacity className="flex-1 bg-red-600/20 border border-red-500/50 p-4 rounded-2xl items-center">
            <Text className="text-2xl mb-1">📢</Text>
            <Text className="text-red-400 font-bold text-center text-xs">Evacuate All</Text>
          </TouchableOpacity>
          <TouchableOpacity className="flex-1 bg-neutral-800 border border-neutral-700 p-4 rounded-2xl items-center">
            <Text className="text-2xl mb-1">🗺️</Text>
            <Text className="text-white font-bold text-center text-xs">Upload Plan</Text>
          </TouchableOpacity>
        </View>



        {/* Managed Buildings */}
        <Text className="text-xl font-bold text-white mb-4">Managed Buildings</Text>
        {dashboardData.buildings && dashboardData.buildings.length > 0 ? (
          dashboardData.buildings.map((building: any) => (
             <View key={building._id} className="bg-neutral-800 border border-neutral-700 p-4 rounded-2xl mb-4">
                <Text className="text-white font-bold text-lg">{building.name}</Text>
                <Text className="text-neutral-400 text-sm mt-1">{building.address}</Text>
             </View>
          ))
        ) : (
          <View className="bg-neutral-800 border border-neutral-700 p-6 rounded-2xl items-center mb-8">
             <Text className="text-neutral-400 text-center">You have not registered any buildings yet.</Text>
             <TouchableOpacity className="mt-4 bg-white/10 px-4 py-2 rounded-lg">
               <Text className="text-white font-bold">Register Building</Text>
             </TouchableOpacity>
          </View>
        )}
        
        <View className="h-10" />
      </ScrollView>
    </View>
  );
}
