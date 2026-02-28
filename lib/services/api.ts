import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import forge from 'node-forge';

const AUTH_STORAGE_KEY = '@el_mujib_auth';

// Hardcoded base URL matching Flutter app_config.dart exactly
const BASE_URL = 'https://elmujib.com';
const BASE_API_URL = `${BASE_URL}/api/`;

// RSA Public Key from Flutter app_config.dart - used for secured login
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBAPJwwNa//eaQYxkNsAODohg38azVtalE
h7Lw4wxlBrbDONgYaebgscpjPRloeL0kj4aLI462lcQGVAxhyh8JijsCAwEAAQ==
-----END PUBLIC KEY-----`;

let cachedToken: string | null = null;

// RSA encryption matching Flutter's InputSecurity class
// Flutter uses PKCS1Encoding(RSAEngine()) which is PKCS#1 v1.5 padding
// In node-forge, publicKey.encrypt(data, 'RSAES-PKCS1-V1_5') is the equivalent
export function encryptWithRSA(plaintext: string): string {
  try {
    const publicKey = forge.pki.publicKeyFromPem(PUBLIC_KEY);
    // Convert plaintext to bytes, encrypt with PKCS#1 v1.5, then base64 encode
    const encrypted = publicKey.encrypt(forge.util.encodeUtf8(plaintext), 'RSAES-PKCS1-V1_5');
    return forge.util.encode64(encrypted);
  } catch (e) {
    console.error('RSA encryption failed:', e);
    return '';
  }
}

// Encrypt input data for secured requests (matching Flutter's data_transport.post secured logic)
// Flutter encrypts BOTH keys and values with RSA
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

// Base URL is hardcoded like Flutter - no need for dynamic setting
export function getBaseUrl(): string {
  return BASE_URL;
}

export function getApiUrl(): string {
  return BASE_API_URL;
}

// Keep setBaseUrl as no-op for backward compatibility
export async function setBaseUrl(_url: string): Promise<void> {
  // Base URL is hardcoded - this is a no-op
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

// HTTP headers matching Flutter's _setHeaders() EXACTLY
// Flutter sends these headers on every request:
// 'Content-type': 'application/json; charset=UTF-8'
// 'Accept': 'application/json'
// 'X-Requested-With': 'XMLHttpRequest'
// 'api-request-signature': 'mobile-app-request'
// 'Authorization': 'Bearer $token'
async function getHeaders(): Promise<Record<string, string>> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    'Content-type': 'application/json; charset=UTF-8',
    'Accept': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    'api-request-signature': 'mobile-app-request',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// Flutter's _setHeaders() sends ALL headers including Content-type for multipart uploads.
// The Dart HTTP library's MultipartRequest overrides Content-Type to multipart/form-data with boundary.
// But the other headers (X-Requested-With, api-request-signature, Authorization) are critical.
// For React Native fetch with FormData, we must NOT set Content-Type manually - fetch sets it with boundary.
async function getMultipartHeaders(): Promise<Record<string, string>> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    'api-request-signature': 'mobile-app-request',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export async function apiGet(
  endpoint: string,
  options?: {
    onSuccess?: (data: any) => void;
    onError?: (error: any) => void;
    queryParameters?: Record<string, string>;
  }
): Promise<any> {
  try {
    const apiUrl = getApiUrl();
    const headers = await getHeaders();

    // Build query string like Flutter's apiUrl function
    let url = `${apiUrl}${endpoint}`;
    if (options?.queryParameters) {
      const params = new URLSearchParams(options.queryParameters);
      url += (url.includes('?') ? '&' : '?') + params.toString();
    }

    const response = await fetch(url, {
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
    const apiUrl = getApiUrl();
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

    // Try to parse as JSON
    const text = await response.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch (parseError) {
      console.error(`API POST ${endpoint} - Response is not JSON:`, text.substring(0, 200));
      throw new Error(`Server returned non-JSON response. Status: ${response.status}`);
    }

    // Match Flutter's _thenProcessing logic:
    // Check if user is unauthorized
    if (data?.data?.auth_info?.authorized === false) {
      await clearAuthData();
      throw new Error('Unauthorized');
    }

    // Check for token refresh
    if (data?.data?.additional?.token_refreshed) {
      cachedToken = data.data.additional.token_refreshed;
      const authData = await getAuthData();
      if (authData) {
        authData.token = cachedToken;
        await saveAuthData(authData);
      }
    }

    if (response.ok) {
      // Flutter checks reaction === 1 or reaction === 21 for success
      if (data.reaction === 1 || data.reaction === 21) {
        if (options?.onSuccess) {
          options.onSuccess(data);
        }
        return data;
      } else {
        // reaction is not 1 or 21 - this is a "failed" response in Flutter's logic
        if (options?.onFailed) {
          options.onFailed(data);
        }
        throw new Error(data?.data?.message || 'Request failed');
      }
    } else if (response.status === 422) {
      // Validation errors - Flutter extracts errors and shows them
      const errors = data?.errors || {};
      let errorString = data?.message || '';
      Object.values(errors).forEach((errArr: any) => {
        if (Array.isArray(errArr) && errArr[0]) {
          errorString += '\n' + errArr[0];
        }
      });
      if (options?.onFailed) {
        options.onFailed(data);
      }
      throw new Error(errorString || 'Validation failed');
    } else {
      if (response.status === 401) {
        await clearAuthData();
      }
      if (options?.onFailed) {
        options.onFailed(data);
      }
      throw new Error(data?.data?.message || data?.message || `HTTP ${response.status}`);
    }
  } catch (error) {
    console.error(`API POST ${endpoint} error:`, error);
    if (options?.onFailed && !(error as any)._handled) {
      options.onFailed(error);
    }
    throw error;
  }
}

// Upload file matching Flutter's data_transport.uploadFile
// Uses 'filepond' as the file field name, matching Flutter exactly
// Flutter's _setHeaders() sends Content-type: application/json even for multipart,
// but Dart's MultipartRequest overrides it. In RN, fetch auto-sets Content-Type for FormData.
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
    const apiUrl = getApiUrl();
    const headers = await getMultipartHeaders();
    const formData = new FormData();

    // Server ONLY accepts these audio MIME types: audio/mp4, audio/mpeg, audio/amr, audio/ogg
    // audio/aac is NOT accepted despite Flutter's data_transport.dart mapping it.
    // The server validates the declared MIME type (not file content) and rejects anything else.
    let sanitizedMimeType = mimeType;
    let sanitizedFileName = fileName;

    if (uploadUrl.includes('whatsapp_audio') || uploadUrl.includes('audio')) {
      const acceptedAudioTypes = ['audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg'];
      if (!acceptedAudioTypes.includes(mimeType)) {
        // Map all non-accepted types to accepted ones
        const audioMimeMap: Record<string, string> = {
          'audio/aac': 'audio/ogg',
          'audio/m4a': 'audio/mp4',
          'audio/x-m4a': 'audio/mp4',
          'audio/mp4a-latm': 'audio/mp4',
          'audio/wav': 'audio/ogg',
          'audio/x-wav': 'audio/ogg',
          'audio/webm': 'audio/ogg',
          'audio/3gpp': 'audio/amr',
          'audio/3gpp2': 'audio/amr',
          'audio/caf': 'audio/ogg',
          'audio/x-caf': 'audio/ogg',
          'application/octet-stream': 'audio/ogg',
        };
        sanitizedMimeType = audioMimeMap[mimeType] || 'audio/ogg';
        console.log(`[Upload] Mapped audio MIME: ${mimeType} → ${sanitizedMimeType}`);
      }
      // Ensure file extension matches the declared MIME type
      const mimeToExt: Record<string, string> = {
        'audio/mp4': '.m4a',
        'audio/mpeg': '.mp3',
        'audio/amr': '.amr',
        'audio/ogg': '.ogg',
      };
      const expectedExt = mimeToExt[sanitizedMimeType];
      if (expectedExt) {
        const currentExt = sanitizedFileName.substring(sanitizedFileName.lastIndexOf('.')).toLowerCase();
        if (currentExt !== expectedExt) {
          const dotIdx = sanitizedFileName.lastIndexOf('.');
          sanitizedFileName = (dotIdx > 0 ? sanitizedFileName.substring(0, dotIdx) : sanitizedFileName) + expectedExt;
          console.log(`[Upload] Corrected filename: ${fileName} → ${sanitizedFileName}`);
        }
      }
    }
    console.log(`[Upload] Final: mimeType=${sanitizedMimeType}, fileName=${sanitizedFileName}, uploadUrl=${uploadUrl}`);

    // Add additional input data fields (Flutter: request.fields.addAll(inputData))
    if (options?.inputData) {
      Object.entries(options.inputData).forEach(([key, value]) => {
        formData.append(key, value);
      });
    }

    // Add file with field name 'filepond' matching Flutter exactly
    // Flutter: request.files.add(await http.MultipartFile.fromPath('filepond', filename, contentType: MediaType.parse(mimeType)))
    if (Platform.OS === 'web') {
      // For web, fileUri is a blob URL or File object
      const response = await fetch(fileUri);
      const blob = await response.blob();
      // Create a File object with proper name and type for web
      const file = new File([blob], sanitizedFileName, { type: sanitizedMimeType });
      formData.append('filepond', file);
    } else {
      // For React Native, we pass an object with uri, type, name
      formData.append('filepond', {
        uri: fileUri,
        type: sanitizedMimeType,
        name: sanitizedFileName,
      } as any);
    }

    console.log(`[Upload] Uploading to ${apiUrl}${uploadUrl} file=${sanitizedFileName} type=${sanitizedMimeType}`);

    const response = await fetch(`${apiUrl}${uploadUrl}`, {
      method: 'POST',
      headers,
      body: formData,
    });

    const text = await response.text();
    console.log(`[Upload] Response status: ${response.status}, body preview: ${text.substring(0, 200)}`);

    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      console.error(`Upload to ${uploadUrl} - Response is not JSON:`, text.substring(0, 300));
      throw new Error(`Server returned non-JSON response. Status: ${response.status}`);
    }

    if (response.ok) {
      // Check for reaction success like Flutter's _thenProcessing
      if (data.reaction === 1 || data.reaction === 21 || !data.reaction) {
        if (options?.onSuccess) {
          options.onSuccess(data);
        }
        return data;
      } else {
        throw new Error(data?.data?.message || 'Upload processing failed');
      }
    } else {
      console.error(`Upload failed with status ${response.status}:`, JSON.stringify(data).substring(0, 500));
      throw new Error(data?.data?.message || data?.message || `Upload failed: HTTP ${response.status}`);
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
    const apiUrl = getApiUrl();
    const headers = await getMultipartHeaders();
    const response = await fetch(`${apiUrl}${endpoint}`, {
      method: 'POST',
      headers,
      body: formData,
    });

    const text = await response.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      console.error(`API POST multipart ${endpoint} - Response is not JSON:`, text.substring(0, 200));
      throw new Error(`Server returned non-JSON response. Status: ${response.status}`);
    }

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
