import React, { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { WORKFLOW_TRACKS, WorkflowTrack, getCircledNumber, resolveCurrentNavigation } from '../config/navigationConfig';
import { NavIcon } from '../components/NavIcon';

const FLOW_STORAGE_KEY = '__omes_guided_flow';

interface StoredFlowState {
  flowId: 'receipt-flow' | 'production-plan-flow' | 'production-issue-flow';
  fstep: number;
}

/**
 * 各業務画面の上部に表示する
 * 1) 全体業務フロー選択時の「ステップナビゲーション（ウィザード）」
 * 2) 各画面共通のタイトル・1行説明・①②③手順ガイドバー
 */
const PageContextBanner: React.FC = () => {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { isTopPage, category, item, subPageLabel } = resolveCurrentNavigation(
    location.pathname
  );

  const [guidedState, setGuidedState] = useState<StoredFlowState | null>(() => {
    try {
      const saved = sessionStorage.getItem(FLOW_STORAGE_KEY);
      return saved ? (JSON.parse(saved) as StoredFlowState) : null;
    } catch (_err) {
      return null;
    }
  });

  const [userOverrideOpen, setUserOverrideOpen] = useState<boolean | null>(null);

  useEffect(() => {
    setUserOverrideOpen(null);
  }, [location.pathname]);

  useEffect(() => {
    if (isTopPage) {
      return;
    }
    const qFlow = searchParams.get('flow') as
      | 'receipt-flow'
      | 'production-plan-flow'
      | 'production-issue-flow'
      | null;
    const qStep = Number(searchParams.get('fstep') || '0');

    if (
      qFlow &&
      (qFlow === 'receipt-flow' ||
        qFlow === 'production-plan-flow' ||
        qFlow === 'production-issue-flow')
    ) {
      const track = WORKFLOW_TRACKS.find((t) => t.id === qFlow);
      if (track) {
        let resolvedStep = qStep;
        if (!resolvedStep) {
          const matched = track.guidedSteps.find(
            (s) => s.path.split('?')[0] === location.pathname
          );
          resolvedStep = matched
            ? matched.stepIndex
            : track.guidedSteps[0]?.stepIndex || 1;
        }
        const nextState: StoredFlowState = { flowId: qFlow, fstep: resolvedStep };
        setGuidedState(nextState);
        try {
          sessionStorage.setItem(FLOW_STORAGE_KEY, JSON.stringify(nextState));
        } catch (_err) {
          // ignore storage errors
        }
        return;
      }
    }

    // URLにクエリが無くても、すでにナビ実行中で現在のパスがそのフロー内のステップに一致する場合はステップ番号を同期
    if (guidedState) {
      const track = WORKFLOW_TRACKS.find((t) => t.id === guidedState.flowId);
      if (track) {
        const matchingSteps = track.guidedSteps.filter(
          (s) => s.path.split('?')[0] === location.pathname
        );
        if (matchingSteps.length > 0) {
          const exactCurrent = matchingSteps.find(
            (s) => s.stepIndex === guidedState.fstep
          );
          if (!exactCurrent) {
            const updated: StoredFlowState = {
              flowId: guidedState.flowId,
              fstep: matchingSteps[0].stepIndex,
            };
            setGuidedState(updated);
            try {
              sessionStorage.setItem(FLOW_STORAGE_KEY, JSON.stringify(updated));
            } catch (_err) {
              // ignore
            }
          }
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, searchParams, isTopPage]);

  const clearGuidedFlow = () => {
    setGuidedState(null);
    try {
      sessionStorage.removeItem(FLOW_STORAGE_KEY);
    } catch (_err) {
      // ignore
    }
  };

  if (isTopPage || !category || !item) {
    return null;
  }

  // 現在アクティブなガイドフローがあり、現在の画面がそのフローに含まれるか判定
  let activeTrack: WorkflowTrack | null = null;
  if (guidedState) {
    const candidate = WORKFLOW_TRACKS.find((t) => t.id === guidedState.flowId) || null;
    if (
      candidate &&
      candidate.guidedSteps.some((s) => s.path.split('?')[0] === location.pathname)
    ) {
      activeTrack = candidate;
    }
  }

  const currentGuidedStep = activeTrack
    ? activeTrack.guidedSteps.find((s) => s.stepIndex === guidedState?.fstep) ||
      activeTrack.guidedSteps.find((s) => s.path.split('?')[0] === location.pathname) ||
      null
    : null;

  const prevGuidedStep =
    activeTrack && currentGuidedStep
      ? activeTrack.guidedSteps.find(
          (s) => s.stepIndex === currentGuidedStep.stepIndex - 1
        ) || null
      : null;

  const nextGuidedStep =
    activeTrack && currentGuidedStep
      ? activeTrack.guidedSteps.find(
          (s) => s.stepIndex === currentGuidedStep.stepIndex + 1
        ) || null
      : null;

  const isFlowActive = Boolean(activeTrack && currentGuidedStep);
  const isGuideOpen = userOverrideOpen !== null ? userOverrideOpen : !isFlowActive;
  const guideSteps = item.guideSteps;
  const hasGuideSteps = Boolean(guideSteps && guideSteps.length > 0);

  const buildStepUrl = (trackId: string, stepIndex: number, rawPath: string) => {
    const [basePath, existingQuery] = rawPath.split('?');
    const params = new URLSearchParams(existingQuery || '');
    params.set('flow', trackId);
    params.set('fstep', String(stepIndex));
    return `${basePath}?${params.toString()}`;
  };

  const resolvedTitle = subPageLabel
    ? `${item.label}（${subPageLabel}）`
    : item.pageTitle || item.label;
  const resolvedSubtitle = item.pageSubtitle || item.description;

  return (
    <div className="page-context-wrapper">
      {/* 1. フロー選択時のステップバイステップ・ナビゲーションウィザード */}
      {activeTrack && currentGuidedStep && (
        <div
          className="guided-flow-wizard mb-2"
          style={
            {
              '--wizard-color': activeTrack.accentColor,
              '--wizard-border': activeTrack.borderColor,
            } as React.CSSProperties
          }
          role="region"
          aria-label="業務フローナビゲーション"
        >
          {/* 上段：フロー名と進捗ステップバー */}
          <div className="guided-wizard-top">
            <div className="guided-wizard-title-group">
              <span className="guided-wizard-badge">
                <NavIcon name="compass" size={14} />
                <span>{activeTrack.badge} ナビ</span>
              </span>
              <strong className="guided-wizard-track-name">{activeTrack.title}</strong>
            </div>

            <div className="guided-wizard-steps-rail">
              {activeTrack.guidedSteps.map((gStep, idx) => {
                const isDone = gStep.stepIndex < currentGuidedStep.stepIndex;
                const isCurrent = gStep.stepIndex === currentGuidedStep.stepIndex;
                return (
                  <React.Fragment key={gStep.stepIndex}>
                    {idx > 0 && (
                      <span className="wizard-rail-arrow" aria-hidden="true">
                        →
                      </span>
                    )}
                    <Link
                      to={buildStepUrl(activeTrack.id, gStep.stepIndex, gStep.path)}
                      className={`wizard-rail-pill ${isCurrent ? 'current' : ''} ${
                        isDone ? 'done' : ''
                      }`}
                    >
                      {isDone && <span className="wizard-check-mark">✓</span>}
                      <span>{gStep.shortTitle}</span>
                    </Link>
                  </React.Fragment>
                );
              })}
            </div>

            <Link
              to={location.pathname}
              onClick={clearGuidedFlow}
              className="guided-wizard-close-link"
              title="フローナビ表示を閉じる"
            >
              × 閉じる
            </Link>
          </div>

          {/* 下段：今の画面でやる操作（短文チップ） ＆ 次のステップへ進むボタン */}
          <div className="guided-wizard-body">
            <div className="guided-wizard-instruction-col">
              <div className="guided-step-heading">
                <span className="guided-step-count-pill">
                  STEP {currentGuidedStep.stepIndex} / {activeTrack.guidedSteps.length}
                </span>
                <span className="guided-step-title-text">{currentGuidedStep.title}</span>
                {currentGuidedStep.mobileHint && (
                  <span className="guided-step-mobile-pill" title={currentGuidedStep.mobileHint}>
                    📱 {currentGuidedStep.mobileHint}
                  </span>
                )}
              </div>

              <div className="guided-action-steps" aria-label="この画面の操作手順">
                {currentGuidedStep.actionSteps.map((stepText, idx) => (
                  <React.Fragment key={stepText}>
                    {idx > 0 && (
                      <span className="guided-action-arrow" aria-hidden="true">
                        →
                      </span>
                    )}
                    <span className="guided-action-chip">{stepText}</span>
                  </React.Fragment>
                ))}
              </div>

              {currentGuidedStep.subButtons && currentGuidedStep.subButtons.length > 0 && (
                <div className="guided-step-subbuttons">
                  <span className="subbuttons-label">すぐ開く：</span>
                  {currentGuidedStep.subButtons.map((sb) => (
                    <Link
                      key={sb.path + sb.label}
                      to={sb.path}
                      className={`guided-sub-btn ${sb.primary ? 'is-primary' : ''}`}
                    >
                      <span>{sb.label}</span>
                      <span>›</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="guided-wizard-action-col">
              {prevGuidedStep && (
                <Link
                  to={buildStepUrl(
                    activeTrack.id,
                    prevGuidedStep.stepIndex,
                    prevGuidedStep.path
                  )}
                  className="guided-prev-btn"
                >
                  ← 前へ（{prevGuidedStep.shortTitle}）
                </Link>
              )}

              {nextGuidedStep ? (
                <Link
                  to={buildStepUrl(
                    activeTrack.id,
                    nextGuidedStep.stepIndex,
                    nextGuidedStep.path
                  )}
                  className="guided-next-btn"
                >
                  <span className="guided-next-sub">操作が終わったら次へ</span>
                  <span className="guided-next-main">
                    {currentGuidedStep.nextButtonLabel}
                  </span>
                </Link>
              ) : (
                <Link
                  to="/"
                  onClick={clearGuidedFlow}
                  className="guided-next-btn is-complete"
                >
                  <span className="guided-next-sub">全ステップ完了</span>
                  <span className="guided-next-main">
                    {currentGuidedStep.nextButtonLabel}
                  </span>
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. 全画面共通の「画面タイトル・概要説明・①②③手順ガイドバー」 */}
      <div
        className="goods-receipt-header-bar page-unified-header-bar"
        style={
          {
            '--page-hdr-primary': category.theme.primary,
            '--page-hdr-bg-light': category.theme.bgLight,
            '--page-hdr-bg-soft': category.theme.bgSoft,
            '--page-hdr-border': category.theme.border,
            '--page-hdr-text-dark': category.theme.textDark,
          } as React.CSSProperties
        }
      >
        <div className="goods-receipt-header-main">
          <div className="goods-receipt-title-row">
            <span className="goods-receipt-title-icon">
              <NavIcon name={item.icon} size={22} />
            </span>
            <div>
              <h2 className="goods-receipt-main-title">{resolvedTitle}</h2>
              <p className="goods-receipt-subtitle">{resolvedSubtitle}</p>
            </div>
          </div>

          {item.nextActions && item.nextActions.length > 0 && (
            <div className="goods-receipt-quick-links">
              {item.nextActions.map((act) => (
                <Link
                  key={act.path + act.label}
                  to={act.path}
                  className={`header-quick-action-btn ${
                    act.highlight ? 'is-highlight' : 'is-secondary'
                  }`}
                >
                  <span>{act.label}</span>
                  <span aria-hidden="true">→</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {hasGuideSteps && guideSteps && (
          <div className="page-guide-steps-wrapper">
            <div className="page-guide-steps-header">
              <button
                type="button"
                className="guide-steps-toggle-btn"
                onClick={() => setUserOverrideOpen(!isGuideOpen)}
                aria-expanded={isGuideOpen}
              >
                <span className="toggle-arrow">{isGuideOpen ? '▼' : '▶'}</span>
                <span className="toggle-title">画面の標準手順</span>
                {isFlowActive ? (
                  <span className={`toggle-badge ${isGuideOpen ? 'is-open' : ''}`}>
                    {isGuideOpen
                      ? '（クリックで折りたたむ）'
                      : '（フローナビ実行中のため折りたたみ中・クリックで表示）'}
                  </span>
                ) : null}
              </button>
            </div>

            {isGuideOpen ? (
              <div className="goods-receipt-step-strip">
                {guideSteps.map((stepText, idx) => (
                  <div className="receipt-guide-chip" key={stepText}>
                    <span className="receipt-guide-num">{getCircledNumber(idx)}</span>
                    <span>{stepText}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};

export default PageContextBanner;
