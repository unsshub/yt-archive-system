// jest.config.cjs
// Jest configuration for yt-archive-system

module.exports = {
  testEnvironment: 'jsdom',
  setupFiles: [
    './src/__setup__/global-setup.js'
  ],
  moduleNameMapper: {
    '\\.(css|less|scss)$': '<rootDir>/src/__setup__/style-mock.js'
  },
  transform: {},
  testMatch: [
    '**/__tests__/**/*.test.js'
  ],
  collectCoverageFrom: [
    'src/js/**/*.js',
    '!src/__setup__/**'
  ],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60
    }
  }
};