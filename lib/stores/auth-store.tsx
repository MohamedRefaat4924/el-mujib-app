import React, { createContext, useContext, useEffect, useReducer, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthData } from '../types';
import { saveAuthData, clearAuthData, getAuthData, setBaseUrl, getBaseUrl } from '../services/api';

interface AuthState {
  isLoading: boolean;
  isLoggedIn: boolean;
  authData: AuthData | null;
  baseUrl: string;
}

type AuthAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'LOGIN_SUCCESS'; payload: AuthData }
  | { type: 'LOGOUT' }
  | { type: 'RESTORE_SESSION'; payload: { authData: AuthData; baseUrl: string } }
  | { type: 'SET_BASE_URL'; payload: string };

const initialState: AuthState = {
  isLoading: true,
  isLoggedIn: false,
  authData: null,
  baseUrl: '',
};

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'LOGIN_SUCCESS':
      return { ...state, isLoggedIn: true, isLoading: false, authData: action.payload };
    case 'LOGOUT':
      return { ...state, isLoggedIn: false, authData: null, isLoading: false };
    case 'RESTORE_SESSION':
      return {
        ...state,
        isLoggedIn: true,
        isLoading: false,
        authData: action.payload.authData,
        baseUrl: action.payload.baseUrl,
      };
    case 'SET_BASE_URL':
      return { ...state, baseUrl: action.payload };
    default:
      return state;
  }
}

interface AuthContextType {
  state: AuthState;
  login: (authData: any, baseUrl?: string) => Promise<void>;
  logout: () => Promise<void>;
  updateBaseUrl: (url: string) => Promise<void>;
  getInfo: (key: string) => any;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  useEffect(() => {
    restoreSession();
  }, []);

  const restoreSession = async () => {
    try {
      const authData = await getAuthData();
      const baseUrl = await getBaseUrl();
      if (authData && authData.token) {
        dispatch({
          type: 'RESTORE_SESSION',
          payload: { authData, baseUrl },
        });
      } else {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    } catch (e) {
      console.error('Error restoring session:', e);
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const login = useCallback(async (responseData: any, baseUrl?: string) => {
    try {
      // Extract auth data matching Flutter's createLoginSession exactly:
      // token = responseData['data']['access_token']
      // vendor_uid = responseData['data']['auth_info']['vendor_uid']
      // uuid = responseData['data']['auth_info']['uuid']
      // profile = responseData['data']['auth_info']['profile']
      const data = responseData?.data || responseData;
      const authInfo = data?.auth_info || {};
      const profile = authInfo?.profile || {};
      const authData: AuthData = {
        token: data?.access_token || '',
        vendor_uid: String(authInfo?.vendor_uid || ''),
        uuid: String(authInfo?.uuid || ''),
        username: profile?.username || '',
        first_name: profile?.first_name || '',
        last_name: profile?.last_name || '',
        email: profile?.email || '',
        mobile_number: profile?.mobile_number || '',
        profile: profile,
      };

      if (baseUrl) {
        await setBaseUrl(baseUrl);
      }
      await saveAuthData(authData);
      dispatch({ type: 'LOGIN_SUCCESS', payload: authData });
    } catch (e) {
      console.error('Error during login:', e);
      throw e;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await clearAuthData();
      dispatch({ type: 'LOGOUT' });
    } catch (e) {
      console.error('Error during logout:', e);
    }
  }, []);

  const updateBaseUrl = useCallback(async (url: string) => {
    await setBaseUrl(url);
    dispatch({ type: 'SET_BASE_URL', payload: url });
  }, []);

  const getInfo = useCallback((key: string): any => {
    if (!state.authData) return null;
    return (state.authData as any)[key] || null;
  }, [state.authData]);

  return (
    <AuthContext.Provider value={{ state, login, logout, updateBaseUrl, getInfo }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
