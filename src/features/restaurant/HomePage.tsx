import type { FC } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowRight, Clock3, MapPin } from 'lucide-react';
import { useCatalog } from '@/features/catalog';
import type { MenuItem } from '@/features/catalog/types';
import { DishImage } from '@/features/catalog/components/DishImage';
import { toLegacyMenuItem } from '@/features/catalog/legacyMenuItem';
import { HeroSection } from './components/HeroSection';
import { getSiteInfo } from './site';
import './HomePage.css';

function dishPrice(dish: MenuItem): string {
  if (dish.pricing_mode === 'market') return 'Theo thời giá';
  if (dish.pricing_mode === 'unknown') return 'Liên hệ';
  if (dish.pricing_mode === 'range') {
    return `${(dish.price_min ?? dish.price_vnd).toLocaleString('vi-VN')} – ${(dish.price_max ?? dish.price_vnd).toLocaleString('vi-VN')} đ`;
  }
  return `${dish.price_vnd.toLocaleString('vi-VN')} đ`;
}

export const HomePage: FC = () => {
  const navigate = useNavigate();
  const { featuredItems, items, settings, isLoadingMenu, menuError } = useCatalog();
  const teaserDishes = (featuredItems.length ? featuredItems : items).slice(0, 4);
  const site = getSiteInfo(settings);

  return (
    <div className="space-y-0">
      <HeroSection onExploreMenu={() => navigate('/menu')} />

      <div className="home-content">
        <section className="home-highlights" aria-labelledby="home-highlights-title">
          <div className="home-section-heading home-content-container">
            <div>
              <span className="home-kicker">Bếp Tiger mời bạn</span>
              <h2 id="home-highlights-title">Món ngon đáng thử</h2>
            </div>
            <Link className="home-text-link" to="/menu">
              Xem tất cả <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>

          {isLoadingMenu ? (
            <div className="home-dish-rail" role="status" aria-label="Đang tải món ngon">
              {[0, 1, 2, 3].map(index => (
                <div key={index} className="home-dish-skeleton" aria-hidden="true">
                  <div /><span /><span />
                </div>
              ))}
            </div>
          ) : teaserDishes.length ? (
            <ul className="home-dish-rail" aria-label="Món ngon nổi bật">
              {teaserDishes.map(dish => (
                <li className="home-dish" key={dish.id}>
                  <Link to="/menu" className="home-dish-link" aria-label={`Xem thực đơn: ${dish.name}`}>
                    <div className="home-dish-image">
                      <DishImage dish={toLegacyMenuItem(dish)} isAvailable={dish.available !== false} />
                      {dish.available === false && <span className="home-dish-unavailable">Tạm hết</span>}
                    </div>
                    <h3>{dish.name}</h3>
                    <span className="home-dish-price">{dishPrice(dish)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="home-content-container home-catalog-notice" role="status">
              {menuError ? 'Chưa tải được món ngon. Bạn có thể thử lại trong thực đơn.' : 'Thực đơn đang được cập nhật.'}
            </p>
          )}
        </section>

        <section className="home-atmosphere home-content-container" aria-labelledby="home-atmosphere-title">
          <figure className="home-atmosphere-photo">
            <img
              src="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=85"
              alt="Ảnh minh hoạ không gian dùng bữa ấm cúng"
              width="1200"
              height="750"
              loading="lazy"
              decoding="async"
            />
            <figcaption>Ảnh minh hoạ không gian</figcaption>
          </figure>
          <div className="home-atmosphere-copy">
            <span className="home-kicker">Một góc Tiger</span>
            <h2 id="home-atmosphere-title">Một bàn ngon.<br />Một buổi sum vầy.</h2>
            <p>Món Việt đậm vị, thêm những câu chuyện rôm rả. Tiger hẹn bạn một bữa ăn thật gần gũi.</p>
          </div>
        </section>

        <section className="home-visit" aria-labelledby="home-visit-title">
          <div className="home-visit-inner home-content-container">
            <div className="home-visit-intro">
              <span className="home-kicker">Hẹn một bữa ngon</span>
              <h2 id="home-visit-title">Ghé Tiger nhé.</h2>
            </div>
            <div className="home-visit-details">
              <dl>
                <div>
                  <dt><MapPin size={18} aria-hidden="true" /><span className="sr-only">Địa chỉ</span></dt>
                  <dd>{site.addressFull}</dd>
                </div>
                <div>
                  <dt><Clock3 size={18} aria-hidden="true" /><span className="sr-only">Giờ mở cửa</span></dt>
                  <dd>{site.hours}</dd>
                </div>
              </dl>
              <div className="home-visit-actions">
                <Link className="home-visit-book" to="/reservation">
                  Đặt bàn <ArrowRight size={17} aria-hidden="true" />
                </Link>
                {site.mapsUrl ? (
                  <a className="home-visit-directions" href={site.mapsUrl} target="_blank" rel="noopener noreferrer">
                    Chỉ đường <MapPin size={16} aria-hidden="true" />
                  </a>
                ) : (
                  <Link className="home-visit-directions" to="/location">
                    Chỉ đường <MapPin size={16} aria-hidden="true" />
                  </Link>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
