import { useEffect, useRef, useState } from 'react';
import { preload } from 'react-dom';
import { heroSlides } from '../heroSlides';
import './HeroFoodCarousel.css';

export function HeroFoodCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [hidden, setHidden] = useState(() => document.hidden);
  const dragStart = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const isPaused = hovered || focused || dragging || hidden;
  const goToSlide = (index: number) => setActiveIndex((index + heroSlides.length) % heroSlides.length);
  const nextSlide = () => setActiveIndex(index => (index + 1) % heroSlides.length);
  const prevSlide = () => setActiveIndex(index => (index + heroSlides.length - 1) % heroSlides.length);

  preload(heroSlides[0].image, { as: 'image', fetchPriority: 'high' });

  useEffect(() => {
    const update = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  useEffect(() => {
    if (isPaused) return;
    const timer = window.setTimeout(nextSlide, 3000);
    return () => window.clearTimeout(timer);
  }, [activeIndex, isPaused]);

  return (
    <div className="hero-food-carousel" role="region" aria-roledescription="carousel" aria-label="Signature dishes"
      onPointerEnter={event => { if (event.pointerType === 'mouse') setHovered(true); }}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
      onKeyDown={event => {
        if (event.key === 'ArrowLeft') { event.preventDefault(); prevSlide(); }
        if (event.key === 'ArrowRight') { event.preventDefault(); nextSlide(); }
      }}>
      <div className="hero-food-stage" data-dragging={dragging || undefined}
        onPointerDown={event => {
          if (!event.isPrimary || event.button !== 0) return;
          dragStart.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
        }}
        onPointerUp={event => {
          const start = dragStart.current;
          if (!start || start.pointerId !== event.pointerId) return;
          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) {
            if (dx < 0) nextSlide(); else prevSlide();
          }
          dragStart.current = null;
          setDragging(false);
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        onPointerCancel={() => { dragStart.current = null; setDragging(false); }}
        onLostPointerCapture={() => { dragStart.current = null; setDragging(false); }}>
        {heroSlides.map((slide, index) => (
          <div key={slide.image} className="hero-food-slide" data-layer={(index - activeIndex + heroSlides.length) % heroSlides.length}
            role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${heroSlides.length}: ${slide.label}`} aria-hidden={index !== activeIndex}>
            <img src={slide.image} alt={slide.alt} width="900" height="900" draggable={false}
              fetchPriority={index === 0 ? 'high' : 'low'} decoding={index === 0 ? 'auto' : 'async'} />
          </div>
        ))}
      </div>
      <div className="hero-food-pagination">
        {heroSlides.map((slide, index) => (
          <button key={slide.image} type="button" className="hero-food-dot" aria-label={`Show dish ${index + 1}`}
            aria-current={index === activeIndex ? 'true' : undefined} onClick={() => goToSlide(index)}><span /></button>
        ))}
      </div>
    </div>
  );
}
