import { useState, useRef, useCallback } from 'react';

interface DocumentUploaderProps {
  onDocumentLoaded: (text: string, filename: string) => void;
  disabled?: boolean;
}

export const DocumentUploader = ({
  onDocumentLoaded,
  disabled = false,
}: DocumentUploaderProps) => {
  const [loading, setLoading] = useState(false);
  const [loadedFile, setLoadedFile] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = useCallback(
    async (file: File) => {
      try {
        setLoading(true);
        // If Electron API is available with path, use readFile for PDF parsing support
        const filePath =
          window.electronAPI?.webUtils?.getPathForFile?.(file) ??
          (file as unknown as { path?: string }).path;
        if (filePath && window.electronAPI?.readFile) {
          const res = await window.electronAPI.readFile(filePath);
          if (res.success && res.data) {
            setLoadedFile(file.name);
            onDocumentLoaded(res.data, file.name);
            return;
          }
        }

        // Web fallback: FileReader for text files
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          if (content) {
            setLoadedFile(file.name);
            onDocumentLoaded(content, file.name);
          }
        };
        reader.readAsText(file);
      } catch (err) {
        console.error('[DocumentUploader] Failed to load document:', err);
      } finally {
        setLoading(false);
      }
    },
    [onDocumentLoaded]
  );

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-400">Story Document (Optional):</span>
        {loadedFile && (
          <span className="text-[10px] text-emerald-400 truncate max-w-[160px]">
            ✓ {loadedFile}
          </span>
        )}
      </div>

      <div
        onClick={() => !disabled && fileInputRef.current?.click()}
        className={`border border-dashed rounded-xl p-2.5 text-center cursor-pointer transition-colors ${
          disabled
            ? 'opacity-50 cursor-not-allowed border-gray-800'
            : 'border-gray-800 hover:border-indigo-500/80 bg-gray-900/40'
        }`}
      >
        <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
          <span>📄</span>
          <span>{loading ? 'Reading document...' : 'Upload Story (.txt, .md, .pdf)'}</span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,.pdf"
          disabled={disabled}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileChange(file);
          }}
          className="hidden"
        />
      </div>
    </div>
  );
};
