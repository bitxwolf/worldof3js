import type { ZodIssue } from 'zod';

export class SceneBuildError extends Error {
  constructor(public override message: string, public readonly code: string) {
    super(message);
    this.name = 'SceneBuildError';
  }
}

export class LLMParseError extends Error {
  constructor(public override message: string, public readonly raw: string) {
    super(message);
    this.name = 'LLMParseError';
  }
}

export class ValidationError extends Error {
  constructor(public override message: string, public readonly issues: ZodIssue[]) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class APIKeyMissingError extends Error {
  constructor() {
    super('Claude API key is not set. Open Settings to add your key.');
    this.name = 'APIKeyMissingError';
  }
}
