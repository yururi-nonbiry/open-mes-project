import React from 'react';
import { Link } from 'react-router-dom';
import {
  NAV_CATEGORIES,
  WORKFLOW_TRACKS,
  NavIcon,
  getCircledNumber,
} from '../config/navigationConfig';

interface TopPageProps {
  isAuthenticated: boolean;
  isStaffOrSuperuser: boolean;
  onLogout: () => void;
}

const TopPage: React.FC<TopPageProps> = ({
  isAuthenticated,
  isStaffOrSuperuser,
  onLogout,
}) => {
  const visibleCategories = NAV_CATEGORIES.filter(
    (cat) => !cat.staffOnly || isStaffOrSuperuser
  );

  return (
    <div className="top-page-container">
      {/* 1. 全体業務フローガイド（①データ投入から入庫まで ／ ②生産から出庫まで の2本立て） */}
      <section className="overall-workflow-banner" aria-label="全体業務フローガイド">
        <div className="workflow-banner-header">
          <div className="workflow-banner-title-group">
            <span className="workflow-banner-icon">
              <NavIcon name="compass" size={22} />
            </span>
            <div>
              <h2>生産ナビ 全体業務フロー</h2>
              <p className="workflow-banner-subtitle">
                やりたい業務に合わせて順番に進めてください。
              </p>
            </div>
          </div>
          <Link to="/usage" className="workflow-manual-btn">
            <NavIcon name="book" size={16} />
            <span>詳しい使い方を見る</span>
          </Link>
        </div>

        <div className="workflow-tracks-container">
          {WORKFLOW_TRACKS.map((track) => (
            <div
              key={track.id}
              className={`workflow-track-block track-${track.id}`}
              style={
                {
                  '--track-accent': track.accentColor,
                  '--track-border': track.borderColor,
                } as React.CSSProperties
              }
            >
              <div className="workflow-track-header">
                <div className="workflow-track-title-row">
                  <span
                    className="workflow-track-badge"
                    style={{ backgroundColor: track.accentColor }}
                  >
                    <NavIcon name={track.icon} size={14} />
                    <span>{track.badge}</span>
                  </span>
                  <div>
                    <h3 className="workflow-track-title">{track.title}</h3>
                    <span className="workflow-track-subtitle">{track.subtitle}</span>
                  </div>
                </div>
                <div className="workflow-track-start-btns">
                  <Link
                    to={track.startStandalonePath}
                    className="track-start-btn is-standalone"
                  >
                    <span>▶ ナビ開始（他アプリを使わない場合）</span>
                  </Link>
                  <Link
                    to={track.startExternalPath}
                    className="track-start-btn is-external"
                  >
                    <span>▶ ナビ開始（他アプリ同期済みの場合）</span>
                  </Link>
                </div>
              </div>

              <div className="overall-workflow-grid">
                {track.phases.map((phase, idx) => (
                  <React.Fragment key={phase.step}>
                    {idx > 0 && (
                      <div className="workflow-phase-connector" aria-hidden="true">
                        <NavIcon name="arrow-right" size={18} />
                      </div>
                    )}
                    <div
                      className={`workflow-phase-card ${phase.dataInputGuide ? 'has-data-guide' : ''
                        }`}
                      style={
                        {
                          '--phase-color': phase.color,
                          '--phase-bg': phase.bgLight,
                          '--phase-border': phase.border,
                        } as React.CSSProperties
                      }
                    >
                      <div className="workflow-phase-top">
                        <span className="workflow-phase-badge">FLOW {phase.step}</span>
                        <span className="workflow-phase-cat">
                          {phase.scenarioBadge || phase.categoryLabel}
                        </span>
                      </div>
                      <div className="workflow-phase-title">
                        <NavIcon name={phase.icon} size={17} />
                        <span>{phase.title}</span>
                      </div>
                      <p className="workflow-phase-summary">{phase.summary}</p>

                      {/* データ投入ステップ：他のアプリを使う場合 / 使わない場合 の分岐表示（中に直接ボタンを配置） */}
                      {phase.dataInputGuide && (
                        <div className="data-input-mode-box">
                          <div className="data-input-mode-item is-external">
                            <span className="mode-pill external">他アプリを使う場合</span>
                            <span className="mode-desc">
                              {phase.dataInputGuide.withExternalApp}
                            </span>
                            {phase.dataInputGuide.externalLinks &&
                              phase.dataInputGuide.externalLinks.length > 0 && (
                                <div className="mode-inline-links">
                                  {phase.dataInputGuide.externalLinks.map((lk) => (
                                    <Link
                                      key={lk.path + lk.label}
                                      to={lk.path}
                                      className="workflow-quick-chip mode-chip-external"
                                    >
                                      <span>{lk.label}</span>
                                      <span className="chip-arrow">›</span>
                                    </Link>
                                  ))}
                                </div>
                              )}
                          </div>
                          <div className="data-input-mode-item is-standalone">
                            <span className="mode-pill standalone">使わない場合</span>
                            <span className="mode-desc">
                              {phase.dataInputGuide.withoutExternalApp}
                            </span>
                            {phase.dataInputGuide.standaloneLinks &&
                              phase.dataInputGuide.standaloneLinks.length > 0 && (
                                <div className="mode-inline-links">
                                  {phase.dataInputGuide.standaloneLinks.map((lk) => (
                                    <Link
                                      key={lk.path + lk.label}
                                      to={lk.path}
                                      className={`workflow-quick-chip mode-chip-standalone ${
                                        lk.primary ? 'is-primary-chip' : ''
                                      }`}
                                    >
                                      <span>{lk.label}</span>
                                      <span className="chip-arrow">›</span>
                                    </Link>
                                  ))}
                                </div>
                              )}
                          </div>
                        </div>
                      )}

                      {phase.links.length > 0 && (
                        <div className="workflow-phase-links">
                          {phase.links.map((lk) => (
                            <Link key={lk.path + lk.label} to={lk.path} className="workflow-quick-chip">
                              <span>{lk.label}</span>
                              <span className="chip-arrow">›</span>
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 2. 管理カテゴリ別メニュー（在庫管理〜管理者メニュー・アカウント：矢印なしで並列表示） */}
      <div className="category-sections-list">
        {visibleCategories.map((cat) => (
          <div
            key={cat.id}
            className={`menu-section category-${cat.id}`}
            style={
              {
                '--cat-primary': cat.theme.primary,
                '--cat-secondary': cat.theme.secondary,
                '--cat-bg-light': cat.theme.bgLight,
                '--cat-bg-soft': cat.theme.bgSoft,
                '--cat-border': cat.theme.border,
                '--cat-text-dark': cat.theme.textDark,
                '--cat-badge-bg': cat.theme.badgeBg,
              } as React.CSSProperties
            }
          >
            <div className="menu-section-header">
              <div className="menu-section-title-row">
                <span className="menu-section-icon-badge">
                  <NavIcon name={cat.icon} size={19} />
                </span>
                <h3>{cat.label}</h3>
              </div>
              <p className="menu-section-flow-summary">{cat.flowSummary}</p>
            </div>

            {cat.id !== 'account' ? (
              <ul
                className={`workflow-steps-list ${
                  cat.id === 'admin' ? 'admin-grid-list' : ''
                } ${cat.id === 'data' ? 'single-item-list' : ''}`}
              >
                {cat.items.map((item, idx) => (
                  <li key={item.path} className="workflow-step-item">
                    <Link to={item.path} className="workflow-step-card">
                      <div className="step-card-header">
                        <div className="step-card-badges">
                          <span className="step-number-badge">
                            {getCircledNumber(idx)}
                          </span>
                          <span className="step-tag-label">{item.stepTag}</span>
                        </div>
                        <span className="step-card-chevron" aria-hidden="true">
                          ›
                        </span>
                      </div>
                      <div className="step-card-main">
                        <span className="step-card-icon">
                          <NavIcon name={item.icon} size={19} />
                        </span>
                        <span className="step-card-title">{item.label}</span>
                      </div>
                      <span className="step-card-desc">{item.description}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="workflow-steps-list account-steps-list">
                {isAuthenticated ? (
                  <>
                    {cat.items.map((item, idx) => (
                      <li key={item.path} className="workflow-step-item">
                        <Link to={item.path} className="workflow-step-card">
                          <div className="step-card-header">
                            <div className="step-card-badges">
                              <span className="step-number-badge">
                                {getCircledNumber(idx)}
                              </span>
                              <span className="step-tag-label">{item.stepTag}</span>
                            </div>
                            <span className="step-card-chevron" aria-hidden="true">
                              ›
                            </span>
                          </div>
                          <div className="step-card-main">
                            <span className="step-card-icon">
                              <NavIcon name={item.icon} size={19} />
                            </span>
                            <span className="step-card-title">{item.label}</span>
                          </div>
                          <span className="step-card-desc">{item.description}</span>
                        </Link>
                      </li>
                    ))}
                    <li className="workflow-step-item">
                      <button
                        type="button"
                        onClick={onLogout}
                        className="link-button logout-step-card"
                      >
                        <span className="step-card-header">
                          <span className="step-card-badges">
                            <span className="step-number-badge">
                              {getCircledNumber(cat.items.length)}
                            </span>
                            <span className="step-tag-label">セッション終了</span>
                          </span>
                          <span className="step-card-chevron" aria-hidden="true">
                            ›
                          </span>
                        </span>
                        <span className="step-card-main">
                          <span className="step-card-icon">
                            <NavIcon name="logout" size={19} />
                          </span>
                          <span className="step-card-title">ログアウト</span>
                        </span>
                        <span className="step-card-desc">
                          作業を終了して現在のアカウントからログアウトします
                        </span>
                      </button>
                    </li>
                  </>
                ) : (
                  <li className="workflow-step-item">
                    <Link to="/login" className="workflow-step-card">
                      <div className="step-card-main">
                        <span className="step-card-icon">
                          <NavIcon name="account" size={19} />
                        </span>
                        <span className="step-card-title">ログイン</span>
                      </div>
                    </Link>
                  </li>
                )}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default TopPage;
