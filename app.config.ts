// Load environment variables with proper priority (system > .env)
import "./scripts/load-env.js";
import type { ExpoConfig } from "expo/config";

// Custom package name for Google Play Store
const androidPackage = "com.elmujib.direct";
const iosBundleId = "com.elmujib.direct";
const scheme = "elmujibdirect";

const env = {
  // App branding - update these values directly (do not use env vars)
  appName: "El Mujib",
  appSlug: "el-mujib-app",
  // S3 URL of the app logo - set this to the URL returned by generate_image when creating custom logo
  // Leave empty to use the default icon from assets/images/icon.png
  logoUrl: "https://private-us-east-1.manuscdn.com/user_upload_by_module/session_file/310419663028929475/KVckgdcSjRDwmaWC.png?Expires=1803809940&Signature=mHmXr9DCQQtq9SILKotoHJl6Mnu2Gd5aylNLfveLHRBlthalJ9PDYuenOvysrmCq-iT59DhIvhYjRTlxYJEiddZ2glQ4DckvqQtPzr81~Qzj2tMLjfhZhlYCPash9BM87cmLAngN0TWQdtxNsVFr3MFWfx4ka3SAt4H5UMp80pBJFLvTpSNs0oXMaSRX4J~Eq0YJv~OS7Dc~KttZKIyjvqMLF595wZndPjpeKQRtPZ4hlrF4LLCwpMTBebZAiQi0guSEmyYimqZwObxo2FVckVCw2DBef30mBvXRJary3bUkyNtBnESwC88OzsnbR-Sl7mOQ2jzvrfs8M0IVvkqsQQ__&Key-Pair-Id=K2HSFNDJXOU9YS",
  scheme,
  iosBundleId,
  androidPackage,
};

const config: ExpoConfig = {
  name: env.appName,
  slug: env.appSlug,
  version: "7.5.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: env.scheme,
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: env.iosBundleId,
    buildNumber: "14",
    "infoPlist": {
        "ITSAppUsesNonExemptEncryption": false
      }
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#1A6B3C",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    versionCode: 14,
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: env.androidPackage,
    permissions: ["android.permission.INTERNET", "android.permission.ACCESS_NETWORK_STATE", "POST_NOTIFICATIONS", "RECORD_AUDIO"],
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          {
            scheme: env.scheme,
            host: "*",
          },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    [
      "expo-audio",
      {
        microphonePermission: "Allow $(PRODUCT_NAME) to access your microphone.",
      },
    ],
    [
      "expo-video",
      {
        supportsBackgroundPlayback: true,
        supportsPictureInPicture: true,
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#ffffff",
        dark: {
          backgroundColor: "#000000",
        },
      },
    ],
    [
      "expo-build-properties",
      {
        android: {
          buildArchs: ["armeabi-v7a", "arm64-v8a"],
          minSdkVersion: 24,
          usesCleartextTraffic: true,
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
