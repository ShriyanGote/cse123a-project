# Run the Mobile App Locally on macOS

This guide is for first-time local setup on a Mac.

## 1) Install prerequisites

- Install [Node.js 20+](https://nodejs.org/).
- Install Xcode from the App Store, then open it once to finish setup.
- Install Xcode Command Line Tools:

```bash
xcode-select --install
```

- Install CocoaPods (needed for iOS native dependencies):

```bash
sudo gem install cocoapods
```

From this folder (`mobile-app`), install project dependencies:

```bash
npm install
```

## 2) One-time Xcode setup (required for iOS builds)

If building to a physical iPhone:

1. Connect your iPhone with USB and tap **Trust This Computer** on the phone.
2. Navigate to (`Code/mobile-app`) directory 
3. Open the generated iOS project in Xcode:

```bash
open ios/mobileapp.xcworkspace
```

3. In Xcode, select the `mobileapp` target on the left tab -> **Signing & Capabilities**:
   - Set your **Team**.
   - Keep **Automatically manage signing** enabled.
4. Click on the run button (sideways triangle symbol) on the top right corner of the left tab to build the project.

## 3) Create local environment file

Create `mobile-app/.env` with at least:

```env
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

## 4) Start the app

For a physical iPhone connected to your Mac:

```bash
npx expo run:ios --device
```

Start with native build cache cleared:

```bash
npx expo run:ios --device --no-build-cache
```

To restart Expo with cache clear:

```bash
npx expo start -c
```

## 5) Common issues

- **"Supabase Config Required" screen**: confirm `.env` exists in `mobile-app` and both Supabase vars are set.
- **Pod install/build errors**: run `npx expo prebuild --clean` and then `npx expo run:ios --device`.
- **Code signing/device install errors**: open Xcode once, sign in with your Apple ID, and trust the developer profile on your iPhone.
