import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import forge from 'node-forge';
import * as FileSystem from 'expo-file-system/legacy';

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

    // === REQUEST LOG ===
    console.log(`\n📤 [API GET] ${url}`);
    console.log(`📤 [HEADERS]`, JSON.stringify(headers, null, 2));

    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    const responseText = await response.text();
    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = responseText;
    }

    // === RESPONSE LOG ===
    console.log(`📥 [RESPONSE] ${url}`);
    console.log(`📥 [STATUS] ${response.status} ${response.statusText}`);
    console.log(`📥 [BODY] ${JSON.stringify(data)?.substring(0, 500)}`);

    if (!response.ok) {
      if (response.status === 401) {
        await clearAuthData();
        throw new Error('Unauthorized');
      }
      throw new Error(`HTTP ${response.status}`);
    }

    if (options?.onSuccess) {
      options.onSuccess(data);
    }
    return data;
  } catch (error) {
    console.error(`❌ [API GET] ${endpoint} error:`, error);
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

    // === REQUEST LOG ===
    const fullPostUrl = `${apiUrl}${endpoint}`;
    console.log(`\n📤 [API POST] ${fullPostUrl}`);
    console.log(`📤 [HEADERS]`, JSON.stringify(headers, null, 2));
    console.log(`📤 [BODY]`, JSON.stringify(bodyData)?.substring(0, 500));

    const response = await fetch(fullPostUrl, {
      method: 'POST',
      headers,
      body: bodyData ? JSON.stringify(bodyData) : undefined,
    });

    // Try to parse as JSON
    const text = await response.text();

    // === RESPONSE LOG ===
    console.log(`📥 [RESPONSE] ${fullPostUrl}`);
    console.log(`📥 [STATUS] ${response.status} ${response.statusText}`);
    console.log(`📥 [BODY] ${text.substring(0, 500)}`);

    let data: any;
    try {
      data = JSON.parse(text);
    } catch (parseError) {
      console.error(`❌ API POST ${endpoint} - Response is not JSON:`, text.substring(0, 200));
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
    console.error(`❌ [API POST] ${endpoint} error:`, error);
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
    onProgress?: (progress: number) => void;
  }
): Promise<any> {
  try {
    const apiUrl = getApiUrl();
    const headers = await getMultipartHeaders();
    const formData = new FormData();

    // Server accepts: audio/aac, audio/mp4, audio/mpeg, audio/amr, audio/ogg
    // We send audio/aac matching Flutter exactly. Do NOT remap audio/aac.
    let sanitizedMimeType = mimeType;
    let sanitizedFileName = fileName;

    if (uploadUrl.includes('whatsapp_audio') || uploadUrl.includes('audio')) {
      // Server accepts ONLY: audio/aac, audio/mp4, audio/mpeg, audio/amr, audio/ogg
      // PHP's getClientMimeType() reads the MIME type from the multipart Content-Disposition.
      // The web app sends audio/mpeg (.mp3) which works most reliably.
      const acceptedAudioTypes = ['audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg'];
      if (!acceptedAudioTypes.includes(mimeType)) {
        // Map ANY non-accepted type to audio/mpeg (most reliable, matches web app)
        const audioMimeMap: Record<string, string> = {
          'audio/m4a': 'audio/mp4',
          'audio/x-m4a': 'audio/mp4',
          'audio/mp4a-latm': 'audio/mp4',
          'audio/wav': 'audio/mpeg',
          'audio/x-wav': 'audio/mpeg',
          'audio/webm': 'audio/ogg',
          'audio/3gpp': 'audio/amr',
          'audio/3gpp2': 'audio/amr',
          'audio/caf': 'audio/mpeg',
          'audio/x-caf': 'audio/mpeg',
          'application/octet-stream': 'audio/mpeg',
        };
        sanitizedMimeType = audioMimeMap[mimeType] || 'audio/mpeg';
        console.log(`[Upload] Mapped audio MIME: ${mimeType} → ${sanitizedMimeType}`);
      }
      // ALWAYS ensure file extension matches the declared MIME type
      // This is critical because PHP may also check the extension
      const mimeToExt: Record<string, string> = {
        'audio/aac': '.aac',
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
      console.log(`[Upload] Audio upload - Final MIME: ${sanitizedMimeType}, Final filename: ${sanitizedFileName}`);
    }
    // === UPLOAD REQUEST LOG ===
    console.log(`\n📤 [UPLOAD] ${apiUrl}${uploadUrl}`);
    console.log(`📤 [UPLOAD HEADERS]`, JSON.stringify(headers, null, 2));
    console.log(`📤 [UPLOAD FILE]`, JSON.stringify({
      originalUri: fileUri?.substring(0, 100),
      originalFileName: fileName,
      originalMimeType: mimeType,
      sanitizedFileName,
      sanitizedMimeType,
      uploadPath: uploadUrl,
    }, null, 2));

    // Add additional input data fields (Flutter: request.fields.addAll(inputData))
    if (options?.inputData) {
      Object.entries(options.inputData).forEach(([key, value]) => {
        formData.append(key, value);
      });
    }

    // Add file with field name 'filepond' matching Flutter exactly
    // Flutter: request.files.add(await http.MultipartFile.fromPath('filepond', filename, contentType: MediaType.parse(mimeType)))
    // Use the SAME approach for ALL file types (images, audio, video, documents).
    // The standard RN FormData {uri, type, name} approach works perfectly for images/docs/camera.
    // Previously audio used a complex base64→Blob workaround, but the standard approach
    // should work the same way for audio as it does for images.
    if (Platform.OS === 'web') {
      // For web, fileUri is a blob URL or File object
      const response = await fetch(fileUri);
      const blob = await response.blob();
      const file = new File([blob], sanitizedFileName, { type: sanitizedMimeType });
      formData.append('filepond', file);
    } else {
      // For ALL native files (images, audio, video, documents): standard RN FormData approach
      // This is the same approach that works perfectly for images and documents
      formData.append('filepond', {
        uri: fileUri,
        type: sanitizedMimeType,
        name: sanitizedFileName,
      } as any);
    }

    // CRITICAL: Ensure NO Content-Type header is set for multipart uploads.
    // fetch/XHR must auto-set Content-Type: multipart/form-data; boundary=...
    // If Content-Type is manually set (even to multipart/form-data), the boundary will be missing
    // and the server won't parse the file, causing 406.
    delete (headers as any)['Content-Type'];
    delete (headers as any)['Content-type'];
    delete (headers as any)['content-type'];

    console.log(`📤 [UPLOAD] Sending to ${apiUrl}${uploadUrl}...`);
    console.log(`📤 [UPLOAD] Final headers (MUST NOT contain Content-Type):`, JSON.stringify(headers, null, 2));

    const fullUrl = `${apiUrl}${uploadUrl}`;
    const isAudioUpload = uploadUrl.includes('audio');

    let text: string;
    let status: number;
    let statusText: string;

    if (isAudioUpload && Platform.OS !== 'web') {
      // For audio uploads on native: use fetch instead of XHR.
      // React Native's XHR polyfill on iOS can override the declared MIME type
      // based on the actual file content, causing 406 errors.
      // fetch handles FormData MIME types more reliably.
      console.log(`📤 [UPLOAD] Using fetch for audio upload (more reliable MIME handling on iOS)`);
      if (options?.onProgress) options.onProgress(30); // Simulate progress since fetch doesn't support it
      
      const fetchResponse = await fetch(fullUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          ...(headers['Authorization'] ? { 'Authorization': headers['Authorization'] } : {}),
          ...(headers['X-Requested-With'] ? { 'X-Requested-With': headers['X-Requested-With'] } : {}),
          ...(headers['api-request-signature'] ? { 'api-request-signature': headers['api-request-signature'] } : {}),
          // DO NOT set Content-Type — let fetch auto-set multipart/form-data with boundary
        },
        body: formData,
      });
      
      if (options?.onProgress) options.onProgress(80);
      text = await fetchResponse.text();
      status = fetchResponse.status;
      statusText = fetchResponse.statusText;
    } else {
      // For non-audio uploads (images, video, docs): use XHR for progress tracking
      const result = await new Promise<{ text: string; status: number; statusText: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', fullUrl, true);

        // Set headers - explicitly exclude any Content-Type
        Object.entries(headers).forEach(([key, value]) => {
          if (key.toLowerCase() === 'content-type') return;
          xhr.setRequestHeader(key, value);
        });

        // Track upload progress
        if (xhr.upload && options?.onProgress) {
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const progress = Math.round((event.loaded / event.total) * 100);
              console.log(`📤 [UPLOAD PROGRESS] ${progress}% (${event.loaded}/${event.total})`);
              options.onProgress!(progress);
            }
          };
        }

        xhr.onload = () => {
          resolve({ text: xhr.responseText, status: xhr.status, statusText: xhr.statusText });
        };

        xhr.onerror = () => {
          reject(new Error(`Upload network error to ${uploadUrl}`));
        };

        xhr.ontimeout = () => {
          reject(new Error(`Upload timeout to ${uploadUrl}`));
        };

        xhr.timeout = 120000; // 2 minute timeout for large files
        xhr.send(formData);
      });
      text = result.text;
      status = result.status;
      statusText = result.statusText;
    }

    // Report 100% on completion
    if (options?.onProgress) {
      options.onProgress(100);
    }

    // === UPLOAD RESPONSE LOG ===
    console.log(`📥 [UPLOAD RESPONSE] ${fullUrl}`);
    console.log(`📥 [STATUS] ${status} ${statusText}`);
    console.log(`📥 [BODY] ${text.substring(0, 500)}`);

    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      console.error(`Upload to ${uploadUrl} - Response is not JSON:`, text.substring(0, 300));
      throw new Error(`Server returned non-JSON response. Status: ${status}`);
    }

    if (status >= 200 && status < 300) {
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
      console.error(`Upload failed with status ${status}:`, JSON.stringify(data).substring(0, 500));
      throw new Error(data?.data?.message || data?.message || `Upload failed: HTTP ${status}`);
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

    // === MULTIPART REQUEST LOG ===
    const fullMultipartUrl = `${apiUrl}${endpoint}`;
    console.log(`\n📤 [API POST MULTIPART] ${fullMultipartUrl}`);
    console.log(`📤 [HEADERS]`, JSON.stringify(headers, null, 2));

    const response = await fetch(fullMultipartUrl, {
      method: 'POST',
      headers,
      body: formData,
    });

    const text = await response.text();

    // === MULTIPART RESPONSE LOG ===
    console.log(`📥 [RESPONSE] ${fullMultipartUrl}`);
    console.log(`📥 [STATUS] ${response.status} ${response.statusText}`);
    console.log(`📥 [BODY] ${text.substring(0, 500)}`);

    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      console.error(`❌ API POST multipart ${endpoint} - Response is not JSON:`, text.substring(0, 200));
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
