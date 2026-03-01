/**
 * Voice Upload Proxy Endpoint
 * 
 * Complete server-side handling of voice message uploads:
 * 1. Client uploads recorded audio (any format) to this endpoint
 * 2. Server converts to MP3 using FFmpeg (the format the web app uses successfully)
 * 3. Server uploads the MP3 to elmujib.com's upload-temp-media endpoint
 * 4. Server sends the media message to the contact via elmujib.com's send-media endpoint
 * 5. Returns the result to the client
 * 
 * This bypasses all iOS MIME type issues since the server handles the actual upload.
 */

import { Router } from 'express';
import multer from 'multer';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execFileAsync = promisify(execFile);

// elmujib.com base URLs
const ELMUJIB_BASE_URL = 'https://elmujib.com';
const ELMUJIB_API_URL = `${ELMUJIB_BASE_URL}/api/`;

// Configure multer for temporary file storage
const voiceUpload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, `voice-${uniqueSuffix}${path.extname(file.originalname) || '.m4a'}`);
    },
  }),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
  },
});

/**
 * Convert audio file to MP3 using FFmpeg
 */
async function convertToMp3(inputPath: string): Promise<string> {
  const outputPath = inputPath.replace(/\.[^.]+$/, '.mp3');
  
  console.log('[VoiceProxy] Converting to MP3:', inputPath, '→', outputPath);
  
  const { stderr } = await execFileAsync('ffmpeg', [
    '-i', inputPath,
    '-c:a', 'libmp3lame',    // MP3 codec
    '-b:a', '128k',           // 128kbps bitrate
    '-ar', '44100',            // 44.1kHz sample rate
    '-ac', '1',                // mono
    '-y',                      // overwrite
    outputPath,
  ], {
    timeout: 30000, // 30 second timeout
  });

  if (stderr) {
    console.log('[VoiceProxy] FFmpeg stderr (last 300):', stderr.slice(-300));
  }

  const stats = fs.statSync(outputPath);
  if (stats.size === 0) {
    throw new Error('FFmpeg produced an empty MP3 file');
  }

  console.log('[VoiceProxy] MP3 conversion done. Size:', stats.size, 'bytes');
  return outputPath;
}

/**
 * Upload file to elmujib.com using multipart form data (server-to-server)
 * Mimics exactly what the web app does via FilePond upload
 */
async function uploadToElmujib(
  mp3Path: string,
  fileName: string,
  authToken: string,
  uploadPath: string = 'media/upload-temp-media/whatsapp_audio'
): Promise<any> {
  // Dynamic import for node-fetch (or use built-in fetch in Node 18+)
  const fileBuffer = fs.readFileSync(mp3Path);
  
  // Build multipart form data manually for Node.js
  const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);
  
  const bodyParts: Buffer[] = [];
  
  // Add the file part with field name 'filepond'
  const fileHeader = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="filepond"; filename="${fileName}"`,
    `Content-Type: audio/mpeg`,
    '',
    '',
  ].join('\r\n');
  
  bodyParts.push(Buffer.from(fileHeader, 'utf-8'));
  bodyParts.push(fileBuffer);
  bodyParts.push(Buffer.from('\r\n', 'utf-8'));
  
  // End boundary
  bodyParts.push(Buffer.from(`--${boundary}--\r\n`, 'utf-8'));
  
  const body = Buffer.concat(bodyParts);
  
  const uploadUrl = `${ELMUJIB_API_URL}${uploadPath}`;
  console.log('[VoiceProxy] Uploading to elmujib:', uploadUrl);
  console.log('[VoiceProxy] File:', fileName, 'Size:', fileBuffer.length, 'bytes');
  
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${authToken}`,
      'X-Requested-With': 'XMLHttpRequest',
      'api-request-signature': 'mobile-app-request',
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });

  const responseText = await response.text();
  console.log('[VoiceProxy] Upload response status:', response.status);
  console.log('[VoiceProxy] Upload response body:', responseText.substring(0, 500));

  if (!response.ok) {
    throw new Error(`Upload to elmujib failed: HTTP ${response.status} - ${responseText.substring(0, 300)}`);
  }

  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`Upload response is not JSON: ${responseText.substring(0, 200)}`);
  }

  return data;
}

/**
 * Send media message to contact via elmujib.com API
 */
async function sendMediaMessage(
  authToken: string,
  contactUid: string,
  uploadedData: any,
  caption: string = ''
): Promise<any> {
  const mediaData = {
    message: uploadedData?.data?.message || 'File uploaded successfully.',
    path: uploadedData?.data?.path,
    original_filename: uploadedData?.data?.original_filename,
    fileName: uploadedData?.data?.fileName,
    fileMimeType: uploadedData?.data?.fileMimeType,
    fileExtension: uploadedData?.data?.fileExtension,
    realPath: uploadedData?.data?.realPath,
    incident: uploadedData?.data?.incident,
  };

  const sendPayload = {
    contact_uid: contactUid,
    filepond: 'undefined',
    uploaded_media_file_name: uploadedData?.data?.fileName,
    media_type: 'audio',
    raw_upload_data: JSON.stringify(mediaData),
    caption,
  };

  const sendUrl = `${ELMUJIB_API_URL}vendor/whatsapp/contact/chat/send-media`;
  console.log('[VoiceProxy] Sending media message:', sendUrl);
  console.log('[VoiceProxy] Send payload:', JSON.stringify(sendPayload).substring(0, 500));

  const response = await fetch(sendUrl, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
      'X-Requested-With': 'XMLHttpRequest',
      'api-request-signature': 'mobile-app-request',
    },
    body: JSON.stringify(sendPayload),
  });

  const responseText = await response.text();
  console.log('[VoiceProxy] Send response status:', response.status);
  console.log('[VoiceProxy] Send response body:', responseText.substring(0, 500));

  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`Send response is not JSON: ${responseText.substring(0, 200)}`);
  }

  return data;
}

export function registerVoiceProxyRoutes(app: Router) {
  /**
   * POST /api/voice-proxy/upload-and-send
   * 
   * Complete voice message flow:
   * 1. Receives audio file from client
   * 2. Converts to MP3 via FFmpeg
   * 3. Uploads MP3 to elmujib.com
   * 4. Sends the media message to the contact
   * 
   * Headers required:
   * - Authorization: Bearer <token> (elmujib.com auth token)
   * 
   * Body (multipart/form-data):
   * - audio: the audio file
   * - contact_uid: the contact to send to
   * - caption: optional caption
   * 
   * Response: { success: true, uploadResult, sendResult }
   */
  app.post('/api/voice-proxy/upload-and-send', voiceUpload.single('audio'), async (req, res) => {
    const inputFile = req.file;
    const contactUid = req.body?.contact_uid;
    const caption = req.body?.caption || '';
    const authToken = req.headers.authorization?.replace('Bearer ', '') || '';

    console.log('[VoiceProxy] === START voice-proxy/upload-and-send ===');
    console.log('[VoiceProxy] Contact:', contactUid);
    console.log('[VoiceProxy] Auth token present:', !!authToken);
    console.log('[VoiceProxy] File:', inputFile ? {
      originalname: inputFile.originalname,
      mimetype: inputFile.mimetype,
      size: inputFile.size,
      path: inputFile.path,
    } : 'NONE');

    if (!inputFile) {
      res.status(400).json({ success: false, error: 'No audio file provided' });
      return;
    }

    if (!contactUid) {
      res.status(400).json({ success: false, error: 'No contact_uid provided' });
      return;
    }

    if (!authToken) {
      res.status(401).json({ success: false, error: 'No authorization token provided' });
      return;
    }

    let mp3Path: string | null = null;

    try {
      // Step 1: Convert to MP3
      console.log('[VoiceProxy] Step 1: Converting to MP3...');
      mp3Path = await convertToMp3(inputFile.path);
      console.log('[VoiceProxy] Step 1 done. MP3 path:', mp3Path);

      // Step 2: Upload MP3 to elmujib.com
      console.log('[VoiceProxy] Step 2: Uploading to elmujib.com...');
      const mp3FileName = `voice_${Date.now()}.mp3`;
      const uploadResult = await uploadToElmujib(mp3Path, mp3FileName, authToken);
      console.log('[VoiceProxy] Step 2 done. Upload result:', JSON.stringify(uploadResult).substring(0, 300));

      // Check upload success
      if (uploadResult.reaction !== 1 && uploadResult.reaction !== 21) {
        throw new Error(`Upload rejected by elmujib: ${JSON.stringify(uploadResult).substring(0, 300)}`);
      }

      // Step 3: Send media message
      console.log('[VoiceProxy] Step 3: Sending media message...');
      const sendResult = await sendMediaMessage(authToken, contactUid, uploadResult, caption);
      console.log('[VoiceProxy] Step 3 done. Send result:', JSON.stringify(sendResult).substring(0, 300));

      console.log('[VoiceProxy] === SUCCESS ===');
      res.json({
        success: true,
        uploadResult,
        sendResult,
      });

    } catch (error: any) {
      console.error('[VoiceProxy] === FAILED ===', error.message);
      console.error('[VoiceProxy] Full error:', error);
      
      res.status(500).json({
        success: false,
        error: error.message,
        details: error.stack?.substring(0, 500),
      });
    } finally {
      // Clean up temporary files
      try {
        if (inputFile?.path && fs.existsSync(inputFile.path)) fs.unlinkSync(inputFile.path);
        if (mp3Path && fs.existsSync(mp3Path)) fs.unlinkSync(mp3Path);
      } catch (cleanupErr) {
        console.warn('[VoiceProxy] Cleanup error:', cleanupErr);
      }
    }
  });

  /**
   * POST /api/voice-proxy/upload-only
   * 
   * Just converts and uploads, returns the upload result.
   * Client handles the send-media step separately.
   * 
   * This is useful if the client wants to handle the send step itself
   * (e.g., to add the message to the local chat store first).
   */
  app.post('/api/voice-proxy/upload-only', voiceUpload.single('audio'), async (req, res) => {
    const inputFile = req.file;
    const authToken = req.headers.authorization?.replace('Bearer ', '') || '';

    console.log('[VoiceProxy] === START voice-proxy/upload-only ===');

    if (!inputFile) {
      res.status(400).json({ success: false, error: 'No audio file provided' });
      return;
    }

    if (!authToken) {
      res.status(401).json({ success: false, error: 'No authorization token provided' });
      return;
    }

    let mp3Path: string | null = null;

    try {
      // Step 1: Convert to MP3
      mp3Path = await convertToMp3(inputFile.path);

      // Step 2: Upload MP3 to elmujib.com
      const mp3FileName = `voice_${Date.now()}.mp3`;
      const uploadResult = await uploadToElmujib(mp3Path, mp3FileName, authToken);

      if (uploadResult.reaction !== 1 && uploadResult.reaction !== 21) {
        throw new Error(`Upload rejected: ${JSON.stringify(uploadResult).substring(0, 300)}`);
      }

      res.json({
        success: true,
        data: uploadResult.data,
        reaction: uploadResult.reaction,
      });

    } catch (error: any) {
      console.error('[VoiceProxy] upload-only failed:', error.message);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    } finally {
      try {
        if (inputFile?.path && fs.existsSync(inputFile.path)) fs.unlinkSync(inputFile.path);
        if (mp3Path && fs.existsSync(mp3Path)) fs.unlinkSync(mp3Path);
      } catch (cleanupErr) {
        console.warn('[VoiceProxy] Cleanup error:', cleanupErr);
      }
    }
  });

  console.log('[VoiceProxy] Voice proxy endpoints registered at /api/voice-proxy/*');
}
