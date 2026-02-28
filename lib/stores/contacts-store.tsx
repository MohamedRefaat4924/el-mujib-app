import React, { createContext, useContext, useReducer, useCallback, useRef } from 'react';
import { apiGet, getItemValue } from '../services/api';
import { Contact, VendorMessagingUser, LabelDropdownItem } from '../types';

interface ContactEntry {
  key: string;
  value: Contact;
}

interface ContactsState {
  contactsList: ContactEntry[];
  originalContactsList: ContactEntry[];
  unreadMsgCount: number;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasReachedMax: boolean;
  currentPage: number;
  vendorMessagingUsers: VendorMessagingUser[];
  labelsDropdownItems: LabelDropdownItem[];
}

type ContactsAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_LOADING_MORE'; payload: boolean }
  | { type: 'SET_CONTACTS'; payload: { contacts: ContactEntry[]; unreadMsgCount: number; append: boolean } }
  | { type: 'SET_REACHED_MAX' }
  | { type: 'INCREMENT_PAGE' }
  | { type: 'RESET_PAGINATION' }
  | { type: 'UPDATE_UNREAD_TO_ZERO'; payload: string }
  | { type: 'UPDATE_CONTACT_NEW_MESSAGE'; payload: { contactUid: string; lastMessageUid: string; formattedTime: string } }
  | { type: 'ADD_NEW_CONTACT'; payload: ContactEntry }
  | { type: 'SET_VENDOR_USERS'; payload: VendorMessagingUser[] }
  | { type: 'SET_LABELS'; payload: LabelDropdownItem[] }
  | { type: 'SET_FILTERED'; payload: ContactEntry[] }
  | { type: 'RESET_FILTER' };

const initialState: ContactsState = {
  contactsList: [],
  originalContactsList: [],
  unreadMsgCount: 0,
  isLoading: false,
  isLoadingMore: false,
  hasReachedMax: false,
  currentPage: 1,
  vendorMessagingUsers: [],
  labelsDropdownItems: [],
};

function contactsReducer(state: ContactsState, action: ContactsAction): ContactsState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_LOADING_MORE':
      return { ...state, isLoadingMore: action.payload };
    case 'SET_CONTACTS': {
      const { contacts, unreadMsgCount, append } = action.payload;
      if (append) {
        const existingKeys = new Set(state.contactsList.map(c => c.key));
        const newContacts = contacts.filter(c => !existingKeys.has(c.key));
        return {
          ...state,
          contactsList: [...state.contactsList, ...newContacts],
          originalContactsList: [...state.originalContactsList, ...newContacts],
          unreadMsgCount,
          isLoading: false,
          isLoadingMore: false,
        };
      }
      return {
        ...state,
        contactsList: contacts,
        originalContactsList: contacts,
        unreadMsgCount,
        isLoading: false,
        isLoadingMore: false,
      };
    }
    case 'SET_REACHED_MAX':
      return { ...state, hasReachedMax: true, isLoadingMore: false };
    case 'INCREMENT_PAGE':
      return { ...state, currentPage: state.currentPage + 1 };
    case 'RESET_PAGINATION':
      return { ...state, currentPage: 1, hasReachedMax: false, contactsList: [], originalContactsList: [] };
    case 'UPDATE_UNREAD_TO_ZERO': {
      const contactUid = action.payload;
      const idx = state.contactsList.findIndex(c => c.value._uid === contactUid);
      if (idx === -1) return state;
      const entry = state.contactsList[idx];
      const unreadCount = entry.value.unread_messages_count || 0;
      const updatedContact = { ...entry.value, unread_messages_count: 0 };
      const newList = [...state.contactsList];
      newList[idx] = { ...entry, value: updatedContact };
      const origIdx = state.originalContactsList.findIndex(c => c.value._uid === contactUid);
      const newOrigList = [...state.originalContactsList];
      if (origIdx !== -1) {
        newOrigList[origIdx] = { ...newOrigList[origIdx], value: updatedContact };
      }
      return {
        ...state,
        contactsList: newList,
        originalContactsList: newOrigList,
        unreadMsgCount: Math.max(0, state.unreadMsgCount - unreadCount),
      };
    }
    case 'UPDATE_CONTACT_NEW_MESSAGE': {
      const { contactUid, lastMessageUid, formattedTime } = action.payload;
      // Check both key and _uid to find the contact (prevents duplicates)
      const idx = state.contactsList.findIndex(
        c => c.key === contactUid || c.value._uid === contactUid
      );
      let newList = [...state.contactsList];
      if (idx !== -1) {
        const entry = newList[idx];
        const updatedContact = {
          ...entry.value,
          last_message: { formatted_message_time: formattedTime || 'Just now', _uid: lastMessageUid },
          unread_messages_count: (entry.value.unread_messages_count || 0) + 1,
        };
        // Remove from current position and move to top (like Flutter)
        newList.splice(idx, 1);
        newList.unshift({ key: entry.key, value: updatedContact });
      } else {
        // Only add new entry if truly not found
        newList.unshift({
          key: contactUid,
          value: {
            _uid: contactUid,
            full_name: 'New Contact',
            name_initials: 'N',
            wa_id: '',
            unread_messages_count: 1,
            labels: [],
            last_message: { formatted_message_time: formattedTime || 'Just now', _uid: lastMessageUid },
          },
        });
      }
      // Also update originalContactsList to keep in sync
      const origIdx = state.originalContactsList.findIndex(
        c => c.key === contactUid || c.value._uid === contactUid
      );
      let newOrigList = [...state.originalContactsList];
      if (origIdx !== -1) {
        const origEntry = newOrigList[origIdx];
        newOrigList[origIdx] = {
          ...origEntry,
          value: {
            ...origEntry.value,
            last_message: { formatted_message_time: formattedTime || 'Just now', _uid: lastMessageUid },
            unread_messages_count: (origEntry.value.unread_messages_count || 0) + 1,
          },
        };
      }
      return {
        ...state,
        contactsList: newList,
        originalContactsList: newOrigList,
        unreadMsgCount: state.unreadMsgCount + 1,
      };
    }
    case 'ADD_NEW_CONTACT': {
      // Prevent duplicates - check both key and _uid
      const newEntry = action.payload;
      const alreadyExists = state.contactsList.some(
        c => c.key === newEntry.key || c.value._uid === newEntry.value._uid
      );
      if (alreadyExists) {
        // Update existing contact instead of adding duplicate
        return {
          ...state,
          contactsList: state.contactsList.map(c =>
            (c.key === newEntry.key || c.value._uid === newEntry.value._uid) ? newEntry : c
          ),
          originalContactsList: state.originalContactsList.map(c =>
            (c.key === newEntry.key || c.value._uid === newEntry.value._uid) ? newEntry : c
          ),
        };
      }
      return {
        ...state,
        contactsList: [newEntry, ...state.contactsList],
        originalContactsList: [newEntry, ...state.originalContactsList],
      };
    }
    case 'SET_VENDOR_USERS':
      return { ...state, vendorMessagingUsers: action.payload };
    case 'SET_LABELS':
      return { ...state, labelsDropdownItems: action.payload };
    case 'SET_FILTERED':
      return { ...state, contactsList: action.payload };
    case 'RESET_FILTER':
      return { ...state, contactsList: state.originalContactsList };
    default:
      return state;
  }
}

interface ContactsContextType {
  state: ContactsState;
  fetchContacts: (options?: { isRefresh?: boolean; assigned?: string }) => Promise<void>;
  fetchContactsByLabel: (labelId: number) => Promise<void>;
  fetchSingleContact: (contactUid: string, vendorUid: string) => Promise<void>;
  updateUnreadToZero: (contactUid: string) => void;
  updateContactNewMessage: (contactUid: string, lastMessageUid: string, formattedTime: string) => void;
  searchContacts: (query: string) => void;
  fetchChatBoxData: (userId?: string) => Promise<void>;
  contactExists: (contactUid: string) => boolean;
}

const ContactsContext = createContext<ContactsContextType | undefined>(undefined);

export function ContactsProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(contactsReducer, initialState);
  const pageRef = useRef(1);
  const loadingRef = useRef(false);

  const fetchContacts = useCallback(async (options?: { isRefresh?: boolean; assigned?: string }) => {
    const isRefresh = options?.isRefresh ?? true;
    const assigned = options?.assigned ?? '';

    if (loadingRef.current) return;
    if (!isRefresh && state.hasReachedMax) return;

    loadingRef.current = true;

    if (isRefresh) {
      pageRef.current = 1;
      dispatch({ type: 'RESET_PAGINATION' });
      dispatch({ type: 'SET_LOADING', payload: true });
    } else {
      dispatch({ type: 'SET_LOADING_MORE', payload: true });
    }

    try {
      const response = await apiGet(
        `vendor/contact/contacts-data?page=${pageRef.current}&assigned=${assigned}`
      );

      if (response) {
        const clientContacts = getItemValue(response, 'client_models.contacts') || {};
        const unreadMsgCount = getItemValue(response, 'client_models.unreadMessagesCount') || 0;

        const entries: ContactEntry[] = Object.entries(clientContacts).map(([key, value]) => ({
          key,
          value: value as Contact,
        }));

        if (entries.length === 0) {
          dispatch({ type: 'SET_REACHED_MAX' });
        } else {
          dispatch({
            type: 'SET_CONTACTS',
            payload: { contacts: entries, unreadMsgCount, append: !isRefresh },
          });
          if (!isRefresh) {
            pageRef.current += 1;
            dispatch({ type: 'INCREMENT_PAGE' });
          }
        }
      }
    } catch (e) {
      console.error('Error fetching contacts:', e);
    } finally {
      loadingRef.current = false;
      dispatch({ type: 'SET_LOADING', payload: false });
      dispatch({ type: 'SET_LOADING_MORE', payload: false });
    }
  }, [state.hasReachedMax]);

  const fetchContactsByLabel = useCallback(async (labelId: number) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const response = await apiGet(`vendor/contact/contacts-data?page=1`);
      if (response) {
        const clientContacts = getItemValue(response, 'client_models.contacts') || {};
        const unreadMsgCount = getItemValue(response, 'client_models.unreadMessagesCount') || 0;
        const entries: ContactEntry[] = Object.entries(clientContacts)
          .map(([key, value]) => ({ key, value: value as Contact }))
          .filter(entry =>
            entry.value.labels?.some((label: any) => label._id === labelId)
          );
        dispatch({
          type: 'SET_CONTACTS',
          payload: { contacts: entries, unreadMsgCount, append: false },
        });
      }
    } catch (e) {
      console.error('Error fetching contacts by label:', e);
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  const fetchSingleContact = useCallback(async (contactUid: string, vendorUid: string) => {
    try {
      const response = await apiGet(
        `vendor/contact/contacts-data/${vendorUid}?way=append&request_contact=${contactUid}&assigned=`
      );
      if (response) {
        const clientContacts = getItemValue(response, 'client_models.contacts') || {};
        const entries: ContactEntry[] = Object.entries(clientContacts).map(([key, value]) => ({
          key,
          value: value as Contact,
        }));
        entries.forEach(entry => {
          dispatch({ type: 'ADD_NEW_CONTACT', payload: entry });
        });
      }
    } catch (e) {
      console.error('Error fetching single contact:', e);
    }
  }, []);

  const updateUnreadToZero = useCallback((contactUid: string) => {
    dispatch({ type: 'UPDATE_UNREAD_TO_ZERO', payload: contactUid });
  }, []);

  const updateContactNewMessage = useCallback((contactUid: string, lastMessageUid: string, formattedTime: string) => {
    dispatch({
      type: 'UPDATE_CONTACT_NEW_MESSAGE',
      payload: { contactUid, lastMessageUid, formattedTime },
    });
  }, []);

  const searchContacts = useCallback((query: string) => {
    if (!query.trim()) {
      dispatch({ type: 'RESET_FILTER' });
      return;
    }
    const q = query.toLowerCase();
    const filtered = state.originalContactsList.filter(entry => {
      const name = (entry.value.full_name || '').toLowerCase();
      const waId = (entry.value.wa_id || '').toLowerCase();
      return name.includes(q) || waId.includes(q);
    });
    dispatch({ type: 'SET_FILTERED', payload: filtered });
  }, [state.originalContactsList]);

  const fetchChatBoxData = useCallback(async (userId?: string) => {
    try {
      // Flutter: userId is null when called from whatsapp_chat.dart (contacts list)
      // So the endpoint becomes: vendor/whatsapp/contact/chat-box-data/null
      // When called from user_info.dart, userId is the actual contact UID
      const response = await apiGet(`vendor/whatsapp/contact/chat-box-data/${userId || 'null'}`);
      if (response?.data) {
        const users = (response.data.vendorMessagingUsers || []).map((user: any) => ({
          id: String(user._id),
          _uid: String(user._uid),
          value: user.full_name || 'Unknown',
          vendors__id: user.vendors__id ? String(user.vendors__id) : null,
        }));
        dispatch({ type: 'SET_VENDOR_USERS', payload: users });

        const labels = (response.data.listOfAllLabels || []).map((label: any) => ({
          id: String(label._id),
          value: label.title || 'Untitled',
          textColor: label.text_color || '#000000',
          bgColor: label.bg_color || '#ffffff',
        }));
        dispatch({ type: 'SET_LABELS', payload: labels });
      }
    } catch (e) {
      console.error('Error fetching chat box data:', e);
    }
  }, []);

  const contactExists = useCallback((contactUid: string): boolean => {
    // Check both key and _uid to prevent duplicates
    // Flutter checks: contactsList.any((entry) => entry.value['_uid'] == contactUid)
    // But the Pusher event sends contactUid which may match the key field
    return state.contactsList.some(
      entry => entry.value._uid === contactUid || entry.key === contactUid
    );
  }, [state.contactsList]);

  return (
    <ContactsContext.Provider
      value={{
        state,
        fetchContacts,
        fetchContactsByLabel,
        fetchSingleContact,
        updateUnreadToZero,
        updateContactNewMessage,
        searchContacts,
        fetchChatBoxData,
        contactExists,
      }}
    >
      {children}
    </ContactsContext.Provider>
  );
}

export function useContacts() {
  const context = useContext(ContactsContext);
  if (!context) {
    throw new Error('useContacts must be used within a ContactsProvider');
  }
  return context;
}
