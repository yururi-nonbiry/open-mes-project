import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { NAV_CATEGORIES, getCircledNumber, resolveCurrentNavigation } from '../config/navigationConfig';
import { NavIcon } from '../components/NavIcon';

interface HeaderProps {
  onMenuClick: () => void;
  isMenuOpen: boolean;
  isAuthenticated: boolean;
  isStaffOrSuperuser?: boolean;
}

const Header: React.FC<HeaderProps> = ({
  onMenuClick,
  isMenuOpen,
  isAuthenticated,
  isStaffOrSuperuser = false,
}) => {
  const location = useLocation();
  const { isTopPage, category, item, subPageLabel } = resolveCurrentNavigation(location.pathname);

  const visibleCategories = NAV_CATEGORIES.filter(
    (cat) => !cat.staffOnly || isStaffOrSuperuser
  );

  const activeAccentColor = category ? category.theme.primary : '#0ea5e9';

  return (
    <header
      className="app-header"
      style={
        {
          '--active-category-color': activeAccentColor,
          '--active-category-bg-light': category ? category.theme.bgLight : '#f0f9ff',
          '--active-category-border': category ? category.theme.border : '#7dd3fc',
          '--active-category-text': category ? category.theme.textDark : '#075985',
        } as React.CSSProperties
      }
    >
      {/* 上段：ブランドタイトル・選択中カテゴリ表示・右側ハンバーガーメニュー */}
      <div className="header-top-bar">
        <div className="header-left-group">
          <Link to="/" className="header-brand-link" title="トップページへ戻る">
            <span className="header-brand-icon">
              <NavIcon name="production" size={20} />
            </span>
            <h1 id="title">生産ナビ</h1>
          </Link>

          {/* 現在選択中の管理カテゴリ＆画面名バッジ */}
          {isAuthenticated && (
            <div className="header-active-indicator" aria-live="polite">
              {isTopPage ? (
                <span className="header-category-badge is-top">
                  <NavIcon name="compass" size={15} />
                  <span>トップページ（全体業務ナビ）</span>
                </span>
              ) : category ? (
                <>
                  <span
                    className="header-category-badge"
                    style={{ backgroundColor: category.theme.primary }}
                  >
                    <NavIcon name={category.icon} size={15} />
                    <span>{category.label}</span>
                  </span>
                  {item && (
                    <span className="header-page-crumb">
                      <span className="header-crumb-sep">›</span>
                      <span className="header-page-name">
                        <NavIcon name={item.icon} size={15} />
                        {item.label}
                      </span>
                      {subPageLabel && (
                        <>
                          <span className="header-crumb-sep">›</span>
                          <span className="header-subpage-name">{subPageLabel}</span>
                        </>
                      )}
                    </span>
                  )}
                </>
              ) : null}
            </div>
          )}
        </div>

        {/* 右側：ハンバーガーメニュー */}
        {isAuthenticated && (
          <div className="header-right-actions">
            <Link to="/usage" className="header-help-link" title="使い方ガイド">
              <NavIcon name="book" size={15} />
              <span className="header-help-text">使い方</span>
            </Link>
            <div
              id="hamburger-menu"
              className={isMenuOpen ? 'open' : ''}
              onClick={onMenuClick}
              role="button"
              tabIndex={0}
              aria-label="メニューを開閉する"
              aria-expanded={isMenuOpen}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onMenuClick();
                }
              }}
            >
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
      </div>

      {/* 中段リボン：管理カテゴリ判別リボン（現在どの管理メニューを選択中か一目で判別） */}
      {isAuthenticated && (
        <div className="header-ribbon-bar" role="navigation" aria-label="管理カテゴリリボン">
          <div className="ribbon-category-list">
            <Link
              to="/"
              className={`ribbon-category-tab ${isTopPage ? 'active' : ''}`}
              style={
                {
                  '--cat-color': '#0284c7',
                  '--cat-bg-soft': '#e0f2fe',
                } as React.CSSProperties
              }
            >
              <NavIcon name="home" size={15} />
              <span className="ribbon-cat-name">全体ナビ</span>
              {isTopPage && <span className="ribbon-active-dot">選択中</span>}
            </Link>

            {visibleCategories.map((cat) => {
              const isSelected = category?.id === cat.id;
              const firstPath = cat.items[0]?.path || '/';
              return (
                <Link
                  key={cat.id}
                  to={firstPath}
                  className={`ribbon-category-tab ${isSelected ? 'active' : ''}`}
                  style={
                    {
                      '--cat-color': cat.theme.primary,
                      '--cat-bg-soft': cat.theme.bgSoft,
                      '--cat-border': cat.theme.border,
                    } as React.CSSProperties
                  }
                >
                  <span
                    className="ribbon-cat-color-bar"
                    style={{ backgroundColor: cat.theme.primary }}
                  />
                  <NavIcon name={cat.icon} size={15} />
                  <span className="ribbon-cat-name">{cat.label}</span>
                  {isSelected && <span className="ribbon-active-dot">選択中</span>}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* 下段サブリボン：選択中カテゴリ内のメニュー一覧（矢印なしで①②③…と並列表示） */}
      {isAuthenticated && category && (
        <div
          className="header-workflow-subribbon"
          aria-label={`${category.label}のメニュー`}
        >
          <div className="subribbon-inner">
            <div
              className="subribbon-category-tag"
              style={{
                backgroundColor: category.theme.primary,
              }}
            >
              <NavIcon name={category.icon} size={14} />
              <span>{category.label}</span>
            </div>

            <div className="subribbon-steps-track">
              {category.items.map((stepItem, idx) => {
                const isCurrentStep = item?.path === stepItem.path;

                return (
                  <Link
                    key={stepItem.path}
                    to={stepItem.path}
                    className={`subribbon-step-link ${isCurrentStep ? 'current' : ''}`}
                    title={stepItem.description}
                  >
                    <span className="subribbon-step-circled">
                      {getCircledNumber(idx)}
                    </span>
                    <NavIcon name={stepItem.icon} size={14} />
                    <span className="subribbon-step-label">{stepItem.label}</span>
                    <span className="subribbon-step-tag">{stepItem.stepTag}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;
