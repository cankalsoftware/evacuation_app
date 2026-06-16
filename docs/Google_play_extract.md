# How to Publish Your Expo App to the Google Play Store

Since you are using Expo, the easiest way to build and publish your app is by using **EAS (Expo Application Services)**. EAS will package your code into an Android App Bundle (`.aab` file), which is the exact format Google requires for the Play Store.

Follow these steps carefully. Take your time!

---

## Step 1: Create a Google Play Developer Account
Before you can publish anything, you need an official developer account with Google.
1. Go to the [Google Play Console](https://play.google.com/console/signup).
2. Sign in with your Google account.
3. Pay the **$25 one-time registration fee**.
4. Verify your identity (Google usually requires a photo ID like a driver's license or passport).

---

## Step 2: Prepare Your App Configuration
We need to tell Google exactly what your app is called internally. Open the `app.json` file in your project folder and make sure you have the `android` section filled out. 

It should look something like this:
```json
{
  "expo": {
    "name": "Evacuation App",
    "slug": "evacuation-app",
    "version": "1.0.0",
    "android": {
      "package": "uk.firevision.evacuationapp",
      "versionCode": 1,
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      }
    }
  }
}
```
*Note: The `package` name (e.g., `uk.firevision.evacuationapp`) must be unique across the entire Google Play Store. It is usually formatted as `com.yourcompany.appname`.*

---

## Step 3: Install EAS CLI
EAS CLI is the tool that builds your app in the cloud so your computer doesn't have to do the heavy lifting.
1. Open your terminal in VS Code.
2. Run this command to install it globally on your computer:
   `npm install -g eas-cli`

---

## Step 4: Log in to Expo
1. Go to [expo.dev](https://expo.dev/) and create a free account if you don't have one.
2. Go back to your terminal and type:
   `eas login`
3. Enter your Expo username and password.

---

## Step 5: Configure Your Project for Building
In your terminal, run:
`eas build:configure`
- It will ask you which platforms you want to configure. Select **All** or **Android**.
- This will automatically create a file called `eas.json` in your project.

---

## Step 6: Build the App for Google Play
Now it's time to actually build the `.aab` (Android App Bundle) file.
1. In your terminal, run:
   `eas build --platform android`
2. It will ask you a few questions:
   - **Would you like to generate a new Android Keystore?** -> Press **Yes (Y)**. (EAS will safely store this key for you. Never lose your Expo account, as this key proves you own the app!).
3. The build process will now start in the cloud. It usually takes about 10 to 15 minutes.
4. When it finishes, the terminal will give you a **Download Link**. Click the link and download the `.aab` file to your computer.

---

## Step 7: Create the App in Google Play Console
1. Log in to your [Google Play Console](https://play.google.com/console).
2. Click **Create App** in the top right.
3. Fill in your App Name, Default Language, and select **App** (not Game) and **Free**.
4. Accept the developer declarations and click **Create App**.

---

## Step 8: Upload Your `.aab` File to Google Play
1. In the Google Play Console menu on the left, scroll down to **Release** -> **Testing** -> **Internal Testing**.
   *(It is highly recommended to do an Internal Test before going straight to Production)*.
2. Click **Create new release**.
3. Under "App bundles", click **Upload** and select the `.aab` file you downloaded in Step 6.
4. Add a release note (e.g., "Initial MVP Release").
5. Click **Save** and then **Review release**.

---

## Step 9: Fill out the Store Listing (The boring part)
Before Google lets anyone download your app, you have to fill out all the legal and store information.
Go through the menu on the left side of the Play Console and complete:
- **Store presence -> Main store listing**: Add your App Icon, Description, and Screenshots.
- **App content**: Fill out the Privacy Policy URL, Content Rating questionnaire, Data Safety form, and Target Audience.

## Step 10: Rollout!
Once all the checks are green and your Store Listing is approved, you can promote your Internal Test to **Production**. Google will review the app (this can take 1 to 7 days for a brand new account). Once approved, your app will be live on the Google Play Store!
