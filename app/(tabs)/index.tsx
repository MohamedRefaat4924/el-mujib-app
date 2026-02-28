import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAuth } from '@/lib/stores/auth-store';
import { useContacts } from '@/lib/stores/contacts-store';
import { initPusher, subscribeToChannel, disconnectPusher } from '@/lib/services/pusher';
import { getApiUrl } from '@/lib/services/api';
import { ScreenContainer } from '@/components/screen-container';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  requestNotificationPermissions,
  handleNewMessageNotification,
  setupNotificationResponseHandler,
  cleanupNotifications,
} from '@/lib/services/notification';

const TABS_FIXED = ['All', 'Mine', 'Unassigned'];

export default function ContactsScreen() {
  const { state: authState, logout, getInfo } = useAuth();
  const {
    state: contactsState,
    fetchContacts,
    fetchContactsByLabel,
    fetchSingleContact,
    updateUnreadToZero,
    updateContactNewMessage,
    searchContacts,
    fetchChatBoxData,
    contactExists,
  } = useContacts();
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLabelId, setSelectedLabelId] = useState<number | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const pusherInitRef = useRef(false);
  // Use refs to avoid stale closures in Pusher callbacks
  const contactExistsRef = useRef(contactExists);
  const fetchSingleContactRef = useRef(fetchSingleContact);
  const updateContactNewMessageRef = useRef(updateContactNewMessage);
  useEffect(() => {
    contactExistsRef.current = contactExists;
    fetchSingleContactRef.current = fetchSingleContact;
    updateContactNewMessageRef.current = updateContactNewMessage;
  });

  // Request notification permissions on mount
  useEffect(() => {
    requestNotificationPermissions();

    // Set up notification tap handler - navigate to chat when tapped
    const cleanup = setupNotificationResponseHandler((contactUid) => {
      router.push({ pathname: '/chat', params: { contactUid } });
    });

    return () => {
      cleanup();
      cleanupNotifications();
    };
  }, []);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authState.isLoading && !authState.isLoggedIn) {
      router.replace('/login');
    }
  }, [authState.isLoading, authState.isLoggedIn]);

  // Fetch contacts and chat box data on mount
  useEffect(() => {
    if (authState.isLoggedIn) {
      fetchContacts({ isRefresh: true });
      fetchChatBoxData();
    }
  }, [authState.isLoggedIn]);

  // Initialize Pusher for real-time updates
  useEffect(() => {
    if (authState.isLoggedIn && authState.authData && !pusherInitRef.current) {
      pusherInitRef.current = true;
      initializePusher();
    }
    return () => {
      // Don't disconnect on unmount - keep connection alive
    };
  }, [authState.isLoggedIn, authState.authData]);

  const initializePusher = async () => {
    try {
      const token = authState.authData?.token;
      if (!token) return;

      await initPusher({
        authToken: token,
        host: 'aa.evyx.lol',
        port: 443,
        useTLS: true,
      });

      const vendorUid = authState.authData?.vendor_uid;
      if (vendorUid) {
        const channelName = `private-vendor-channel.${vendorUid}`;
        subscribeToChannel(channelName, {
          onEvent: (eventName, eventData) => {
            console.log('[Home] Pusher event received:', eventName, JSON.stringify(eventData).substring(0, 200));
            if (eventName === 'VendorChannelBroadcast' && !eventData?.message_status) {
              const contactUid = eventData?.contactUid;
              if (contactUid) {
                // Use refs to get latest function references (avoids stale closures)
                if (!contactExistsRef.current(contactUid)) {
                  fetchSingleContactRef.current(contactUid, vendorUid);
                } else {
                  updateContactNewMessageRef.current(
                    contactUid,
                    eventData?.lastMessageUid || '',
                    eventData?.formatted_last_message_time || ''
                  );
                }

                // Play notification sound and show local notification
                const contactName = eventData?.contactName || eventData?.full_name || 'New Message';
                const messagePreview = eventData?.message || eventData?.formatted_message || 'You have a new message';
                handleNewMessageNotification(
                  contactName,
                  messagePreview,
                  contactUid
                );
              }
            }
          },
          onSubscriptionError: (error) => {
            console.error('[Pusher] Subscription error:', error);
          },
        });
      }
    } catch (e) {
      console.error('Pusher init error:', e);
    }
  };

  const handleTabChange = useCallback((index: number) => {
    setActiveTab(index);
    setSelectedLabelId(null);
    setSearchQuery('');

    let assigned = '';
    if (index === 0) assigned = '';
    else if (index === 1) assigned = 'to-me';
    else if (index === 2) assigned = 'unassigned';
    else {
      const dynamicUsers = contactsState.vendorMessagingUsers.filter(
        u => !u.vendors__id || u.vendors__id === 'null'
      );
      const userIndex = index - 3;
      if (dynamicUsers[userIndex]) {
        assigned = dynamicUsers[userIndex].id;
      }
    }
    fetchContacts({ isRefresh: true, assigned });
  }, [contactsState.vendorMessagingUsers, fetchContacts]);

  const handleRefresh = useCallback(() => {
    handleTabChange(activeTab);
  }, [activeTab, handleTabChange]);

  const handleLoadMore = useCallback(() => {
    if (!contactsState.isLoadingMore && !contactsState.hasReachedMax) {
      fetchContacts({ isRefresh: false });
    }
  }, [contactsState.isLoadingMore, contactsState.hasReachedMax, fetchContacts]);

  const handleSearch = useCallback((text: string) => {
    setSearchQuery(text);
    searchContacts(text);
  }, [searchContacts]);

  const handleLabelFilter = useCallback((labelId: number) => {
    setSelectedLabelId(labelId);
    fetchContactsByLabel(labelId);
  }, [fetchContactsByLabel]);

  const handleClearFilter = useCallback(() => {
    setSelectedLabelId(null);
    fetchContacts({ isRefresh: true });
  }, [fetchContacts]);

  const handleContactPress = useCallback((contact: any) => {
    updateUnreadToZero(contact._uid);
    (router as any).push({
      pathname: '/chat',
      params: {
        contactUid: contact._uid,
        contactName: contact.full_name || 'Unknown',
        contactInitials: contact.name_initials || 'U',
        contactWaId: contact.wa_id || '',
      },
    });
  }, [updateUnreadToZero]);

  const dynamicUserTabs = contactsState.vendorMessagingUsers.filter(
    u => !u.vendors__id || u.vendors__id === 'null'
  );
  const allTabs = [...TABS_FIXED, ...dynamicUserTabs.map(u => u.value)];

  if (authState.isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#1A6B3C" />
      </View>
    );
  }

  if (!authState.isLoggedIn) return null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>El Mujib</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => setShowMenu(!showMenu)}
            style={styles.menuButton}
          >
            <MaterialIcons name="more-vert" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
        {showMenu && (
          <View style={styles.menuDropdown}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => { setShowMenu(false); (router as any).push('/profile'); }}
            >
              <MaterialIcons name="person" size={18} color="#1B1B23" />
              <Text style={styles.menuItemText}>Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => { setShowMenu(false); (router as any).push('/settings'); }}
            >
              <MaterialIcons name="settings" size={18} color="#1B1B23" />
              <Text style={styles.menuItemText}>Settings</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {allTabs.map((tab, index) => (
            <TouchableOpacity
              key={index}
              style={[styles.tab, activeTab === index && styles.activeTab]}
              onPress={() => handleTabChange(index)}
            >
              <Text style={[styles.tabText, activeTab === index && styles.activeTabText]}>
                {tab}
              </Text>
              {index === 0 && contactsState.unreadMsgCount > 0 && (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>{contactsState.unreadMsgCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Labels Filter */}
      {contactsState.labelsDropdownItems.length > 0 && (
        <View style={styles.labelsContainer}>
          <TouchableOpacity onPress={handleClearFilter} style={styles.clearLabelBtn}>
            <MaterialIcons name="clear" size={16} color="#fff" />
          </TouchableOpacity>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {contactsState.labelsDropdownItems.map((label) => (
              <TouchableOpacity
                key={label.id}
                style={[
                  styles.labelChip,
                  {
                    backgroundColor: label.bgColor,
                    borderColor: label.textColor,
                  },
                  selectedLabelId === Number(label.id) && styles.labelChipActive,
                ]}
                onPress={() => handleLabelFilter(Number(label.id))}
              >
                <Text style={[styles.labelChipText, { color: label.textColor }]}>
                  {label.value}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Search */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <MaterialIcons name="search" size={20} color="#9BA1A6" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search contacts..."
            placeholderTextColor="#9BA1A6"
            value={searchQuery}
            onChangeText={handleSearch}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => handleSearch('')}>
              <MaterialIcons name="close" size={18} color="#9BA1A6" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Contact List */}
      {contactsState.isLoading && contactsState.contactsList.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#1A6B3C" />
          <Text style={styles.loadingText}>Loading contacts...</Text>
        </View>
      ) : contactsState.contactsList.length === 0 ? (
        <View style={styles.centerContainer}>
          <MaterialIcons name="error-outline" size={48} color="#ccc" />
          <Text style={styles.emptyText}>No contacts found</Text>
        </View>
      ) : (
        <FlatList
          data={contactsState.contactsList}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) => (
            <ContactItem
              contact={item.value}
              onPress={() => handleContactPress(item.value)}
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={contactsState.isLoading && contactsState.contactsList.length > 0}
              onRefresh={handleRefresh}
              colors={['#1A6B3C']}
              tintColor="#1A6B3C"
            />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            contactsState.isLoadingMore ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color="#1A6B3C" />
              </View>
            ) : null
          }
          contentContainerStyle={{ paddingBottom: 80 }}
        />
      )}
    </View>
  );
}

// Contact item component
function ContactItem({ contact, onPress }: { contact: any; onPress: () => void }) {
  const unreadCount = contact.unread_messages_count || 0;
  const initials = contact.name_initials || (contact.full_name || 'U').charAt(0).toUpperCase();

  return (
    <TouchableOpacity onPress={onPress} style={styles.contactItem} activeOpacity={0.7}>
      <View style={styles.contactAvatar}>
        <Text style={styles.contactAvatarText}>{initials}</Text>
      </View>
      <View style={styles.contactInfo}>
        <View style={styles.contactNameRow}>
          <Text style={styles.contactName} numberOfLines={1}>
            {contact.full_name || 'Unknown'}
          </Text>
          <View style={styles.contactLabels}>
            {(contact.labels || []).slice(0, 3).map((label: any, idx: number) => (
              <View
                key={idx}
                style={[styles.contactLabelDot, { backgroundColor: label.bg_color || '#ccc' }]}
              />
            ))}
          </View>
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>
        <View style={styles.contactSubRow}>
          <Text style={styles.contactPhone} numberOfLines={1}>
            {contact.wa_id || 'Unknown'}
          </Text>
          <Text style={styles.contactTime}>
            {contact.last_message?.formatted_message_time || ''}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F7F7',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  header: {
    backgroundColor: '#1A6B3C',
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
    zIndex: 10,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuButton: {
    padding: 4,
  },
  menuDropdown: {
    position: 'absolute',
    top: 50,
    right: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    minWidth: 160,
    zIndex: 100,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  menuItemText: {
    fontSize: 15,
    color: '#1B1B23',
    fontWeight: '500',
  },
  tabsContainer: {
    backgroundColor: '#1A6B3C',
    paddingBottom: 8,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginHorizontal: 4,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  activeTab: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  tabText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '500',
  },
  activeTabText: {
    color: '#fff',
    fontWeight: '600',
  },
  tabBadge: {
    backgroundColor: '#fff',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  tabBadgeText: {
    color: '#1A6B3C',
    fontSize: 11,
    fontWeight: '700',
  },
  labelsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  clearLabelBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  labelChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    marginHorizontal: 3,
  },
  labelChipActive: {
    borderWidth: 2,
  },
  labelChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  searchContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1B1B23',
  },
  loadingText: {
    color: '#687076',
    fontSize: 14,
  },
  emptyText: {
    color: '#9BA1A6',
    fontSize: 16,
    fontWeight: '500',
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 0.5,
    borderBottomColor: '#E5E7EB',
  },
  contactAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1A6B3C',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    shadowColor: '#1A6B3C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  contactAvatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  contactInfo: {
    flex: 1,
  },
  contactNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  contactName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1B1B23',
    flex: 1,
  },
  contactLabels: {
    flexDirection: 'row',
    gap: 3,
  },
  contactLabelDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  unreadBadge: {
    backgroundColor: '#1A6B3C',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  contactSubRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  contactPhone: {
    fontSize: 12,
    color: '#687076',
    flex: 1,
  },
  contactTime: {
    fontSize: 11,
    color: '#9BA1A6',
  },
  footerLoader: {
    paddingVertical: 16,
    alignItems: 'center',
  },
});
