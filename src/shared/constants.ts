export const APP_VERSION = '1.0.0';

export const IPC_CHANNELS = {
  // LLM
  LLM_PARSE_WORLD:   'llm:parse-world',
  LLM_GENERATE_CODE: 'llm:generate-code',
  LLM_UPDATE_WORLD:  'llm:update-world',
  LLM_NPC_REPLY:     'llm:npc-reply',
  LLM_ENRICH_WORLD:  'llm:enrich-world',
  LLM_STREAM_CHUNK:  'llm:stream-chunk',
  LLM_STREAM_END:    'llm:stream-end',
  LLM_STREAM_ERROR:  'llm:stream-error',

  // Files
  FILE_OPEN_DIALOG:  'file:open-dialog',
  FILE_READ:         'file:read',
  FILE_SAVE_WORLD:   'file:save-world',
  FILE_LOAD_WORLD:   'file:load-world',
  FILE_EXPORT_HTML:  'file:export-html',

  // Images
  IMAGE_PROCESS:     'image:process',
  IMAGE_PREVIEW:     'image:preview',

  // App
  APP_GET_SETTINGS:  'app:get-settings',
  APP_SAVE_SETTINGS: 'app:save-settings',
  APP_VERSION:       'app:version',
} as const;

export const LIMITS = {
  MAX_PROMPT_LENGTH: 4000,
  MAX_DOC_CHARS: 50000,
  MAX_IMAGE_DIMENSION: 1024,
  MAX_NPC_CONVERSATION_TURNS: 10,
  LLM_TIMEOUT_MS: 30000,
} as const;
