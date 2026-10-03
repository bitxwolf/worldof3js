import { ipcMain } from 'electron';

export function registerSettingsHandlers(): void {
  // Fetch models from any OpenAI-compatible endpoint
  ipcMain.handle('settings:fetch-openai-models', async (_, { baseUrl, apiKey }: {
    baseUrl: string;
    apiKey: string;
  }) => {
    try {
      const url = `${baseUrl.replace(/\/$/, '')}/models`;
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        return { success: false, error: { message: `HTTP ${res.status}: ${res.statusText}` } };
      }
      const json = (await res.json()) as { data?: Array<{ id: string }> };
      const models = (json.data ?? []).map((m) => m.id).sort();
      return { success: true, data: { models } };
    } catch (err) {
      return { success: false, error: { message: err instanceof Error ? err.message : String(err) } };
    }
  });

  // Fetch models from Anthropic
  ipcMain.handle('settings:fetch-anthropic-models', async (_, { apiKey }: { apiKey: string }) => {
    try {
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        return { success: false, error: { message: `HTTP ${res.status}: ${res.statusText}` } };
      }
      const json = (await res.json()) as { data?: Array<{ id: string; display_name?: string }> };
      const models = (json.data ?? []).map((m) => m.id).sort();
      return { success: true, data: { models } };
    } catch (err) {
      return { success: false, error: { message: err instanceof Error ? err.message : String(err) } };
    }
  });
}
