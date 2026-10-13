import React from 'react'

interface PlateFallbackProps {
  name: string
  category?: string
  className?: string
}

export const PlateFallback: React.FC<PlateFallbackProps> = ({
  name,
  category,
  className = '',
}) => {
  return (
    <div
      className={`relative w-full h-full flex flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-[#fbf8f2] to-[#f4ede1] text-[#234386] select-none p-4 ${className}`}
      aria-label={`Món ăn ${name}`}
    >
      {/* Decorative Ceramic Plate SVG */}
      <svg
        className="w-28 h-28 sm:w-32 sm:h-32 drop-shadow-sm transition-transform duration-500 group-hover:scale-105"
        viewBox="0 0 160 160"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Outer Shadow */}
        <circle cx="80" cy="80" r="74" fill="#000000" fillOpacity="0.04" />

        {/* Plate Rim */}
        <circle cx="80" cy="80" r="70" fill="#FDFBF7" stroke="#E6DDCF" strokeWidth="2.5" />

        {/* Decorative Concentric Ring */}
        <circle cx="80" cy="80" r="62" stroke="#234386" strokeOpacity="0.15" strokeWidth="1" strokeDasharray="3 3" />

        {/* Inner Plate Basin */}
        <circle cx="80" cy="80" r="50" fill="#F5EFE6" stroke="#DFD5C5" strokeWidth="1.5" />

        {/* Center Well */}
        <circle cx="80" cy="80" r="32" fill="#EFE8DD" fillOpacity="0.7" />

        {/* Subtle Culinary Motif / Steaming Aroma */}
        <path
          d="M74 68C72 63 76 59 74 54M80 66C78 60 82 56 80 50M86 68C84 63 88 59 86 54"
          stroke="#ED7328"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeOpacity="0.75"
        />

        {/* Chopsticks / Leaf Minimal Icon */}
        <path
          d="M68 96C74 93 86 93 92 96"
          stroke="#234386"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeOpacity="0.4"
        />
        <circle cx="80" cy="84" r="3" fill="#ED7328" fillOpacity="0.8" />
      </svg>

      {/* Dish Name Banner */}
      <div className="mt-3 text-center px-2 z-10 max-w-full">
        <p className="text-xs sm:text-sm font-semibold text-[#234386] line-clamp-1 tracking-tight">
          {name}
        </p>
        {category && (
          <span className="inline-block mt-0.5 text-[10px] uppercase tracking-wider text-[#ed7328] font-medium bg-[#ed7328]/10 px-2 py-0.5 rounded-full">
            {category}
          </span>
        )}
      </div>

      {/* Subtle Tiger 345 Brand Watermark */}
      <div className="absolute bottom-2 right-2 text-[9px] text-[#234386]/30 font-serif tracking-widest pointer-events-none">
        TIGER 345
      </div>
    </div>
  )
}
