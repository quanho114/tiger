import type { FC } from 'react'

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
    <div className="flex items-center gap-2">
      {actions.map((action, idx) => (
        <button
          key={idx}
          type="button"
          disabled={disabled}
          onClick={() => onSelectAction(action)}
          className="shrink-0 rounded-full border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-[#173866] transition-colors hover:border-[#ed7328] hover:bg-[#fff7ef] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#173866] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {action}
        </button>
      ))}
    </div>
  )
}
