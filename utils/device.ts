import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export async function getOrCreateDeviceId(): Promise<string> {
  const STORAGE_KEY = 'firevision_device_id';
  let deviceId: string | null = null;
  
  if (Platform.OS === 'web') {
    deviceId = localStorage.getItem(STORAGE_KEY);
    if (!deviceId) {
      deviceId = `dev_${Date.now()}_${Math.random().toString(36).substring(2)}`;
      localStorage.setItem(STORAGE_KEY, deviceId);
    }
  } else {
    try {
      deviceId = await SecureStore.getItemAsync(STORAGE_KEY);
      if (!deviceId) {
        deviceId = `dev_${Date.now()}_${Math.random().toString(36).substring(2)}`;
        await SecureStore.setItemAsync(STORAGE_KEY, deviceId);
      }
    } catch (err) {
      console.warn("SecureStore failed, generating ephemeral ID", err);
      deviceId = `dev_${Date.now()}_ephemeral`;
    }
  }
  return deviceId;
}
