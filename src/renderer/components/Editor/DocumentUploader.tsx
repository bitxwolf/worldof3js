import { useState, useRef, useCallback } from 'react';
import { parseDocument } from '../../llm/DocumentParser';
import { useUIStore } from '../../store/uiStore';

interface DocumentUploaderProps {
  onDocumentLoaded: (text: string, filename: string) => void;
  disabled?: boolean;
}

export const DocumentUploader = ({
  onDocumentLoaded,
  disabled = false,
}: DocumentUploaderProps) => {
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [loadedFile, setLoadedFile] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { showNotification } = useUIStore();

  const processTextContent = useCallback(
    async (content: string, filename: string) => {
      if (!content || !content.trim()) {
        setErrorMessage('File is empty or contains no readable text.');
        showNotification('The uploaded story file is empty.', 4000, 'warning');
        return;
      }
      const parsed = await parseDocument(content, filename);
      setLoadedFile(parsed.isChunked ? `${filename} (Condensed)` : filename);
      setErrorMessage(null);
      onDocumentLoaded(parsed.text, filename);
      const chCount = parsed.extractedChapters.length;
      const charCount = parsed.extractedCharacters.length;
      showNotification(
        `Parsed ${filename}: ${chCount} chapters, ${charCount} characters detected.`,
        3500,
        'success'
      );
    },
    [onDocumentLoaded, showNotification]
  );

  const handleOpenClick = useCallback(async () => {
    if (disabled || loading) return;

    // In Electron, use openFileDialog so that native file picking registers path with main process
    if (window.electronAPI?.openFileDialog && window.electronAPI?.readFile) {
      try {
        setLoading(true);
        setErrorMessage(null);
        const res = await window.electronAPI.openFileDialog([
          { name: 'Story Documents', extensions: ['txt', 'md', 'pdf'] },
        ]);

        if (res.success && res.data) {
          const filePath = res.data;
          const filename = filePath.split(/[/\\]/).pop() || 'document';
          const readRes = await window.electronAPI.readFile(filePath);
          if (readRes.success) {
            await processTextContent(readRes.data, filename);
          } else {
            const err = readRes.error.message || 'Failed to read story document';
            setErrorMessage(err);
            showNotification(`File read error: ${err}`, 5000, 'warning');
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMessage(msg);
        showNotification(`Failed to open document: ${msg}`, 4000, 'warning');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Browser fallback: trigger hidden input
    fileInputRef.current?.click();
  }, [disabled, loading, processTextContent, showNotification]);

  const handleFileInputChange = useCallback(
    async (file: File) => {
      try {
        setLoading(true);
        setErrorMessage(null);

        const isPdf = file.name.toLowerCase().endsWith('.pdf');

        // Check if Electron webUtils is available
        const filePath =
          window.electronAPI?.webUtils?.getPathForFile?.(file) ??
          (file as unknown as { path?: string }).path;

        if (filePath && window.electronAPI?.readFile) {
          try {
            const res = await window.electronAPI.readFile(filePath);
            if (res.success && res.data) {
              await processTextContent(res.data, file.name);
              return;
            }
          } catch {
            // IPC read failed, fall through to FileReader fallback
          }
        }

        // Browser mode or restricted IPC path access:
        // For PDF: If running with Electron IPC, read buffer via FileReader and pass to readFile
        if (isPdf) {
          if (window.electronAPI?.readFile) {
            try {
              const buffer = await new Promise<ArrayBuffer | null>((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target?.result as ArrayBuffer);
                reader.onerror = () => resolve(null);
                reader.readAsArrayBuffer(file);
              });
              if (buffer) {
                const res = await (window.electronAPI.readFile as any)({ buffer, ext: '.pdf' });
                if (res.success && res.data) {
                  await processTextContent(res.data, file.name);
                  return;
                }
              }
            } catch {
              // fall through to warning
            }
          }
          setErrorMessage('PDF parsing in browser requires the desktop app. Please use .txt or .md files.');
          showNotification('PDF extraction requires the Electron desktop app. Please use .txt or .md files in browser.', 4000, 'warning');
          return;
        }

        // Standard browser FileReader for text files (readAsText)
        await new Promise<void>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = async (e) => {
            try {
              const content = e.target?.result as string;
              if (content) {
                await processTextContent(content, file.name);
              } else {
                setErrorMessage('Empty file content');
              }
              resolve();
            } catch (err) {
              reject(err);
            }
          };
          reader.onerror = () => {
            setErrorMessage('Failed to read file');
            showNotification('FileReader failed to read the file.', 4000, 'warning');
            resolve();
          };
          reader.readAsText(file);
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMessage(msg);
        console.error('[DocumentUploader] Failed to load document:', err);
      } finally {
        setLoading(false);
      }
    },
    [processTextContent, showNotification]
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (disabled || loading) return;

      const file = e.dataTransfer.files?.[0];
      if (file) {
        await handleFileInputChange(file);
      }
    },
    [disabled, loading, handleFileInputChange]
  );

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-400">Story Document (Optional):</span>
        {loadedFile && !errorMessage && (
          <span className="text-[10px] text-emerald-400 truncate max-w-[160px]">
            ✓ {loadedFile}
          </span>
        )}
        {errorMessage && (
          <span className="text-[10px] text-rose-400 truncate max-w-[160px]" title={errorMessage}>
            ⚠ Error loading file
          </span>
        )}
      </div>

      <div
        onClick={handleOpenClick}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!disabled) setIsDragging(true);
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragging(false);
        }}
        onDrop={handleDrop}
        className={`border border-dashed rounded-xl p-2.5 text-center cursor-pointer transition-colors ${
          disabled
            ? 'opacity-50 cursor-not-allowed border-gray-800'
            : isDragging
            ? 'border-indigo-500 bg-indigo-950/40 text-white'
            : errorMessage
            ? 'border-rose-800/80 hover:border-rose-600 bg-rose-950/20'
            : 'border-gray-800 hover:border-indigo-500/80 bg-gray-900/40'
        }`}
      >
        <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
          <span>{loading ? '⏳' : isDragging ? '📥' : errorMessage ? '⚠️' : '📄'}</span>
          <span>
            {loading
              ? 'Reading document...'
              : isDragging
              ? 'Drop document here'
              : errorMessage
              ? 'Failed to load story (Click to retry)'
              : 'Upload Story (.txt, .md, .pdf)'}
          </span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,.pdf"
          disabled={disabled}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileInputChange(file);
            e.target.value = '';
          }}
          className="hidden"
        />
      </div>
    </div>
  );
};
