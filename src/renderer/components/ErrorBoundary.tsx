import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { useUIStore } from '../store/uiStore';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackMessage?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ViewportErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ViewportErrorBoundary] Caught error:', error, info);
  }

  handleRestart = (): void => {
    this.setState({ hasError: false, error: null });
  };

  handleExportLogs = (): void => {
    const logs = useUIStore.getState().ipcLogs;
    const content = logs.length > 0
      ? logs.map((entry) => `[${new Date(entry.timestamp).toISOString()}] ${entry.type.toUpperCase()}: ${entry.text}`).join('\n')
      : 'No logs in store buffer';
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `worldengine-crash-${Date.now()}.log`;
    link.click();
    URL.revokeObjectURL(url);
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex items-center justify-center bg-gray-950">
          <div className="text-center space-y-4 p-8 max-w-md">
            <div className="text-4xl">⚠️</div>
            <h2 className="text-lg font-semibold text-white">The viewport crashed.</h2>
            <p className="text-sm text-gray-400">
              {this.state.error?.message ?? 'An unknown error occurred'}
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={this.handleRestart}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
              >
                Restart Viewport
              </button>
              <button
                onClick={this.handleExportLogs}
                className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium transition-colors"
              >
                Export Logs
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
