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

---

## ❓ Frequently Asked Questions (Q&A)

### 1. Accounts & Registration
**Q: Should I use my personal or FireVision Google account to register with Google Play? Should it be a "Personal" or "Organization" account?**
**A:** You **must use an official company Google account** (e.g., an admin email for Cankal Software), and you should absolutely register it as an **Organization account**. 
- **Why an Organization?** Google recently introduced strict rules for "Personal" accounts. If you register as Personal, Google forces you to find 20 real people to test your app for 14 straight days before they let you publish it. **Organization accounts bypass this rule.** As long as Cankal Software is a registered business (and you have a D-U-N-S number), you can publish immediately.
- **Can one business account hold multiple apps?** **Yes!** You pay the $25 fee exactly *once*. Under your developer account, you can publish unlimited apps (FireVision, and any future apps you build). 
- **What if my official Gov.uk registered name is too long?** When registering an Organization, Google requires your **Legal Entity Name** to match your documents exactly (e.g., "Cankal software and IT consultancy Ltd."). However, Google Play provides a separate field called **"Developer Name"**. This is the public name that users actually see on the App Store. You can set this public Developer Name to simply **"CankalSoftware"** for brand recognition!
- **When applying for a D-U-N-S number, should I select General, Apple, or Google?** The 9-digit D-U-N-S number you receive is **universal**. Once you get your DUNS number, you use that **exact same number** for both your Google Play registration *and* your future Apple Developer registration. 

**Pro Tip: How to get your DUNS number faster and for free:**
It is highly recommended to apply through the Apple Developer portal instead of the main D&B website, as Apple has a direct partnership that expedites the process.
1. Log in to your Apple Developer account (you do not need to pay the $99 fee yet).
2. Go to the hidden [Apple D-U-N-S Number Look up](https://developer.apple.com/enroll/duns-lookup/#!/search) page.
3. Fill out your Organization Information exactly as it appears on your Gov.uk registration.
4. If your company isn't found, check the box to **"Submit my information to Dun & Bradstreet"**.
5. Within 5 to 14 days, you will receive an email with your 9-digit number, which you can immediately take to Google Play!
- **Can I start as Personal and change to Organization later?** Yes, but it is a highly painful, manual process. You have to contact Google Play Support to migrate the account, or create a brand new Organization account, pay the $25 fee a second time, and then manually transfer the app ownership from the Personal account to the Organization account. **Save yourself the headache and register as an Organization from day one.**

### 2. Platforms & Builds
**Q: On the Expo deployment, what does `--platform all` mean?**
**A:** When running a build command (like `eas build --platform all`), "all" tells Expo to build **both** the Android app and the iOS (Apple) app at the exact same time. If you only want to build the Android version, you would use `eas build --platform android`.

**Q: Does this process allow me to create an app for iPhones? Or is that a different process?**
**A:** The codebase we've built works perfectly for both Android and iPhones! However, the *deployment* process is different. To publish to iPhones, you need an **Apple Developer Account** ($99/year). Once you have that, you will run `eas build --platform ios`, which generates an `.ipa` file instead of an `.aab` file, and you upload it to Apple App Store Connect instead of the Google Play Console.

### 3. App Updates
**Q: After I deploy to Google Play, will I be able to update the app versions while I improve it in the coming months?**
**A:** **Yes, absolutely!** You are never locked in. Whenever we add new features, we just change the version number in your `app.json` (e.g., from `1.0.0` to `1.0.1`), run the `eas build` command again, and upload the new file to Google Play. Users will then get an "Update" button in the Play Store.

### 4. Direct Downloads & Web Hosting
**Q: Can I link the app directly on the firevision.uk website instead of using Google Play? Can users download it from my server for free?**
**A:** **Yes, for Android, you can do this completely for free!** This is called "sideloading." You can host the installation file on your website, and users can click a link to download and install it without ever touching the Google Play Store.
*(Note: Apple/iOS strictly prohibits this. iPhones can only install apps through the official Apple App Store).*

**Q: How do I create a file that I can download and install directly on an Android phone from my website?**
**A:** To install directly on a phone from a website, you need an **`.apk`** file, *not* an `.aab` file. 
- **`.aab` (Android App Bundle):** Strictly for the Google Play Store. Phones cannot install this directly.
- **`.apk` (Android Package Kit):** The universal installation file that Android phones can download and run directly.

**How to generate the downloadable `.apk` file for your website:**
You will need to configure your `eas.json` file for a "preview" build, and then run:
```bash
eas build -p android --profile preview
```
This tells Expo to create a standalone `.apk` file instead of a Store bundle. Once the build finishes, Expo gives you a direct download link. You can download that `.apk` file, upload it to your `firevision.uk` server, and create a "Download Android App" button!

### 5. Expo & EAS Installation Quirks
**Q: When I ran `npm install -g eas-cli`, I got a massive wall of red warnings saying packages are deprecated (like `uuid`, `glob`, etc.). Did it fail?**
**A:** **No, it did not fail!** You can completely ignore those warnings. `eas-cli` relies on hundreds of smaller packages built by other developers. Over time, those smaller tools get marked as "deprecated," and NPM aggressively warns you about them. As long as the command finishes with a message like `added 516 packages in 45s`, the installation was 100% successful.

**Q: When running `eas build:configure`, it asked to create an EAS project for `temp_app`. Why did it say `temp_app`?**
**A:** EAS automatically reads the `name` and `slug` fields from your `app.json` file. If those fields are set to `temp_app` (leftover from project creation), EAS will try to register that name on their servers. If this happens, cancel the command (Ctrl+C), open `app.json`, update the `name`, `slug`, and add an `android.package` identifier (e.g., `uk.firevision.evacuation`), and then re-run the configuration.

**Q: During `eas build:configure`, it asked me which platform and I selected "Android". Do I still need to type `--platform android` when I run `eas build`?**
**A:** **Yes!** The `eas build:configure` command ONLY creates a local settings file (`eas.json`) on your computer. It does not actually build anything. When it is time to actually trigger the massive cloud computers to compile your app, you must explicitly tell it which platform to build right then by running `eas build --platform android`.

**Q: Once the build finishes and I download the `.aab` or `.apk` file, does Expo save it somewhere? Can I access it later?**
**A:** **Yes, absolutely!** Every single build you ever run is permanently saved on your Expo web dashboard. If you go to [expo.dev](https://expo.dev) and click on your project, you will see a "Builds" tab on the left side. You can view all of your past builds, read the success/error logs, and download the `.aab` or `.apk` files again at any time!

### 6. App Icons & Environment Variables
**Q: How do I change the default Expo app icon to my custom FireVision logo?**
**A:** Setting the App Icon is super easy! If you look inside your `assets/` folder, you will see default placeholder images (`icon.png`, `android-icon-foreground.png`, `splash.png`). 
1. Make sure your custom `FireVision.png` logo is exactly a **1024x1024 pixel** square.
2. Simply delete the default images in the `assets/` folder, and replace them with your custom logo, ensuring you keep the exact same filenames (e.g., name your new logo `icon.png`).
3. The next time you run an `eas build`, Expo will automatically package your new gorgeous logo into the app!

**Q: Why did my standalone `.apk` app instantly crash on my phone, but work on my computer?**
**A:** When you run `eas build`, Expo sends your code to their cloud computers to build the APK. However, your `.env.local` file (which holds your API keys) is purposely hidden from GitHub and the cloud for security. Because the cloud computers couldn't see your API keys, the APK was compiled completely empty. When you opened it on your phone, the authentication system crashed because it had no key.
**The Fix:** You must inject your public environment variables directly into the `eas.json` file under the specific build profile (e.g., `"preview": { "env": { "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY": "..." } }`) so the cloud compiler can package them into the app.

**Q: Are the environment variables in `eas.json` hidden from hackers? Can someone hijack the app?**
**A:** **No, they are public, but it is 100% secure!** Any key that starts with `EXPO_PUBLIC_` is designed by definition to be a "Public Key." When the app compiles, these keys are permanently embedded into the app code shipped to users' phones. 
This is not a security flaw—this is exactly how modern apps work. 
- Your Convex URL simply tells the app *where* the database is.
- Your Clerk Publishable Key only allows the app to render the login form. 
Neither of these keys gives hackers access to your database or user data. Hackers would still need a secure, authenticated JWT (login token) to read or write any data to your Convex database. 
*(Warning: You should NEVER put "Secret Keys" like a `CLERK_SECRET_KEY` or Stripe Secret Key into `eas.json` or your frontend app).*
