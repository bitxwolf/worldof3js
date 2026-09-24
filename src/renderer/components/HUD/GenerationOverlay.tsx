import { useUIStore } from '../../store/uiStore';

const STEPS = [
  'Reading your story',
  'Designing the world',
  'Writing the scene code',
  'Rendering geometry',
  'Summoning characters',
] as const;

export const GenerationOverlay = () => {
  const { isGenerating, pipelineProgress } = useUIStore();

  if (!isGenerating) return null;

  const currentStep = Math.min(Math.floor(pipelineProgress / 20), STEPS.length - 1);

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-950/95 border border-white/10 rounded-2xl p-6 w-80 shadow-2xl space-y-4">
        <h3 className="text-center text-sm font-semibold text-white">BUILDING YOUR WORLD</h3>
        <div className="space-y-2">
          {STEPS.map((step, i) => {
            const isDone = i < currentStep;
            const isCurrent = i === currentStep;
            return (
              <div key={step} className="flex items-center gap-2 text-xs">
                <span className={isDone ? 'text-emerald-400' : isCurrent ? 'text-blue-400 animate-pulse' : 'text-gray-600'}>
                  {isDone ? '✓' : isCurrent ? '◌' : '○'}
                </span>
                <span className={isDone ? 'text-gray-300' : isCurrent ? 'text-white font-medium' : 'text-gray-600'}>
                  {step}{isCurrent ? '...' : ''}
                </span>
              </div>
            );
          })}
        </div>
        <div className="w-full bg-gray-800 rounded-full h-1.5">
          <div
            className="bg-indigo-500 h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${pipelineProgress}%` }}
          />
        </div>
      </div>
    </div>
  );
};
