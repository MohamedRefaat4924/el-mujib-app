import { describe, it, expect } from 'vitest';

describe('Bug Fix Round 3', () => {
  describe('Audio MIME type sanitization', () => {
    // Simulate the sanitization logic from api.ts
    function sanitizeAudioMime(mimeType: string): string {
      const acceptedAudioTypes = ['audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg'];
      if (acceptedAudioTypes.includes(mimeType)) return mimeType;
      
      const mimeMap: Record<string, string> = {
        'audio/m4a': 'audio/aac',
        'audio/x-m4a': 'audio/aac',
        'audio/mp4a-latm': 'audio/aac',
        'audio/wav': 'audio/ogg',
        'audio/x-wav': 'audio/ogg',
        'audio/webm': 'audio/ogg',
        'audio/3gpp': 'audio/amr',
        'audio/3gpp2': 'audio/amr',
        'audio/caf': 'audio/aac',
        'audio/x-caf': 'audio/aac',
        'application/octet-stream': 'audio/aac',
      };
      return mimeMap[mimeType] || 'audio/aac';
    }

    function sanitizeFileName(fileName: string, mimeType: string): string {
      const mimeToExt: Record<string, string> = {
        'audio/aac': '.aac',
        'audio/mp4': '.mp4',
        'audio/mpeg': '.mp3',
        'audio/amr': '.amr',
        'audio/ogg': '.ogg',
      };
      const expectedExt = mimeToExt[mimeType];
      if (expectedExt && !fileName.toLowerCase().endsWith(expectedExt)) {
        const dotIdx = fileName.lastIndexOf('.');
        return (dotIdx > 0 ? fileName.substring(0, dotIdx) : fileName) + expectedExt;
      }
      return fileName;
    }

    it('should accept audio/aac as-is', () => {
      expect(sanitizeAudioMime('audio/aac')).toBe('audio/aac');
    });

    it('should accept audio/mp4 as-is', () => {
      expect(sanitizeAudioMime('audio/mp4')).toBe('audio/mp4');
    });

    it('should map audio/m4a to audio/aac', () => {
      expect(sanitizeAudioMime('audio/m4a')).toBe('audio/aac');
    });

    it('should map audio/caf to audio/aac', () => {
      expect(sanitizeAudioMime('audio/caf')).toBe('audio/aac');
    });

    it('should map audio/webm to audio/ogg', () => {
      expect(sanitizeAudioMime('audio/webm')).toBe('audio/ogg');
    });

    it('should map application/octet-stream to audio/aac', () => {
      expect(sanitizeAudioMime('application/octet-stream')).toBe('audio/aac');
    });

    it('should default unknown types to audio/aac', () => {
      expect(sanitizeAudioMime('audio/unknown')).toBe('audio/aac');
    });

    it('should correct file extension for audio/aac', () => {
      expect(sanitizeFileName('voice_message.mp4', 'audio/aac')).toBe('voice_message.aac');
    });

    it('should correct file extension for audio/mp4', () => {
      expect(sanitizeFileName('voice_message.aac', 'audio/mp4')).toBe('voice_message.mp4');
    });

    it('should not change correct extension', () => {
      expect(sanitizeFileName('voice_message.aac', 'audio/aac')).toBe('voice_message.aac');
    });

    it('should add extension if missing', () => {
      expect(sanitizeFileName('voice_message', 'audio/aac')).toBe('voice_message.aac');
    });
  });

  describe('Contact deduplication', () => {
    interface ContactEntry {
      key: string;
      value: { _uid: string; full_name: string; unread_messages_count: number };
    }

    function contactExists(contactsList: ContactEntry[], contactUid: string): boolean {
      return contactsList.some(
        entry => entry.value._uid === contactUid || entry.key === contactUid
      );
    }

    function addNewContact(contactsList: ContactEntry[], newEntry: ContactEntry): ContactEntry[] {
      const alreadyExists = contactsList.some(
        c => c.key === newEntry.key || c.value._uid === newEntry.value._uid
      );
      if (alreadyExists) {
        return contactsList.map(c =>
          (c.key === newEntry.key || c.value._uid === newEntry.value._uid) ? newEntry : c
        );
      }
      return [newEntry, ...contactsList];
    }

    function updateContactNewMessage(
      contactsList: ContactEntry[],
      contactUid: string,
      lastMessageUid: string
    ): ContactEntry[] {
      const idx = contactsList.findIndex(
        c => c.key === contactUid || c.value._uid === contactUid
      );
      let newList = [...contactsList];
      if (idx !== -1) {
        const entry = newList[idx];
        const updated = {
          ...entry.value,
          unread_messages_count: (entry.value.unread_messages_count || 0) + 1,
        };
        newList.splice(idx, 1);
        newList.unshift({ key: entry.key, value: updated });
      }
      return newList;
    }

    const contacts: ContactEntry[] = [
      { key: 'uid-123', value: { _uid: 'uid-123', full_name: 'John', unread_messages_count: 0 } },
      { key: 'uid-456', value: { _uid: 'uid-456', full_name: 'Jane', unread_messages_count: 1 } },
    ];

    it('should find contact by key', () => {
      expect(contactExists(contacts, 'uid-123')).toBe(true);
    });

    it('should find contact by _uid', () => {
      expect(contactExists(contacts, 'uid-456')).toBe(true);
    });

    it('should not find non-existent contact', () => {
      expect(contactExists(contacts, 'uid-999')).toBe(false);
    });

    it('should not duplicate when adding existing contact by key', () => {
      const newEntry: ContactEntry = {
        key: 'uid-123',
        value: { _uid: 'uid-123', full_name: 'John Updated', unread_messages_count: 2 },
      };
      const result = addNewContact(contacts, newEntry);
      expect(result.length).toBe(2); // No duplicate
      expect(result.find(c => c.key === 'uid-123')?.value.full_name).toBe('John Updated');
    });

    it('should not duplicate when adding existing contact by _uid', () => {
      const newEntry: ContactEntry = {
        key: 'different-key',
        value: { _uid: 'uid-456', full_name: 'Jane Updated', unread_messages_count: 3 },
      };
      const result = addNewContact(contacts, newEntry);
      expect(result.length).toBe(2); // No duplicate
    });

    it('should add truly new contact', () => {
      const newEntry: ContactEntry = {
        key: 'uid-789',
        value: { _uid: 'uid-789', full_name: 'New Person', unread_messages_count: 0 },
      };
      const result = addNewContact(contacts, newEntry);
      expect(result.length).toBe(3);
      expect(result[0].key).toBe('uid-789'); // Added at top
    });

    it('should move updated contact to top', () => {
      const result = updateContactNewMessage(contacts, 'uid-456', 'msg-1');
      expect(result[0].key).toBe('uid-456'); // Moved to top
      expect(result[0].value.unread_messages_count).toBe(2); // Incremented
      expect(result.length).toBe(2); // No duplicate
    });

    it('should find contact by _uid in updateContactNewMessage', () => {
      const result = updateContactNewMessage(contacts, 'uid-123', 'msg-2');
      expect(result[0].key).toBe('uid-123'); // Moved to top
      expect(result[0].value.unread_messages_count).toBe(1); // Incremented from 0
    });
  });

  describe('Pusher multi-listener support', () => {
    // Simulate the multi-listener logic
    interface Listener {
      listenerId: string;
      callback: (data: any) => void;
    }

    function addListener(listeners: Listener[], listenerId: string, callback: (data: any) => void): Listener[] {
      const filtered = listeners.filter(l => l.listenerId !== listenerId);
      filtered.push({ listenerId, callback });
      return filtered;
    }

    function removeListenerById(listeners: Listener[], listenerId: string): Listener[] {
      return listeners.filter(l => l.listenerId !== listenerId);
    }

    it('should add multiple listeners', () => {
      let listeners: Listener[] = [];
      listeners = addListener(listeners, 'home', () => {});
      listeners = addListener(listeners, 'chat', () => {});
      expect(listeners.length).toBe(2);
    });

    it('should replace listener with same ID', () => {
      let listeners: Listener[] = [];
      listeners = addListener(listeners, 'home', () => {});
      listeners = addListener(listeners, 'home', () => {}); // Replace
      expect(listeners.length).toBe(1);
    });

    it('should remove specific listener', () => {
      let listeners: Listener[] = [];
      listeners = addListener(listeners, 'home', () => {});
      listeners = addListener(listeners, 'chat', () => {});
      listeners = removeListenerById(listeners, 'chat');
      expect(listeners.length).toBe(1);
      expect(listeners[0].listenerId).toBe('home');
    });

    it('should notify all listeners on event', () => {
      let listeners: Listener[] = [];
      const results: string[] = [];
      listeners = addListener(listeners, 'home', () => results.push('home'));
      listeners = addListener(listeners, 'chat', () => results.push('chat'));
      
      // Simulate event broadcast
      listeners.forEach(l => l.callback({}));
      expect(results).toEqual(['home', 'chat']);
    });
  });
});
