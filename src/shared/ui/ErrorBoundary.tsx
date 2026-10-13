import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
  /** In-page layout variant (e.g. inside admin shell) vs full page */
  variant?: 'page' | 'inline';
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  isDetailsOpen: boolean;
  hasCopied: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      isDetailsOpen: false,
      hasCopied: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  handleCopyError = (): void => {
    if (!this.state.error) return;
    const text = `${this.state.error.name}: ${this.state.error.message}\n${this.state.error.stack || ''}`;
    navigator.clipboard?.writeText(text).then(() => {
      this.setState({ hasCopied: true });
      setTimeout(() => this.setState({ hasCopied: false }), 2000);
    });
  };

  toggleDetails = (): void => {
    this.setState((prev) => ({ isDetailsOpen: !prev.isDetailsOpen }));
  };

  render(): ReactNode {
    if (this.state.hasError) {
      const { fallbackTitle, fallbackMessage, variant = 'page' } = this.props;
      const isAdminRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');

      return (
        <div
          className={`flex items-center justify-center p-4 sm:p-6 ${
            variant === 'inline' ? 'py-12' : 'min-h-[55vh]'
          }`}
        >
          <div className="bg-[#fbf9f6] border border-[#e3d6bd] rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-[0_16px_40px_rgba(35,67,134,0.08)] text-center relative overflow-hidden">
            {/* Soft decorative glow */}
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-[#ed7328]/10 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-[#234386]/8 rounded-full blur-2xl pointer-events-none" />

            {/* Icon */}
            <div className="relative w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-700 flex items-center justify-center mx-auto mb-4 shadow-2xs">
              <AlertTriangle className="w-7 h-7" />
            </div>

            {/* Title & Message */}
            <h2 className="font-['Fraunces',serif] text-xl font-bold text-[#171a17] tracking-tight">
              {fallbackTitle || 'Đã xảy ra gián đoạn giao diện'}
            </h2>
            <p className="text-xs text-[#5c5e63] mt-2 leading-relaxed">
              {fallbackMessage ||
                'Trang gặp sự cố không mong muốn trong quá trình kết xuất. Dữ liệu của quý khách vẫn được bảo toàn an toàn.'}
            </p>

            {/* Collapsible Technical Details */}
            {this.state.error && (
              <div className="mt-4 text-left">
                <button
                  type="button"
                  onClick={this.toggleDetails}
                  className="flex items-center justify-between w-full px-3 py-1.5 text-[11px] font-medium text-[#787979] hover:text-[#171a17] hover:bg-[#edece9]/60 rounded-lg transition cursor-pointer"
                >
                  <span>Chi tiết lỗi kỹ thuật</span>
                  {this.state.isDetailsOpen ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>

                {this.state.isDetailsOpen && (
                  <div className="mt-1.5 p-3 bg-white rounded-xl border border-[#e2e3e3] shadow-inner text-[11px] font-mono text-rose-700 max-h-48 overflow-y-auto">
                    <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-[#f0f0ee]">
                      <span className="text-[10px] text-[#8a8f89] font-sans font-medium uppercase tracking-wider">
                        Thông báo lỗi
                      </span>
                      <button
                        type="button"
                        onClick={this.handleCopyError}
                        className="inline-flex items-center gap-1 text-[10px] text-[#234386] hover:underline font-sans cursor-pointer"
                      >
                        {this.state.hasCopied ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span className="text-emerald-600 font-semibold">Đã sao chép</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Sao chép</span>
                          </>
                        )}
                      </button>
                    </div>
                    <p className="break-words font-medium">{this.state.error.message || String(this.state.error)}</p>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={this.handleRetry}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#234386] hover:bg-[#1a3468] text-white text-xs font-semibold rounded-full shadow-xs active:scale-95 transition-all cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Thử tải lại</span>
              </button>
              <a
                href={isAdminRoute ? '/admin' : '/'}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-white hover:bg-[#edece9] text-[#171a17] text-xs font-semibold rounded-full border border-[#d8d5cd] transition-all"
              >
                <Home className="w-3.5 h-3.5 text-[#787979]" />
                <span>{isAdminRoute ? 'Về Bảng điều khiển' : 'Về Trang chủ'}</span>
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
