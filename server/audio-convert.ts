/**
 * Audio Conversion Endpoint
 * 
 * Converts uploaded audio files to real OGG format (Opus codec) using FFmpeg.
 * This ensures the audio file is in a genuine OGG container that the WhatsApp
 * API server accepts, rather than just renaming the extension.
 * 
 * Flow:
 * 1. Client records audio (AAC/M4A format from expo-audio)
 * 2. Client uploads to this endpoint
 * 3. Server converts to OGG/Opus using FFmpeg
 * 4. Server returns the converted file as base64 or streams it back
 * 5. Client then uploads the real OGG to elmujib.com's upload endpoint
 */

import { Router } from 'express';
import multer from 'multer';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execFileAsync = promisify(execFile);

// Configure multer for temporary file storage
const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, `audio-${uniqueSuffix}${path.extname(file.originalname) || '.m4a'}`);
    },
  }),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
  },
});

export function registerAudioConvertRoutes(app: Router) {
  /**
   * POST /api/convert-audio
   * 
   * Accepts an audio file upload and converts it to OGG (Opus codec).
   * Returns the converted file as a downloadable response.
   * 
   * Request: multipart/form-data with field 'audio'
   * Response: application/ogg binary file
   */
  app.post('/api/convert-audio', upload.single('audio'), async (req, res) => {
    const inputFile = req.file;
    
    if (!inputFile) {
      res.status(400).json({ error: 'No audio file provided' });
      return;
    }

    const inputPath = inputFile.path;
    const outputPath = inputPath.replace(/\.[^.]+$/, '.ogg');

    console.log('[AudioConvert] Input:', {
      originalName: inputFile.originalname,
      mimeType: inputFile.mimetype,
      size: inputFile.size,
      inputPath,
      outputPath,
    });

    try {
      // Convert to OGG with Opus codec using FFmpeg
      // -i: input file
      // -c:a libopus: use Opus audio codec (best for voice in OGG container)
      // -b:a 64k: 64kbps bitrate (good quality for voice)
      // -ar 48000: 48kHz sample rate (Opus standard)
      // -ac 1: mono channel (voice messages are mono)
      // -application voip: optimize for voice
      // -y: overwrite output
      const { stdout, stderr } = await execFileAsync('ffmpeg', [
        '-i', inputPath,
        '-c:a', 'libopus',
        '-b:a', '64k',
        '-ar', '48000',
        '-ac', '1',
        '-application', 'voip',
        '-y',
        outputPath,
      ], {
        timeout: 30000, // 30 second timeout
      });

      console.log('[AudioConvert] FFmpeg stdout:', stdout);
      if (stderr) {
        console.log('[AudioConvert] FFmpeg stderr (last 500 chars):', stderr.slice(-500));
      }

      // Verify the output file exists and has content
      const stats = fs.statSync(outputPath);
      console.log('[AudioConvert] Output file size:', stats.size, 'bytes');

      if (stats.size === 0) {
        throw new Error('FFmpeg produced an empty output file');
      }

      // Read the converted file and send as base64
      const convertedBuffer = fs.readFileSync(outputPath);
      const base64Data = convertedBuffer.toString('base64');

      res.json({
        success: true,
        data: base64Data,
        mimeType: 'audio/ogg',
        fileName: inputFile.originalname.replace(/\.[^.]+$/, '.ogg'),
        originalSize: inputFile.size,
        convertedSize: stats.size,
      });

    } catch (error: any) {
      console.error('[AudioConvert] Conversion failed:', error.message);
      console.error('[AudioConvert] Full error:', error);
      
      res.status(500).json({
        error: 'Audio conversion failed',
        details: error.message,
      });
    } finally {
      // Clean up temporary files
      try {
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      } catch (cleanupErr) {
        console.warn('[AudioConvert] Cleanup error:', cleanupErr);
      }
    }
  });

  console.log('[AudioConvert] Audio conversion endpoint registered at /api/convert-audio');
}
