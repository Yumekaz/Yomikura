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
            <h2 className="text-xl font-semibold text-slate-100">We couldn’t open this screen</h2>
            <p className="mt-2 text-sm text-slate-400">
              Try reloading. If the problem continues, you can include the details below when reporting it.
            </p>
            {this.state.error && (
              <details className="yomi-error-details mt-4"><summary>Technical details</summary><pre>{this.state.error.message || this.state.error.toString()}</pre></details>
            )}
            <button
              onClick={this.handleReload}
              className="yomi-button yomi-button-primary mt-6"
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
