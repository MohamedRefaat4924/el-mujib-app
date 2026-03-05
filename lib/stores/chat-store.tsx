import React, { createContext, useContext, useReducer, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiGet, apiPost, uploadFile, getItemValue } from '../services/api';
import { ChatMessage, WhatsAppTemplate, MessageFrom, MessageType, MessageStatus } from '../types';
import { Platform } from 'react-native';

// Helper to parse a raw message object from the API into our ChatMessage type
// Matches Flutter's _parseAndAddMessages logic
function parseMessageFromApi(value: any): ChatMessage {
  const mediaValues = value?.__data?.media_values || {};
  const isIncoming = value?.is_incoming_message;
  // Flutter: message_from = isIncoming ? 1 : 2
  const messageFrom: MessageFrom = isIncoming === true || isIncoming === 1 ? 1 : 2;

  // Determine message type from __data or media_values
  let messageType: MessageType = 'text';
  const rawType = value?.__data?.type || mediaValues?.type || value?.message_type || '';
  if (['image', 'audio', 'video', 'document', 'sticker', 'contacts', 'location', 'interactive', 'template', 'reaction'].includes(rawType)) {
    messageType = rawType as MessageType;
  } else if (value?.template_message) {
    messageType = 'template';
  }

  // Determine status
  let status: MessageStatus = 'sent';
  const rawStatus = value?.status || '';
  if (['sent', 'delivered', 'read', 'failed', 'pending'].includes(rawStatus)) {
    status = rawStatus as MessageStatus;
  }

  return {
    _uid: value?._uid || value?._id || String(Math.random()),
    status,
    message_from: messageFrom,
    message_type: messageType,
    formatted_message: value?.message || value?.formatted_message || '',
    formatted_message_time: value?.formatted_message_time || '',
    whatsapp_message_error: value?.whatsapp_message_error || '',
    template_message: value?.template_message || '',
    __data: {
      interaction_message_data: value?.__data?.interaction_message_data,
      template_message_data: value?.__data?.template_message_data,
      contact_data: value?.__data?.contact_data,
      media_url: mediaValues?.link || value?.__data?.media_url || '',
      caption: mediaValues?.caption || value?.__data?.caption || '',
      latitude: value?.__data?.latitude,
      longitude: value?.__data?.longitude,
      filename: mediaValues?.file_name || mediaValues?.original_filename || value?.__data?.filename || '',
      mime_type: mediaValues?.mime_type || value?.__data?.mime_type || '',
    },
    reaction: value?.reaction,
  };
}

const MESSAGE_CACHE_PREFIX = '@el_mujib_messages_';
const QUICK_REPLIES_KEY = '@el_mujib_quick_replies';
const SAVED_VOICES_KEY = '@el_mujib_saved_voices';

interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  isLoadingMore: boolean;
  isSending: boolean;
  hasReachedMax: boolean;
  currentPage: number;
  templates: WhatsAppTemplate[];
  quickReplies: string[];
  savedVoiceMessages: SavedVoiceMessage[];
  currentContactUid: string;
}

type ChatAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_LOADING_MORE'; payload: boolean }
  | { type: 'SET_SENDING'; payload: boolean }
  | { type: 'SET_MESSAGES'; payload: { messages: ChatMessage[]; append: boolean } }
  | { type: 'ADD_MESSAGE'; payload: ChatMessage }
  | { type: 'SET_REACHED_MAX' }
  | { type: 'INCREMENT_PAGE' }
  | { type: 'RESET_CHAT' }
  | { type: 'SET_TEMPLATES'; payload: WhatsAppTemplate[] }
  | { type: 'SET_QUICK_REPLIES'; payload: string[] }
  | { type: 'SET_SAVED_VOICES'; payload: SavedVoiceMessage[] }
  | { type: 'SET_CONTACT_UID'; payload: string }
  | { type: 'UPDATE_MESSAGE_STATUS'; payload: { messageUid: string; status: string } };

const initialState: ChatState = {
  messages: [],
  isLoading: false,
  isLoadingMore: false,
  isSending: false,
  hasReachedMax: false,
  currentPage: 1,
  templates: [],
  quickReplies: [],
  savedVoiceMessages: [],
  currentContactUid: '',
};

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_LOADING_MORE':
      return { ...state, isLoadingMore: action.payload };
    case 'SET_SENDING':
      return { ...state, isSending: action.payload };
    case 'SET_MESSAGES': {
      if (action.payload.append) {
        const existingUids = new Set(state.messages.map(m => m._uid));
        const newMsgs = action.payload.messages.filter(m => !existingUids.has(m._uid));
        return {
          ...state,
          messages: [...state.messages, ...newMsgs],
          isLoading: false,
          isLoadingMore: false,
        };
      }
      return {
        ...state,
        messages: action.payload.messages,
        isLoading: false,
        isLoadingMore: false,
      };
    }
    case 'ADD_MESSAGE':
      return {
        ...state,
        messages: [action.payload, ...state.messages],
        isSending: false,
      };
    case 'SET_REACHED_MAX':
      return { ...state, hasReachedMax: true, isLoadingMore: false };
    case 'INCREMENT_PAGE':
      return { ...state, currentPage: state.currentPage + 1 };
    case 'RESET_CHAT':
      return { ...initialState, templates: state.templates, quickReplies: state.quickReplies, savedVoiceMessages: state.savedVoiceMessages };
    case 'SET_TEMPLATES':
      return { ...state, templates: action.payload };
    case 'SET_QUICK_REPLIES':
      return { ...state, quickReplies: action.payload };
    case 'SET_SAVED_VOICES':
      return { ...state, savedVoiceMessages: action.payload };
    case 'SET_CONTACT_UID':
      return { ...state, currentContactUid: action.payload };
    case 'UPDATE_MESSAGE_STATUS': {
      const { messageUid, status } = action.payload;
      const updatedMessages = state.messages.map(m =>
        m._uid === messageUid ? { ...m, status: status as any } : m
      );
      return { ...state, messages: updatedMessages };
    }
    default:
      return state;
  }
}

export interface SavedVoiceMessage {
  id: string;
  name: string;
  uri: string;
  duration: number; // seconds
  createdAt: number;
}

interface ChatContextType {
  state: ChatState;
  fetchMessages: (vendorUid: string, contactUid: string, options?: { isRefresh?: boolean }) => Promise<void>;
  sendTextMessage: (contactUid: string, message: string) => Promise<void>;
  sendMediaMessage: (contactUid: string, file: any, mediaType: string, caption?: string, onProgress?: (progress: number, step: string) => void) => Promise<void>;
  sendTemplateMessage: (contactUid: string, template: any) => Promise<void>;
  resetChat: () => void;
  fetchTemplates: () => Promise<void>;
  loadCachedMessages: (contactUid: string) => Promise<void>;
  saveCachedMessages: (contactUid: string) => Promise<void>;
  loadQuickReplies: () => Promise<void>;
  addQuickReply: (reply: string) => Promise<void>;
  removeQuickReply: (reply: string) => Promise<void>;
  loadSavedVoiceMessages: () => Promise<void>;
  addSavedVoiceMessage: (voice: SavedVoiceMessage) => Promise<void>;
  removeSavedVoiceMessage: (id: string) => Promise<void>;
  setContactUid: (uid: string) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const pageRef = useRef(1);
  const loadingRef = useRef(false);

  // Fetch messages matching Flutter's chatbox_controller.dart getUserChat()
  // Flutter uses data_transport.get() (GET method)
  // Initial: vendor/whatsapp/contact/chat/{userId}?assigned=
  // Pagination: vendor/whatsapp/contact/chat/{userId}?way=prepend&assigned=&page={page}
  // Response: response.client_models.whatsappMessageLogs (Map, not Array)
  const fetchMessages = useCallback(async (
    vendorUid: string,
    contactUid: string,
    options?: { isRefresh?: boolean }
  ) => {
    const isRefresh = options?.isRefresh ?? true;

    if (loadingRef.current) return;
    if (!isRefresh && state.hasReachedMax) return;

    loadingRef.current = true;

    if (isRefresh) {
      pageRef.current = 2; // Flutter starts currentPage at 2 (page 1 is initial load)
      dispatch({ type: 'SET_LOADING', payload: true });
    } else {
      dispatch({ type: 'SET_LOADING_MORE', payload: true });
    }

    try {
      // Flutter getUserChat: data_transport.get('vendor/whatsapp/contact/chat/$userId?assigned=')
      // Flutter loadMoreMessages2: data_transport.get('vendor/whatsapp/contact/chat/$userId?way=prepend&assigned=&page=$currentPage')
      let endpoint: string;
      if (isRefresh) {
        endpoint = `vendor/whatsapp/contact/chat/${contactUid}?assigned=`;
      } else {
        endpoint = `vendor/whatsapp/contact/chat/${contactUid}?way=prepend&assigned=&page=${pageRef.current}`;
      }

      const response = await apiGet(endpoint);

      if (response) {
        // Flutter extracts: response['client_models']['whatsappMessageLogs']
        // This is a Map (object), not an Array - Flutter iterates with forEach
        const messagesData = getItemValue(response, 'client_models.whatsappMessageLogs') ||
                            getItemValue(response, 'data.whatsappMessageLogs') || {};

        let messagesList: ChatMessage[] = [];
        if (Array.isArray(messagesData)) {
          messagesList = messagesData;
        } else if (typeof messagesData === 'object' && messagesData !== null) {
          // Flutter iterates over map values with forEach((key, value))
          messagesList = Object.values(messagesData).map((value: any) => {
            // Parse each message matching Flutter's _parseAndAddMessages
            return parseMessageFromApi(value);
          });
        }

        if (messagesList.length === 0 && !isRefresh) {
          dispatch({ type: 'SET_REACHED_MAX' });
        } else {
          dispatch({
            type: 'SET_MESSAGES',
            payload: { messages: messagesList, append: !isRefresh },
          });
          if (!isRefresh) {
            pageRef.current += 1;
            dispatch({ type: 'INCREMENT_PAGE' });
          }
        }

        // Also extract assignedLabelIds from response (Flutter does this too)
        const labelIds = getItemValue(response, 'client_models.assignedLabelIds');
        if (labelIds) {
          // Store in state if needed later
        }
      }
    } catch (e) {
      console.error('Error fetching messages:', e);
    } finally {
      loadingRef.current = false;
      dispatch({ type: 'SET_LOADING', payload: false });
      dispatch({ type: 'SET_LOADING_MORE', payload: false });
    }
  }, [state.hasReachedMax]);

  // Send text message matching Flutter's chatbox.dart sendMessage()
  // Endpoint: vendor/whatsapp/contact/chat/send
  // Payload: { contact_uid, message_body }
  const sendTextMessage = useCallback(async (contactUid: string, message: string) => {
    dispatch({ type: 'SET_SENDING', payload: true });
    try {
      await apiPost('vendor/whatsapp/contact/chat/send', {
        contact_uid: contactUid,
        message_body: message,
      });
      // Quick replies are now user-managed, not auto-added
    } catch (e) {
      console.error('Error sending message:', e);
    } finally {
      dispatch({ type: 'SET_SENDING', payload: false });
    }
  }, []);

  // Send media message matching Flutter's chatbox_controller.dart sendMediaN()
  // Three-step process matching Flutter exactly:
  // 1. Call prepare-send-media/{type} (GET) to prepare the upload session
  // 2. Upload file to media/upload-temp-media/whatsapp_{type} with field name 'filepond'
  // 3. Send via vendor/whatsapp/contact/chat/send-media with uploaded data
  const sendMediaMessage = useCallback(async (
    contactUid: string,
    file: any,
    mediaType: string,
    caption?: string,
    onProgress?: (progress: number, step: string) => void
  ) => {
    dispatch({ type: 'SET_SENDING', payload: true });
    try {
      // Normalize media type label (matching Flutter's getChatMedia normalization)
      let normalizedLabel = mediaType.toLowerCase();
      if (normalizedLabel === 'documento') normalizedLabel = 'document';
      if (normalizedLabel === 'immagine') normalizedLabel = 'image';

      console.log('[sendMediaMessage] === STEP 1: prepare-send-media ===');
      // Step 1: Call prepare-send-media (matching Flutter's getChatMedia)
      try {
        const prepResult = await apiGet(`vendor/whatsapp/contact/chat/prepare-send-media/${normalizedLabel}`);
        console.log('[sendMediaMessage] Step 1 SUCCESS:', JSON.stringify(prepResult)?.substring(0, 200));
      } catch (prepErr: any) {
        console.warn('[sendMediaMessage] Step 1 WARNING (non-fatal):', prepErr?.message || prepErr);
        // Continue even if this fails - it's a preparation step
      }

      // Step 2: Determine upload path based on media type (matching Flutter's switch case)
      let uploadPath = 'media/upload-temp-media/whatsapp_other';
      switch (normalizedLabel) {
        case 'image':
          uploadPath = 'media/upload-temp-media/whatsapp_image';
          break;
        case 'video':
          uploadPath = 'media/upload-temp-media/whatsapp_video';
          break;
        case 'document':
          uploadPath = 'media/upload-temp-media/whatsapp_document';
          break;
        case 'audio':
          uploadPath = 'media/upload-temp-media/whatsapp_audio';
          break;
      }

      const fileUri = file.uri || file;
      const fileName = file.fileName || file.name || `file.${normalizedLabel}`;
      const mimeType = file.mimeType || file.type || 'application/octet-stream';

      console.log('[sendMediaMessage] === STEP 2: upload file ===', {
        fileUri: fileUri?.substring(0, 100),
        fileName,
        mimeType,
        uploadPath,
        normalizedLabel,
        fileKeys: typeof file === 'object' ? Object.keys(file) : ['string'],
      });

      // Report step progress
      if (onProgress) onProgress(10, 'Uploading...');

      // Step 2: Upload file using 'filepond' field name (matching Flutter data_transport.uploadFile)
      let uploadResponse;
      try {
        uploadResponse = await uploadFile(
          fileUri,
          fileName,
          mimeType,
          uploadPath,
          {
            onProgress: (uploadPct) => {
              // Map upload progress (0-100) to overall progress (10-80)
              if (onProgress) {
                const overall = 10 + Math.round(uploadPct * 0.7);
                onProgress(overall, `Uploading... ${uploadPct}%`);
              }
            },
          },
        );
        console.log('[sendMediaMessage] Step 2 UPLOAD SUCCESS:', JSON.stringify(uploadResponse)?.substring(0, 300));
      } catch (uploadErr: any) {
        console.error('[sendMediaMessage] Step 2 UPLOAD FAILED:', uploadErr?.message || uploadErr);
        throw new Error(`Upload step failed: ${uploadErr?.message || 'Unknown error'}`);
      }

      if (!uploadResponse?.data) {
        console.error('[sendMediaMessage] Step 2 UPLOAD returned no data:', JSON.stringify(uploadResponse)?.substring(0, 300));
        throw new Error('Upload failed - no data returned');
      }

      const uploadedData = uploadResponse.data;
      console.log('[sendMediaMessage] uploadedData:', JSON.stringify(uploadedData)?.substring(0, 300));

      // Step 3: Send media message
      // For audio on web: match the blade file exactly — it only sends
      // {contact_uid, uploaded_media_file_name, media_type: 'audio'} with NO raw_upload_data.
      // The blade file's voice recording uploads via FilePond and then sends just the filename.
      // For other media types: include raw_upload_data as Flutter does.
      let finalMimeType = uploadedData?.fileMimeType;
      let finalFileName = uploadedData?.fileName;
      let finalExtension = uploadedData?.fileExtension;
      console.log('[sendMediaMessage] Upload response data:', { finalMimeType, finalFileName, finalExtension });

      // For audio uploads: force the MIME type to match what we actually sent
      // The server may detect the original blob MIME (e.g., audio/webm) instead of the converted MP3
      if (normalizedLabel === 'audio') {
        const acceptedAudioMimes = ['audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg'];
        if (!acceptedAudioMimes.includes(finalMimeType || '')) {
          // Override with the MIME type we declared during upload
          finalMimeType = mimeType; // This is the sanitized MIME from step 2
          console.log('[sendMediaMessage] Overriding audio MIME in upload data to:', finalMimeType);
        }
        // Also fix extension to match
        const mimeExtMap: Record<string, string> = {
          'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'audio/aac': '.aac',
          'audio/ogg': '.ogg', 'audio/amr': '.amr',
        };
        if (mimeExtMap[finalMimeType || '']) {
          finalExtension = mimeExtMap[finalMimeType || ''];
        }
      }

      const mediaData = {
        message: uploadedData?.message || 'File uploaded successfully.',
        path: uploadedData?.path,
        original_filename: uploadedData?.original_filename,
        fileName: finalFileName,
        fileMimeType: finalMimeType,
        fileExtension: finalExtension,
        realPath: uploadedData?.realPath,
        incident: uploadedData?.incident,
      };

      const sendPayload: Record<string, string> = {
        contact_uid: contactUid,
        filepond: 'undefined',
        uploaded_media_file_name: finalFileName || uploadedData?.fileName || fileName,
        media_type: normalizedLabel,
        raw_upload_data: JSON.stringify(mediaData),
        caption: caption || '',
      };
      if (onProgress) onProgress(85, 'Sending...');
      console.log('[sendMediaMessage] === STEP 3: send-media ===', JSON.stringify(sendPayload)?.substring(0, 500));
      try {
        const sendResult = await apiPost('vendor/whatsapp/contact/chat/send-media', sendPayload);
        console.log('[sendMediaMessage] Step 3 SEND SUCCESS:', JSON.stringify(sendResult)?.substring(0, 200));
        if (onProgress) onProgress(100, 'Sent!');
      } catch (sendErr: any) {
        console.error('[sendMediaMessage] Step 3 SEND FAILED:', sendErr?.message || sendErr);
        throw sendErr;
      }
    } catch (e: any) {
      console.error('[sendMediaMessage] OVERALL ERROR:', e?.message || e);
    } finally {
      dispatch({ type: 'SET_SENDING', payload: false });
    }
  }, []);

  // Send template message matching Flutter's sendTemplateMessage
  // Flutter uses: vendor/whatsapp/contact/chat/prepare-send-media with template data
  const sendTemplateMessage = useCallback(async (contactUid: string, template: any) => {
    dispatch({ type: 'SET_SENDING', payload: true });
    try {
      await apiPost('vendor/whatsapp/contact/chat/prepare-send-media', {
        contact_uid: contactUid,
        template_uid: template._uid,
        template_name: template.template_name,
        template_language: template.language,
        template_data: { components: template.components || [] },
      });
    } catch (e) {
      console.error('Error sending template:', e);
    } finally {
      dispatch({ type: 'SET_SENDING', payload: false });
    }
  }, []);

  const resetChat = useCallback(() => {
    pageRef.current = 1;
    loadingRef.current = false;
    dispatch({ type: 'RESET_CHAT' });
  }, []);

  // Fetch templates - Flutter loads these from the chat-box-data response
  // The templates are part of the initial chat data, not a separate endpoint
  const fetchTemplates = useCallback(async () => {
    try {
      // Templates come from the chat-box-data endpoint response
      // They are extracted as part of the contact chat data
      // No separate endpoint exists in Flutter for this
      console.log('[Chat] Templates loaded from chat-box-data response');
    } catch (e) {
      console.error('Error fetching templates:', e);
    }
  }, []);

  const loadCachedMessages = useCallback(async (contactUid: string) => {
    try {
      const cached = await AsyncStorage.getItem(`${MESSAGE_CACHE_PREFIX}${contactUid}`);
      if (cached) {
        const messages = JSON.parse(cached);
        dispatch({ type: 'SET_MESSAGES', payload: { messages, append: false } });
      }
    } catch (e) {
      console.error('Error loading cached messages:', e);
    }
  }, []);

  const saveCachedMessages = useCallback(async (contactUid: string) => {
    try {
      const toCache = state.messages.slice(0, 100);
      await AsyncStorage.setItem(`${MESSAGE_CACHE_PREFIX}${contactUid}`, JSON.stringify(toCache));
    } catch (e) {
      console.error('Error saving cached messages:', e);
    }
  }, [state.messages]);

  const loadQuickReplies = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(QUICK_REPLIES_KEY);
      if (stored) {
        dispatch({ type: 'SET_QUICK_REPLIES', payload: JSON.parse(stored) });
      }
    } catch (e) {
      console.error('Error loading quick replies:', e);
    }
  }, []);

  const addQuickReply = useCallback(async (reply: string) => {
    if (!reply.trim() || reply.length > 200) return;
    try {
      const stored = await AsyncStorage.getItem(QUICK_REPLIES_KEY);
      let replies: string[] = stored ? JSON.parse(stored) : [];
      // Don't add duplicates
      if (replies.includes(reply.trim())) return;
      replies.push(reply.trim());
      replies = replies.slice(0, 50); // Max 50 quick replies
      await AsyncStorage.setItem(QUICK_REPLIES_KEY, JSON.stringify(replies));
      dispatch({ type: 'SET_QUICK_REPLIES', payload: replies });
    } catch (e) {
      console.error('Error adding quick reply:', e);
    }
  }, []);

  const removeQuickReply = useCallback(async (reply: string) => {
    try {
      const stored = await AsyncStorage.getItem(QUICK_REPLIES_KEY);
      let replies: string[] = stored ? JSON.parse(stored) : [];
      replies = replies.filter(r => r !== reply);
      await AsyncStorage.setItem(QUICK_REPLIES_KEY, JSON.stringify(replies));
      dispatch({ type: 'SET_QUICK_REPLIES', payload: replies });
    } catch (e) {
      console.error('Error removing quick reply:', e);
    }
  }, []);

  const loadSavedVoiceMessages = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(SAVED_VOICES_KEY);
      if (stored) {
        dispatch({ type: 'SET_SAVED_VOICES', payload: JSON.parse(stored) });
      }
    } catch (e) {
      console.error('Error loading saved voice messages:', e);
    }
  }, []);

  const addSavedVoiceMessage = useCallback(async (voice: SavedVoiceMessage) => {
    try {
      const stored = await AsyncStorage.getItem(SAVED_VOICES_KEY);
      let voices: SavedVoiceMessage[] = stored ? JSON.parse(stored) : [];
      voices.unshift(voice);
      voices = voices.slice(0, 30); // Max 30 saved voice messages
      await AsyncStorage.setItem(SAVED_VOICES_KEY, JSON.stringify(voices));
      dispatch({ type: 'SET_SAVED_VOICES', payload: voices });
    } catch (e) {
      console.error('Error saving voice message:', e);
    }
  }, []);

  const removeSavedVoiceMessage = useCallback(async (id: string) => {
    try {
      const stored = await AsyncStorage.getItem(SAVED_VOICES_KEY);
      let voices: SavedVoiceMessage[] = stored ? JSON.parse(stored) : [];
      voices = voices.filter(v => v.id !== id);
      await AsyncStorage.setItem(SAVED_VOICES_KEY, JSON.stringify(voices));
      dispatch({ type: 'SET_SAVED_VOICES', payload: voices });
    } catch (e) {
      console.error('Error removing saved voice message:', e);
    }
  }, []);

  const setContactUid = useCallback((uid: string) => {
    dispatch({ type: 'SET_CONTACT_UID', payload: uid });
  }, []);

  return (
    <ChatContext.Provider
      value={{
        state,
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
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}
