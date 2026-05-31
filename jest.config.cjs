/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ['**/tests/**/*.test.js'],
  transform: {},
  transformIgnorePatterns: [
    'node_modules/(?!(pako)/)',
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  moduleNameMapper: {
    '\\.css$': '<rootDir>/tests/mocks/css.js',
    '\\.html$': '<rootDir>/tests/mocks/html.js',
  },
  verbose: true,
  testTimeout: 10000,
};
