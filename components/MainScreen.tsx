import React from "react";
import { View, ActivityIndicator } from "react-native";
import { useUser } from "@clerk/clerk-expo";
import GuestDashboard from "./GuestDashboard";
import AdminDashboard from "./AdminDashboard";

export default function MainScreen() {
  const { user, isLoaded } = useUser();

  if (!isLoaded) {
    return (
      <View className="flex-1 bg-neutral-900 justify-center items-center">
        <ActivityIndicator color="red" size="large" />
      </View>
    );
  }

  const isAdmin = user?.publicMetadata?.role === "admin";

  if (isAdmin) {
    return <AdminDashboard />;
  }

  return <GuestDashboard />;
}
