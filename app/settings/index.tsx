import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/stores/auth-store';
import { disconnectPusher } from '@/lib/services/pusher';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { state: authState, logout } = useAuth();

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            disconnectPusher();
            await logout();
            router.replace('/login');
          },
        },
      ]
    );
  };

  const username = authState.authData?.username || 'User';
  const email = authState.authData?.email || '';
  const initial = username.charAt(0).toUpperCase();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      {/* User Card */}
      <View style={styles.userCard}>
        <View style={styles.userAvatar}>
          <Text style={styles.userAvatarText}>{initial}</Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{username}</Text>
          <Text style={styles.userEmail}>{email}</Text>
        </View>
      </View>

      {/* Menu Items */}
      <View style={styles.menuCard}>
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => (router as any).push('/profile')}
          activeOpacity={0.7}
        >
          <View style={[styles.menuIconBg, { backgroundColor: '#089B21' }]}>
            <MaterialIcons name="person" size={20} color="#fff" />
          </View>
          <Text style={styles.menuItemText}>My Profile</Text>
          <MaterialIcons name="chevron-right" size={22} color="#9BA1A6" />
        </TouchableOpacity>

        <View style={styles.menuDivider} />

        <TouchableOpacity
          style={styles.menuItem}
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <View style={[styles.menuIconBg, { backgroundColor: '#F5365C' }]}>
            <MaterialIcons name="logout" size={20} color="#fff" />
          </View>
          <Text style={[styles.menuItemText, { color: '#F5365C' }]}>Logout</Text>
          <MaterialIcons name="chevron-right" size={22} color="#9BA1A6" />
        </TouchableOpacity>
      </View>

      {/* App Info */}
      <View style={styles.appInfo}>
        <Image
          source={require('@/assets/images/icon.png')}
          style={styles.appLogo}
          resizeMode="contain"
        />
        <Text style={styles.appName}>El Mujib</Text>
        <Text style={styles.appVersion}>Version 1.0.0</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F7F7',
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
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 16,
    padding: 20,
    borderRadius: 16,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  userAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#089B21',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#089B21',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  userAvatarText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1B1B23',
  },
  userEmail: {
    fontSize: 13,
    color: '#687076',
    marginTop: 2,
  },
  menuCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
  },
  menuIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1B1B23',
    flex: 1,
  },
  menuDivider: {
    height: 0.5,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 16,
  },
  appInfo: {
    alignItems: 'center',
    marginTop: 40,
    gap: 4,
  },
  appLogo: {
    width: 48,
    height: 48,
    borderRadius: 10,
    marginBottom: 8,
  },
  appName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1B1B23',
  },
  appVersion: {
    fontSize: 12,
    color: '#9BA1A6',
  },
});
