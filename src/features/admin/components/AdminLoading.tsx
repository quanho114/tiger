import type { FC } from 'react'

interface AdminLoadingProps {
  /** Text shown under the spinner */
  label?: string
  /** Full-screen (route guard / F5) or inline block (in-page initial load) */
  variant?: 'screen' | 'block'
}

/**
 * In-page skeleton for admin child routes.
 * Mirrors the Elera KPI strip + content table geometry to prevent layout shift.
 */
export const AdminPageSkeleton: FC<{ label?: string }> = ({ label }) => {
  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-pulse">
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-6 w-48 bg-[#e8e7e3] rounded-lg" />
          <div className="h-3.5 w-72 bg-[#f0efe9] rounded-md" />
        </div>
        <div className="h-8 w-28 bg-[#e8e7e3] rounded-xl self-start sm:self-auto" />
      </div>

      {/* 4 KPI Cards Skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="bg-white border border-[#e2e3e3] rounded-xl p-4 shadow-2xs space-y-3"
          >
            <div className="h-3 w-24 bg-[#f0efe9] rounded" />
            <div className="h-7 w-32 bg-[#e8e7e3] rounded-md" />
          </div>
        ))}
      </div>

      {/* Filter / Search Bar Skeleton */}
      <div className="bg-white border border-[#e2e3e3] rounded-xl p-4 shadow-2xs space-y-3">
        <div className="h-9 w-full max-w-md bg-[#f0efe9] rounded-lg" />
        <div className="flex gap-2 pt-2 border-t border-[#f2f1ed]">
          <div className="h-6 w-20 bg-[#f0efe9] rounded-md" />
          <div className="h-6 w-24 bg-[#f0efe9] rounded-md" />
          <div className="h-6 w-20 bg-[#f0efe9] rounded-md" />
        </div>
      </div>

      {/* Table / List Skeleton */}
      <div className="bg-white border border-[#e2e3e3] rounded-xl shadow-2xs overflow-hidden">
        <div className="h-10 bg-[#faf9f7] border-b border-[#e2e3e3] px-4 flex items-center justify-between">
          <div className="h-3.5 w-32 bg-[#e8e7e3] rounded" />
          <div className="h-3.5 w-20 bg-[#e8e7e3] rounded" />
        </div>
        <div className="p-4 space-y-4">
          {[1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="flex items-center justify-between gap-4 py-2 border-b border-[#f6f5f3] last:border-0">
              <div className="h-4 w-28 bg-[#f0efe9] rounded" />
              <div className="h-4 w-36 bg-[#f0efe9] rounded hidden sm:block" />
              <div className="h-4 w-24 bg-[#f0efe9] rounded" />
              <div className="h-4 w-16 bg-[#e8e7e3] rounded" />
            </div>
          ))}
        </div>
      </div>

      {label && (
        <p className="text-center text-xs font-medium text-[#787979] pt-2">
          {label}
        </p>
      )}
    </div>
  )
}

/**
 * Full Admin App Shell Skeleton used at RouteGuard / F5 level.
 * Renders the exact sidebar (270px) + topbar (64px) layout with calm shimmer.
 * Prevents the stark white-screen flash and double spinner pop-in on refresh.
 */
export const AdminShellSkeleton: FC<{ label?: string }> = ({ label = 'Đang tải trang quản trị...' }) => {
  return (
    <div className="admin-elera-scope min-h-screen flex flex-col md:flex-row antialiased bg-[#fbf9f6]">
      {/* Sidebar Skeleton (270px) */}
      <aside className="hidden md:flex w-[270px] bg-white border-r border-[#e2e3e3] flex-col shrink-0">
        {/* Brand Header */}
        <div className="h-16 px-4 border-b border-[#e2e3e3] flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#2b2e2c] flex items-center justify-center text-white font-black text-sm">
            T
          </div>
          <div className="space-y-1">
            <div className="h-3.5 w-24 bg-[#e8e7e3] rounded" />
            <div className="h-2.5 w-16 bg-[#f0efe9] rounded" />
          </div>
        </div>

        {/* Navigation Placeholders */}
        <div className="p-3 space-y-6 flex-1">
          <div className="space-y-2">
            <div className="h-2.5 w-16 bg-[#f0efe9] rounded px-1 mb-2" />
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-8 rounded-lg bg-[#f6f5f3] flex items-center px-3 gap-3">
                <div className="w-4 h-4 rounded bg-[#e8e7e3]" />
                <div className="h-3 w-24 bg-[#e8e7e3] rounded" />
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <div className="h-2.5 w-16 bg-[#f0efe9] rounded px-1 mb-2" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 rounded-lg bg-[#f6f5f3] flex items-center px-3 gap-3">
                <div className="w-4 h-4 rounded bg-[#e8e7e3]" />
                <div className="h-3 w-20 bg-[#e8e7e3] rounded" />
              </div>
            ))}
          </div>
        </div>

        {/* User Card Skeleton */}
        <div className="p-3 border-t border-[#e2e3e3]">
          <div className="p-2 rounded-xl bg-[#f6f5f3] border border-[#e2e3e3] flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#7cd56e]/20 border border-[#7cd56e]/40" />
            <div className="space-y-1">
              <div className="h-3 w-20 bg-[#e8e7e3] rounded" />
              <div className="h-2 w-12 bg-[#f0efe9] rounded" />
            </div>
          </div>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar Skeleton (64px) */}
        <header className="h-16 bg-white border-b border-[#e2e3e3] px-4 md:px-8 flex items-center justify-between shrink-0">
          <div className="h-9 w-64 bg-[#f6f5f3] border border-[#d2d2d2]/50 rounded-xl" />
          <div className="flex items-center gap-3">
            <div className="h-6 w-28 bg-[#e4f7c6]/60 rounded-full hidden sm:block" />
            <div className="w-8 h-8 rounded-lg bg-[#f6f5f3] border border-[#e2e3e3]" />
            <div className="w-8 h-8 rounded-full bg-[#7cd56e]/20 border border-[#7cd56e]/40" />
          </div>
        </header>

        {/* Content Skeleton */}
        <main className="flex-1 p-4 md:p-6 lg:p-8">
          <AdminPageSkeleton label={label} />
        </main>
      </div>
    </div>
  )
}

/**
 * Shared loading component.
 * - variant="screen": Renders AdminShellSkeleton so F5 retains full layout geometry.
 * - variant="block": Renders AdminPageSkeleton within the page's existing layout.
 */
export const AdminLoading: FC<AdminLoadingProps> = ({
  label = 'Đang tải dữ liệu...',
  variant = 'block',
}) => {
  if (variant === 'screen') {
    return <AdminShellSkeleton label={label} />
  }

  return <AdminPageSkeleton label={label} />
}
