import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNPCStore } from '../../store/npcStore';

export const DialogueBox = React.memo(function DialogueBox({
  npcName,
  npcGreeting,
  onSendMessage,
  onClose,
  streamingText,
  isStreaming,
}: {
  npcName: string;
  npcGreeting?: string;
  onSendMessage: (message: string) => void;
  onClose: () => void;
  streamingText: string;
  isStreaming: boolean;
}) {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { dialogueHistory } = useNPCStore();
  const npcId = useNPCStore((s) => s.activeNPC?.id ?? '');
  const history = dialogueHistory[npcId] || [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, streamingText]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [isStreaming]);

  const handleSend = useCallback(() => {
    const msg = inputText.trim();
    if (!msg || isStreaming) return;
    onSendMessage(msg);
    setInputText('');
  }, [inputText, isStreaming, onSendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSend();
      }
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [handleSend, onClose]
  );

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 pointer-events-auto">
      <div className="max-w-2xl mx-auto mb-4 bg-gray-950/90 backdrop-blur-xl border border-gray-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800 bg-gray-900/80">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-sm font-semibold text-white">{npcName}</span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-gray-800 transition-colors"
          >
            Esc to close
          </button>
        </div>

        {/* Messages */}
        <div className="max-h-48 overflow-y-auto px-4 py-3 space-y-2.5 text-sm">
          {npcGreeting && history.length === 0 && (
            <div className="text-gray-300 italic text-xs">
              &ldquo;{npcGreeting}&rdquo;
            </div>
          )}
          {history.map((msg, i) => (
            <div
              key={i}
              className={`${
                msg.sender === 'player'
                  ? 'text-indigo-300 text-right'
                  : 'text-gray-200'
              }`}
            >
              <span className="text-[10px] text-gray-500 mr-1">
                {msg.sender === 'player' ? 'You' : npcName}:
              </span>
              {msg.text}
            </div>
          ))}
          {isStreaming && streamingText && (
            <div className="text-gray-200">
              <span className="text-[10px] text-gray-500 mr-1">{npcName}:</span>
              {streamingText}
              <span className="animate-pulse">▌</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-gray-800 flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isStreaming ? 'Waiting for reply...' : 'Say something...'}
            disabled={isStreaming}
            className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!inputText.trim() || isStreaming}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
});
