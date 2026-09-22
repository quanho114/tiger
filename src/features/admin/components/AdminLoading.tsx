import type { FC } from 'react'

interface AdminLoadingProps {
  /** Text shown under the spinner */
  label?: string
  /** Full-screen (route guard / F5) or inline block (in-page initial load) */
  variant?: 'screen' | 'block'
}

/**
 * Single shared loading indicator for the whole admin console.
 * Amber spinner on light stone — matches the admin brand, no more
 * mismatched green/blue spinners between pages.
 */
export const AdminLoading: FC<AdminLoadingProps> = ({
  label = 'Đang tải dữ liệu...',
  variant = 'block',
}) => {
  if (variant === 'screen') {
    // No background of its own: the cream paper body shows through,
    // so guard -> suspense -> page loaders share one seamless backdrop.
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-stone-500">
        <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium tracking-wide">{label}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center py-24">
      <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mb-3" />
      <p className="text-xs font-medium text-stone-500">{label}</p>
    </div>
  )
}
