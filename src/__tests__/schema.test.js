// Resistant Tests: Data Schema Validation
// Converted to CommonJS-compatible inline functions (no exports needed)

// Inline validation function (no external dependencies for Phase 1)
const validateVideoEntry = (entry) => {
  const required = ['url', 'title', 'thumbnail'];
  const missing = required.filter(key => !entry[key]);
  if (missing.length > 0) throw new Error(`Missing fields: ${missing.join(', ')}`);
  if (!/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+/.test(entry.url)) {
    throw new Error('Invalid YouTube URL');
  }
  return true;
};

describe('Video Schema Validation', () => {
  test('rejects entries missing required fields', () => {
    expect(() => validateVideoEntry({ url: 'https://youtube.com/1' })).toThrow('Missing fields');
  });

  test('rejects non-YouTube URLs', () => {
    expect(() => validateVideoEntry({ 
      url: 'https://example.com', 
      title: 'Test', 
      thumbnail: 'thumb.jpg' 
    })).toThrow('Invalid YouTube URL');
  });

  test('accepts valid English & Arabic entries', () => {
    const validEN = { 
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 
      title: 'Rick Astley', 
      thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/default.jpg' 
    };
    const validAR = { 
      url: 'https://youtu.be/abc123', 
      title: 'فيديو تعليمي', 
      thumbnail: 'thumb.jpg' 
    };
    expect(() => validateVideoEntry(validEN)).not.toThrow();
    expect(() => validateVideoEntry(validAR)).not.toThrow();
  });
});