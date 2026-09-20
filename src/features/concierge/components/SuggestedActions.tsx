import type { FC } from 'react'
import { Sparkles } from 'lucide-react'

interface SuggestedActionsProps {
  actions: string[]
  onSelectAction: (action: string) => void
  disabled?: boolean
}

export const SuggestedActions: FC<SuggestedActionsProps> = ({
  actions,
  onSelectAction,
  disabled = false,
}) => {
  if (!actions || actions.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1">
      <span className="text-[10px] font-semibold text-stone-600 uppercase tracking-wider flex items-center gap-1">
        <Sparkles className="w-3 h-3 text-amber-500" />
        Gợi ý:
      </span>
      {actions.map((action, idx) => (
        <button
          key={idx}
          type="button"
          disabled={disabled}
          onClick={() => onSelectAction(action)}
          className="text-xs px-2.5 py-1 rounded-full bg-stone-100 hover:bg-amber-100 hover:text-amber-900 text-stone-700 font-medium transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed border border-stone-200/60"
        >
          {action}
        </button>
      ))}
    </div>
  )
}
