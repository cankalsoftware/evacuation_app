import React from "react";
import { View, ActivityIndicator } from "react-native";
import { useUser } from "@clerk/clerk-expo";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import GuestDashboard from "./GuestDashboard";
import AdminDashboard from "./AdminDashboard";

export default function MainScreen() {
  const { user, isLoaded } = useUser();
  const convexUser = useQuery(api.users.getUser, { clerkId: user?.id });

  if (!isLoaded || convexUser === undefined) {
    return (
      <View className="flex-1 bg-neutral-900 justify-center items-center">
        <ActivityIndicator color="red" size="large" />
      </View>
    );
  }

  // If the user isn't fully synced yet, keep showing loading
  if (convexUser === null) {
    return (
      <View className="flex-1 bg-neutral-900 justify-center items-center">
        <ActivityIndicator color="red" size="large" />
      </View>
    );
  }

  const isAdmin = convexUser.role === "admin";

  if (isAdmin) {
    return <AdminDashboard />;
  }

  return <GuestDashboard />;
}
