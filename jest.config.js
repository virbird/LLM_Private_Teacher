module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.jest.json' }],
  },
  moduleNameMapper: {
    '^obsidian$': '<rootDir>/tests/__mocks__/obsidian.ts',
    '^sql\\.js/dist/sql-wasm\\.wasm$': '<rootDir>/tests/__mocks__/wasm.ts',
  },
  testMatch: ['**/*.test.ts'],
};
