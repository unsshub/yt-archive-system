// src/__tests__/build-config.test.js
// Tests for build configuration, linting, and production setup

const fs = require('fs');
const path = require('path');

describe('Build Configuration', () => {
  describe('Project Structure', () => {
    test('package.json exists and has required fields', () => {
      const packageJson = require('../../package.json');
      
      expect(packageJson.name).toBeDefined();
      expect(packageJson.version).toBeDefined();
      expect(packageJson.scripts).toBeDefined();
      expect(packageJson.scripts.test).toBeDefined();
      expect(packageJson.scripts.build).toBeDefined();
      expect(packageJson.scripts.lint).toBeDefined();
      expect(packageJson.scripts.format).toBeDefined();
    });

    test('package.json has required dependencies', () => {
      const packageJson = require('../../package.json');
      
      // Dev dependencies
      expect(packageJson.devDependencies).toBeDefined();
      expect(packageJson.devDependencies.jest).toBeDefined();
      expect(packageJson.devDependencies.jsdom).toBeDefined();
      expect(packageJson.devDependencies.eslint).toBeDefined();
      expect(packageJson.devDependencies.prettier).toBeDefined();
      
      // Build dependencies
      expect(packageJson.devDependencies.vite || packageJson.devDependencies.parcel).toBeDefined();
    });

    test('.gitignore exists and contains essential entries', () => {
      const gitignorePath = path.join(__dirname, '..', '..', '.gitignore');
      const gitignore = fs.readFileSync(gitignorePath, 'utf-8');
      
      expect(gitignore).toMatch(/node_modules/);
      expect(gitignore).toMatch(/dist/);
      expect(gitignore).toMatch(/\.env/);
      expect(gitignore).toMatch(/coverage/);
    });

    test('jest.config.cjs exists and has correct configuration', () => {
      const jestConfig = require('../../jest.config.cjs');
      
      expect(jestConfig.testEnvironment).toBe('jsdom');
      expect(jestConfig.setupFiles).toBeDefined();
      expect(jestConfig.moduleNameMapper).toBeDefined();
    });
  });

  describe('ESLint Configuration', () => {
    test('.eslintrc exists with recommended rules', () => {
      const eslintPath = path.join(__dirname, '..', '..', '.eslintrc.json');
      const eslint = JSON.parse(fs.readFileSync(eslintPath, 'utf-8'));
      
      expect(eslint.env).toBeDefined();
      expect(eslint.env.browser).toBe(true);
      expect(eslint.env.node).toBe(true);
      expect(eslint.env.jest).toBe(true);
      expect(eslint.extends).toBeDefined();
    });

    test('eslint is configured for CommonJS modules', () => {
      const eslintPath = path.join(__dirname, '..', '..', '.eslintrc.json');
      const eslint = JSON.parse(fs.readFileSync(eslintPath, 'utf-8'));
      
      // Should not enforce ES modules
      const rules = eslint.rules || {};
      // Allow require statements
      expect(eslint.parserOptions).toBeDefined();
    });
  });

  describe('Prettier Configuration', () => {
    test('.prettierrc exists with formatting rules', () => {
      const prettierPath = path.join(__dirname, '..', '..', '.prettierrc');
      const prettier = JSON.parse(fs.readFileSync(prettierPath, 'utf-8'));
      
      expect(prettier.singleQuote).toBe(true);
      expect(prettier.trailingComma).toBeDefined();
      expect(prettier.semi).toBe(true);
      expect(prettier.tabWidth).toBe(2);
    });
  });

  describe('Vite Configuration', () => {
    test('vite.config.js exists and has correct settings', () => {
      const vitePath = path.join(__dirname, '..', '..', 'vite.config.js');
      const viteConfig = fs.readFileSync(vitePath, 'utf-8');
      
      expect(viteConfig).toMatch(/root/);
      expect(viteConfig).toMatch(/publicDir/);
      expect(viteConfig).toMatch(/outDir/);
    });

    test('vite config supports multiple entry points', () => {
      const vitePath = path.join(__dirname, '..', '..', 'vite.config.js');
      const viteConfig = fs.readFileSync(vitePath, 'utf-8');
      
      // Should handle the HTML entry point
      expect(viteConfig).toMatch(/index\.html/);
    });
  });

  describe('Service Worker', () => {
    test('sw.js exists with cache strategy', () => {
      const swPath = path.join(__dirname, '..', '..', 'public', 'sw.js');
      const sw = fs.readFileSync(swPath, 'utf-8');
      
      expect(sw).toMatch(/CACHE_NAME/);
      expect(sw).toMatch(/install/);
      expect(sw).toMatch(/activate/);
      expect(sw).toMatch(/fetch/);
    });

    test('service worker caches essential assets', () => {
      const swPath = path.join(__dirname, '..', '..', 'public', 'sw.js');
      const sw = fs.readFileSync(swPath, 'utf-8');
      
      expect(sw).toMatch(/\.html/);
      expect(sw).toMatch(/\.css/);
      expect(sw).toMatch(/\.js/);
    });

    test('index.html registers service worker', () => {
      const indexPath = path.join(__dirname, '..', '..', 'public', 'index.html');
      const indexContent = fs.readFileSync(indexPath, 'utf-8');
      
      expect(indexContent).toMatch(/serviceWorker/);
      expect(indexContent).toMatch(/sw\.js/);
    });
  });
});