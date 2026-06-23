/**
 * @file ProfileSettingsScreen.tsx
 * @description Provides a modal interface for users (both guests and admins) to update their
 * profile information (name, phone) and review/grant necessary device permissions like
 * Location and Notifications.
 * 
 * @module ProfileSettingsScreen
 */
import React, { useState, useEffect } from "react";
import { View, Modal, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform, Linking } from "react-native";
import { Text, TouchableOpacity, TextInput, FooterLinks } from "./ResponsiveUI";
import { useUser } from "@clerk/clerk-expo";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";

type Props = {
  visible: boolean;
  onClose: () => void;
  dashboardData: any;
};

/**
 * ProfileSettingsScreen Component
 * 
 * @description Renders a modal overlay containing user profile inputs and permission toggles.
 * Automatically synchronizes profile changes to the Convex database.
 * 
 * @param {Object} props - Component props
 * @param {boolean} props.visible - Controls the visibility of the modal
 * @param {Function} props.onClose - Callback triggered when the modal is closed
 * @param {any} props.dashboardData - Current user's preferences, permissions, and profile info
 * @returns {JSX.Element} The rendered React component.
 */
export default function ProfileSettingsScreen({ visible, onClose, dashboardData }: Props) {
  const { user } = useUser();
  const [name, setName] = useState(dashboardData?.name || "");
  const [phone, setPhone] = useState(dashboardData?.phone || "");
  const [agreedToTandC, setAgreedToTandC] = useState(dashboardData?.agreedToTandC || false);
  const [saving, setSaving] = useState(false);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [refreshingLocation, setRefreshingLocation] = useState(false);
  const [hasLocation, setHasLocation] = useState(true);
  const [hasNotifications, setHasNotifications] = useState(true);
  const hasPermissions = hasLocation && hasNotifications;

  const updateProfile = useMutation(api.portal.updateProfile);

  useEffect(() => {
    if (visible) {
      setName(dashboardData?.name || "");
      setPhone(dashboardData?.phone || "");
      setAgreedToTandC(dashboardData?.agreedToTandC || false);
      
      setHasLocation(dashboardData?.locationGranted === true);
      setHasNotifications(dashboardData?.notificationsGranted === true);

      fetchLocation();
    }
  }, [visible, dashboardData]);

  const fetchLocation = async () => {
    setRefreshingLocation(true);
    try {
      let { status } = await Location.getForegroundPermissionsAsync();
      const dbGranted = dashboardData?.locationGranted === true;
      
      if (dbGranted && status === 'granted') {
        let loc = await Location.getCurrentPositionAsync({});
        setLocation(loc);
      } else {
        setLocation(null);
      }
    } catch (e) {
      console.log("Error fetching location", e);
    } finally {
      setRefreshingLocation(false);
    }
  };

  const handleSave = async () => {
    if (!user?.id) return;
    
    if (!dashboardData?.agreedToTandC && !agreedToTandC) {
       alert("You must agree to the Terms and Conditions to proceed.");
       return;
    }
    
    setSaving(true);
    try {

      await updateProfile({ 
        clerkId: user.id, 
        name: name.trim(), 
        phone: phone.trim(),
        agreedToTandC,
        locationGranted: hasLocation,
        notificationsGranted: hasNotifications,
      });
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
          <Text className="text-3xl font-extrabold text-white">{!dashboardData?.agreedToTandC ? "Welcome to FireVision" : "Profile Settings"}</Text>
          <TouchableOpacity onPress={onClose} className="bg-neutral-800 w-10 h-10 rounded-full border border-neutral-700 items-center justify-center">
            <Text className="text-white text-lg font-bold">✕</Text>
          </TouchableOpacity>
        </View>

        {!dashboardData?.agreedToTandC && (
          <Text className="text-neutral-300 mb-6 leading-relaxed">
            Please complete your profile and review our Terms and Conditions to access the Evacuation features.
          </Text>
        )}

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

        <View className="bg-neutral-800 p-6 rounded-3xl border border-neutral-700 mb-6">
          <Text className="text-xl font-bold text-white mb-6">Device Permissions</Text>
          
          <TouchableOpacity 
            className="flex-row items-center mb-6"
            onPress={async () => {
              if (hasLocation) {
                setHasLocation(false);
              } else {
                setHasLocation(true);
                try {
                  const { status } = await Location.requestForegroundPermissionsAsync();
                  if (status !== 'granted') {
                    alert("Location permission denied by OS. Please enable it in your device settings.");
                  }
                } catch (e) {
                  console.warn(e);
                }
              }
            }}
          >
            <View className={`w-6 h-6 rounded border items-center justify-center mr-3 ${hasLocation ? 'bg-blue-600 border-blue-500' : 'bg-neutral-900 border-neutral-700'}`}>
              {hasLocation && <Text className="text-white font-bold text-xs">✓</Text>}
            </View>
            <Text className="text-neutral-300 flex-1">
              Grant Location Permission
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            className="flex-row items-center mb-6"
            onPress={async () => {
              if (hasNotifications) {
                setHasNotifications(false);
              } else {
                setHasNotifications(true);
                try {
                  if (Platform.OS !== 'web') {
                    const { status } = await Notifications.requestPermissionsAsync();
                    if (status !== 'granted') {
                      alert("Notification permission denied by OS. Please enable it in your device settings.");
                    }
                  }
                } catch (e) {
                  console.warn(e);
                }
              }
            }}
          >
            <View className={`w-6 h-6 rounded border items-center justify-center mr-3 ${hasNotifications ? 'bg-blue-600 border-blue-500' : 'bg-neutral-900 border-neutral-700'}`}>
              {hasNotifications && <Text className="text-white font-bold text-xs">✓</Text>}
            </View>
            <Text className="text-neutral-300 flex-1">
              Grant Push Notification Permission
            </Text>
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

          <View className="flex-row flex-wrap items-center mb-4 mt-2">
            <TouchableOpacity onPress={() => setAgreedToTandC(!agreedToTandC)} className="flex-row items-center mr-1">
              <View className={`w-6 h-6 rounded border items-center justify-center mr-3 ${agreedToTandC ? 'bg-blue-600 border-blue-500' : 'bg-neutral-900 border-neutral-700'}`}>
                {agreedToTandC && <Text className="text-white font-bold text-xs">✓</Text>}
              </View>
              <Text className="text-neutral-300">I confirm and agree to the </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => Linking.openURL('https://www.firevision.uk/terms')}>
              <Text className="underline text-neutral-300">Terms and Conditions</Text>
            </TouchableOpacity>
            <Text className="text-neutral-300">.</Text>
          </View>

          <TouchableOpacity 
            onPress={handleSave} 
            disabled={saving}
            className={`py-4 rounded-xl items-center mt-4 shadow-lg border-2 ${!dashboardData?.agreedToTandC && !agreedToTandC ? 'bg-neutral-700 border-neutral-600 opacity-50' : 'bg-red-600 border-red-500'}`}
          >
            {saving ? <ActivityIndicator color="white" /> : <Text className="text-white font-extrabold text-lg uppercase tracking-wider">{!dashboardData?.agreedToTandC ? "Complete Setup" : "Save Profile"}</Text>}
          </TouchableOpacity>
        </View>


          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
