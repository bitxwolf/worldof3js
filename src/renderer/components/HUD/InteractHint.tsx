import React from 'react';

export const InteractHint = React.memo(function InteractHint({
  npcName,
  actionText,
}: {
  npcName?: string | null;
  actionText?: string | null;
}) {
  const text = actionText || (npcName ? `Talk to ${npcName}` : null);
  if (!text) return null;

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 pointer-events-none z-20">
      <div className="bg-black/75 backdrop-blur-md border border-gray-700 rounded-xl px-5 py-2.5 text-xs text-white flex items-center gap-2 shadow-2xl">
        <kbd className="bg-gray-800 border border-gray-600 px-2 py-0.5 rounded text-xs font-mono text-emerald-400">
          E
        </kbd>
        <span className="font-medium text-emerald-300">{text}</span>
      </div>
    </div>
  );
});
