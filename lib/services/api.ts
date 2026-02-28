import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const AUTH_STORAGE_KEY = '@el_mujib_auth';
const BASE_URL_KEY = '@el_mujib_base_url';

let cachedToken: string | null = null;
let cachedBaseUrl: string | null = null;

export async function getBaseUrl(): Promise<string> {
  if (cachedBaseUrl) return cachedBaseUrl;
  const stored = await AsyncStorage.getItem(BASE_URL_KEY);
  cachedBaseUrl = stored || '';
  return cachedBaseUrl;
}

export async function setBaseUrl(url: string): Promise<void> {
  // Ensure URL ends without trailing slash
  const cleanUrl = url.replace(/\/+$/, '');
  cachedBaseUrl = cleanUrl;
  await AsyncStorage.setItem(BASE_URL_KEY, cleanUrl);
}

export async function getApiUrl(): Promise<string> {
  const base = await getBaseUrl();
  return `${base}/api/`;
}

export async function getAuthToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  try {
    const authDataStr = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
    if (authDataStr) {
      const authData = JSON.parse(authDataStr);
      cachedToken = authData.token || null;
      return cachedToken;
    }
  } catch (e) {
    console.error('Error reading auth token:', e);
  }
  return null;
}

export async function getAuthData(): Promise<any | null> {
  try {
    const authDataStr = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
    if (authDataStr) {
      return JSON.parse(authDataStr);
    }
  } catch (e) {
    console.error('Error reading auth data:', e);
  }
  return null;
}

export function getAuthInfo(key: string): any {
  // Synchronous version - uses cached data
  return null; // Will be populated by the store
}

export async function saveAuthData(data: any): Promise<void> {
  try {
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(data));
    cachedToken = data.token || null;
  } catch (e) {
    console.error('Error saving auth data:', e);
  }
}

export async function clearAuthData(): Promise<void> {
  try {
    await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
    cachedToken = null;
  } catch (e) {
    console.error('Error clearing auth data:', e);
  }
}

export async function isLoggedIn(): Promise<boolean> {
  const token = await getAuthToken();
  return !!token;
}

// HTTP methods
async function getHeaders(): Promise<Record<string, string>> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function getMultipartHeaders(): Promise<Record<string, string>> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export async function apiGet(
  endpoint: string,
  options?: { onSuccess?: (data: any) => void; onError?: (error: any) => void }
): Promise<any> {
  try {
    const apiUrl = await getApiUrl();
    const headers = await getHeaders();
    const response = await fetch(`${apiUrl}${endpoint}`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      if (response.status === 401) {
        await clearAuthData();
        throw new Error('Unauthorized');
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    if (options?.onSuccess) {
      options.onSuccess(data);
    }
    return data;
  } catch (error) {
    console.error(`API GET ${endpoint} error:`, error);
    if (options?.onError) {
      options.onError(error);
    }
    throw error;
  }
}

export async function apiPost(
  endpoint: string,
  inputData?: Record<string, any>,
  options?: {
    onSuccess?: (data: any) => void;
    onFailed?: (data: any) => void;
    secured?: boolean;
  }
): Promise<any> {
  try {
    const apiUrl = await getApiUrl();
    const headers = await getHeaders();
    const response = await fetch(`${apiUrl}${endpoint}`, {
      method: 'POST',
      headers,
      body: inputData ? JSON.stringify(inputData) : undefined,
    });

    const data = await response.json();

    if (response.ok) {
      if (options?.onSuccess) {
        options.onSuccess(data);
      }
      return data;
    } else {
      if (response.status === 401) {
        await clearAuthData();
      }
      if (options?.onFailed) {
        options.onFailed(data);
      }
      throw new Error(data?.message || `HTTP ${response.status}`);
    }
  } catch (error) {
    console.error(`API POST ${endpoint} error:`, error);
    if (options?.onFailed) {
      options.onFailed(error);
    }
    throw error;
  }
}

export async function apiPostMultipart(
  endpoint: string,
  formData: FormData,
  options?: {
    onSuccess?: (data: any) => void;
    onFailed?: (data: any) => void;
    onProgress?: (progress: number) => void;
  }
): Promise<any> {
  try {
    const apiUrl = await getApiUrl();
    const headers = await getMultipartHeaders();
    const response = await fetch(`${apiUrl}${endpoint}`, {
      method: 'POST',
      headers,
      body: formData,
    });

    const data = await response.json();

    if (response.ok) {
      if (options?.onSuccess) {
        options.onSuccess(data);
      }
      return data;
    } else {
      if (options?.onFailed) {
        options.onFailed(data);
      }
      throw new Error(data?.message || `HTTP ${response.status}`);
    }
  } catch (error) {
    console.error(`API POST multipart ${endpoint} error:`, error);
    if (options?.onFailed) {
      options.onFailed(error);
    }
    throw error;
  }
}

// Helper to extract nested values like 'client_models.contacts'
export function getItemValue(data: any, path: string): any {
  const keys = path.split('.');
  let current = data;
  for (const key of keys) {
    if (current == null) return null;
    current = current[key];
  }
  return current;
}
