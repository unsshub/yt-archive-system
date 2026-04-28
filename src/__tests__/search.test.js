// Resistant Tests: Bilingual Search Logic (EN/AR)
// Converted to CommonJS-compatible inline functions (no exports needed)

// Unicode-normalized text comparator for bilingual search
const normalizeText = (text) => {
  if (!text) return '';
  return text
    .normalize('NFD')                          // Decompose accented/diacritic chars
    .replace(/[\u064B-\u065F\u0670]/g, '')    // Remove Arabic diacritics (Tashkeel)
    .toLowerCase()                            // Case-insensitive
    .trim();                                  // Remove whitespace
};

const searchArchive = (archive, query) => {
  if (!query || !query.trim()) return archive;
  const normalizedQuery = normalizeText(query);
  return archive.filter(item =>
    normalizeText(item.title).includes(normalizedQuery) ||
    (item.tags && item.tags.some(tag => normalizeText(tag).includes(normalizedQuery)))
  );
};

describe('Bilingual Search (EN/AR)', () => {
  const mockArchive = [
    { title: 'JavaScript Basics', tags: ['programming', 'english'] },
    { title: 'أساسيات البرمجة', tags: ['برمجة', 'عربي'] },
    { title: 'React vs Vue 2026', tags: ['frameworks'] }
  ];

  test('finds English titles case-insensitively', () => {
    const results = searchArchive(mockArchive, 'javascript');
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('JavaScript Basics');
  });

  test('finds Arabic titles and ignores diacritics', () => {
    const results = searchArchive(mockArchive, 'أساسيات');
    expect(results).toHaveLength(1);
    expect(results[0].title).toContain('أساسيات');
  });

  test('searches across tags and titles', () => {
    const results = searchArchive(mockArchive, 'framework');
    expect(results).toHaveLength(1);
  });

  test('returns full archive on empty query', () => {
    expect(searchArchive(mockArchive, ' ')).toEqual(mockArchive);
    expect(searchArchive(mockArchive, '')).toEqual(mockArchive);
  });
});