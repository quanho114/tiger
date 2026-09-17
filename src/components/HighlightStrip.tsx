import type { FC } from 'react';
import { Leaf, ChefHat, Heart, Users } from 'lucide-react';

export const HighlightStrip: FC = () => {
  const features = [
    {
      icon: Leaf,
      label: 'NGUYÊN LIỆU',
      sublabel: 'TƯƠI SẠCH MỖI NGÀY',
    },
    {
      icon: ChefHat,
      label: 'ĐỘI NGŨ BẾP TRƯỞNG',
      sublabel: 'GIÀU KINH NGHIỆM',
    },
    {
      icon: Heart,
      label: 'KHÔNG GIAN ẤM CÚNG,',
      sublabel: 'TINH TẾ',
    },
    {
      icon: Users,
      label: 'PHÙ HỢP CHO MỌI',
      sublabel: 'DỊP ĐẶC BIỆT',
    },
  ];

  return (
    <section className="relative z-20 py-5 bg-[#fbf9f6] border-y border-[#d2b68c]/35">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 lg:gap-6 items-center">
          
          {features.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div key={idx} className="flex items-center gap-3 group">
                <div className="text-[#3d5a45] group-hover:text-[#ed7328] transition-colors shrink-0">
                  <Icon size={22} className="stroke-[1.6]" />
                </div>
                <div className="flex flex-col font-['Be_Vietnam_Pro',sans-serif] text-[10px] sm:text-[11px] font-semibold tracking-[0.08em] uppercase text-[#000000]/75 leading-tight">
                  <span>{item.label}</span>
                  <span className="text-[#000000]/90 font-semibold">{item.sublabel}</span>
                </div>
              </div>
            );
          })}

          {/* Right end brand slogan divider (Image A detail) */}
          <div className="hidden lg:flex items-center gap-4 pl-4 border-l border-[#d2b68c]/40 font-['Be_Vietnam_Pro',sans-serif] text-[10px] font-semibold tracking-[0.14em] uppercase text-[#000000]/50 whitespace-nowrap">
            <span className="w-8 h-[1px] bg-[#d2b68c]" />
            <span>GOOD FOOD BRIGHTER DAYS</span>
          </div>

        </div>
      </div>
    </section>
  );
};
