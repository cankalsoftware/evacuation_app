module.exports = {
  expo: {
    name: "FireVision Evacuation",
    slug: "firevision_evacuation",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    ios: {
      supportsTablet: true,
      infoPlist: {
        NSCameraUsageDescription: "FireVision needs access to your camera to scan hotel evacuation plans securely.",
        NSPhotoLibraryUsageDescription: "FireVision needs access to your photo library to upload saved evacuation plans."
      }
    },
    android: {
      package: "uk.firevision.evacuation",
      googleServicesFile: "./google-services.json",
      predictiveBackGestureEnabled: false,
      permissions: [
        "android.permission.CAMERA",
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE",
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.RECORD_AUDIO"
      ],
      config: {
        googleMaps: {
          // Even a placeholder API key prevents a fatal native crash on Android startup.
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || ""
        }
      }
    },
    web: {
      favicon: "./assets/favicon.png"
    },
    plugins: [
      "expo-web-browser",
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission: "Allow FireVision to use your location to verify your proximity to your scanned evacuation plan."
        }
      ],
      [
        "expo-image-picker",
        {
          photosPermission: "Allow FireVision to access your photos to upload evacuation plans.",
          cameraPermission: "Allow FireVision to access your camera to scan evacuation plans."
        }
      ],
      [
        "expo-camera",
        {
          cameraPermission: "Allow FireVision to access your camera for AR evacuation mode."
        }
      ],
      "expo-sharing"
    ],
    extra: {
      eas: {
        projectId: "b1c9f7aa-5895-4f04-bd7e-41270fa124e2"
      }
    }
  }
};
