import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error captured by ErrorBoundary:", error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center p-6 text-center">
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-8 max-w-md w-full">
            <h2 className="text-xl font-semibold text-red-200">Something went wrong</h2>
            <p className="mt-2 text-sm text-slate-400">
              An unexpected error has occurred.
            </p>
            {this.state.error && (
              <div className="mt-4 rounded bg-black/40 p-3 text-left font-mono text-xs text-red-400 overflow-auto max-h-40">
                {this.state.error.message || this.state.error.toString()}
              </div>
            )}
            <button
              onClick={this.handleReload}
              className="mt-6 inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
