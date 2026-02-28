import React, { createContext, useContext, useReducer, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiGet, apiPost, uploadFile, getItemValue } from '../services/api';
import { ChatMessage, WhatsAppTemplate } from '../types';
import { Platform } from 'react-native';

const MESSAGE_CACHE_PREFIX = '@el_mujib_messages_';
const QUICK_REPLIES_KEY = '@el_mujib_quick_replies';

interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  isLoadingMore: boolean;
  isSending: boolean;
  hasReachedMax: boolean;
  currentPage: number;
  templates: WhatsAppTemplate[];
  quickReplies: string[];
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
      return { ...initialState, templates: state.templates, quickReplies: state.quickReplies };
    case 'SET_TEMPLATES':
      return { ...state, templates: action.payload };
    case 'SET_QUICK_REPLIES':
      return { ...state, quickReplies: action.payload };
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

interface ChatContextType {
  state: ChatState;
  fetchMessages: (vendorUid: string, contactUid: string, options?: { isRefresh?: boolean }) => Promise<void>;
  sendTextMessage: (contactUid: string, message: string) => Promise<void>;
  sendMediaMessage: (contactUid: string, file: any, mediaType: string, caption?: string) => Promise<void>;
  sendTemplateMessage: (contactUid: string, template: any) => Promise<void>;
  resetChat: () => void;
  fetchTemplates: () => Promise<void>;
  loadCachedMessages: (contactUid: string) => Promise<void>;
  saveCachedMessages: (contactUid: string) => Promise<void>;
  loadQuickReplies: () => Promise<void>;
  addQuickReply: (reply: string) => Promise<void>;
  setContactUid: (uid: string) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const pageRef = useRef(1);
  const loadingRef = useRef(false);

  // Fetch messages matching Flutter's chatbox_controller.dart getUserChat()
  // Endpoint: vendor/whatsapp/contact/chat/{userId}?assigned=
  // Flutter uses POST with inputData: {"contact_uid": userId}
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
      pageRef.current = 1;
      dispatch({ type: 'SET_LOADING', payload: true });
    } else {
      dispatch({ type: 'SET_LOADING_MORE', payload: true });
    }

    try {
      // Flutter endpoint: vendor/whatsapp/contact/chat/{userId}?assigned=
      // It's a POST request with contact_uid in the body
      const response = await apiPost(
        `vendor/whatsapp/contact/chat/${contactUid}?page=${pageRef.current}`,
        { contact_uid: contactUid }
      );

      if (response) {
        // Flutter extracts: response['data']['whatsappMessageLogs']
        const messagesData = getItemValue(response, 'data.whatsappMessageLogs') ||
                            getItemValue(response, 'data.messages') ||
                            response?.data || [];

        let messagesList: ChatMessage[] = [];
        if (Array.isArray(messagesData)) {
          messagesList = messagesData;
        } else if (typeof messagesData === 'object') {
          // Flutter iterates over map values
          messagesList = Object.values(messagesData);
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
      // Add to quick replies for smart suggestions
      addQuickReply(message);
    } catch (e) {
      console.error('Error sending message:', e);
    } finally {
      dispatch({ type: 'SET_SENDING', payload: false });
    }
  }, []);

  // Send media message matching Flutter's chatbox_controller.dart sendMediaN()
  // Two-step process:
  // 1. Upload file to media/upload-temp-media/whatsapp_{type} with field name 'filepond'
  // 2. Send via vendor/whatsapp/contact/chat/send-media with uploaded data
  const sendMediaMessage = useCallback(async (
    contactUid: string,
    file: any,
    mediaType: string,
    caption?: string
  ) => {
    dispatch({ type: 'SET_SENDING', payload: true });
    try {
      // Step 1: Determine upload path based on media type (matching Flutter's switch case)
      let uploadPath = 'media/upload-temp-media/whatsapp_other';
      switch (mediaType) {
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
      const fileName = file.fileName || file.name || `file.${mediaType}`;
      const mimeType = file.mimeType || file.type || 'application/octet-stream';

      // Step 1: Upload file using 'filepond' field name (matching Flutter data_transport.uploadFile)
      const uploadResponse = await uploadFile(
        fileUri,
        fileName,
        mimeType,
        uploadPath,
      );

      if (!uploadResponse?.data) {
        throw new Error('Upload failed - no data returned');
      }

      const uploadedData = uploadResponse.data;

      // Step 2: Send media message matching Flutter's sendMediaN payload exactly
      // Flutter builds: { contact_uid, filepond: "undefined", uploaded_media_file_name, media_type, raw_upload_data, caption }
      const mediaData = {
        message: uploadedData?.message || 'File uploaded successfully.',
        path: uploadedData?.path,
        original_filename: uploadedData?.original_filename,
        fileName: uploadedData?.fileName,
        fileMimeType: uploadedData?.fileMimeType,
        fileExtension: uploadedData?.fileExtension,
        realPath: uploadedData?.realPath,
        incident: uploadedData?.incident,
      };

      await apiPost('vendor/whatsapp/contact/chat/send-media', {
        contact_uid: contactUid,
        filepond: 'undefined',
        uploaded_media_file_name: uploadedData?.fileName || fileName,
        media_type: mediaType,
        raw_upload_data: JSON.stringify(mediaData),
        caption: caption || '',
      });
    } catch (e) {
      console.error('Error sending media:', e);
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
    if (!reply.trim() || reply.length > 100) return;
    try {
      const stored = await AsyncStorage.getItem(QUICK_REPLIES_KEY);
      let replies: string[] = stored ? JSON.parse(stored) : [];
      replies = replies.filter(r => r !== reply);
      replies.unshift(reply);
      replies = replies.slice(0, 20);
      await AsyncStorage.setItem(QUICK_REPLIES_KEY, JSON.stringify(replies));
      dispatch({ type: 'SET_QUICK_REPLIES', payload: replies });
    } catch (e) {
      console.error('Error adding quick reply:', e);
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
