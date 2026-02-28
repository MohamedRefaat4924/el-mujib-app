import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import forge from 'node-forge';

const AUTH_STORAGE_KEY = '@el_mujib_auth';
const BASE_URL_KEY = '@el_mujib_base_url';

// RSA Public Key from Flutter app_config.dart - used for secured login
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBAPJwwNa//eaQYxkNsAODohg38azVtalE
h7Lw4wxlBrbDONgYaebgscpjPRloeL0kj4aLI462lcQGVAxhyh8JijsCAwEAAQ==
-----END PUBLIC KEY-----`;

let cachedToken: string | null = null;
let cachedBaseUrl: string | null = null;

// RSA encryption matching Flutter's InputSecurity class
export function encryptWithRSA(plaintext: string): string {
  try {
    const publicKey = forge.pki.publicKeyFromPem(PUBLIC_KEY);
    const encrypted = (publicKey as any).encrypt(plaintext, 'PKCS1v1.5');
    return forge.util.encode64(encrypted);
  } catch (e) {
    console.error('RSA encryption failed:', e);
    return '';
  }
}

// Encrypt input data for secured requests (matching Flutter's data_transport.post secured logic)
function encryptInputData(
  inputData: Record<string, any>,
  unSecuredFields?: string[]
): Record<string, any> {
  const encrypted: Record<string, any> = {};
  Object.entries(inputData).forEach(([key, value]) => {
    if (unSecuredFields && unSecuredFields.includes(key)) {
      encrypted[key] = value;
    } else {
      encrypted[encryptWithRSA(key)] = encryptWithRSA(String(value));
    }
  });
  return encrypted;
}

export async function getBaseUrl(): Promise<string> {
  if (cachedBaseUrl) return cachedBaseUrl;
  const stored = await AsyncStorage.getItem(BASE_URL_KEY);
  cachedBaseUrl = stored || '';
  return cachedBaseUrl;
}

export async function setBaseUrl(url: string): Promise<void> {
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

// HTTP headers matching Flutter's _setHeaders()
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
    unSecuredFields?: string[];
  }
): Promise<any> {
  try {
    const apiUrl = await getApiUrl();
    const headers = await getHeaders();

    // Apply RSA encryption for secured requests (matching Flutter's data_transport.post)
    let bodyData = inputData;
    if (options?.secured && inputData) {
      bodyData = encryptInputData(inputData, options.unSecuredFields);
    }

    const response = await fetch(`${apiUrl}${endpoint}`, {
      method: 'POST',
      headers,
      body: bodyData ? JSON.stringify(bodyData) : undefined,
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

// Upload file matching Flutter's data_transport.uploadFile
// Uses 'filepond' as the file field name, matching Flutter exactly
export async function uploadFile(
  fileUri: string,
  fileName: string,
  mimeType: string,
  uploadUrl: string,
  options?: {
    inputData?: Record<string, string>;
    onSuccess?: (data: any) => void;
    onError?: (error: any) => void;
  }
): Promise<any> {
  try {
    const apiUrl = await getApiUrl();
    const headers = await getMultipartHeaders();
    const formData = new FormData();

    // Add additional input data fields
    if (options?.inputData) {
      Object.entries(options.inputData).forEach(([key, value]) => {
        formData.append(key, value);
      });
    }

    // Add file with field name 'filepond' matching Flutter exactly
    if (Platform.OS === 'web') {
      // For web, fileUri is a blob URL or File object
      const response = await fetch(fileUri);
      const blob = await response.blob();
      formData.append('filepond', blob, fileName);
    } else {
      formData.append('filepond', {
        uri: fileUri,
        type: mimeType,
        name: fileName,
      } as any);
    }

    const response = await fetch(`${apiUrl}${uploadUrl}`, {
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
      throw new Error(data?.message || `Upload failed: HTTP ${response.status}`);
    }
  } catch (error) {
    console.error(`Upload to ${uploadUrl} error:`, error);
    if (options?.onError) {
      options.onError(error);
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
// Matches Flutter's getItemValue utility
export function getItemValue(data: any, path: string, fallbackValue: any = null): any {
  const keys = path.split('.');
  let current = data;
  for (const key of keys) {
    if (current == null) return fallbackValue;
    current = current[key];
  }
  return current ?? fallbackValue;
}
