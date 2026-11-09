import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  NAV_CATEGORIES,
  NavIcon,
  getCircledNumber,
  resolveCurrentNavigation,
} from '../config/navigationConfig';

interface SideMenuProps {
  isOpen: boolean;
  isStaffOrSuperuser: boolean;
  onVersionClick: () => void;
  onLinkClick: () => void;
  onLogout: () => void;
  isAuthenticated: boolean;
}

const SideMenu: React.FC<SideMenuProps> = ({
  isOpen,
  isStaffOrSuperuser,
  onVersionClick,
  onLinkClick,
  onLogout,
}) => {
  const location = useLocation();
  const { isTopPage, category: activeCategory, item: activeItem } =
    resolveCurrentNavigation(location.pathname);

  const handleLogoutClick = (e: React.MouseEvent) => {
    e.preventDefault();
    onLinkClick(); // Close menu on click
    onLogout();
  };

  const visibleCategories = NAV_CATEGORIES.filter(
    (cat) => !cat.staffOnly || isStaffOrSuperuser
  );

  // Escキーでサイドメニューを閉じる
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onLinkClick();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onLinkClick]);

  return (
    <nav id="menu-bar" className={isOpen ? 'open' : ''} aria-label="サイドメニュー">
      <div className="side-menu-header">
        <span className="side-menu-header-title">
          <NavIcon name="compass" size={16} />
          <span>業務メニュー一覧</span>
        </span>
        <button
          type="button"
          className="side-menu-close-btn"
          onClick={onLinkClick}
          aria-label="メニューを閉じる"
          title="閉じる (Esc)"
        >
          ✕
        </button>
      </div>

      <Link
        to="/"
        className={`side-menu-top-link ${isTopPage ? 'active' : ''}`}
        onClick={onLinkClick}
      >
        <NavIcon name="home" size={17} />
        <span>トップページ</span>
      </Link>

      {visibleCategories.map((cat) => {
        const isCatActive = activeCategory?.id === cat.id;
        return (
          <div
            key={cat.id}
            className={`side-menu-category-group ${isCatActive ? 'active-group' : ''}`}
            style={
              {
                '--side-cat-color': cat.theme.primary,
                '--side-cat-secondary': cat.theme.secondary,
              } as React.CSSProperties
            }
          >
            <div className="menu-category-title">
              <span
                className="menu-category-color-pill"
                style={{ backgroundColor: cat.theme.primary }}
              >
                <NavIcon name={cat.icon} size={14} />
              </span>
              <span className="menu-category-label-text">
                {cat.id === 'account' ? 'アカウント設定' : cat.label}
              </span>
              {isCatActive && <span className="side-cat-active-badge">選択中</span>}
            </div>

            {cat.items.map((stepItem, idx) => {
              const isItemActive = activeItem?.path === stepItem.path;
              return (
                <Link
                  key={stepItem.path}
                  to={stepItem.path}
                  className={`menu-subcategory-link ${isItemActive ? 'active' : ''}`}
                  onClick={onLinkClick}
                >
                  <span className="side-circled-num">{getCircledNumber(idx)}</span>
                  <NavIcon name={stepItem.icon} size={15} />
                  <span className="side-link-text">{stepItem.label}</span>
                  <span className="side-link-subtag">{stepItem.stepTag}</span>
                </Link>
              );
            })}
          </div>
        );
      })}

      <div className="side-menu-footer">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            onLinkClick();
            onVersionClick();
          }}
          className="menu-subcategory-link side-version-link"
        >
          <NavIcon name="info" size={15} />
          <span className="side-link-text">バージョン情報</span>
        </a>
        <button onClick={handleLogoutClick} className="menu-logout-button">
          <NavIcon name="logout" size={16} />
          <span>ログアウト</span>
        </button>
      </div>
    </nav>
  );
};

export default SideMenu;
