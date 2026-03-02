# El Mujib — React Native Chat App

A WhatsApp-like messaging platform built with **React Native (Expo SDK 54)**, featuring real-time Soketi/Pusher integration, multi-message type support, contact management, and a modern UI. Converted from Flutter to React Native with enhanced features.

---

## Features

- **Authentication** — Login with email/password (RSA-encrypted credentials)
- **Real-time messaging** — Soketi/Pusher WebSocket integration for live message updates
- **Multi-message types** — Text, images, voice notes, videos, documents, interactive buttons, lists, templates
- **Voice recording** — Record and send voice messages using device microphone (AAC format)
- **Image gallery** — Tap to view fullscreen, swipe to browse conversation images
- **Inline media players** — Audio waveform player and video player directly in chat bubbles
- **Upload progress** — Real-time progress bar for all media uploads
- **Contact management** — Contacts list with filtering (All, Mine, Unassigned), labels, search, pagination
- **User profiles** — View/edit contact info, assign team members, assign labels, update notes
- **Local storage** — Message history cached with AsyncStorage for offline access and faster loading
- **Quick replies** — User-managed custom quick reply suggestions
- **Notifications** — Sound + local push notification on new messages
- **Copy messages** — Long-press to copy message text
- **Modern UI** — Deep forest green (#1A6B3C) brand theme with 3D-feeling card design

---

## Tech Stack

| Technology | Purpose |
|-----------|---------|
| React Native 0.81 | Mobile framework |
| Expo SDK 54 | Build toolchain & native APIs |
| TypeScript | Type safety |
| Expo Router 6 | File-based navigation |
| NativeWind 4 | Tailwind CSS styling |
| AsyncStorage | Local data persistence |
| expo-audio | Voice recording & playback |
| expo-video | Video playback |
| expo-image-picker | Camera & gallery access |
| Pusher.js | Real-time WebSocket (Soketi) |
| node-forge | RSA encryption for login |

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 18.x or 22.x LTS |
| pnpm | 9.x (`npm install -g pnpm@9`) |
| Expo CLI | Latest (`npm install -g expo-cli`) |
| EAS CLI | Latest (`npm install -g eas-cli`) |
| Android Studio | Latest (for Android builds) |
| Xcode | 15+ (for iOS builds, macOS only) |

---

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/el-mujib-app.git
cd el-mujib-app

# 2. Install dependencies
pnpm install

# 3. Start the development server
npx expo start --clear
```

Then:
- Press `i` to open in iOS Simulator
- Press `a` to open in Android Emulator
- Scan the QR code with **Expo Go** on your physical device

---

## Project Structure

```
el-mujib-app/
├── app/                          # Screens (Expo Router file-based routing)
│   ├── (tabs)/
│   │   ├── _layout.tsx           # Tab bar configuration
│   │   └── index.tsx             # Home screen (contacts list)
│   ├── chat/index.tsx            # Chat screen
│   ├── login/index.tsx           # Login screen
│   ├── user-info/index.tsx       # Contact details screen
│   ├── profile/index.tsx         # Profile screen
│   ├── settings/index.tsx        # Settings screen
│   └── _layout.tsx               # Root layout with providers
├── components/
│   └── chat/
│       ├── message-bubble.tsx    # Message rendering (all types)
│       ├── audio-player.tsx      # Inline audio waveform player
│       ├── video-player.tsx      # Inline video player
│       └── image-gallery.tsx     # Fullscreen image viewer
├── lib/
│   ├── services/
│   │   ├── api.ts                # API client (elmujib.com)
│   │   ├── pusher.ts             # Soketi WebSocket connection
│   │   ├── voice-send-helper.ts  # Voice upload logic
│   │   ├── message-history.ts    # Local message caching
│   │   └── notification.ts       # Push notifications
│   └── stores/
│       ├── auth-store.tsx        # Authentication state
│       ├── contacts-store.tsx    # Contacts state
│       └── chat-store.tsx        # Chat state & messages
├── hooks/
│   └── use-voice-recorder.ts    # Voice recording hook
├── assets/
│   ├── images/                   # App icons & splash
│   └── sounds/                   # Notification sound
├── app.config.ts                 # Expo configuration
├── credentials.json              # Android signing config
├── upload-keystore.jks           # Android upload keystore
├── eas.json                      # EAS Build profiles
└── theme.config.js               # Color theme tokens
```

---

## Building for Production

### Android AAB (Google Play)

```bash
# Cloud build (recommended)
eas build --profile production --platform android

# Local build
npx expo prebuild --platform android
cd android && ./gradlew bundleRelease
```

The project includes `upload-keystore.jks` and `credentials.json` pre-configured for Google Play signing.

### Android APK (Testing)

```bash
eas build --profile preview --platform android
```

### iOS (App Store)

```bash
eas build --profile production --platform ios
```

---

## Android Signing

| Property | Value |
|----------|-------|
| Keystore | `upload-keystore.jks` |
| Store Password | `koko123` |
| Key Alias | `upload` |
| Key Password | `koko123` |
| SHA1 | `76:E4:8B:62:72:73:6C:95:72:4E:B4:C7:7D:61:0C:A0:A9:D3:05:C9` |

---

## Configuration

The app connects to `https://elmujib.com` with hardcoded API URLs (matching the original Flutter app). Soketi WebSocket connects to `aa.evyx.lol` with app key `elmujib-key-12345`.

No `.env` file is required for basic functionality. An `env.local` template is provided if you need to configure the optional Express backend server.

---

## License

Private — All rights reserved.
