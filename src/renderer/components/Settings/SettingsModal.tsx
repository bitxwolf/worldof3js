import { useState, useEffect } from 'react';
import { useUIStore } from '../../store/uiStore';
import { transport } from '../../../shared/transport';

const ANTHROPIC_FALLBACK_MODELS = [
  'claude-opus-4-5',
  'claude-opus-5-5',
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
];

export const SettingsModal = () => {
  const { isSettingsOpen, closeSettings } = useUIStore();
  const onClose = closeSettings;

  // Provider selection
  const [activeProvider, setActiveProvider] = useState<'openai' | 'anthropic'>('openai');

  // OpenAI-compatible section
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState('https://openrouter.ai/api/v1');
  const [openaiKey, setOpenaiKey] = useState('');
  const [openaiModels, setOpenaiModels] = useState<string[]>([]);
  const [openaiModel, setOpenaiModel] = useState('');
  const [openaiStatus, setOpenaiStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [openaiError, setOpenaiError] = useState('');

  // Anthropic section
  const [anthropicKey, setAnthropicKey] = useState('');
  const [anthropicModels, setAnthropicModels] = useState<string[]>([]);
  const [anthropicModel, setAnthropicModel] = useState('');
  const [anthropicStatus, setAnthropicStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [anthropicError, setAnthropicError] = useState('');
  const [anthropicStatusMsg, setAnthropicStatusMsg] = useState('');

  // Generation quality
  const [quality, setQuality] = useState<'fast' | 'quality'>('fast');

  // Load saved settings & models on open
  useEffect(() => {
    if (!isSettingsOpen) return;
    (async () => {
      const res = await (window.electronAPI?.getSettings
        ? window.electronAPI.getSettings()
        : transport.getSettings());
      if (res.success && res.data) {
        const s = res.data;
        if (s.activeProvider) setActiveProvider(s.activeProvider);
        if (s.openaiBaseUrl) setOpenaiBaseUrl(s.openaiBaseUrl);
        if (s.openaiApiKey) setOpenaiKey(s.openaiApiKey);
        if (s.anthropicApiKey) setAnthropicKey(s.anthropicApiKey);
        if (s.quality) setQuality(s.quality);

        // OpenAI models restoring
        const savedOpenaiModels = s.openaiModelList ? [...s.openaiModelList] : [];
        if (s.openaiModel && !savedOpenaiModels.includes(s.openaiModel)) {
          savedOpenaiModels.unshift(s.openaiModel);
        }
        if (savedOpenaiModels.length > 0) {
          setOpenaiModels(savedOpenaiModels);
          setOpenaiStatus('ok');
        }
        if (s.openaiModel) {
          setOpenaiModel(s.openaiModel);
        }

        // Anthropic models restoring
        const savedAnthropicModels = s.anthropicModelList ? [...s.anthropicModelList] : [];
        if (s.anthropicModel && !savedAnthropicModels.includes(s.anthropicModel)) {
          savedAnthropicModels.unshift(s.anthropicModel);
        }
        if (savedAnthropicModels.length > 0) {
          setAnthropicModels(savedAnthropicModels);
          setAnthropicStatus('ok');
          setAnthropicStatusMsg(`✓ ${savedAnthropicModels.length} models available`);
        }
        if (s.anthropicModel) {
          setAnthropicModel(s.anthropicModel);
        }
      }
    })();
  }, [isSettingsOpen]);

  if (!isSettingsOpen) return null;

  const fetchOpenAIModels = async () => {
    if (!openaiBaseUrl || !openaiKey) {
      setOpenaiError('Enter base URL and API key first.');
      setOpenaiStatus('error');
      return;
    }
    setOpenaiStatus('loading');
    setOpenaiError('');
    const res = await (window.electronAPI?.fetchOpenAIModels
      ? window.electronAPI.fetchOpenAIModels({ baseUrl: openaiBaseUrl, apiKey: openaiKey })
      : transport.fetchOpenAIModels({ baseUrl: openaiBaseUrl, apiKey: openaiKey }));

    if (res.success && res.data) {
      setOpenaiModels(res.data.models);
      if (!res.data.models.includes(openaiModel)) setOpenaiModel(res.data.models[0] ?? '');
      setOpenaiStatus('ok');
    } else {
      const errMsg = ('error' in res && res.error?.message) || 'Fetch failed';
      setOpenaiError(errMsg);
      setOpenaiStatus('error');
    }
  };

  const fetchAnthropicModels = async () => {
    if (!anthropicKey) {
      setAnthropicError('Enter API key first.');
      setAnthropicStatus('error');
      return;
    }
    setAnthropicStatus('loading');
    setAnthropicError('');
    setAnthropicStatusMsg('');
    const res = await (window.electronAPI?.fetchAnthropicModels
      ? window.electronAPI.fetchAnthropicModels({ apiKey: anthropicKey })
      : transport.fetchAnthropicModels({ apiKey: anthropicKey }));

    if (res.success && res.data) {
      let models = res.data.models;
      if (models.length === 0) {
        models = ANTHROPIC_FALLBACK_MODELS;
        setAnthropicStatusMsg('✓ Using known models (fetch returned empty)');
      } else {
        setAnthropicStatusMsg(`✓ ${models.length} models available`);
      }
      setAnthropicModels(models);
      if (!models.includes(anthropicModel)) setAnthropicModel(models[0] ?? '');
      setAnthropicStatus('ok');
    } else {
      const errMsg = ('error' in res && res.error?.message) || 'Fetch failed';
      setAnthropicError(errMsg);
      setAnthropicStatus('error');
    }
  };

  const handleSave = () => {
    const payload = {
      activeProvider,
      openaiBaseUrl,
      openaiApiKey: openaiKey,
      openaiModel,
      anthropicApiKey: anthropicKey,
      anthropicModel,
      quality,
      openaiModelList: openaiModels,
      anthropicModelList: anthropicModels,
      apiKey: activeProvider === 'anthropic' ? anthropicKey : openaiKey,
      model: activeProvider === 'anthropic' ? anthropicModel : openaiModel,
    };

    if (window.electronAPI?.saveSettings) {
      window.electronAPI.saveSettings(payload);
    } else {
      transport.saveSettings(payload);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-2xl space-y-5 max-h-[92vh] overflow-y-auto custom-scrollbar">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <h2 className="text-lg font-bold text-gray-100 flex items-center gap-2">
            ⚙ Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 transition-colors text-lg"
          >
            ✕
          </button>
        </div>

        {/* Active Provider Toggle */}
        <div className="settings-section">
          <label className="settings-label">ACTIVE PROVIDER</label>
          <div className="provider-toggle">
            <button
              type="button"
              className={activeProvider === 'openai' ? 'active' : ''}
              onClick={() => setActiveProvider('openai')}
            >
              {activeProvider === 'openai' ? '● ' : '○ '}OpenRouter / OpenAI
            </button>
            <button
              type="button"
              className={activeProvider === 'anthropic' ? 'active' : ''}
              onClick={() => setActiveProvider('anthropic')}
            >
              {activeProvider === 'anthropic' ? '● ' : '○ '}Anthropic
            </button>
          </div>
        </div>

        {/* OpenAI-Compatible Section */}
        <div className="settings-card">
          <div className="settings-card-title">OpenRouter / OpenAI Compatible</div>

          <label className="settings-label">Base URL</label>
          <div className="input-row">
            <input
              type="text"
              value={openaiBaseUrl}
              onChange={(e) => setOpenaiBaseUrl(e.target.value)}
              placeholder="https://openrouter.ai/api/v1"
              className="settings-input"
            />
            <button
              type="button"
              onClick={fetchOpenAIModels}
              disabled={openaiStatus === 'loading'}
              className="fetch-btn"
            >
              {openaiStatus === 'loading' ? '...' : 'Fetch'}
            </button>
          </div>

          <label className="settings-label">API Key</label>
          <input
            type="password"
            value={openaiKey}
            onChange={(e) => setOpenaiKey(e.target.value)}
            placeholder="sk-or-v1-..."
            className="settings-input"
          />

          <label className="settings-label">Model</label>
          <select
            value={openaiModel}
            onChange={(e) => setOpenaiModel(e.target.value)}
            className="settings-select"
            disabled={openaiModels.length === 0}
          >
            {openaiModels.length === 0 ? (
              <option value="">— fetch models first —</option>
            ) : (
              openaiModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))
            )}
          </select>

          {/* Status line */}
          {openaiStatus === 'ok' && (
            <span className="status-ok">✓ {openaiModels.length} models available</span>
          )}
          {openaiStatus === 'error' && (
            <span className="status-error">✗ {openaiError}</span>
          )}
        </div>

        {/* Anthropic Section */}
        <div className="settings-card">
          <div className="settings-card-title">Anthropic</div>

          <label className="settings-label">API Key</label>
          <div className="input-row">
            <input
              type="password"
              value={anthropicKey}
              onChange={(e) => setAnthropicKey(e.target.value)}
              placeholder="sk-ant-..."
              className="settings-input"
            />
            <button
              type="button"
              onClick={fetchAnthropicModels}
              disabled={anthropicStatus === 'loading'}
              className="fetch-btn"
            >
              {anthropicStatus === 'loading' ? '...' : 'Fetch'}
            </button>
          </div>

          <label className="settings-label">Model</label>
          <select
            value={anthropicModel}
            onChange={(e) => setAnthropicModel(e.target.value)}
            className="settings-select"
            disabled={anthropicModels.length === 0}
          >
            {anthropicModels.length === 0 ? (
              <option value="">— fetch models first —</option>
            ) : (
              anthropicModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))
            )}
          </select>

          {anthropicStatus === 'ok' && (
            <span className="status-ok">
              {anthropicStatusMsg || `✓ ${anthropicModels.length} models available`}
            </span>
          )}
          {anthropicStatus === 'error' && (
            <span className="status-error">✗ {anthropicError}</span>
          )}
        </div>

        {/* Generation Quality — keep existing */}
        <div className="settings-section">
          <label className="settings-label">Generation Quality</label>
          <div className="quality-toggle">
            <button
              type="button"
              className={quality === 'fast' ? 'active' : ''}
              onClick={() => setQuality('fast')}
            >
              ⚡ Fast
            </button>
            <button
              type="button"
              className={quality === 'quality' ? 'active' : ''}
              onClick={() => setQuality('quality')}
            >
              ✦ High Detail
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="settings-footer">
          <button type="button" onClick={onClose} className="btn-cancel">
            Cancel
          </button>
          <button type="button" onClick={handleSave} className="btn-save">
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};
