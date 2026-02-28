import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatMessage } from '../types';

const MESSAGE_CACHE_PREFIX = '@el_mujib_messages_';
const QUICK_REPLIES_KEY = '@el_mujib_quick_replies';
const CONTACT_CONTEXT_PREFIX = '@el_mujib_context_';
const RECENT_CONTACTS_KEY = '@el_mujib_recent_contacts';

/**
 * Message History Service
 * Provides localStorage-based caching for messages, quick replies,
 * and smart context to make the app faster and more intelligent.
 */

// ===== Message Caching =====

export async function cacheMessages(contactUid: string, messages: ChatMessage[]): Promise<void> {
  try {
    const key = `${MESSAGE_CACHE_PREFIX}${contactUid}`;
    // Store last 200 messages per contact
    const toCache = messages.slice(0, 200);
    await AsyncStorage.setItem(key, JSON.stringify(toCache));
  } catch (e) {
    console.error('[MessageHistory] Cache error:', e);
  }
}

export async function getCachedMessages(contactUid: string): Promise<ChatMessage[]> {
  try {
    const key = `${MESSAGE_CACHE_PREFIX}${contactUid}`;
    const cached = await AsyncStorage.getItem(key);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (e) {
    console.error('[MessageHistory] Read cache error:', e);
  }
  return [];
}

export async function clearCachedMessages(contactUid: string): Promise<void> {
  try {
    const key = `${MESSAGE_CACHE_PREFIX}${contactUid}`;
    await AsyncStorage.removeItem(key);
  } catch (e) {
    console.error('[MessageHistory] Clear cache error:', e);
  }
}

// ===== Quick Replies (Smart Suggestions) =====

export async function getQuickReplies(): Promise<string[]> {
  try {
    const stored = await AsyncStorage.getItem(QUICK_REPLIES_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('[MessageHistory] Quick replies read error:', e);
  }
  return [];
}

export async function addQuickReply(reply: string): Promise<string[]> {
  if (!reply.trim() || reply.length > 200) return [];
  try {
    let replies = await getQuickReplies();
    // Remove duplicate
    replies = replies.filter(r => r !== reply);
    // Add to beginning
    replies.unshift(reply);
    // Keep max 30
    replies = replies.slice(0, 30);
    await AsyncStorage.setItem(QUICK_REPLIES_KEY, JSON.stringify(replies));
    return replies;
  } catch (e) {
    console.error('[MessageHistory] Add quick reply error:', e);
    return [];
  }
}

export async function removeQuickReply(reply: string): Promise<string[]> {
  try {
    let replies = await getQuickReplies();
    replies = replies.filter(r => r !== reply);
    await AsyncStorage.setItem(QUICK_REPLIES_KEY, JSON.stringify(replies));
    return replies;
  } catch (e) {
    console.error('[MessageHistory] Remove quick reply error:', e);
    return [];
  }
}

// ===== Contact Context (Smart Memory) =====

interface ContactContext {
  lastVisited: number;
  messageCount: number;
  lastSentMessage: string;
  frequentWords: Record<string, number>;
  contactName: string;
}

export async function updateContactContext(
  contactUid: string,
  data: Partial<ContactContext>
): Promise<void> {
  try {
    const key = `${CONTACT_CONTEXT_PREFIX}${contactUid}`;
    const existing = await AsyncStorage.getItem(key);
    const context: ContactContext = existing
      ? JSON.parse(existing)
      : { lastVisited: 0, messageCount: 0, lastSentMessage: '', frequentWords: {}, contactName: '' };

    const updated = { ...context, ...data, lastVisited: Date.now() };
    await AsyncStorage.setItem(key, JSON.stringify(updated));
  } catch (e) {
    console.error('[MessageHistory] Update context error:', e);
  }
}

export async function getContactContext(contactUid: string): Promise<ContactContext | null> {
  try {
    const key = `${CONTACT_CONTEXT_PREFIX}${contactUid}`;
    const stored = await AsyncStorage.getItem(key);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('[MessageHistory] Get context error:', e);
  }
  return null;
}

/**
 * Analyze sent messages to build smart suggestions.
 * Extracts common phrases and words to suggest as quick replies.
 */
export async function analyzeAndUpdateContext(
  contactUid: string,
  sentMessage: string,
  contactName: string
): Promise<void> {
  try {
    const context = (await getContactContext(contactUid)) || {
      lastVisited: 0,
      messageCount: 0,
      lastSentMessage: '',
      frequentWords: {},
      contactName: '',
    };

    context.messageCount += 1;
    context.lastSentMessage = sentMessage;
    context.contactName = contactName;

    // Extract words and update frequency
    const words = sentMessage.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    words.forEach(word => {
      context.frequentWords[word] = (context.frequentWords[word] || 0) + 1;
    });

    // Keep only top 50 words
    const sorted = Object.entries(context.frequentWords)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50);
    context.frequentWords = Object.fromEntries(sorted);

    await updateContactContext(contactUid, context);
  } catch (e) {
    console.error('[MessageHistory] Analyze context error:', e);
  }
}

// ===== Recent Contacts =====

interface RecentContact {
  uid: string;
  name: string;
  lastVisited: number;
}

export async function addRecentContact(uid: string, name: string): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(RECENT_CONTACTS_KEY);
    let recents: RecentContact[] = stored ? JSON.parse(stored) : [];
    recents = recents.filter(r => r.uid !== uid);
    recents.unshift({ uid, name, lastVisited: Date.now() });
    recents = recents.slice(0, 20);
    await AsyncStorage.setItem(RECENT_CONTACTS_KEY, JSON.stringify(recents));
  } catch (e) {
    console.error('[MessageHistory] Add recent contact error:', e);
  }
}

export async function getRecentContacts(): Promise<RecentContact[]> {
  try {
    const stored = await AsyncStorage.getItem(RECENT_CONTACTS_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('[MessageHistory] Get recent contacts error:', e);
  }
  return [];
}

// ===== Storage Management =====

export async function getStorageUsage(): Promise<{ keys: number; estimatedSize: string }> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const elMujibKeys = allKeys.filter(k => k.startsWith('@el_mujib_'));
    return {
      keys: elMujibKeys.length,
      estimatedSize: `~${elMujibKeys.length * 10}KB`,
    };
  } catch (e) {
    return { keys: 0, estimatedSize: '0KB' };
  }
}

export async function clearAllCache(): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const elMujibKeys = allKeys.filter(k => k.startsWith('@el_mujib_messages_'));
    await AsyncStorage.multiRemove(elMujibKeys);
  } catch (e) {
    console.error('[MessageHistory] Clear all cache error:', e);
  }
}
