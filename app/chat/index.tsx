import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Dimensions,
  Modal,
  ScrollView,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useAudioRecorder,
  useAudioRecorderState,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
  IOSOutputFormat,
  AudioQuality,
} from 'expo-audio';
import { useAuth } from '@/lib/stores/auth-store';
import { useChat, SavedVoiceMessage } from '@/lib/stores/chat-store';
import { useContacts } from '@/lib/stores/contacts-store';
import { MessageBubble } from '@/components/chat/message-bubble';
import { ImageGallery } from '@/components/chat/image-gallery';
import { ChatMessage } from '@/lib/types';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { sendVoiceViaProxy, prepareVoiceForSending } from '@/lib/services/voice-send-helper';
import { createProgressHandler, clearProgress } from '@/lib/helpers/send-with-progress';

// Recording preset - platform-specific formats:
// iOS: MPEG4AAC codec always produces M4A/MP4 container → send as audio/mp4 with .m4a
// Android: aac_adts produces raw ADTS AAC bitstream → send as audio/aac with .aac
// Server accepts: audio/aac, audio/mp4, audio/mpeg, audio/amr, audio/ogg
const VOICE_RECORDING_PRESET = {
  // iOS produces M4A regardless of extension, so use .m4a
  // Android with aac_adts produces raw AAC, use .aac
  extension: Platform.OS === 'ios' ? '.m4a' : '.aac',
  sampleRate: 44100,
  numberOfChannels: 1, // mono for voice messages
  bitRate: 128000,
  android: {
    outputFormat: 'aac_adts' as const, // Raw AAC bitstream (ADTS)
    audioEncoder: 'aac' as const,
  },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.HIGH,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 128000,
  },
};

// Voice MIME type for uploads - use audio/mpeg (.mp3) for all platforms
// The web app converts to MP3 (audio/mpeg) which the server accepts most reliably.
// PHP's getClientMimeType() uses what we declare in the multipart form data.
const VOICE_MIME_TYPE = 'audio/mpeg';
const VOICE_EXTENSION = '.mp3';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Extract copyable text content from a message
function getMessageTextContent(msg: ChatMessage): string | null {
  // Text messages
  if (msg.message_type === 'text') {
    const text = msg.formatted_message || '';
    // Strip HTML tags
    return text
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .trim() || null;
  }
  // Image/video captions
  if (msg.message_type === 'image' || msg.message_type === 'video') {
    return msg.__data?.caption || msg.formatted_message || null;
  }
  // Template messages
  if (msg.template_message) {
    return msg.template_message
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .trim() || null;
  }
  // Fallback to formatted_message
  return msg.formatted_message || null;
}

export default function ChatScreen() {
  const params = useLocalSearchParams<{
    contactUid: string;
    contactName: string;
    contactInitials: string;
    contactWaId: string;
  }>();

  const insets = useSafeAreaInsets();
  const { state: authState } = useAuth();
  const {
    state: chatState,
    fetchMessages,
    sendTextMessage,
    sendMediaMessage,
    sendTemplateMessage,
    resetChat,
    fetchTemplates,
    loadCachedMessages,
    saveCachedMessages,
    loadQuickReplies,
    addQuickReply,
    removeQuickReply,
    loadSavedVoiceMessages,
    addSavedVoiceMessage,
    removeSavedVoiceMessage,
    setContactUid,
  } = useChat();
  const { updateUnreadToZero } = useContacts();

  const [messageText, setMessageText] = useState('');
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showSavedVoices, setShowSavedVoices] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showAddQuickReply, setShowAddQuickReply] = useState(false);
  const [newQuickReplyText, setNewQuickReplyText] = useState('');
  const [isSavingVoice, setIsSavingVoice] = useState(false);
  const [savingVoiceName, setSavingVoiceName] = useState('');
  const [galleryImageUrl, setGalleryImageUrl] = useState<string | null>(null);
  const [showCopyMenu, setShowCopyMenu] = useState<{ message: ChatMessage; y: number } | null>(null);
  const [isConvertingAudio, setIsConvertingAudio] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ progress: number; step: string } | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const savedRecordingRef = useRef<{ savedUri: string; savedDuration: number } | null>(null);

  // expo-audio recorder hook with custom AAC preset
  const audioRecorder = useAudioRecorder(VOICE_RECORDING_PRESET);
  const recorderState = useAudioRecorderState(audioRecorder, 500);

  const contactUid = params.contactUid || '';
  const contactName = params.contactName || 'Unknown';
  const contactInitials = params.contactInitials || 'U';
  const vendorUid = authState.authData?.vendor_uid || '';

  // Initialize chat
  useEffect(() => {
    if (contactUid && vendorUid) {
      setContactUid(contactUid);
      loadCachedMessages(contactUid);
      fetchMessages(vendorUid, contactUid, { isRefresh: true });
      updateUnreadToZero(contactUid);
      fetchTemplates();
      loadQuickReplies();
      loadSavedVoiceMessages();
    }

    return () => {
      if (contactUid) {
        saveCachedMessages(contactUid);
      }
      resetChat();
    };
  }, [contactUid, vendorUid]);

  // Poll for new messages while chat is open (every 5 seconds)
  // This avoids interfering with the home page's Pusher subscription
  useEffect(() => {
    if (!vendorUid || !contactUid) return;

    const pollInterval = setInterval(() => {
      fetchMessages(vendorUid, contactUid, { isRefresh: true });
    }, 5000);

    return () => {
      clearInterval(pollInterval);
      saveCachedMessages(contactUid);
    };
  }, [vendorUid, contactUid, fetchMessages, saveCachedMessages]);

  const handleSendText = useCallback(async () => {
    const text = messageText.trim();
    if (!text || !contactUid) return;
    setMessageText('');
    setShowQuickReplies(false);
    await sendTextMessage(contactUid, text);
    setTimeout(() => {
      fetchMessages(vendorUid, contactUid, { isRefresh: true });
    }, 1000);
  }, [messageText, contactUid, vendorUid, sendTextMessage, fetchMessages]);

  const handleSendImage = useCallback(async () => {
    setShowAttachMenu(false);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets.length > 0) {
        const onProgress = createProgressHandler(setUploadProgress);
        for (let i = 0; i < result.assets.length; i++) {
          const asset = result.assets[i];
          if (result.assets.length > 1) {
            setUploadProgress({ progress: 0, step: `Image ${i + 1}/${result.assets.length}` });
          }
          await sendMediaMessage(contactUid, {
            uri: asset.uri,
            mimeType: asset.mimeType || 'image/jpeg',
            fileName: asset.fileName || 'image.jpg',
          }, 'image', undefined, onProgress);
        }
        clearProgress(setUploadProgress);
        setTimeout(() => {
          fetchMessages(vendorUid, contactUid, { isRefresh: true });
        }, 1500);
      }
    } catch (e) {
      console.error('Image picker error:', e);
      setUploadProgress(null);
    }
  }, [contactUid, vendorUid, sendMediaMessage, fetchMessages]);

  const handleSendVideo = useCallback(async () => {
    setShowAttachMenu(false);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        allowsMultipleSelection: false,
        quality: 0.8,
        videoMaxDuration: 120, // 2 minutes max
      });

      if (!result.canceled && result.assets.length > 0) {
        const asset = result.assets[0];
        const onProgress = createProgressHandler(setUploadProgress);
        await sendMediaMessage(contactUid, {
          uri: asset.uri,
          mimeType: asset.mimeType || 'video/mp4',
          fileName: asset.fileName || `video_${Date.now()}.mp4`,
        }, 'video', undefined, onProgress);
        clearProgress(setUploadProgress);
        setTimeout(() => {
          fetchMessages(vendorUid, contactUid, { isRefresh: true });
        }, 2000);
      }
    } catch (e) {
      console.error('Video picker error:', e);
      setUploadProgress(null);
    }
  }, [contactUid, vendorUid, sendMediaMessage, fetchMessages]);

  const handleTakePhoto = useCallback(async () => {
    setShowAttachMenu(false);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Camera permission is required to take photos.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8,
      });

      if (!result.canceled && result.assets.length > 0) {
        const asset = result.assets[0];
        const onProgress = createProgressHandler(setUploadProgress);
        await sendMediaMessage(contactUid, {
          uri: asset.uri,
          mimeType: asset.mimeType || 'image/jpeg',
          fileName: asset.fileName || 'photo.jpg',
        }, 'image', undefined, onProgress);
        clearProgress(setUploadProgress);
        setTimeout(() => {
          fetchMessages(vendorUid, contactUid, { isRefresh: true });
        }, 1500);
      }
    } catch (e) {
      console.error('Camera error:', e);
      setUploadProgress(null);
    }
  }, [contactUid, vendorUid, sendMediaMessage, fetchMessages]);

  const handleSendDocument = useCallback(async () => {
    setShowAttachMenu(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets.length > 0) {
        const asset = result.assets[0];
        const onProgress = createProgressHandler(setUploadProgress);
        await sendMediaMessage(contactUid, {
          uri: asset.uri,
          mimeType: asset.mimeType || 'application/octet-stream',
          fileName: asset.name || 'document',
        }, 'document', undefined, onProgress);
        clearProgress(setUploadProgress);
        setTimeout(() => {
          fetchMessages(vendorUid, contactUid, { isRefresh: true });
        }, 1500);
      }
    } catch (e) {
      console.error('Document picker error:', e);
      setUploadProgress(null);
    }
  }, [contactUid, vendorUid, sendMediaMessage, fetchMessages]);

  const handleStartRecording = useCallback(async () => {
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Microphone permission is required to record audio.');
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      // Prepare and start recording with custom AAC preset
      // On Android: aac_adts output format produces raw AAC bitstream (.aac)
      // On iOS: MPEG4AAC codec with .aac extension
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      console.log('[Recording] Started with AAC preset, extension: .aac');
    } catch (e) {
      console.error('Recording start error:', e);
      Alert.alert('Error', 'Could not start recording. Please check microphone permissions.');
    }
  }, [audioRecorder]);

  const handleStopRecording = useCallback(async () => {
    if (!recorderState.isRecording) return;

    try {
      const duration = Math.round(recorderState.durationMillis / 1000);
      await audioRecorder.stop();
      const uri = audioRecorder.uri;

      console.log('[Recording] Stopped. URI:', uri, 'Duration:', duration, 's');

      if (uri) {
        // Ask user: Send now or Save for later?
        Alert.alert(
          'Voice Message',
          'What would you like to do with this recording?',
          [
            {
              text: 'Send Now',
              onPress: async () => {
                try {
                  setUploadProgress({ progress: 0, step: 'Preparing voice...' });
                  // Use server proxy: uploads to our server, converts to MP3, uploads to elmujib.com
                  console.log('[Recording] Sending voice via proxy...');
                  await sendVoiceViaProxy(
                    uri,
                    contactUid,
                    '', // no caption
                    (progress, step) => setUploadProgress({ progress, step }),
                  );
                  clearProgress(setUploadProgress);
                  setTimeout(() => {
                    fetchMessages(vendorUid, contactUid, { isRefresh: true });
                  }, 1500);
                } catch (sendErr: any) {
                  console.error('[Recording] Send error:', sendErr);
                  setUploadProgress(null);
                  // Fallback: try direct upload with audio/mpeg
                  try {
                    console.log('[Recording] Proxy failed, trying direct upload fallback...');
                    setUploadProgress({ progress: 0, step: 'Retrying...' });
                    const onProgress = createProgressHandler(setUploadProgress);
                    const voiceFile = await prepareVoiceForSending(uri, `voice_${Date.now()}`);
                    await sendMediaMessage(contactUid, {
                      uri: voiceFile.uri,
                      mimeType: voiceFile.mimeType,
                      fileName: voiceFile.fileName,
                    }, 'audio', undefined, onProgress);
                    clearProgress(setUploadProgress);
                    setTimeout(() => {
                      fetchMessages(vendorUid, contactUid, { isRefresh: true });
                    }, 1500);
                  } catch (fallbackErr: any) {
                    console.error('[Recording] Fallback also failed:', fallbackErr);
                    setUploadProgress(null);
                    Alert.alert('Error', 'Failed to send voice message. Please try again.');
                  }
                }
              },
            },
            {
              text: 'Save for Later',
              onPress: () => {
                setIsSavingVoice(true);
                setSavingVoiceName('');
                savedRecordingRef.current = { savedUri: uri, savedDuration: duration };
              },
            },
            { text: 'Discard', style: 'destructive' },
          ]
        );
      }
    } catch (e) {
      console.error('Recording stop error:', e);
    }
  }, [audioRecorder, recorderState, contactUid, vendorUid, sendMediaMessage, fetchMessages]);

  const handleSaveVoiceMessage = useCallback(async () => {
    const name = savingVoiceName.trim();
    if (!name) {
      Alert.alert('Name required', 'Please enter a name for this voice message.');
      return;
    }
    if (!savedRecordingRef.current?.savedUri) return;

    const voice: SavedVoiceMessage = {
      id: `voice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      uri: savedRecordingRef.current.savedUri,
      duration: savedRecordingRef.current.savedDuration || 0,
      createdAt: Date.now(),
    };

    await addSavedVoiceMessage(voice);
    savedRecordingRef.current = null;
    setIsSavingVoice(false);
    setSavingVoiceName('');
  }, [savingVoiceName, addSavedVoiceMessage]);

  const handleCancelRecording = useCallback(async () => {
    try {
      await audioRecorder.stop();
    } catch (e) {
      console.error('Recording cancel error:', e);
    }
  }, [audioRecorder]);

  const handleSendSavedVoice = useCallback(async (voice: SavedVoiceMessage) => {
    setShowSavedVoices(false);
    try {
      setUploadProgress({ progress: 0, step: 'Preparing voice...' });
      // Use server proxy: uploads to our server, converts to MP3, uploads to elmujib.com
      console.log('[SavedVoice] Sending via proxy...');
      await sendVoiceViaProxy(
        voice.uri,
        contactUid,
        '',
        (progress, step) => setUploadProgress({ progress, step }),
      );
      clearProgress(setUploadProgress);
      setTimeout(() => {
        fetchMessages(vendorUid, contactUid, { isRefresh: true });
      }, 1500);
    } catch (proxyErr: any) {
      console.error('[SavedVoice] Proxy failed:', proxyErr);
      // Fallback: try direct upload
      try {
        console.log('[SavedVoice] Trying direct upload fallback...');
        setUploadProgress({ progress: 0, step: 'Retrying...' });
        const onProgress = createProgressHandler(setUploadProgress);
        const voiceFile = await prepareVoiceForSending(voice.uri, voice.name);
        await sendMediaMessage(contactUid, {
          uri: voiceFile.uri,
          mimeType: voiceFile.mimeType,
          fileName: voiceFile.fileName,
        }, 'audio', undefined, onProgress);
        clearProgress(setUploadProgress);
        setTimeout(() => {
          fetchMessages(vendorUid, contactUid, { isRefresh: true });
        }, 1500);
      } catch (fallbackErr: any) {
        console.error('[SavedVoice] Fallback also failed:', fallbackErr);
        setUploadProgress(null);
        Alert.alert('Error', 'Failed to send voice message. The file may have been deleted.');
      }
    }
  }, [contactUid, vendorUid, sendMediaMessage, fetchMessages]);

  const handleDeleteSavedVoice = useCallback((voice: SavedVoiceMessage) => {
    Alert.alert(
      'Delete Voice Message',
      `Delete "${voice.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => removeSavedVoiceMessage(voice.id),
        },
      ]
    );
  }, [removeSavedVoiceMessage]);

  const handleQuickReply = useCallback((reply: string) => {
    setMessageText(reply);
    setShowQuickReplies(false);
  }, []);

  const handleAddQuickReply = useCallback(async () => {
    const text = newQuickReplyText.trim();
    if (!text) return;
    await addQuickReply(text);
    setNewQuickReplyText('');
    setShowAddQuickReply(false);
  }, [newQuickReplyText, addQuickReply]);

  const handleDeleteQuickReply = useCallback((reply: string) => {
    Alert.alert(
      'Delete Quick Reply',
      `Delete "${reply}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => removeQuickReply(reply),
        },
      ]
    );
  }, [removeQuickReply]);

  const handleLoadMore = useCallback(() => {
    if (!chatState.isLoadingMore && !chatState.hasReachedMax) {
      fetchMessages(vendorUid, contactUid, { isRefresh: false });
    }
  }, [chatState.isLoadingMore, chatState.hasReachedMax, vendorUid, contactUid, fetchMessages]);

  const handleInteractiveButton = useCallback(async (id: string, title: string) => {
    await sendTextMessage(contactUid, title);
    setTimeout(() => {
      fetchMessages(vendorUid, contactUid, { isRefresh: true });
    }, 1000);
  }, [contactUid, vendorUid, sendTextMessage, fetchMessages]);

  // Long-press on message: show copy option
  const handleMessageLongPress = useCallback((msg: ChatMessage) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    const textContent = getMessageTextContent(msg);
    if (textContent) {
      Alert.alert(
        'Message Options',
        undefined,
        [
          {
            text: 'Copy Text',
            onPress: async () => {
              await Clipboard.setStringAsync(textContent);
              if (Platform.OS !== 'web') {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }
            },
          },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
    }
  }, []);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerAvatar}>
          <Text style={styles.headerAvatarText}>{contactInitials}</Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.headerName} numberOfLines={1}>{contactName}</Text>
          <Text style={styles.headerPhone} numberOfLines={1}>{params.contactWaId || ''}</Text>
        </View>
        <TouchableOpacity
          onPress={() => {
            (router as any).push({
              pathname: '/user-info',
              params: { contactUid, contactName },
            });
          }}
          style={styles.infoButton}
        >
          <MaterialIcons name="info-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <View style={styles.messagesContainer}>
        {chatState.isLoading && chatState.messages.length === 0 ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#1A6B3C" />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={chatState.messages}
            keyExtractor={(item) => item._uid}
            renderItem={({ item }) => (
              <MessageBubble
                message={item}
                onInteractiveButtonPress={handleInteractiveButton}
                onImagePress={(url) => setGalleryImageUrl(url)}
                onLongPress={handleMessageLongPress}
              />
            )}
            inverted
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.3}
            ListFooterComponent={
              chatState.isLoadingMore ? (
                <View style={styles.loadingMore}>
                  <ActivityIndicator size="small" color="#1A6B3C" />
                </View>
              ) : null
            }
            contentContainerStyle={styles.messagesList}
          />
        )}
      </View>

      {/* Quick Replies Panel */}
      {showQuickReplies && (
        <View style={styles.quickRepliesContainer}>
          <View style={styles.quickRepliesHeader}>
            <Text style={styles.quickRepliesTitle}>Quick Replies</Text>
            <TouchableOpacity
              onPress={() => setShowAddQuickReply(true)}
              style={styles.addQuickReplyBtn}
            >
              <MaterialIcons name="add" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
          {chatState.quickReplies.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickRepliesScroll}
            >
              {chatState.quickReplies
                .filter(reply => {
                  if (!messageText.trim()) return true;
                  return reply.toLowerCase().includes(messageText.toLowerCase());
                })
                .map((reply, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.quickReplyChip}
                    onPress={() => handleQuickReply(reply)}
                    onLongPress={() => handleDeleteQuickReply(reply)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.quickReplyText} numberOfLines={1}>{reply}</Text>
                  </TouchableOpacity>
                ))}
            </ScrollView>
          ) : (
            <Text style={styles.quickReplyEmptyText}>
              No quick replies yet. Tap + to add one.
            </Text>
          )}
        </View>
      )}

      {/* Input Area */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Upload Progress Bar */}
        {uploadProgress && (
          <View style={styles.uploadProgressContainer}>
            <View style={styles.uploadProgressRow}>
              <ActivityIndicator size="small" color="#1A6B3C" />
              <Text style={styles.uploadProgressText}>{uploadProgress.step}</Text>
              <Text style={styles.uploadProgressPercent}>{uploadProgress.progress}%</Text>
            </View>
            <View style={styles.uploadProgressBarBg}>
              <View style={[styles.uploadProgressBarFill, { width: `${uploadProgress.progress}%` }]} />
            </View>
          </View>
        )}

        <View style={[styles.inputArea, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          {recorderState.isRecording ? (
            <View style={styles.recordingBar}>
              <TouchableOpacity onPress={handleCancelRecording} style={styles.cancelRecordBtn}>
                <MaterialIcons name="close" size={24} color="#F5365C" />
              </TouchableOpacity>
              <View style={styles.recordingIndicator}>
                <View style={styles.recordingDot} />
                <Text style={styles.recordingTime}>{formatDuration(Math.round(recorderState.durationMillis / 1000))}</Text>
              </View>
              <TouchableOpacity onPress={handleStopRecording} style={styles.stopRecordBtn}>
                <MaterialIcons name="stop" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.inputRow}>
              {/* Attachment */}
              <TouchableOpacity
                onPress={() => setShowAttachMenu(!showAttachMenu)}
                style={styles.attachButton}
              >
                <MaterialIcons name="attach-file" size={24} color="#687076" />
              </TouchableOpacity>

              {/* Text Input */}
              <View style={styles.textInputContainer}>
                <TextInput
                  style={styles.textInput}
                  placeholder="Type a message..."
                  placeholderTextColor="#9BA1A6"
                  value={messageText}
                  onChangeText={setMessageText}
                  multiline
                  maxLength={4096}
                  onFocus={() => {
                    if (chatState.quickReplies.length > 0) {
                      setShowQuickReplies(true);
                    }
                  }}
                  returnKeyType="default"
                />
              </View>

              {/* Quick Reply Toggle */}
              <TouchableOpacity
                onPress={() => setShowQuickReplies(!showQuickReplies)}
                style={styles.quickReplyBtn}
              >
                <MaterialIcons
                  name="flash-on"
                  size={20}
                  color={showQuickReplies ? '#1A6B3C' : '#9BA1A6'}
                />
              </TouchableOpacity>

              {/* Send or Record */}
              {messageText.trim().length > 0 ? (
                <TouchableOpacity
                  onPress={handleSendText}
                  style={styles.sendButton}
                  disabled={chatState.isSending}
                >
                  {chatState.isSending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <MaterialIcons name="send" size={20} color="#fff" />
                  )}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={handleStartRecording}
                  style={styles.micButton}
                >
                  <MaterialIcons name="mic" size={22} color="#1A6B3C" />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Attachment Menu */}
      {showAttachMenu && (
        <View style={[styles.attachMenu, { bottom: 70 + Math.max(insets.bottom, 8) }]}>
          <TouchableOpacity style={styles.attachOption} onPress={handleTakePhoto}>
            <View style={[styles.attachIconBg, { backgroundColor: '#F5365C' }]}>
              <MaterialIcons name="camera-alt" size={22} color="#fff" />
            </View>
            <Text style={styles.attachLabel}>Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.attachOption} onPress={handleSendImage}>
            <View style={[styles.attachIconBg, { backgroundColor: '#1A6B3C' }]}>
              <MaterialIcons name="photo-library" size={22} color="#fff" />
            </View>
            <Text style={styles.attachLabel}>Gallery</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.attachOption} onPress={handleSendVideo}>
            <View style={[styles.attachIconBg, { backgroundColor: '#7C3AED' }]}>
              <MaterialIcons name="videocam" size={22} color="#fff" />
            </View>
            <Text style={styles.attachLabel}>Video</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.attachOption} onPress={handleSendDocument}>
            <View style={[styles.attachIconBg, { backgroundColor: '#D7A81B' }]}>
              <MaterialIcons name="description" size={22} color="#fff" />
            </View>
            <Text style={styles.attachLabel}>Document</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.attachOption} onPress={() => { setShowAttachMenu(false); setShowSavedVoices(true); }}>
            <View style={[styles.attachIconBg, { backgroundColor: '#6366F1' }]}>
              <MaterialIcons name="graphic-eq" size={22} color="#fff" />
            </View>
            <Text style={styles.attachLabel}>Voice Notes</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Add Quick Reply Modal */}
      <Modal visible={showAddQuickReply} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.addQuickReplySheet}>
            <Text style={styles.addQuickReplyTitle}>Add Quick Reply</Text>
            <TextInput
              style={styles.addQuickReplyInput}
              placeholder="Type your quick reply..."
              placeholderTextColor="#9BA1A6"
              value={newQuickReplyText}
              onChangeText={setNewQuickReplyText}
              maxLength={200}
              multiline
              autoFocus
            />
            <View style={styles.addQuickReplyActions}>
              <TouchableOpacity
                onPress={() => { setShowAddQuickReply(false); setNewQuickReplyText(''); }}
                style={styles.addQuickReplyCancelBtn}
              >
                <Text style={styles.addQuickReplyCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAddQuickReply}
                style={[styles.addQuickReplySaveBtn, !newQuickReplyText.trim() && { opacity: 0.5 }]}
                disabled={!newQuickReplyText.trim()}
              >
                <Text style={styles.addQuickReplySaveText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Save Voice Message Name Modal */}
      <Modal visible={isSavingVoice} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.addQuickReplySheet}>
            <Text style={styles.addQuickReplyTitle}>Save Voice Message</Text>
            <Text style={styles.saveVoiceSubtitle}>Give this recording a name so you can find it later.</Text>
            <TextInput
              style={styles.addQuickReplyInput}
              placeholder="e.g. Greeting, Follow-up..."
              placeholderTextColor="#9BA1A6"
              value={savingVoiceName}
              onChangeText={setSavingVoiceName}
              maxLength={50}
              autoFocus
            />
            <View style={styles.addQuickReplyActions}>
              <TouchableOpacity
                onPress={() => {
                  setIsSavingVoice(false);
                  setSavingVoiceName('');
                  savedRecordingRef.current = null;
                }}
                style={styles.addQuickReplyCancelBtn}
              >
                <Text style={styles.addQuickReplyCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveVoiceMessage}
                style={[styles.addQuickReplySaveBtn, !savingVoiceName.trim() && { opacity: 0.5 }]}
                disabled={!savingVoiceName.trim()}
              >
                <Text style={styles.addQuickReplySaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Saved Voice Messages Modal */}
      <Modal visible={showSavedVoices} animationType="slide" transparent>
        <View style={styles.templateOverlay}>
          <View style={[styles.templateSheet, { paddingBottom: insets.bottom }]}>
            <View style={styles.templateHeader}>
              <Text style={styles.templateTitle}>Saved Voice Notes</Text>
              <TouchableOpacity onPress={() => setShowSavedVoices(false)}>
                <MaterialIcons name="close" size={24} color="#1B1B23" />
              </TouchableOpacity>
            </View>
            <Text style={styles.savedVoiceHint}>Tap to send, long press to delete</Text>
            <FlatList
              data={chatState.savedVoiceMessages}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.savedVoiceItem}
                  onPress={() => handleSendSavedVoice(item)}
                  onLongPress={() => handleDeleteSavedVoice(item)}
                  activeOpacity={0.7}
                >
                  <View style={styles.savedVoiceIcon}>
                    <MaterialIcons name="graphic-eq" size={20} color="#6366F1" />
                  </View>
                  <View style={styles.savedVoiceInfo}>
                    <Text style={styles.savedVoiceName}>{item.name}</Text>
                    <Text style={styles.savedVoiceDuration}>
                      {formatDuration(item.duration)} • {new Date(item.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                  <MaterialIcons name="send" size={18} color="#1A6B3C" />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.savedVoiceEmpty}>
                  <MaterialIcons name="graphic-eq" size={48} color="#E5E7EB" />
                  <Text style={styles.emptyText}>No saved voice notes</Text>
                  <Text style={styles.savedVoiceEmptyHint}>
                    Record a voice message and choose "Save for Later" to add it here.
                  </Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>
      {/* Image Gallery Viewer */}
      {galleryImageUrl && (
        <ImageGallery
          visible={!!galleryImageUrl}
          initialImageUrl={galleryImageUrl}
          messages={chatState.messages}
          onClose={() => setGalleryImageUrl(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0EDE8',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    backgroundColor: '#1A6B3C',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 12,
    gap: 10,
    shadowColor: '#1A6B3C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  backButton: {
    padding: 4,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  headerAvatarText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  headerInfo: {
    flex: 1,
  },
  headerName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  headerPhone: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  infoButton: {
    padding: 6,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesList: {
    paddingVertical: 8,
  },
  loadingMore: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  // Quick Replies
  quickRepliesContainer: {
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 0.5,
    borderTopColor: '#E5E7EB',
  },
  quickRepliesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  quickRepliesTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#687076',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addQuickReplyBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#1A6B3C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickRepliesScroll: {
    paddingRight: 8,
  },
  quickReplyChip: {
    backgroundColor: '#EFF8F0',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#1A6B3C',
    maxWidth: 200,
  },
  quickReplyText: {
    color: '#1A6B3C',
    fontSize: 13,
    fontWeight: '500',
  },
  quickReplyEmptyText: {
    color: '#9BA1A6',
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 4,
  },
  // Input Area
  inputArea: {
    backgroundColor: '#fff',
    paddingHorizontal: 8,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: '#E5E7EB',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  attachButton: {
    padding: 8,
    marginBottom: 2,
  },
  textInputContainer: {
    flex: 1,
    backgroundColor: '#F8F8F6',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 10 : 4,
    minHeight: 40,
    maxHeight: 120,
    justifyContent: 'center',
  },
  textInput: {
    fontSize: 15,
    color: '#1B1B23',
    lineHeight: 20,
    maxHeight: 100,
  },
  quickReplyBtn: {
    padding: 8,
    marginBottom: 2,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#1A6B3C',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
    shadowColor: '#1A6B3C',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  micButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(26,107,60,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  // Recording
  recordingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  cancelRecordBtn: {
    padding: 8,
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#F5365C',
  },
  recordingTime: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1B1B23',
  },
  stopRecordBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1A6B3C',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1A6B3C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  // Attachment Menu
  attachMenu: {
    position: 'absolute',
    left: 12,
    right: 12,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-evenly',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  attachOption: {
    alignItems: 'center',
    gap: 6,
    width: 60,
  },
  attachIconBg: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachLabel: {
    fontSize: 11,
    color: '#687076',
    fontWeight: '500',
  },
  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  addQuickReplySheet: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 340,
  },
  addQuickReplyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1B1B23',
    marginBottom: 12,
  },
  saveVoiceSubtitle: {
    fontSize: 13,
    color: '#687076',
    marginBottom: 12,
  },
  addQuickReplyInput: {
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1B1B23',
    minHeight: 44,
    maxHeight: 100,
    marginBottom: 16,
  },
  addQuickReplyActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  addQuickReplyCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  addQuickReplyCancelText: {
    fontSize: 15,
    color: '#687076',
    fontWeight: '500',
  },
  addQuickReplySaveBtn: {
    backgroundColor: '#1A6B3C',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  addQuickReplySaveText: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '600',
  },
  // Saved Voice Messages Modal
  templateOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  templateSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingTop: 16,
  },
  templateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  templateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1B1B23',
  },
  savedVoiceHint: {
    fontSize: 12,
    color: '#9BA1A6',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  savedVoiceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: '#E5E7EB',
    gap: 12,
  },
  savedVoiceIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(99,102,241,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedVoiceInfo: {
    flex: 1,
  },
  savedVoiceName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1B1B23',
  },
  savedVoiceDuration: {
    fontSize: 12,
    color: '#9BA1A6',
    marginTop: 2,
  },
  savedVoiceEmpty: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  savedVoiceEmptyHint: {
    fontSize: 13,
    color: '#9BA1A6',
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: 18,
  },
  emptyText: {
    color: '#9BA1A6',
    fontSize: 14,
  },
  // Upload Progress Bar
  uploadProgressContainer: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 0.5,
    borderTopColor: '#E5E7EB',
  },
  uploadProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  uploadProgressText: {
    flex: 1,
    fontSize: 13,
    color: '#1B1B23',
    fontWeight: '500',
  },
  uploadProgressPercent: {
    fontSize: 13,
    color: '#1A6B3C',
    fontWeight: '700',
  },
  uploadProgressBarBg: {
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    overflow: 'hidden',
  },
  uploadProgressBarFill: {
    height: 4,
    backgroundColor: '#1A6B3C',
    borderRadius: 2,
  },
});
