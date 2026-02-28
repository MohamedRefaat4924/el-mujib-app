import { describe, it, expect } from 'vitest';

// ─── Template HTML Parser Tests ─────────────────────────────────────────────

function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<strong>(.*?)<\/strong>/gi, '$1')
    .replace(/<b>(.*?)<\/b>/gi, '$1')
    .replace(/<em>(.*?)<\/em>/gi, '$1')
    .replace(/<i>(.*?)<\/i>/gi, '$1')
    .replace(/<a[^>]*>(.*?)<\/a>/gi, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseTemplateHtml(html: string) {
  const result: {
    headerText?: string;
    headerImageUrl?: string;
    bodyText?: string;
    footerText?: string;
    buttons: Array<{ text: string; url?: string }>;
    isInteractive: boolean;
  } = { buttons: [], isInteractive: false };

  if (!html || html.trim() === '') return result;

  const hasButtons = html.includes('lw-whatsapp-buttons') || html.includes('list-group-item');
  result.isInteractive = hasButtons;

  const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch) result.headerImageUrl = imgMatch[1];

  const footerMatch = html.match(/<div[^>]*class="[^"]*lw-whatsapp-footer[^"]*"[^>]*>(.*?)<\/div>/is);
  if (footerMatch) result.footerText = stripHtml(footerMatch[1]).trim();

  const buttonRegex = /<[^>]*class="[^"]*list-group-item[^"]*"[^>]*>(.*?)<\/(?:a|div|span|li)>/gis;
  let btnMatch;
  while ((btnMatch = buttonRegex.exec(html)) !== null) {
    const btnText = stripHtml(btnMatch[1]).trim();
    if (btnText) {
      const hrefMatch = btnMatch[0].match(/href=["']([^"']+)["']/i);
      result.buttons.push({ text: btnText, url: hrefMatch ? hrefMatch[1] : undefined });
    }
  }

  let bodyHtml = html;
  bodyHtml = bodyHtml.replace(/<div[^>]*class="[^"]*lw-whatsapp-buttons[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
  bodyHtml = bodyHtml.replace(/<div[^>]*class="[^"]*list-group[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
  bodyHtml = bodyHtml.replace(/<div[^>]*class="[^"]*lw-whatsapp-footer[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
  bodyHtml = bodyHtml.replace(/<img[^>]*>/gi, '');
  const bodyText = stripHtml(bodyHtml).trim();
  if (bodyText) result.bodyText = bodyText;

  return result;
}

describe('parseTemplateHtml', () => {
  it('should return empty result for empty HTML', () => {
    const result = parseTemplateHtml('');
    expect(result.buttons).toEqual([]);
    expect(result.isInteractive).toBe(false);
  });

  it('should parse buttons with list-group-item class', () => {
    const html = `
      <div class="card">
        <div>Hello!</div>
        <div class="lw-whatsapp-buttons">
          <a class="list-group-item" href="#">Option 1</a>
          <a class="list-group-item" href="#">Option 2</a>
        </div>
      </div>
    `;
    const result = parseTemplateHtml(html);
    expect(result.isInteractive).toBe(true);
    expect(result.buttons.length).toBe(2);
    expect(result.buttons[0].text).toBe('Option 1');
  });

  it('should extract image URL', () => {
    const html = `<div><img src="https://example.com/img.jpg" /><div>Body</div></div>`;
    const result = parseTemplateHtml(html);
    expect(result.headerImageUrl).toBe('https://example.com/img.jpg');
  });

  it('should extract footer text', () => {
    const html = `<div><div>Body</div><div class="lw-whatsapp-footer">Footer</div></div>`;
    const result = parseTemplateHtml(html);
    expect(result.footerText).toBe('Footer');
  });

  it('should handle plain text template', () => {
    const html = `<div>Simple message</div>`;
    const result = parseTemplateHtml(html);
    expect(result.isInteractive).toBe(false);
    expect(result.buttons.length).toBe(0);
    expect(result.bodyText).toBe('Simple message');
  });
});

// ─── Audio MIME Type Sanitization Tests ─────────────────────────────────────

describe('Audio MIME type sanitization', () => {
  const ACCEPTED_AUDIO_TYPES = ['audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg'];
  const MIME_MAP: Record<string, string> = {
    'audio/m4a': 'audio/mp4',
    'audio/x-m4a': 'audio/mp4',
    'audio/mp4a-latm': 'audio/mp4',
    'audio/wav': 'audio/ogg',
    'audio/x-wav': 'audio/ogg',
    'audio/webm': 'audio/ogg',
    'audio/3gpp': 'audio/amr',
    'audio/3gpp2': 'audio/amr',
  };

  function sanitizeAudioMime(mimeType: string): string {
    if (ACCEPTED_AUDIO_TYPES.includes(mimeType)) return mimeType;
    return MIME_MAP[mimeType] || 'audio/mp4';
  }

  it('should pass through accepted MIME types unchanged', () => {
    expect(sanitizeAudioMime('audio/aac')).toBe('audio/aac');
    expect(sanitizeAudioMime('audio/mp4')).toBe('audio/mp4');
    expect(sanitizeAudioMime('audio/mpeg')).toBe('audio/mpeg');
    expect(sanitizeAudioMime('audio/amr')).toBe('audio/amr');
    expect(sanitizeAudioMime('audio/ogg')).toBe('audio/ogg');
  });

  it('should map audio/m4a to audio/mp4', () => {
    expect(sanitizeAudioMime('audio/m4a')).toBe('audio/mp4');
  });

  it('should map audio/x-m4a to audio/mp4', () => {
    expect(sanitizeAudioMime('audio/x-m4a')).toBe('audio/mp4');
  });

  it('should map audio/wav to audio/ogg', () => {
    expect(sanitizeAudioMime('audio/wav')).toBe('audio/ogg');
  });

  it('should map audio/webm to audio/ogg', () => {
    expect(sanitizeAudioMime('audio/webm')).toBe('audio/ogg');
  });

  it('should map audio/3gpp to audio/amr', () => {
    expect(sanitizeAudioMime('audio/3gpp')).toBe('audio/amr');
  });

  it('should default unknown types to audio/mp4', () => {
    expect(sanitizeAudioMime('audio/unknown')).toBe('audio/mp4');
    expect(sanitizeAudioMime('audio/flac')).toBe('audio/mp4');
  });
});

// ─── Upload Path Tests ──────────────────────────────────────────────────────

describe('Upload path determination', () => {
  const getUploadPath = (label: string) => {
    switch (label) {
      case 'image': return 'media/upload-temp-media/whatsapp_image';
      case 'video': return 'media/upload-temp-media/whatsapp_video';
      case 'document': return 'media/upload-temp-media/whatsapp_document';
      case 'audio': return 'media/upload-temp-media/whatsapp_audio';
      default: return 'media/upload-temp-media/whatsapp_other';
    }
  };

  it('should return correct paths for each media type', () => {
    expect(getUploadPath('image')).toBe('media/upload-temp-media/whatsapp_image');
    expect(getUploadPath('audio')).toBe('media/upload-temp-media/whatsapp_audio');
    expect(getUploadPath('video')).toBe('media/upload-temp-media/whatsapp_video');
    expect(getUploadPath('document')).toBe('media/upload-temp-media/whatsapp_document');
    expect(getUploadPath('other')).toBe('media/upload-temp-media/whatsapp_other');
  });
});

// ─── Quick Reply Management Tests ───────────────────────────────────────────

describe('Quick reply management', () => {
  it('should not add empty replies', () => {
    const replies: string[] = [];
    const addReply = (reply: string) => {
      if (!reply.trim() || reply.length > 200) return;
      if (replies.includes(reply.trim())) return;
      replies.push(reply.trim());
    };
    addReply('');
    addReply('   ');
    expect(replies.length).toBe(0);
  });

  it('should not add duplicate replies', () => {
    const replies: string[] = ['Hello'];
    const addReply = (reply: string) => {
      if (!reply.trim() || reply.length > 200) return;
      if (replies.includes(reply.trim())) return;
      replies.push(reply.trim());
    };
    addReply('Hello');
    expect(replies.length).toBe(1);
  });

  it('should add new unique replies', () => {
    const replies: string[] = ['Hello'];
    const addReply = (reply: string) => {
      if (!reply.trim() || reply.length > 200) return;
      if (replies.includes(reply.trim())) return;
      replies.push(reply.trim());
    };
    addReply('How are you?');
    expect(replies.length).toBe(2);
    expect(replies[1]).toBe('How are you?');
  });

  it('should remove replies correctly', () => {
    let replies = ['Hello', 'How are you?', 'Goodbye'];
    const removeReply = (reply: string) => {
      replies = replies.filter(r => r !== reply);
    };
    removeReply('How are you?');
    expect(replies.length).toBe(2);
    expect(replies).toEqual(['Hello', 'Goodbye']);
  });

  it('should reject replies over 200 characters', () => {
    const replies: string[] = [];
    const addReply = (reply: string) => {
      if (!reply.trim() || reply.length > 200) return;
      replies.push(reply.trim());
    };
    addReply('a'.repeat(201));
    expect(replies.length).toBe(0);
    addReply('a'.repeat(200));
    expect(replies.length).toBe(1);
  });
});

// ─── Saved Voice Message Tests ──────────────────────────────────────────────

describe('Saved voice message management', () => {
  it('should create voice message with required fields', () => {
    const voice = {
      id: `voice_${Date.now()}_abc123`,
      name: 'Greeting',
      uri: 'file:///path/to/recording.mp4',
      duration: 5,
      createdAt: Date.now(),
    };
    expect(voice.id).toBeTruthy();
    expect(voice.name).toBe('Greeting');
    expect(voice.duration).toBe(5);
    expect(voice.uri).toContain('file://');
  });

  it('should add voice messages to the beginning of the list', () => {
    const voices = [
      { id: '1', name: 'First', uri: 'file:///a.mp4', duration: 3, createdAt: 1000 },
    ];
    const newVoice = { id: '2', name: 'Second', uri: 'file:///b.mp4', duration: 5, createdAt: 2000 };
    voices.unshift(newVoice);
    expect(voices[0].name).toBe('Second');
    expect(voices.length).toBe(2);
  });

  it('should remove voice messages by id', () => {
    let voices = [
      { id: '1', name: 'First', uri: 'file:///a.mp4', duration: 3, createdAt: 1000 },
      { id: '2', name: 'Second', uri: 'file:///b.mp4', duration: 5, createdAt: 2000 },
      { id: '3', name: 'Third', uri: 'file:///c.mp4', duration: 7, createdAt: 3000 },
    ];
    voices = voices.filter(v => v.id !== '2');
    expect(voices.length).toBe(2);
    expect(voices.map(v => v.name)).toEqual(['First', 'Third']);
  });

  it('should limit to max 30 saved voice messages', () => {
    let voices = Array.from({ length: 30 }, (_, i) => ({
      id: String(i),
      name: `Voice ${i}`,
      uri: `file:///${i}.mp4`,
      duration: i,
      createdAt: i * 1000,
    }));
    const newVoice = { id: '30', name: 'New', uri: 'file:///30.mp4', duration: 10, createdAt: 31000 };
    voices.unshift(newVoice);
    voices = voices.slice(0, 30);
    expect(voices.length).toBe(30);
    expect(voices[0].name).toBe('New');
  });
});

// ─── stripHtml Tests ────────────────────────────────────────────────────────

describe('stripHtml', () => {
  it('should strip basic HTML tags', () => {
    expect(stripHtml('<b>bold</b>')).toBe('bold');
    expect(stripHtml('<strong>strong</strong>')).toBe('strong');
  });

  it('should decode HTML entities', () => {
    expect(stripHtml('&amp;')).toBe('&');
    expect(stripHtml('&lt;')).toBe('<');
    expect(stripHtml('&gt;')).toBe('>');
    expect(stripHtml('hello&nbsp;world')).toBe('hello world');
  });

  it('should convert br tags to newlines', () => {
    expect(stripHtml('line1<br>line2')).toBe('line1\nline2');
    expect(stripHtml('line1<br/>line2')).toBe('line1\nline2');
  });

  it('should handle empty input', () => {
    expect(stripHtml('')).toBe('');
  });
});
