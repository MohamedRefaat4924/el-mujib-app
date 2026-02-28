# El Mujib - Mobile App Interface Design

## Overview
El Mujib is a WhatsApp Business messaging platform that enables vendors to manage customer conversations. The app provides real-time chat with support for multiple message types, contact management with labels and assignment, and team collaboration features.

## Design Philosophy
- **iOS-native feel** following Apple HIG guidelines
- **One-handed usage** optimized for portrait 9:16
- **Modern 3D aesthetic** with depth, glassmorphism, and subtle shadows
- **Green brand identity** matching the El Mujib brand

---

## Screen List

### 1. Login Screen
- Full-screen background with brand gradient
- Centered card with glassmorphism effect
- App logo at top
- Email/username input field
- Password input field with show/hide toggle
- Login button (primary green)
- Demo login button (conditional on demo mode)

### 2. Contacts List Screen (Home)
- **Header**: App title "El Mujib" with popup menu (Profile, Settings)
- **Tab Bar**: Scrollable tabs - All, Mine, Unassigned, + dynamic user tabs
- **Labels Bar**: Horizontal scrollable label chips with colors, clear filter button
- **Search Bar**: Search contacts by name or phone number
- **Contact List**: FlatList with:
  - Avatar circle with initials
  - Contact name (bold)
  - Phone number (subtitle)
  - Label indicators (colored tag icons)
  - Unread message count badge
  - Last message time
- **Pull-to-refresh** and **infinite scroll pagination**
- **Bottom Tab Bar**: Chat icon with unread count badge

### 3. Chat Screen (Chatbox)
- **Header**: Back button, contact name, user info button
- **Messages List**: Inverted FlatList with message bubbles
  - Incoming messages (left, light gray)
  - Outgoing messages (right, green)
  - Message types: text, image, audio, video, document, sticker, contacts, location, interactive (buttons/lists), template, reaction
  - Status indicators (sent, delivered, read, failed)
  - Timestamp on each message
- **Quick Reply Bar** (NEW): Horizontal scrollable quick reply chips
- **Input Area**:
  - Attachment button (opens action sheet)
  - Text input field (expandable)
  - Voice record button (hold to record) (ENHANCED)
  - Send button (appears when text entered)
- **Attachment Options**: Camera, Gallery (multi-select), Audio, Document, Template
- **Template Picker**: Bottom sheet with searchable template list

### 4. User Info Screen
- **Header**: "User Information" with back button
- **Profile Card**: Avatar, name, phone, email, language
- **Assign Section**:
  - Assign team member (dropdown)
  - Assign labels (multi-select checkboxes)
- **Notes Section**: Editable text area for contact notes
- **Actions**: Save button for each section

### 5. Profile Screen
- **Header**: "My Profile" with back button
- **User Card**: Avatar, username, email
- **Editable Fields**: First name, last name, mobile number, email
- **Edit/Save Toggle**: FAB button to toggle edit mode
- **Save Button**: Appears in edit mode

### 6. Settings Screen
- **Header**: "Settings" with back button
- **User Card**: Avatar, username, email
- **Menu Items**:
  - My Profile → Profile Screen
  - Settings → User Settings
  - Logout → Confirmation dialog

---

## Primary Content and Functionality

### Contacts List
- Paginated contact data from API
- Real-time updates via Soketi (new messages, status changes)
- Tab filtering: All, Mine (assigned to me), Unassigned, per-user tabs
- Label filtering with colored chips
- Search by name or phone number
- Unread message count per contact and total

### Chat Messages
- All WhatsApp message types rendered appropriately
- Text with HTML formatting (bold, italic, links, code)
- Images with full-screen viewer
- Audio with waveform player
- Video with inline player
- Documents with download link
- Interactive messages (buttons, lists) with tap actions
- Template messages with header/body/footer/buttons
- Location messages with map link
- Contact cards
- Stickers

### Real-time (Soketi)
- Private vendor channel subscription
- New message notifications
- Message status updates (sent, delivered, read)
- Contact list auto-update on new messages
- Sound notification on incoming messages

### Local Storage (ENHANCED)
- Message history cache per contact
- Offline message viewing
- Quick reply suggestions based on history
- Smart context for faster loading

---

## Key User Flows

### Login Flow
1. User opens app → Login screen
2. Enter email/username + password
3. Tap "Login" → API call → Store auth token
4. Navigate to Contacts List

### View Contacts Flow
1. Contacts List loads with "All" tab
2. User can switch tabs (Mine, Unassigned, etc.)
3. User can filter by labels
4. User can search by name/phone
5. Scroll down for more contacts (pagination)
6. Pull down to refresh

### Chat Flow
1. Tap contact → Navigate to Chat screen
2. Messages load (newest first, paginated)
3. User types message → Send button appears
4. Tap send → Message sent via API
5. Real-time: incoming messages appear instantly
6. Tap attachment → Choose media type → Upload and send
7. Quick reply chips appear based on context (NEW)

### Voice Recording Flow (ENHANCED)
1. Tap and hold mic button → Recording starts
2. Visual feedback: recording indicator, timer
3. Release → Recording stops → Audio sent
4. Swipe left to cancel recording

### Multi-Image Flow (NEW)
1. Tap attachment → Gallery
2. Select multiple images
3. Preview selected images
4. Send all at once

### User Info Flow
1. Tap user info icon in chat header
2. View contact details
3. Assign team member from dropdown
4. Toggle labels on/off
5. Edit and save notes

---

## Color Choices

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| primary | #089B21 | #2ECC40 | Brand green, buttons, active states |
| background | #F7F7F7 | #151718 | Screen backgrounds |
| surface | #FFFFFF | #1E2022 | Cards, elevated surfaces |
| foreground | #1B1B23 | #ECEDEE | Primary text |
| muted | #687076 | #9BA1A6 | Secondary text |
| border | #E5E7EB | #334155 | Dividers, borders |
| success | #2DCE89 | #4ADE80 | Success states, delivered |
| warning | #D7A81B | #FBBF24 | Warning states |
| error | #F5365C | #F87171 | Error states, failed messages |
| incoming | #FFFFFF | #2A2D30 | Incoming message bubbles |
| outgoing | #DCF8C6 | #005C4B | Outgoing message bubbles |
| chatBg | #ECE5DD | #0B141A | Chat background |

---

## 3D / Modern UI Elements

1. **Glassmorphism cards**: Semi-transparent backgrounds with blur
2. **Elevated shadows**: Multi-layer shadows for depth (shadow-sm, shadow-md)
3. **Gradient accents**: Subtle green gradients on headers and buttons
4. **Rounded corners**: Generous border radius (12-20px)
5. **Smooth animations**: Spring-based transitions for navigation
6. **Haptic feedback**: On button taps and message sends
7. **Floating elements**: FAB buttons, floating input bar
8. **Depth layers**: Background → Surface → Card → Elevated card
