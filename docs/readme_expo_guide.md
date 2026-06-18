# Expo Build & Debug Guide

This guide covers the essential commands and concepts for running, building, and debugging your Expo React Native application.

## 1. Running the App Locally (Expo Go)

To run the app locally during development, you use the Expo development server. This creates a local server that your Expo Go app (on your phone) can connect to via Wi-Fi.

**Command:**
```bash
npx expo start
```
*(Tip: If you ever run into weird caching issues where old code is still running, clear the cache using `npx expo start -c`)*

**How to connect:**
1. Make sure your phone and computer are on the same Wi-Fi network.
2. Open the **Expo Go** app on your phone.
3. Scan the QR code that appears in your terminal.

---

## 2. Building for Production

When you are ready to create a standalone app (APK) that can be installed directly on a phone without the Expo Go app, you use EAS (Expo Application Services).

**Command:**
```bash
eas build -p android --profile preview
```

**What this does:**
1. Packages your local code (excluding files in `.gitignore` like `.env`).
2. Uploads it to the Expo cloud servers.
3. Compiles a standalone `.apk` using the configurations defined in your `app.config.js` and `eas.json`.
4. Provides a download link (or QR code) to install the app on your Android device.

**Important Note on Environment Variables:**
Because your `.env` files are in `.gitignore` to protect your secrets, the EAS server never sees them. To inject environment variables into your production build, you MUST define them in your `eas.json` under the `"env"` section of the profile you are building.

---

## 3. Debugging Native Crashes (Development Client)

Sometimes, your app will work perfectly in Expo Go, but crash immediately when you build a standalone APK. This happens because Expo Go runs an older, more forgiving native environment, whereas the standalone build compiles strict, modern native code (like the New Architecture).

If a standalone app crashes on startup (e.g. showing "There is a bug in the app"), you cannot easily see the error without Android Developer Tools. To catch these elusive native crashes, you should build an **EAS Development Client**.

**What is a Development Client?**
It is a custom version of Expo Go that contains **your** exact native code and modules. It connects to your local development server just like Expo Go, but if a crash occurs, it will display a massive red error screen with the exact stack trace!

### Step 1: Build the Development Client
Run this command to build the custom client:
```bash
eas build -p android --profile development
```
*(If EAS asks if you want it to install `expo-dev-client` for you, always answer **Yes**!)*

### Step 2: Install and Run
1. Download the finished APK and install it on your phone.
2. Start your local server in "dev client" mode:
   ```bash
   npx expo start --dev-client
   ```
3. Open your newly installed app on your phone and scan the QR code.
4. The app will connect. If there is a native crash, it will be caught and displayed immediately on your screen and in your VSCode terminal!

---

## 4. Building for App Stores (Google Play & Apple App Store)

Once your app is thoroughly tested and you are ready to publish it to the official app stores, you need to create production artifacts. Google Play requires an `.aab` (Android App Bundle), and Apple requires an iOS build.

**Before you build:** Make sure your `app.config.js` and `eas.json` `production` profile contain all required production API keys.

### Android (Google Play Store)
By default, the `eas build -p android` (with the default `production` profile) creates an `.aab` file automatically.

**Command:**
```bash
eas build -p android --profile production
```
*(EAS will guide you through generating or uploading an Android Keystore. Let it handle it automatically for you if this is your first time).*

### iOS (Apple App Store)
Building for iOS requires an Apple Developer account. 

**Command:**
```bash
eas build -p ios --profile production
```
*(EAS will ask you to log into your Apple Developer account to manage your provisioning profiles and certificates automatically).*

### Auto-Submit to Stores
Expo also offers `eas submit`, which can automatically upload your finished `.aab` or `.ipa` directly to the Google Play Console or Apple App Store Connect without needing Xcode or Android Studio.

```bash
# Submit your latest Android build
eas submit -p android

# Submit your latest iOS build
eas submit -p ios
```
