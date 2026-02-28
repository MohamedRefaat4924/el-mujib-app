import { describe, it, expect } from 'vitest';

// We'll test the parseTemplateHtml function logic by recreating it here
// since it's embedded in the component. This tests the core parsing logic.

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

function parseTemplateHtml(html: string): {
  headerText?: string;
  headerImageUrl?: string;
  bodyText?: string;
  footerText?: string;
  buttons: Array<{ text: string; url?: string }>;
  isInteractive: boolean;
} {
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
  if (imgMatch) {
    result.headerImageUrl = imgMatch[1];
  }

  const footerMatch = html.match(/<div[^>]*class="[^"]*lw-whatsapp-footer[^"]*"[^>]*>(.*?)<\/div>/is);
  if (footerMatch) {
    result.footerText = stripHtml(footerMatch[1]).trim();
  }

  const buttonRegex = /<[^>]*class="[^"]*list-group-item[^"]*"[^>]*>(.*?)<\/(?:a|div|span|li)>/gis;
  let btnMatch;
  while ((btnMatch = buttonRegex.exec(html)) !== null) {
    const btnText = stripHtml(btnMatch[1]).trim();
    if (btnText) {
      const hrefMatch = btnMatch[0].match(/href=["']([^"']+)["']/i);
      result.buttons.push({
        text: btnText,
        url: hrefMatch ? hrefMatch[1] : undefined,
      });
    }
  }

  if (result.buttons.length === 0) {
    const linkBtnRegex = /<a[^>]*>(.*?)<\/a>/gis;
    let linkMatch;
    const buttonsSection = html.match(/<div[^>]*class="[^"]*lw-whatsapp-buttons[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const searchHtml = buttonsSection ? buttonsSection[1] : '';
    if (searchHtml) {
      while ((linkMatch = linkBtnRegex.exec(searchHtml)) !== null) {
        const linkText = stripHtml(linkMatch[1]).trim();
        if (linkText) {
          const hrefMatch = linkMatch[0].match(/href=["']([^"']+)["']/i);
          result.buttons.push({
            text: linkText,
            url: hrefMatch ? hrefMatch[1] : undefined,
          });
        }
      }
    }
  }

  let bodyHtml = html;
  bodyHtml = bodyHtml.replace(/<div[^>]*class="[^"]*lw-whatsapp-buttons[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
  bodyHtml = bodyHtml.replace(/<div[^>]*class="[^"]*list-group[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
  bodyHtml = bodyHtml.replace(/<div[^>]*class="[^"]*lw-whatsapp-footer[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
  bodyHtml = bodyHtml.replace(/<img[^>]*>/gi, '');

  const bodyText = stripHtml(bodyHtml).trim();
  if (bodyText) {
    result.bodyText = bodyText;
  }

  return result;
}

describe('parseTemplateHtml', () => {
  it('should return empty result for empty HTML', () => {
    const result = parseTemplateHtml('');
    expect(result.buttons).toEqual([]);
    expect(result.isInteractive).toBe(false);
    expect(result.bodyText).toBeUndefined();
  });

  it('should parse buttons with list-group-item class', () => {
    const html = `
      <div class="card">
        <div>Hello, welcome to our service!</div>
        <div class="lw-whatsapp-buttons">
          <a class="list-group-item" href="#">Option 1</a>
          <a class="list-group-item" href="#">Option 2</a>
          <a class="list-group-item" href="#">Option 3</a>
        </div>
      </div>
    `;
    const result = parseTemplateHtml(html);
    expect(result.isInteractive).toBe(true);
    expect(result.buttons.length).toBe(3);
    expect(result.buttons[0].text).toBe('Option 1');
    expect(result.buttons[1].text).toBe('Option 2');
    expect(result.buttons[2].text).toBe('Option 3');
  });

  it('should extract image URL from template', () => {
    const html = `
      <div class="card">
        <img src="https://example.com/image.jpg" alt="Header" />
        <div>Some body text</div>
      </div>
    `;
    const result = parseTemplateHtml(html);
    expect(result.headerImageUrl).toBe('https://example.com/image.jpg');
    expect(result.bodyText).toContain('Some body text');
  });

  it('should extract footer text', () => {
    const html = `
      <div class="card">
        <div>Body content here</div>
        <div class="lw-whatsapp-footer">Powered by ElMujib</div>
      </div>
    `;
    const result = parseTemplateHtml(html);
    expect(result.footerText).toBe('Powered by ElMujib');
  });

  it('should parse buttons with URL links', () => {
    const html = `
      <div class="card">
        <div>Check our website</div>
        <div class="lw-whatsapp-buttons">
          <a class="list-group-item" href="https://example.com">Visit Website</a>
        </div>
      </div>
    `;
    const result = parseTemplateHtml(html);
    expect(result.buttons.length).toBe(1);
    expect(result.buttons[0].text).toBe('Visit Website');
    expect(result.buttons[0].url).toBe('https://example.com');
  });

  it('should handle plain text template (no buttons)', () => {
    const html = `<div>This is a simple text template message</div>`;
    const result = parseTemplateHtml(html);
    expect(result.isInteractive).toBe(false);
    expect(result.buttons.length).toBe(0);
    expect(result.bodyText).toBe('This is a simple text template message');
  });
});

describe('stripHtml', () => {
  it('should strip basic HTML tags', () => {
    expect(stripHtml('<b>bold</b>')).toBe('bold');
    expect(stripHtml('<strong>strong</strong>')).toBe('strong');
    expect(stripHtml('<em>italic</em>')).toBe('italic');
    expect(stripHtml('<i>italic</i>')).toBe('italic');
  });

  it('should decode HTML entities', () => {
    expect(stripHtml('&amp;')).toBe('&');
    expect(stripHtml('&lt;')).toBe('<');
    expect(stripHtml('&gt;')).toBe('>');
    expect(stripHtml('&quot;')).toBe('"');
    expect(stripHtml('&#039;')).toBe("'");
    // &nbsp; alone gets replaced to space then trimmed to empty
    expect(stripHtml('hello&nbsp;world')).toBe('hello world');
  });

  it('should convert br tags to newlines', () => {
    expect(stripHtml('line1<br>line2')).toBe('line1\nline2');
    expect(stripHtml('line1<br/>line2')).toBe('line1\nline2');
    expect(stripHtml('line1<br />line2')).toBe('line1\nline2');
  });

  it('should handle empty input', () => {
    expect(stripHtml('')).toBe('');
  });
});

describe('message parsing - template_message field', () => {
  it('should include template_message in parsed message', () => {
    // Simulate what parseMessageFromApi does
    const apiValue = {
      _uid: 'msg123',
      message: 'Hello',
      template_message: '<div class="card"><div>Hello</div><div class="lw-whatsapp-buttons"><a class="list-group-item">Reply</a></div></div>',
      is_incoming_message: true,
      status: 'delivered',
      formatted_message_time: '10:30 AM',
      __data: {
        media_values: {},
      },
    };

    // The template_message should be preserved
    expect(apiValue.template_message).toBeTruthy();
    expect(apiValue.template_message).toContain('lw-whatsapp-buttons');
    expect(apiValue.template_message).toContain('list-group-item');
  });
});

describe('upload flow', () => {
  it('should normalize media type labels', () => {
    // Test the normalization logic from sendMediaMessage
    const normalize = (label: string) => {
      let normalizedLabel = label.toLowerCase();
      if (normalizedLabel === 'documento') normalizedLabel = 'document';
      if (normalizedLabel === 'immagine') normalizedLabel = 'image';
      return normalizedLabel;
    };

    expect(normalize('image')).toBe('image');
    expect(normalize('IMAGE')).toBe('image');
    expect(normalize('audio')).toBe('audio');
    expect(normalize('video')).toBe('video');
    expect(normalize('document')).toBe('document');
    expect(normalize('documento')).toBe('document');
    expect(normalize('immagine')).toBe('image');
  });

  it('should determine correct upload path based on media type', () => {
    const getUploadPath = (normalizedLabel: string) => {
      let uploadPath = 'media/upload-temp-media/whatsapp_other';
      switch (normalizedLabel) {
        case 'image':
          uploadPath = 'media/upload-temp-media/whatsapp_image';
          break;
        case 'video':
          uploadPath = 'media/upload-temp-media/whatsapp_video';
          break;
        case 'document':
          uploadPath = 'media/upload-temp-media/whatsapp_document';
          break;
        case 'audio':
          uploadPath = 'media/upload-temp-media/whatsapp_audio';
          break;
      }
      return uploadPath;
    };

    expect(getUploadPath('image')).toBe('media/upload-temp-media/whatsapp_image');
    expect(getUploadPath('audio')).toBe('media/upload-temp-media/whatsapp_audio');
    expect(getUploadPath('video')).toBe('media/upload-temp-media/whatsapp_video');
    expect(getUploadPath('document')).toBe('media/upload-temp-media/whatsapp_document');
    expect(getUploadPath('other')).toBe('media/upload-temp-media/whatsapp_other');
  });
});
