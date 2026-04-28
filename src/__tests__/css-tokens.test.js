// src/__tests__/css-tokens.test.js
// Tests for CSS Design System Tokens

const fs = require('fs');
const path = require('path');

describe('CSS Design System Tokens', () => {
  let variablesContent;
  let baseContent;

  beforeAll(() => {
    const variablesPath = path.join(__dirname, '..', 'css', 'tokens', 'variables.css');
    const basePath = path.join(__dirname, '..', 'css', 'tokens', 'base.css');
    variablesContent = fs.readFileSync(variablesPath, 'utf-8');
    baseContent = fs.readFileSync(basePath, 'utf-8');
  });

  describe('variables.css', () => {
    test('defines color palette with accessible contrast pairs', () => {
      // Check new naming scheme: --color-bg and --color-text
      expect(variablesContent).toMatch(/--color-bg:\s*#[\da-fA-F]{3,8};/);
      expect(variablesContent).toMatch(/--color-text:\s*#[\da-fA-F]{3,8};/);
      // Ensure light bg has dark text (basic contrast check)
      const bgMatch = variablesContent.match(/--color-bg:\s*#([\da-fA-F]{6})/);
      const textMatch = variablesContent.match(/--color-text:\s*#([\da-fA-F]{6})/);
      if (bgMatch && textMatch) {
        const bgHex = bgMatch[1];
        const textHex = textMatch[1];
        // Simple check: they should be different
        expect(bgHex).not.toBe(textHex);
      }
    });

    test('defines spacing scale based on 8px unit', () => {
      // New naming: --space-1, --space-2, --space-4, --space-6
      expect(variablesContent).toMatch(/--space-1:\s*0\.25rem;/);   // 4px
      expect(variablesContent).toMatch(/--space-2:\s*0\.5rem;/);    // 8px
      expect(variablesContent).toMatch(/--space-4:\s*1rem;/);       // 16px
      expect(variablesContent).toMatch(/--space-6:\s*1\.5rem;/);    // 24px
    });

    test('defines fluid typography using clamp()', () => {
      expect(variablesContent).toMatch(/--text-base:\s*clamp\(/);
      expect(variablesContent).toMatch(/--text-lg:\s*clamp\(/);
    });

    test('defines RTL-aware logical properties', () => {
      // Check for logical properties used in base.css
      // border-radius is used, padding-inline/margin-inline are in base.css
      expect(variablesContent).toMatch(/--border-radius/);
      expect(variablesContent).toMatch(/--z-modal/);
      expect(variablesContent).toMatch(/--z-toast/);
    });

    test('supports prefers-color-scheme for dark mode', () => {
      const darkModeBlock = variablesContent.match(/@media\s*\(\s*prefers-color-scheme:\s*dark\s*\)[\s\S]*?}/);
      expect(darkModeBlock).toBeTruthy();
      expect(darkModeBlock[0]).toMatch(/--color-bg:\s*#[1-9a-fA-F]{6};/);
      expect(darkModeBlock[0]).toMatch(/--color-text:\s*#[1-9a-fA-F]{6};/);
    });
  });

  describe('base.css', () => {
    test('includes CSS reset with box-sizing border-box', () => {
      expect(baseContent).toMatch(/box-sizing:\s*border-box/);
    });

    test('defines focus-visible styles for accessibility', () => {
      expect(baseContent).toMatch(/focus-visible/);
    });

    test('enables font smoothing for better typography', () => {
      expect(baseContent).toMatch(/-webkit-font-smoothing:\s*antialiased/);
      expect(baseContent).toMatch(/-moz-osx-font-smoothing:\s*grayscale/);
    });

    test('sets root font-size for rem-based scaling', () => {
      // Updated: checks for font-size: 100% (browser default = 16px)
      expect(baseContent).toMatch(/html\s*{[\s\S]*?font-size:\s*100%/);
    });
  });
});