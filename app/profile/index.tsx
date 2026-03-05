import React, { useEffect, useState } from 'react';
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
import { router } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/stores/auth-store';
import { apiGet, apiPost } from '@/lib/services/api';
import { crossPlatformAlert } from '@/lib/helpers/cross-platform-alert';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { state: authState } = useAuth();

  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');

  useEffect(() => {
    loadProfile();
  }, []);

  // Flutter loads profile from local storage (storeUserInfo), not from a GET endpoint
  // So we just load from authState directly
  const loadProfile = async () => {
    setIsLoading(true);
    try {
      setFirstName(authState.authData?.first_name || '');
      setLastName(authState.authData?.last_name || '');
      setMobileNumber(authState.authData?.mobile_number || '');
      setEmail(authState.authData?.email || '');
      setUsername(authState.authData?.username || '');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Flutter endpoint: user/profile-update
      await apiPost('user/profile-update', {
        first_name: firstName,
        last_name: lastName,
        mobile_number: mobileNumber,
        email: email,
      });
      setIsEditing(false);
      crossPlatformAlert('Success', 'Profile updated successfully');
    } catch (e) {
      crossPlatformAlert('Error', 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Profile</Text>
        <TouchableOpacity
          onPress={() => isEditing ? handleSave() : setIsEditing(true)}
          style={styles.editButton}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <MaterialIcons name={isEditing ? 'check' : 'edit'} size={22} color="#fff" />
          )}
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#1A6B3C" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Avatar Card */}
          <View style={styles.avatarCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(firstName || username || 'U').charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.avatarName}>{username}</Text>
            <Text style={styles.avatarEmail}>{email}</Text>
          </View>

          {/* Form */}
          <View style={styles.formCard}>
            <View style={styles.formField}>
              <Text style={styles.formLabel}>First Name</Text>
              <TextInput
                style={[styles.formInput, !isEditing && styles.formInputDisabled]}
                value={firstName}
                onChangeText={setFirstName}
                editable={isEditing}
                placeholder="Enter first name"
                placeholderTextColor="#9BA1A6"
              />
            </View>

            <View style={styles.formField}>
              <Text style={styles.formLabel}>Last Name</Text>
              <TextInput
                style={[styles.formInput, !isEditing && styles.formInputDisabled]}
                value={lastName}
                onChangeText={setLastName}
                editable={isEditing}
                placeholder="Enter last name"
                placeholderTextColor="#9BA1A6"
              />
            </View>

            <View style={styles.formField}>
              <Text style={styles.formLabel}>Mobile Number</Text>
              <TextInput
                style={[styles.formInput, !isEditing && styles.formInputDisabled]}
                value={mobileNumber}
                onChangeText={setMobileNumber}
                editable={isEditing}
                placeholder="Enter mobile number"
                placeholderTextColor="#9BA1A6"
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.formField}>
              <Text style={styles.formLabel}>Email</Text>
              <TextInput
                style={[styles.formInput, !isEditing && styles.formInputDisabled]}
                value={email}
                onChangeText={setEmail}
                editable={isEditing}
                placeholder="Enter email"
                placeholderTextColor="#9BA1A6"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
          </View>

          {isEditing && (
            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSave}
              disabled={isSaving}
              activeOpacity={0.8}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveButtonText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
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
    flex: 1,
  },
  editButton: {
    padding: 6,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  avatarCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#1A6B3C',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#1A6B3C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  avatarText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
  },
  avatarName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1B1B23',
  },
  avatarEmail: {
    fontSize: 13,
    color: '#687076',
    marginTop: 4,
  },
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  formField: {
    gap: 6,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#687076',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  formInput: {
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1B1B23',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  formInputDisabled: {
    backgroundColor: '#FAFAFA',
    borderColor: 'transparent',
  },
  saveButton: {
    backgroundColor: '#1A6B3C',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#1A6B3C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
