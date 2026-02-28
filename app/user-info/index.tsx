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
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/stores/auth-store';
import { apiGet, apiPost } from '@/lib/services/api';

interface TeamMember {
  id: string;
  _uid: string;
  value: string;
  vendors__id: string | null;
}

interface LabelItem {
  id: string;
  value: string;
  textColor: string;
  bgColor: string;
}

interface UserInfoData {
  _uid: string;
  full_name: string;
  first_name: string;
  last_name: string;
  wa_id: string;
  email: string;
  language_code: string;
  assigned_users__id: string | null;
  __data?: {
    contact_notes?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

export default function UserInfoScreen() {
  const params = useLocalSearchParams<{
    contactUid: string;
    contactName: string;
    assignedLabelIds: string;
  }>();
  const insets = useSafeAreaInsets();
  const { state: authState } = useAuth();

  const [userInfo, setUserInfo] = useState<UserInfoData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedUserUid, setSelectedUserUid] = useState<string>('');
  const [selectedLabels, setSelectedLabels] = useState<Set<string>>(new Set());
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [isSavingAssign, setIsSavingAssign] = useState(false);
  const [isSavingLabels, setIsSavingLabels] = useState(false);

  // Data from chat-box-data endpoint
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [labels, setLabels] = useState<LabelItem[]>([]);

  const contactUid = params.contactUid || '';

  // Parse initial assigned label IDs from params
  const initialLabelIds = params.assignedLabelIds
    ? params.assignedLabelIds.split(',').filter(Boolean)
    : [];

  useEffect(() => {
    if (contactUid) {
      loadData();
    }
  }, [contactUid]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Load both endpoints in parallel (matching Flutter's getUserInfo + getChatLabels)
      const [userInfoRes, chatBoxRes] = await Promise.all([
        apiGet(`vendor/contacts/${contactUid}/get-update-data`),
        apiGet(`vendor/whatsapp/contact/chat-box-data/${contactUid}`),
      ]);

      // Process user info (matching Flutter's getUserInfo)
      if (userInfoRes?.data) {
        const data = userInfoRes.data;
        setUserInfo(data);

        // Extract assigned user ID (matching Flutter: data['assigned_users__id'])
        const assignedId = data.assigned_users__id ? String(data.assigned_users__id) : '';
        setSelectedUserId(assignedId);

        // Extract notes from __data.contact_notes (matching Flutter)
        if (data.__data && typeof data.__data === 'object' && !Array.isArray(data.__data)) {
          setNotes(data.__data.contact_notes || '');
        } else {
          setNotes('');
        }
      }

      // Process chat box data (matching Flutter's getChatLabels)
      if (chatBoxRes?.data) {
        const cbData = chatBoxRes.data;

        // Format team members (matching Flutter: vendorMessagingUsers)
        const users: TeamMember[] = (cbData.vendorMessagingUsers || []).map((user: any) => ({
          id: String(user._id),
          _uid: String(user._uid),
          value: user.full_name || 'Unknown',
          vendors__id: user.vendors__id ? String(user.vendors__id) : null,
        }));
        setTeamMembers(users);

        // Find the _uid for the assigned user
        if (userInfoRes?.data?.assigned_users__id) {
          const assignedId = String(userInfoRes.data.assigned_users__id);
          const matchingUser = users.find(u => u.id === assignedId);
          if (matchingUser) {
            setSelectedUserUid(matchingUser._uid);
          }
        }

        // Format labels (matching Flutter: listOfAllLabels)
        const labelsList: LabelItem[] = (cbData.listOfAllLabels || []).map((label: any) => ({
          id: String(label._id),
          value: label.title || 'Untitled',
          textColor: label.text_color || '#000000',
          bgColor: label.bg_color || '#ffffff',
        }));
        setLabels(labelsList);

        // Set initial selected labels from params
        if (initialLabelIds.length > 0) {
          setSelectedLabels(new Set(initialLabelIds));
        }
      }
    } catch (e) {
      console.error('Error loading user info:', e);
    } finally {
      setIsLoading(false);
    }
  };

  // Update notes API (matching Flutter: vendor/whatsapp/contact/chat/update-notes)
  const handleSaveNotes = async () => {
    setIsSavingNotes(true);
    try {
      await apiPost('vendor/whatsapp/contact/chat/update-notes', {
        contactIdOrUid: contactUid,
        contact_notes: notes.trim(),
      });
      setIsEditingNotes(false);
      Alert.alert('Success', 'Notes updated successfully');
    } catch (e) {
      console.error('Error saving notes:', e);
      Alert.alert('Error', 'Failed to update notes');
    } finally {
      setIsSavingNotes(false);
    }
  };

  // Assign user API (matching Flutter: vendor/whatsapp/contact/chat/assign-user)
  const handleAssignUser = async (user: TeamMember | null) => {
    const newUserId = user ? user.id : '';
    const newUserUid = user ? user._uid : '';
    setSelectedUserId(newUserId);
    setSelectedUserUid(newUserUid);
    setIsSavingAssign(true);
    try {
      await apiPost('vendor/whatsapp/contact/chat/assign-user', {
        contactIdOrUid: contactUid,
        assigned_users_uid: newUserUid,
      });
    } catch (e) {
      console.error('Error assigning user:', e);
      Alert.alert('Error', 'Failed to assign team member');
    } finally {
      setIsSavingAssign(false);
    }
  };

  // Assign labels API (matching Flutter: vendor/whatsapp/contact/chat/assign-labels)
  const handleSaveLabels = async () => {
    setIsSavingLabels(true);
    try {
      await apiPost('vendor/whatsapp/contact/chat/assign-labels', {
        contactUid: contactUid,
        contact_labels: Array.from(selectedLabels),
      });
      Alert.alert('Success', 'Labels updated successfully');
    } catch (e) {
      console.error('Error saving labels:', e);
      Alert.alert('Error', 'Failed to update labels');
    } finally {
      setIsSavingLabels(false);
    }
  };

  const handleToggleLabel = (labelId: string) => {
    const newLabels = new Set(selectedLabels);
    if (newLabels.has(labelId)) {
      newLabels.delete(labelId);
    } else {
      newLabels.add(labelId);
    }
    setSelectedLabels(newLabels);
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
          <ActivityIndicator size="large" color="#1A6B3C" />
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
        <View style={styles.profileCard}>
          <View style={styles.profileBanner}>
            <View style={styles.profileAvatar}>
              <MaterialIcons name="person" size={48} color="#333" />
            </View>
            <Text style={styles.profileName}>
              {userInfo?.first_name || userInfo?.full_name || 'Unknown'}
            </Text>
          </View>
          <View style={styles.infoRows}>
            <InfoRow icon="person" label="Name" value={userInfo?.first_name || userInfo?.full_name || '...'} />
            <InfoRow icon="call" label="Phone" value={userInfo?.wa_id || '...'} />
            <InfoRow icon="email" label="Email" value={userInfo?.email || '...'} />
            <InfoRow icon="language" label="Language" value={userInfo?.language_code || '...'} />
          </View>
        </View>

        {/* Assign Team & Labels Section */}
        <Text style={styles.sectionTitle}>Assign Team & Labels</Text>
        <View style={styles.card}>
          {/* Assign Team Member */}
          <View style={styles.fieldGroup}>
            <View style={styles.fieldLabel}>
              <Text style={styles.fieldLabelText}>Assign Team Member</Text>
            </View>
            <View style={styles.fieldContent}>
              <View style={styles.dropdownContainer}>
                {teamMembers.length === 0 ? (
                  <Text style={styles.emptyText}>No team members available</Text>
                ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chipsRow}
                  >
                    <TouchableOpacity
                      style={[styles.chip, !selectedUserId && styles.chipActive]}
                      onPress={() => handleAssignUser(null)}
                    >
                      <Text style={[styles.chipText, !selectedUserId && styles.chipTextActive]}>
                        Unassigned
                      </Text>
                    </TouchableOpacity>
                    {teamMembers.map((user) => (
                      <TouchableOpacity
                        key={user.id}
                        style={[styles.chip, selectedUserId === user.id && styles.chipActive]}
                        onPress={() => handleAssignUser(user)}
                      >
                        <Text style={[styles.chipText, selectedUserId === user.id && styles.chipTextActive]}>
                          {user.value}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>
            </View>
            <View style={styles.saveRow}>
              {isSavingAssign && <ActivityIndicator size="small" color="#1A6B3C" />}
            </View>
          </View>

          <View style={styles.divider} />

          {/* Assign Labels */}
          <View style={styles.fieldGroup}>
            <View style={styles.fieldLabel}>
              <Text style={styles.fieldLabelText}>Labels / Tags</Text>
            </View>
            <View style={styles.fieldContent}>
              {labels.length === 0 ? (
                <Text style={styles.emptyText}>No labels available</Text>
              ) : (
                <View style={styles.labelsGrid}>
                  {labels.map((label) => {
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
                        activeOpacity={0.7}
                      >
                        <MaterialIcons
                          name={isSelected ? 'check-box' : 'check-box-outline-blank'}
                          size={18}
                          color={isSelected ? label.textColor : '#9BA1A6'}
                        />
                        <Text
                          style={[
                            styles.labelItemText,
                            isSelected && { color: label.textColor },
                          ]}
                        >
                          {label.value}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
            <TouchableOpacity
              style={[styles.actionButton, isSavingLabels && styles.actionButtonDisabled]}
              onPress={handleSaveLabels}
              disabled={isSavingLabels}
              activeOpacity={0.8}
            >
              {isSavingLabels ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.actionButtonText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Notes Section */}
        <Text style={styles.sectionTitle}>Notes</Text>
        <View style={styles.card}>
          <View style={styles.notesContainer}>
            <View style={styles.notesHeader}>
              <TextInput
                style={[styles.notesInput, !isEditingNotes && styles.notesInputReadonly]}
                placeholder="Notes..."
                placeholderTextColor="#9BA1A6"
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={8}
                textAlignVertical="top"
                editable={isEditingNotes}
              />
              {!isEditingNotes && (
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={() => setIsEditingNotes(true)}
                >
                  <MaterialIcons name="edit" size={14} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={[
                styles.updateButton,
                !isEditingNotes && styles.updateButtonDisabled,
              ]}
              onPress={isEditingNotes ? handleSaveNotes : undefined}
              disabled={!isEditingNotes || isSavingNotes}
              activeOpacity={0.8}
            >
              {isSavingNotes ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.updateButtonText}>Update</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// Info row component for profile card
function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIconContainer}>
        <MaterialIcons name={icon as any} size={16} color="#fff" />
      </View>
      <View style={styles.infoTextContainer}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
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
    backgroundColor: '#1A6B3C',
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
    paddingBottom: 40,
  },

  // Profile Card
  profileCard: {
    backgroundColor: '#fff',
    borderRadius: 0,
    overflow: 'hidden',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  profileBanner: {
    backgroundColor: '#1A6B3C',
    paddingTop: 40,
    paddingBottom: 20,
    alignItems: 'center',
  },
  profileAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  infoRows: {
    padding: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: '#E5E7EB',
    gap: 12,
  },
  infoIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1A6B3C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoTextContainer: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 11,
    color: '#9BA1A6',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: 14,
    color: '#1B1B23',
    fontWeight: '500',
    marginTop: 1,
  },

  // Section title
  sectionTitle: {
    fontSize: 14,
    color: '#687076',
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },

  // Card
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },

  // Field group
  fieldGroup: {
    padding: 12,
  },
  fieldLabel: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  fieldLabelText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#3F51B5',
  },
  fieldContent: {
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 4,
    padding: 10,
  },
  dropdownContainer: {
    minHeight: 36,
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: '#9BA1A6',
    fontStyle: 'italic',
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  chipActive: {
    backgroundColor: '#1A6B3C',
    borderColor: '#1A6B3C',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#687076',
  },
  chipTextActive: {
    color: '#fff',
  },
  saveRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
    minHeight: 20,
  },

  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 12,
  },

  // Labels
  labelsGrid: {
    gap: 6,
  },
  labelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#fff',
  },
  labelItemText: {
    fontSize: 14,
    color: '#1B1B23',
    fontWeight: '500',
  },

  // Action button (save labels)
  actionButton: {
    backgroundColor: '#1A6B3C',
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 12,
    alignSelf: 'flex-end',
    paddingHorizontal: 30,
  },
  actionButtonDisabled: {
    opacity: 0.6,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },

  // Notes
  notesContainer: {
    padding: 12,
  },
  notesHeader: {
    position: 'relative',
  },
  notesInput: {
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 4,
    padding: 10,
    fontSize: 13,
    color: '#1B1B23',
    minHeight: 160,
    lineHeight: 20,
  },
  notesInputReadonly: {
    color: '#333',
  },
  editButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateButton: {
    backgroundColor: '#1A6B3C',
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  updateButtonDisabled: {
    backgroundColor: '#9BA1A6',
  },
  updateButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
