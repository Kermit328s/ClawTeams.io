import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^@infra/(.*)$': '<rootDir>/src/infra/$1',
    '^@brain/(.*)$': '<rootDir>/src/brain/$1',
    '^@workflow/(.*)$': '<rootDir>/src/workflow/$1',
    '^@connector/(.*)$': '<rootDir>/src/connector/$1',
    '^@shared/(.*)$': '<rootDir>/src/infra/shared/$1',
  },
};

export default config;
