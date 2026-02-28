import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/stores/auth-store';
import { useContacts } from '@/lib/stores/contacts-store';
import { apiGet, apiPost, getItemValue } from '@/lib/services/api';

interface UserInfoData {
  _uid: string;
  full_name: string;
  first_name: string;
  last_name: string;
  wa_id: string;
  email: string;
  language_code: string;
  assigned_users__id: string | null;
  labels: any[];
  [key: string]: any;
}

export default function UserInfoScreen() {
  const params = useLocalSearchParams<{ contactUid: string; contactName: string }>();
  const insets = useSafeAreaInsets();
  const { state: authState } = useAuth();
  const { state: contactsState, fetchChatBoxData } = useContacts();

  const [userInfo, setUserInfo] = useState<UserInfoData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedLabels, setSelectedLabels] = useState<Set<string>>(new Set());
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [isSavingAssign, setIsSavingAssign] = useState(false);
  const [isSavingLabels, setIsSavingLabels] = useState(false);

  const contactUid = params.contactUid || '';
  const vendorUid = authState.authData?.vendor_uid || '';

  useEffect(() => {
    if (contactUid && vendorUid) {
      loadUserInfo();
      fetchChatBoxData();
    }
  }, [contactUid, vendorUid]);

  const loadUserInfo = async () => {
    setIsLoading(true);
    try {
      // Flutter endpoint: vendor/contacts/{userId}/get-update-data
      const response = await apiGet(
        `vendor/contacts/${contactUid}/get-update-data`
      );
      if (response?.data) {
        const info = response.data.contactData || response.data;
        setUserInfo(info);
        setNotes(info.description || info.contact_notes || info.notes || '');
        setSelectedUserId(info.assigned_users__id ? String(info.assigned_users__id) : '');

        const labelIds = new Set<string>();
        (info.labels || []).forEach((label: any) => {
          labelIds.add(String(label._id));
        });
        setSelectedLabels(labelIds);
      }
    } catch (e) {
      console.error('Error loading user info:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveNotes = async () => {
    setIsSavingNotes(true);
    try {
      // Flutter endpoint: vendor/contacts/{userId}/contact-update-notes
      // Flutter payload: { contactIdOrUid: contactUid, contact_notes: notes }
      await apiPost(`vendor/contacts/${contactUid}/contact-update-notes`, {
        contactIdOrUid: contactUid,
        contact_notes: notes,
      });
      Alert.alert('Success', 'Notes saved successfully');
    } catch (e) {
      Alert.alert('Error', 'Failed to save notes');
    } finally {
      setIsSavingNotes(false);
    }
  };

  const handleAssignUser = async (userId: string) => {
    setSelectedUserId(userId);
    setIsSavingAssign(true);
    try {
      // Flutter endpoint: vendor/contacts/{userId}/contact-assign-user
      // Flutter payload: { contactIdOrUid: contactUid, assigned_users_uid: userId }
      await apiPost(`vendor/contacts/${contactUid}/contact-assign-user`, {
        contactIdOrUid: contactUid,
        assigned_users_uid: userId || '',
      });
    } catch (e) {
      Alert.alert('Error', 'Failed to assign user');
    } finally {
      setIsSavingAssign(false);
    }
  };

  const handleToggleLabel = async (labelId: string) => {
    const newLabels = new Set(selectedLabels);
    if (newLabels.has(labelId)) {
      newLabels.delete(labelId);
    } else {
      newLabels.add(labelId);
    }
    setSelectedLabels(newLabels);
    setIsSavingLabels(true);
    try {
      // Flutter endpoint: vendor/contacts/{userId}/contact-assign-labels
      // Flutter payload: { contactUid: contactUid, contact_labels: labelsArray }
      await apiPost(`vendor/contacts/${contactUid}/contact-assign-labels`, {
        contactUid: contactUid,
        contact_labels: Array.from(newLabels),
      });
    } catch (e) {
      Alert.alert('Error', 'Failed to update labels');
    } finally {
      setIsSavingLabels(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>User Information</Text>
        </View>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#089B21" />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>User Information</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Profile Card */}
        <View style={styles.card}>
          <View style={styles.profileAvatar}>
            <Text style={styles.profileAvatarText}>
              {userInfo?.full_name?.charAt(0)?.toUpperCase() || 'U'}
            </Text>
          </View>
          <Text style={styles.profileName}>{userInfo?.full_name || 'Unknown'}</Text>
          <Text style={styles.profilePhone}>{userInfo?.wa_id || ''}</Text>
          {userInfo?.email && (
            <Text style={styles.profileEmail}>{userInfo.email}</Text>
          )}
          {userInfo?.language_code && (
            <View style={styles.langBadge}>
              <MaterialIcons name="language" size={14} color="#089B21" />
              <Text style={styles.langText}>{userInfo.language_code}</Text>
            </View>
          )}
        </View>

        {/* Assign User */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialIcons name="person-add" size={20} color="#089B21" />
            <Text style={styles.cardTitle}>Assign Team Member</Text>
            {isSavingAssign && <ActivityIndicator size="small" color="#089B21" />}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.assignList}>
            <TouchableOpacity
              style={[styles.assignChip, !selectedUserId && styles.assignChipActive]}
              onPress={() => handleAssignUser('')}
            >
              <Text style={[styles.assignChipText, !selectedUserId && styles.assignChipTextActive]}>
                Unassigned
              </Text>
            </TouchableOpacity>
            {contactsState.vendorMessagingUsers.map((user) => (
              <TouchableOpacity
                key={user.id}
                style={[styles.assignChip, selectedUserId === user.id && styles.assignChipActive]}
                onPress={() => handleAssignUser(user.id)}
              >
                <Text style={[styles.assignChipText, selectedUserId === user.id && styles.assignChipTextActive]}>
                  {user.value}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Labels */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialIcons name="label" size={20} color="#089B21" />
            <Text style={styles.cardTitle}>Labels</Text>
            {isSavingLabels && <ActivityIndicator size="small" color="#089B21" />}
          </View>
          <View style={styles.labelsGrid}>
            {contactsState.labelsDropdownItems.map((label) => {
              const isSelected = selectedLabels.has(label.id);
              return (
                <TouchableOpacity
                  key={label.id}
                  style={[
                    styles.labelItem,
                    { borderColor: label.bgColor },
                    isSelected && { backgroundColor: label.bgColor },
                  ]}
                  onPress={() => handleToggleLabel(label.id)}
                >
                  <MaterialIcons
                    name={isSelected ? 'check-box' : 'check-box-outline-blank'}
                    size={18}
                    color={isSelected ? label.textColor : '#9BA1A6'}
                  />
                  <Text style={[styles.labelItemText, isSelected && { color: label.textColor }]}>
                    {label.value}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Notes */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialIcons name="note" size={20} color="#089B21" />
            <Text style={styles.cardTitle}>Notes</Text>
          </View>
          <TextInput
            style={styles.notesInput}
            placeholder="Add notes about this contact..."
            placeholderTextColor="#9BA1A6"
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
          <TouchableOpacity
            style={styles.saveButton}
            onPress={handleSaveNotes}
            disabled={isSavingNotes}
            activeOpacity={0.8}
          >
            {isSavingNotes ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>Save Notes</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
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
  },
  header: {
    backgroundColor: '#089B21',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 14,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  scrollContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  profileAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#089B21',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 12,
    shadowColor: '#089B21',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  profileAvatarText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  profileName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1B1B23',
    textAlign: 'center',
  },
  profilePhone: {
    fontSize: 14,
    color: '#687076',
    textAlign: 'center',
    marginTop: 4,
  },
  profileEmail: {
    fontSize: 13,
    color: '#9BA1A6',
    textAlign: 'center',
    marginTop: 2,
  },
  langBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'center',
    marginTop: 8,
    backgroundColor: '#F0F9F0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  langText: {
    fontSize: 12,
    color: '#089B21',
    fontWeight: '600',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1B1B23',
    flex: 1,
  },
  assignList: {
    flexDirection: 'row',
  },
  assignChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  assignChipActive: {
    backgroundColor: '#089B21',
    borderColor: '#089B21',
  },
  assignChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#687076',
  },
  assignChipTextActive: {
    color: '#fff',
  },
  labelsGrid: {
    gap: 8,
  },
  labelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  labelItemText: {
    fontSize: 14,
    color: '#1B1B23',
    fontWeight: '500',
  },
  notesInput: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: '#1B1B23',
    minHeight: 100,
    lineHeight: 20,
  },
  saveButton: {
    backgroundColor: '#089B21',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
    shadowColor: '#089B21',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
