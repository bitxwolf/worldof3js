import React from 'react';

export const Crosshair = React.memo(function Crosshair({ active }: { active: boolean }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-20">
      <div
        className={`w-2 h-2 rounded-full transition-colors duration-150 ${
          active ? 'bg-emerald-400 shadow-lg shadow-emerald-400/50' : 'bg-white/60'
        }`}
      />
    </div>
  );
});
