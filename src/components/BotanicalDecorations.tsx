import type { FC } from 'react';

// Hand-drawn botanical olive/tea leaf sprig SVG
export const BotanicalBranch: FC<{ className?: string; color?: string }> = ({ 
  className = '', 
  color = '#4a6741' 
}) => (
  <svg 
    viewBox="0 0 160 160" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {/* Central Stem */}
    <path 
      d="M15 145 C 45 110, 80 70, 140 20" 
      stroke={color} 
      strokeWidth="2.5" 
      strokeLinecap="round" 
    />
    {/* Leaves */}
    <path 
      d="M140 20 C 135 5, 120 0, 115 12 C 110 24, 128 25, 140 20 Z" 
      fill={color} 
      opacity="0.85" 
    />
    <path 
      d="M110 42 C 92 35, 78 40, 82 52 C 86 64, 102 52, 110 42 Z" 
      fill={color} 
      opacity="0.8" 
    />
    <path 
      d="M95 55 C 105 40, 125 45, 122 60 C 119 72, 102 62, 95 55 Z" 
      fill={color} 
      opacity="0.85" 
    />
    <path 
      d="M75 75 C 55 70, 45 82, 52 92 C 60 102, 72 85, 75 75 Z" 
      fill={color} 
      opacity="0.75" 
    />
    <path 
      d="M62 88 C 72 72, 92 80, 88 95 C 84 105, 68 96, 62 88 Z" 
      fill={color} 
      opacity="0.85" 
    />
    <path 
      d="M42 110 C 25 108, 20 122, 28 130 C 38 138, 45 120, 42 110 Z" 
      fill={color} 
      opacity="0.7" 
    />
    <path 
      d="M32 125 C 42 110, 60 120, 55 132 C 50 142, 38 132, 32 125 Z" 
      fill={color} 
      opacity="0.8" 
    />
  </svg>
);

// Botanical single sprig for corner accents
export const BotanicalSprig: FC<{ className?: string; color?: string }> = ({ 
  className = '', 
  color = '#4a6741' 
}) => (
  <svg 
    viewBox="0 0 100 100" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path 
      d="M10 90 Q 40 50, 90 10" 
      stroke={color} 
      strokeWidth="2" 
      strokeLinecap="round" 
    />
    <path d="M90 10 C 75 8, 65 18, 72 26 C 80 32, 88 20, 90 10 Z" fill={color} opacity="0.8" />
    <path d="M60 40 C 45 35, 40 45, 48 52 C 55 58, 62 48, 60 40 Z" fill={color} opacity="0.75" />
    <path d="M50 50 C 58 38, 70 42, 68 55 C 65 65, 54 58, 50 50 Z" fill={color} opacity="0.85" />
    <path d="M30 70 C 18 68, 16 78, 22 84 C 28 88, 35 78, 30 70 Z" fill={color} opacity="0.7" />
  </svg>
);

// Hand-drawn playful curved arrow pointing from script note to target
export const HandDrawnArrow: FC<{ className?: string; color?: string; flip?: boolean }> = ({
  className = '',
  color = '#ed7328',
  flip = false,
}) => (
  <svg
    viewBox="0 0 60 40"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`${className} ${flip ? 'scale-x-[-1]' : ''}`}
  >
    <path
      d="M10 12 C 25 8, 42 16, 48 30"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeDasharray="2 0"
    />
    <path
      d="M38 28 L 48 31 L 49 20"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// Golden stardust / dots accent
export const StarDustDots: FC<{ className?: string }> = ({ className = '' }) => (
  <svg 
    viewBox="0 0 80 80" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg" 
    className={className}
  >
    <circle cx="20" cy="15" r="2.5" fill="#ed7328" opacity="0.7" />
    <circle cx="35" cy="28" r="1.5" fill="#ffc400" />
    <circle cx="15" cy="40" r="2" fill="#ed7328" opacity="0.6" />
    <circle cx="50" cy="20" r="3" fill="#ffc400" opacity="0.8" />
    <circle cx="65" cy="35" r="2" fill="#ed7328" opacity="0.7" />
    <circle cx="45" cy="50" r="2.5" fill="#ffc400" />
    <circle cx="30" cy="65" r="1.5" fill="#ed7328" opacity="0.8" />
    <circle cx="60" cy="60" r="2" fill="#ffc400" opacity="0.6" />
  </svg>
);

// Wavy section divider to match Image C
export const WavySectionDividerTop: FC<{ fill?: string; className?: string }> = ({ 
  fill = '#234386',
  className = '' 
}) => (
  <div className={`w-full overflow-hidden leading-none ${className}`}>
    <svg 
      className="relative block w-full h-[50px] sm:h-[75px] md:h-[100px]" 
      viewBox="0 0 1200 120" 
      preserveAspectRatio="none"
    >
      <path 
        d="M0,0 C150,90 350,-40 500,45 C650,130 900,10 1200,80 L1200,120 L0,120 Z" 
        fill={fill} 
      />
    </svg>
  </div>
);

export const WavySectionDividerBottom: FC<{ fill?: string; className?: string }> = ({ 
  fill = '#234386',
  className = '' 
}) => (
  <div className={`w-full overflow-hidden leading-none rotate-180 ${className}`}>
    <svg 
      className="relative block w-full h-[50px] sm:h-[75px] md:h-[100px]" 
      viewBox="0 0 1200 120" 
      preserveAspectRatio="none"
    >
      <path 
        d="M0,0 C150,90 350,-40 500,45 C650,130 900,10 1200,80 L1200,120 L0,120 Z" 
        fill={fill} 
      />
    </svg>
  </div>
);
