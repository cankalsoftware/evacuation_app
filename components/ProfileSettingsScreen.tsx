import React, { useState, useEffect } from "react";
import { View, Modal, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { Text, TouchableOpacity, TextInput } from "./ResponsiveUI";
import { useUser } from "@clerk/clerk-expo";
import * as Location from "expo-location";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";

type Props = {
  visible: boolean;
  onClose: () => void;
  dashboardData: any;
};

export default function ProfileSettingsScreen({ visible, onClose, dashboardData }: Props) {
  const { user } = useUser();
  const [name, setName] = useState(dashboardData?.name || "");
  const [phone, setPhone] = useState(dashboardData?.phone || "");
  const [saving, setSaving] = useState(false);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [refreshingLocation, setRefreshingLocation] = useState(false);

  const updateProfile = useMutation(api.portal.updateProfile);

  useEffect(() => {
    if (visible) {
      setName(dashboardData?.name || "");
      setPhone(dashboardData?.phone || "");
      fetchLocation();
    }
  }, [visible, dashboardData]);

  const fetchLocation = async () => {
    setRefreshingLocation(true);
    try {
      let { status } = await Location.getForegroundPermissionsAsync();
      if (status === 'granted') {
        let loc = await Location.getCurrentPositionAsync({});
        setLocation(loc);
      }
    } catch (e) {
      console.log("Error fetching location", e);
    } finally {
      setRefreshingLocation(false);
    }
  };

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      await updateProfile({ clerkId: user.id, name: name.trim(), phone: phone.trim() });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView className="flex-1 bg-neutral-900">
          <View className="px-6 pt-12 pb-12">
        <View className="flex-row justify-between items-center mb-8">
          <Text className="text-3xl font-extrabold text-white">Profile Settings</Text>
          <TouchableOpacity onPress={onClose} className="bg-neutral-800 w-10 h-10 rounded-full border border-neutral-700 items-center justify-center">
            <Text className="text-white text-lg font-bold">✕</Text>
          </TouchableOpacity>
        </View>

        <View className="space-y-6 mb-8">
          <View>
            <Text className="text-neutral-400 mb-2 font-bold text-xs uppercase tracking-wider">Email Address (Read-Only)</Text>
            <View className="bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-4">
              <Text className="text-white text-lg">{user?.primaryEmailAddress?.emailAddress}</Text>
            </View>
          </View>

          <View>
            <Text className="text-neutral-400 mb-2 font-bold text-xs uppercase tracking-wider">Full Name (Optional)</Text>
            <TextInput
              className="bg-neutral-900 border border-neutral-700 text-white rounded-xl px-4 py-4 text-lg"
              placeholder="John Doe"
              placeholderTextColor="#666"
              value={name}
              onChangeText={setName}
            />
          </View>

          <View>
            <Text className="text-neutral-400 mb-2 font-bold text-xs uppercase tracking-wider">Telephone (Optional)</Text>
            <TextInput
              className="bg-neutral-900 border border-neutral-700 text-white rounded-xl px-4 py-4 text-lg"
              placeholder="+1 555 123 4567"
              placeholderTextColor="#666"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />
          </View>

          <TouchableOpacity 
            onPress={handleSave} 
            disabled={saving}
            className="bg-red-600 py-4 rounded-xl items-center mt-4 shadow-lg border-2 border-red-500"
          >
            {saving ? <ActivityIndicator color="white" /> : <Text className="text-white font-extrabold text-lg uppercase tracking-wider">Save Profile</Text>}
          </TouchableOpacity>
        </View>

        <View className="bg-neutral-800 p-6 rounded-3xl border border-neutral-700">
          <Text className="text-xl font-bold text-white mb-6">Location Services</Text>
          
          <View className="flex-row items-center mb-2">
            <View className="w-6 h-6 bg-green-500 rounded border border-green-400 items-center justify-center mr-3">
              <Text className="text-white font-bold text-xs">✓</Text>
            </View>
            <Text className="text-white text-base font-bold">Location Tracking Enabled</Text>
          </View>
          <TouchableOpacity onPress={() => console.log("Terms pressed")}>
            <Text className="text-red-400 text-sm ml-9 mb-6 underline">View Terms & Conditions</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={fetchLocation}
            disabled={refreshingLocation}
            className="bg-neutral-900 p-4 rounded-xl border border-neutral-700 mb-6 flex-row items-center"
          >
            {refreshingLocation ? (
              <ActivityIndicator color="white" size="large" className="mr-4" />
            ) : (
              <Text className="text-3xl mr-4">📍</Text>
            )}
            <View>
              <Text className="text-neutral-400 text-xs uppercase mb-1 font-bold">Current Coordinates</Text>
              {location ? (
                 <Text className="text-white font-mono text-xs">
                   Lat: {location.coords.latitude.toFixed(6)}{"\n"}
                   Lon: {location.coords.longitude.toFixed(6)}
                 </Text>
              ) : (
                 <Text className="text-neutral-500 italic text-xs">Waiting for GPS lock...</Text>
              )}
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={fetchLocation}
            disabled={refreshingLocation}
            className="flex-row justify-center items-center py-3 bg-neutral-700 rounded-xl border border-neutral-600"
          >
            {refreshingLocation ? <ActivityIndicator color="white" className="mr-2" /> : <Text className="mr-2 text-xl">🛰️</Text>}
            <Text className="text-white font-bold">Force Refresh Location</Text>
          </TouchableOpacity>
        </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
