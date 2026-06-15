import React, { useState } from "react";
import { View, Modal, Image, ActivityIndicator, Alert } from "react-native";
import { Text, TouchableOpacity } from "./ResponsiveUI";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { useUser } from "@clerk/clerk-expo";

type Props = {
  visible: boolean;
  onClose: () => void;
};

export default function PlanScannerModal({ visible, onClose }: Props) {
  const { user } = useUser();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const generateUploadUrl = useMutation(api.portal.generateUploadUrl);
  const uploadScannedPlan = useMutation(api.portal.uploadScannedPlan);

  const handleTakePhoto = async () => {
    let result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled) {
      setImageUri(result.assets[0].uri);
    }
  };

  const handlePickGallery = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled) {
      setImageUri(result.assets[0].uri);
    }
  };

  const handleConfirm = async () => {
    if (!imageUri || !user?.id) return;
    setUploading(true);

    try {
      // 1. Get Live GPS Location
      let { status } = await Location.getForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "We need location permissions to securely geo-fence this evacuation plan.");
        setUploading(false);
        return;
      }
      let location = await Location.getCurrentPositionAsync({});

      // 2. Upload Image to Convex Storage
      const postUrl = await generateUploadUrl();
      const response = await fetch(imageUri);
      const blob = await response.blob();

      const result = await fetch(postUrl, {
        method: "POST",
        headers: { "Content-Type": blob.type },
        body: blob,
      });

      const { storageId } = await result.json();

      // 3. Save to database with GPS coordinates
      await uploadScannedPlan({
        clerkId: user.id,
        storageId,
        lat: location.coords.latitude,
        lon: location.coords.longitude,
      });

      // Done!
      setImageUri(null);
      onClose();
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to upload the evacuation plan.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide">
      <View className="flex-1 bg-black">
        {imageUri ? (
          <View className="flex-1">
            <Image source={{ uri: imageUri }} className="flex-1" resizeMode="contain" />
            <View className="absolute bottom-0 w-full p-8 bg-black/80 flex-row justify-between pb-12">
              <TouchableOpacity onPress={() => setImageUri(null)} className="py-4 px-8 bg-neutral-800 rounded-xl">
                <Text className="text-white font-bold text-lg">Retake</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleConfirm} disabled={uploading} className="py-4 px-8 bg-green-600 rounded-xl flex-row items-center">
                {uploading ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold text-lg">Confirm Plan</Text>}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View className="flex-1 justify-center items-center px-6">
            <Text className="text-white text-3xl font-extrabold mb-4 text-center">Scan Evacuation Plan</Text>
            <Text className="text-neutral-400 text-center mb-12 text-lg">Take a photo of the evacuation plan located behind your hotel room door, or upload an existing photo.</Text>

            <TouchableOpacity onPress={handleTakePhoto} className="bg-red-600 w-full py-5 rounded-2xl mb-4 items-center flex-row justify-center">
              <Text className="text-white font-extrabold text-xl mr-2">📸</Text>
              <Text className="text-white font-extrabold text-xl">Take Photo</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={handlePickGallery} className="bg-neutral-800 w-full py-5 rounded-2xl items-center flex-row justify-center border border-neutral-700">
              <Text className="text-white font-extrabold text-xl mr-2">🖼️</Text>
              <Text className="text-white font-extrabold text-xl">Choose from Gallery</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={onClose} className="mt-12 py-4 px-8">
              <Text className="text-neutral-500 font-bold text-lg">Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}
