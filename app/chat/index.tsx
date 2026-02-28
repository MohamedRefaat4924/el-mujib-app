import React, { useEffect, useState, useCallback, useRef } from 'react';
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
import { useAuth } from '@/lib/stores/auth-store';
import { useChat } from '@/lib/stores/chat-store';
import { useContacts } from '@/lib/stores/contacts-store';
import { subscribeToChannel, unsubscribeFromChannel } from '@/lib/services/pusher';
import { MessageBubble } from '@/components/chat/message-bubble';
import { ChatMessage } from '@/lib/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
    markAllRead,
    loadCachedMessages,
    saveCachedMessages,
    loadQuickReplies,
    addQuickReply,
    setContactUid,
  } = useChat();
  const { updateUnreadToZero } = useContacts();

  const [messageText, setMessageText] = useState('');
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [templateSearch, setTemplateSearch] = useState('');
  const flatListRef = useRef<FlatList>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRecorderRef = useRef<any>(null);

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
      markAllRead(contactUid);
      updateUnreadToZero(contactUid);
      fetchTemplates();
      loadQuickReplies();
    }

    return () => {
      if (contactUid) {
        saveCachedMessages(contactUid);
      }
      resetChat();
    };
  }, [contactUid, vendorUid]);

  // Subscribe to real-time updates for this contact
  useEffect(() => {
    if (!vendorUid || !contactUid) return;

    const channelName = `private-vendor-channel.${vendorUid}`;
    // We subscribe globally in contacts screen, but listen for specific contact messages here
    // The global subscription handles updating the contact list
    // Here we just need to refresh messages when we get a new one for this contact

    return () => {
      // Save messages to cache when leaving
      saveCachedMessages(contactUid);
    };
  }, [vendorUid, contactUid]);

  const handleSendText = useCallback(async () => {
    const text = messageText.trim();
    if (!text || !contactUid) return;
    setMessageText('');
    setShowQuickReplies(false);
    await sendTextMessage(contactUid, text);
    // Refresh messages after sending
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
        for (const asset of result.assets) {
          await sendMediaMessage(contactUid, {
            uri: asset.uri,
            mimeType: asset.mimeType || 'image/jpeg',
            fileName: asset.fileName || 'image.jpg',
          }, 'image');
        }
        setTimeout(() => {
          fetchMessages(vendorUid, contactUid, { isRefresh: true });
        }, 1500);
      }
    } catch (e) {
      console.error('Image picker error:', e);
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
        await sendMediaMessage(contactUid, {
          uri: asset.uri,
          mimeType: asset.mimeType || 'image/jpeg',
          fileName: asset.fileName || 'photo.jpg',
        }, 'image');
        setTimeout(() => {
          fetchMessages(vendorUid, contactUid, { isRefresh: true });
        }, 1500);
      }
    } catch (e) {
      console.error('Camera error:', e);
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
        await sendMediaMessage(contactUid, {
          uri: asset.uri,
          mimeType: asset.mimeType || 'application/octet-stream',
          fileName: asset.name || 'document',
        }, 'document');
        setTimeout(() => {
          fetchMessages(vendorUid, contactUid, { isRefresh: true });
        }, 1500);
      }
    } catch (e) {
      console.error('Document picker error:', e);
    }
  }, [contactUid, vendorUid, sendMediaMessage, fetchMessages]);

  const handleStartRecording = useCallback(async () => {
    try {
      // Dynamic import to avoid issues on web
      const { Audio } = await import('expo-av');
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Microphone permission is required to record audio.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      audioRecorderRef.current = recording;
      setIsRecording(true);
      setRecordingDuration(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (e) {
      console.error('Recording start error:', e);
    }
  }, []);

  const handleStopRecording = useCallback(async () => {
    if (!audioRecorderRef.current) return;

    try {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }

      await audioRecorderRef.current.stopAndUnloadAsync();
      const uri = audioRecorderRef.current.getURI();
      audioRecorderRef.current = null;
      setIsRecording(false);
      setRecordingDuration(0);

      if (uri) {
        await sendMediaMessage(contactUid, {
          uri,
          mimeType: 'audio/m4a',
          fileName: 'voice_message.m4a',
        }, 'audio');
        setTimeout(() => {
          fetchMessages(vendorUid, contactUid, { isRefresh: true });
        }, 1500);
      }
    } catch (e) {
      console.error('Recording stop error:', e);
      setIsRecording(false);
    }
  }, [contactUid, vendorUid, sendMediaMessage, fetchMessages]);

  const handleCancelRecording = useCallback(async () => {
    if (!audioRecorderRef.current) return;
    try {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      await audioRecorderRef.current.stopAndUnloadAsync();
      audioRecorderRef.current = null;
      setIsRecording(false);
      setRecordingDuration(0);
    } catch (e) {
      console.error('Recording cancel error:', e);
      setIsRecording(false);
    }
  }, []);

  const handleSendTemplate = useCallback(async (template: any) => {
    setShowTemplates(false);
    await sendTemplateMessage(contactUid, template);
    setTimeout(() => {
      fetchMessages(vendorUid, contactUid, { isRefresh: true });
    }, 1500);
  }, [contactUid, vendorUid, sendTemplateMessage, fetchMessages]);

  const handleQuickReply = useCallback((reply: string) => {
    setMessageText(reply);
    setShowQuickReplies(false);
  }, []);

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

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const filteredTemplates = chatState.templates.filter(t =>
    !templateSearch || t.template_name?.toLowerCase().includes(templateSearch.toLowerCase())
  );

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
            <ActivityIndicator size="large" color="#089B21" />
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
              />
            )}
            inverted
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.3}
            ListFooterComponent={
              chatState.isLoadingMore ? (
                <View style={styles.loadingMore}>
                  <ActivityIndicator size="small" color="#089B21" />
                </View>
              ) : null
            }
            contentContainerStyle={styles.messagesList}
          />
        )}
      </View>

      {/* Quick Replies */}
      {showQuickReplies && chatState.quickReplies.length > 0 && (
        <View style={styles.quickRepliesContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {chatState.quickReplies.map((reply, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.quickReplyChip}
                onPress={() => handleQuickReply(reply)}
                activeOpacity={0.7}
              >
                <Text style={styles.quickReplyText} numberOfLines={1}>{reply}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Input Area */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={[styles.inputArea, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          {isRecording ? (
            <View style={styles.recordingBar}>
              <TouchableOpacity onPress={handleCancelRecording} style={styles.cancelRecordBtn}>
                <MaterialIcons name="close" size={24} color="#F5365C" />
              </TouchableOpacity>
              <View style={styles.recordingIndicator}>
                <View style={styles.recordingDot} />
                <Text style={styles.recordingTime}>{formatDuration(recordingDuration)}</Text>
              </View>
              <TouchableOpacity onPress={handleStopRecording} style={styles.stopRecordBtn}>
                <MaterialIcons name="send" size={24} color="#fff" />
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
                  onChangeText={(text) => {
                    setMessageText(text);
                    if (text.length === 0) setShowQuickReplies(false);
                  }}
                  multiline
                  maxLength={4096}
                  onFocus={() => {
                    if (chatState.quickReplies.length > 0 && messageText.length === 0) {
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
                <MaterialIcons name="flash-on" size={20} color="#089B21" />
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
                  <MaterialIcons name="mic" size={24} color="#089B21" />
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
            <View style={[styles.attachIconBg, { backgroundColor: '#089B21' }]}>
              <MaterialIcons name="photo-library" size={22} color="#fff" />
            </View>
            <Text style={styles.attachLabel}>Gallery</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.attachOption} onPress={handleSendDocument}>
            <View style={[styles.attachIconBg, { backgroundColor: '#D7A81B' }]}>
              <MaterialIcons name="description" size={22} color="#fff" />
            </View>
            <Text style={styles.attachLabel}>Document</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.attachOption} onPress={() => { setShowAttachMenu(false); setShowTemplates(true); }}>
            <View style={[styles.attachIconBg, { backgroundColor: '#6366F1' }]}>
              <MaterialIcons name="article" size={22} color="#fff" />
            </View>
            <Text style={styles.attachLabel}>Template</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Template Picker Modal */}
      <Modal visible={showTemplates} animationType="slide" transparent>
        <View style={styles.templateOverlay}>
          <View style={[styles.templateSheet, { paddingBottom: insets.bottom }]}>
            <View style={styles.templateHeader}>
              <Text style={styles.templateTitle}>Templates</Text>
              <TouchableOpacity onPress={() => setShowTemplates(false)}>
                <MaterialIcons name="close" size={24} color="#1B1B23" />
              </TouchableOpacity>
            </View>
            <View style={styles.templateSearchBar}>
              <MaterialIcons name="search" size={18} color="#9BA1A6" />
              <TextInput
                style={styles.templateSearchInput}
                placeholder="Search templates..."
                placeholderTextColor="#9BA1A6"
                value={templateSearch}
                onChangeText={setTemplateSearch}
              />
            </View>
            <FlatList
              data={filteredTemplates}
              keyExtractor={(item) => item._uid}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.templateItem}
                  onPress={() => handleSendTemplate(item)}
                  activeOpacity={0.7}
                >
                  <View style={styles.templateItemIcon}>
                    <MaterialIcons name="article" size={20} color="#089B21" />
                  </View>
                  <View style={styles.templateItemInfo}>
                    <Text style={styles.templateItemName}>{item.template_name}</Text>
                    <Text style={styles.templateItemLang}>{item.language} • {item.category}</Text>
                  </View>
                  <MaterialIcons name="send" size={18} color="#089B21" />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.centerContainer}>
                  <Text style={styles.emptyText}>No templates found</Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ECE5DD',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    backgroundColor: '#089B21',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  backButton: {
    padding: 4,
  },
  headerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
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
  quickRepliesContainer: {
    backgroundColor: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderTopWidth: 0.5,
    borderTopColor: '#E5E7EB',
  },
  quickReplyChip: {
    backgroundColor: '#F0F9F0',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#089B21',
    maxWidth: 200,
  },
  quickReplyText: {
    color: '#089B21',
    fontSize: 13,
    fontWeight: '500',
  },
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
    backgroundColor: '#F5F5F5',
    borderRadius: 20,
    paddingHorizontal: 14,
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#089B21',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
    shadowColor: '#089B21',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  micButton: {
    padding: 8,
    marginBottom: 2,
  },
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
    backgroundColor: '#089B21',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachMenu: {
    position: 'absolute',
    left: 12,
    right: 12,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-around',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  attachOption: {
    alignItems: 'center',
    gap: 6,
  },
  attachIconBg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachLabel: {
    fontSize: 11,
    color: '#687076',
    fontWeight: '500',
  },
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
    marginBottom: 12,
  },
  templateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1B1B23',
  },
  templateSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    height: 40,
    gap: 8,
    marginBottom: 8,
  },
  templateSearchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1B1B23',
  },
  templateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#E5E7EB',
    gap: 12,
  },
  templateItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(8,155,33,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  templateItemInfo: {
    flex: 1,
  },
  templateItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1B1B23',
  },
  templateItemLang: {
    fontSize: 12,
    color: '#9BA1A6',
    marginTop: 2,
  },
  emptyText: {
    color: '#9BA1A6',
    fontSize: 14,
  },
});
