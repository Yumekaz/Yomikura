import React, { Component, ErrorInfo, ReactNode } from "react";
import { Link } from "react-router-dom";

interface Props {
  children: ReactNode;
  resetKey: string;
}

interface State {
  error: Error | null;
  resetKey: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    error: null,
    resetKey: this.props.resetKey,
  };

  public static getDerivedStateFromProps({ resetKey }: Props, state: State) {
    return resetKey === state.resetKey ? null : { resetKey, error: null };
  }

  public static getDerivedStateFromError(error: Error) {
    return { error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error captured by ErrorBoundary:", error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.error) {
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
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button onClick={this.handleReload} className="yomi-button yomi-button-primary">Reload page</button>
              <Link to="/library" replace className="yomi-button yomi-button-secondary">Open library</Link>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
