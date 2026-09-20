import type { FC } from 'react'
import { HelpCircle } from 'lucide-react'
import type { ClarificationChoicesCardData } from '../types'

interface ClarificationChoicesProps {
  card: ClarificationChoicesCardData
  onSelectChoice: (field: string, value: string) => void
  disabled?: boolean
}

export const ClarificationChoices: FC<ClarificationChoicesProps> = ({
  card,
  onSelectChoice,
  disabled = false,
}) => {
  return (
    <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3.5 space-y-2.5">
      <div className="flex items-start gap-2 text-xs font-semibold text-amber-950">
        <HelpCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
        <span>{card.question}</span>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        {card.choices.map((choice, idx) => (
          <button
            key={idx}
            type="button"
            disabled={disabled}
            onClick={() => onSelectChoice(choice.field, choice.value)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-amber-300/80 text-amber-900 hover:bg-amber-100/60 hover:border-amber-400 active:scale-95 transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {choice.label}
          </button>
        ))}
      </div>
    </div>
  )
}
