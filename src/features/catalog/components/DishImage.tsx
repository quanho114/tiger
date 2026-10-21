import { useState } from 'react'
import type { FC } from 'react'
import type { MenuItem } from '@/features/catalog/legacyMenuItem'
import { PlateFallback } from './PlateFallback'

interface DishImageProps {
  dish: MenuItem
  categoryName?: string
  className?: string
  imgClassName?: string
  isAvailable?: boolean
}

export const DishImage: FC<DishImageProps> = ({
  dish,
  categoryName,
  className = '',
  imgClassName = '',
  isAvailable = true,
}) => {
  const [hasError, setHasError] = useState(false)

  const isRealImage =
    !hasError &&
    dish.image_source !== 'none' &&
    Boolean(dish.image) &&
    dish.image !== '/tiger.svg'

  if (!isRealImage) {
    return (
      <PlateFallback
        name={dish.name}
        category={categoryName}
        className={className}
      />
    )
  }

  return (
    <div className="relative w-full h-full">
      <img
        src={dish.image}
        alt={
          dish.image_source === 'illustration'
            ? `Ảnh minh họa cho món ${dish.name}`
            : dish.name
        }
        onError={() => setHasError(true)}
        loading="lazy"
        decoding="async"
        className={`w-full h-full object-cover transition-transform duration-500 ${
          isAvailable ? 'group-hover:scale-105' : 'grayscale-[40%]'
        } ${imgClassName}`}
      />
      {dish.image_source === 'illustration' && (
        <span
          title="Ảnh stock minh họa, không phải ảnh chụp món thực tế tại Tiger 345"
          className="absolute bottom-2 left-2 rounded-full border border-white/30 bg-black/65 px-2 py-1 text-[9px] font-medium text-white shadow-sm"
        >
          Ảnh minh họa
        </span>
      )}
    </div>
  )
}
