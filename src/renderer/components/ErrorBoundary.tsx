import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';

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
    const logs = (console as unknown as { _history?: string[] })._history?.join('\n') ?? 'No logs captured';
    const blob = new Blob([logs], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `worldengine-crash-${Date.now()}.txt`;
    link.click();
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
