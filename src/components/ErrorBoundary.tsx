import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-[50vh] flex items-center justify-center p-6">
          <div className="bg-stone-900 border border-stone-800 text-stone-100 rounded-2xl p-6 sm:p-8 max-w-lg w-full shadow-2xl text-center">
            <div className="w-12 h-12 rounded-full bg-rose-950/80 border border-rose-800 text-rose-400 flex items-center justify-center mx-auto mb-4 text-xl">
              ⚠️
            </div>
            <h2 className="text-lg font-bold text-stone-100 tracking-tight">
              {this.props.fallbackTitle || 'Đã xảy ra lỗi giao diện'}
            </h2>
            <p className="text-xs text-stone-400 mt-2 leading-relaxed">
              {this.props.fallbackMessage ||
                'Trang gặp sự cố không mong muốn trong quá trình kết xuất. Vui lòng thử tải lại hoặc liên hệ kỹ thuật.'}
            </p>

            {this.state.error && (
              <div className="mt-4 p-3 bg-stone-950 rounded-lg border border-stone-800 text-left overflow-x-auto">
                <p className="text-[11px] font-mono text-rose-300 break-words">
                  {this.state.error.message || String(this.state.error)}
                </p>
              </div>
            )}

            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={this.handleRetry}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs rounded-lg transition shadow-sm cursor-pointer"
              >
                Tải lại trang
              </button>
              <a
                href="/"
                className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-semibold rounded-lg transition border border-stone-700"
              >
                Về Trang chủ
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
