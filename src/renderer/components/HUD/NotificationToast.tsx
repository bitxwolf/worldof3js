import { useUIStore, type ToastNotification } from '../../store/uiStore';

export const NotificationToast = () => {
  const { notifications, dismissNotification } = useUIStore();

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-2 pointer-events-none">
      {notifications.map((n: ToastNotification) => {
        let badgeColor = 'bg-indigo-600/90 border-indigo-400/50 text-indigo-100';
        let icon = '💬';

        if (n.type === 'success') {
          badgeColor = 'bg-emerald-900/90 border-emerald-500/50 text-emerald-100';
          icon = '✨';
        } else if (n.type === 'warning') {
          badgeColor = 'bg-amber-900/90 border-amber-500/50 text-amber-100';
          icon = '⚠️';
        }

        return (
          <div
            key={n.id}
            onClick={() => dismissNotification(n.id)}
            className={`pointer-events-auto backdrop-blur-md border px-4 py-2.5 rounded-xl shadow-2xl text-xs flex items-center gap-2.5 transition-all animate-bounce cursor-pointer max-w-md ${badgeColor}`}
          >
            <span>{icon}</span>
            <span className="font-medium leading-relaxed">{n.message}</span>
          </div>
        );
      })}
    </div>
  );
};
