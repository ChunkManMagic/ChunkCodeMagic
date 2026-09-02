import { Component, ReactNode, ErrorInfo } from 'react';
import { AlertCircle } from 'lucide-react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  onReset?: () => void;
  fallbackTitle?: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, { hasError: boolean; error: Error | null }> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  handleReset = (resetCallback?: () => void) => {
    if (typeof resetCallback === 'function') {
      resetCallback();
    } else if (this.props.onReset) {
      this.props.onReset();
    }
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center bg-zinc-900/50 rounded-3xl border border-red-500/20 backdrop-blur-sm min-h-[300px]">
          <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mb-4 border border-red-500/20">
            <AlertCircle className="w-6 h-6 text-red-500" />
          </div>
          <h2 className="text-xl font-serif text-white mb-2">{this.props.fallbackTitle || "Component Error"}</h2>
          <p className="text-zinc-400 mb-4 max-w-md text-xs">This component encountered an unexpected error.</p>
          
          <div className="flex flex-col sm:flex-row gap-2">
            <button 
              onClick={() => this.handleReset()}
              className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-500 transition-all text-xs"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
