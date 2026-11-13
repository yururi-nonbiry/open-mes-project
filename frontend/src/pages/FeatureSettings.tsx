import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import inventoryService from '../services/inventoryService';
import { ApiError } from '../utils/api';
import scheduleDateDefaultsService, { offsetToDate } from '../services/scheduleDateDefaultsService';
import { WORKFLOW_TRACKS } from '../config/navigationConfig';
import { NavIcon } from '../components/NavIcon';
import {
  FlowVisibility,
  FlowTrackId,
  WorkflowFeatureSettings,
  getWorkflowFeatureSettings,
  saveWorkflowFeatureSettings,
  DEFAULT_WORKFLOW_FEATURE_SETTINGS,
} from '../services/workflowFeatureService';

const VISIBILITY_OPTIONS: { value: FlowVisibility; label: string; icon: string; description: string }[] = [
  {
    value: 'visible',
    label: '表示',
    icon: 'check-circle',
    description: '通常通りカラー表示され、ナビゲーションや各リンクが利用できます。',
  },
  {
    value: 'grayed',
    label: 'グレーアウト',
    icon: 'info',
    description: '半透明・グレースケールで表示され、休止中バッジが表示されます。',
  },
  {
    value: 'hidden',
    label: '非表示',
    icon: 'x-circle',
    description: 'トップページの全体業務フロー一覧から完全に非表示にします。',
  },
];

const FeatureSettings: React.FC = () => {
  const [settings, setSettings] = useState<WorkflowFeatureSettings>(getWorkflowFeatureSettings);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // 入庫時のデフォルト棚番登録の確認(サーバー側に保存。全端末・全ユーザーに適用)
  const [confirmDefaultLocation, setConfirmDefaultLocation] = useState<boolean | null>(null);
  const [optionMessage, setOptionMessage] = useState<{ type: 'success' | 'danger'; text: string } | null>(null);

  // 入庫・出庫の予定日フィルタの初期値(今日からの相対日数。空欄=指定なし。サーバー側に保存)
  const [dateFromOffset, setDateFromOffset] = useState('');
  const [dateToOffset, setDateToOffset] = useState('');
  const [dateDefaultsLoaded, setDateDefaultsLoaded] = useState(false);
  const [dateDefaultsMessage, setDateDefaultsMessage] = useState<{ type: 'success' | 'danger'; text: string } | null>(null);

  useEffect(() => {
    scheduleDateDefaultsService.getOffsets().then((o) => {
      setDateFromOffset(o.schedule_date_from_offset_days === null ? '' : String(o.schedule_date_from_offset_days));
      setDateToOffset(o.schedule_date_to_offset_days === null ? '' : String(o.schedule_date_to_offset_days));
      setDateDefaultsLoaded(true);
    });
  }, []);

  const parseOffset = (value: string): number | null | undefined => {
    if (value.trim() === '') return null;
    const n = Number(value);
    return Number.isInteger(n) ? n : undefined; // undefined = 不正
  };

  const handleSaveDateDefaults = async () => {
    setDateDefaultsMessage(null);
    const from = parseOffset(dateFromOffset);
    const to = parseOffset(dateToOffset);
    if (from === undefined || to === undefined) {
      setDateDefaultsMessage({ type: 'danger', text: '相対日数は整数で入力してください（空欄は指定なし）。' });
      return;
    }
    try {
      await scheduleDateDefaultsService.updateOffsets({
        schedule_date_from_offset_days: from,
        schedule_date_to_offset_days: to,
      });
      setDateDefaultsMessage({ type: 'success', text: '予定日の初期値を保存しました。次に画面を開いたときから反映されます。' });
    } catch (err) {
      setDateDefaultsMessage({
        type: 'danger',
        text: err instanceof ApiError ? err.message : '設定の保存中に通信エラーが発生しました。',
      });
    }
  };

  const datePreview = (value: string) => {
    const n = parseOffset(value);
    if (n === undefined) return '（整数で入力）';
    return n === null ? '指定なし' : `今日の日付で ${offsetToDate(n)}`;
  };

  useEffect(() => {
    inventoryService.getFeatureOptions().then((o) => setConfirmDefaultLocation(o.confirm_register_default_location));
  }, []);

  const handleConfirmDefaultLocationChange = async (enabled: boolean) => {
    setOptionMessage(null);
    try {
      const result = await inventoryService.updateFeatureOptions({ confirm_register_default_location: enabled });
      setConfirmDefaultLocation(result.confirm_register_default_location);
      setOptionMessage({
        type: 'success',
        text: `入庫時のデフォルト棚番登録の確認を${enabled ? 'ON' : 'OFF'}にしました。`,
      });
    } catch (err) {
      setOptionMessage({
        type: 'danger',
        text: err instanceof ApiError ? err.message : '設定の保存中に通信エラーが発生しました。',
      });
    }
  };

  const handleVisibilityChange = (trackId: FlowTrackId, value: FlowVisibility) => {
    setSettings((prev) => ({
      ...prev,
      [trackId]: value,
    }));
    setSaveMessage(null);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveWorkflowFeatureSettings(settings);
    setSaveMessage('有効機能設定を保存しました。トップページの全体業務フローに反映されています。');
  };

  const handleReset = () => {
    if (window.confirm('すべてのフローを表示（初期設定）に戻しますか？')) {
      setSettings({ ...DEFAULT_WORKFLOW_FEATURE_SETTINGS });
      saveWorkflowFeatureSettings({ ...DEFAULT_WORKFLOW_FEATURE_SETTINGS });
      setSaveMessage('設定を初期状態（すべて表示）に戻しました。');
    }
  };

  return (
    <div className="goods-receipt-page">
      <div className="feature-settings-container">
        <div className="feature-settings-intro card shadow-sm mb-4">
          <div className="card-body">
            <div className="d-flex align-items-center gap-3">
              <span className="feature-settings-icon-badge">
                <NavIcon name="settings" size={28} />
              </span>
              <div>
                <h4 className="card-title mb-1 fw-bold">有効機能設定（全体業務フロー）</h4>
                <p className="card-text text-muted mb-0">
                  トップページに表示する全体業務フロー（フロー①〜③）の表示状態を「表示」「グレーアウト」「非表示」から切り替えられます。工場の運用に合わせて不要なフローを休止・非表示にしてください。
                </p>
              </div>
            </div>
          </div>
        </div>

        {saveMessage && (
          <div className="alert alert-success d-flex align-items-center justify-content-between mb-4" role="alert">
            <div className="d-flex align-items-center gap-2">
              <NavIcon name="check-circle" size={18} />
              <span>{saveMessage}</span>
            </div>
            <Link to="/" className="btn btn-sm btn-outline-success fw-bold">
              トップページで確認 →
            </Link>
          </div>
        )}

        <div className="card shadow-sm mb-4">
          <div className="card-body">
            <h5 className="fw-bold mb-2">入庫時のデフォルト棚番登録の確認</h5>
            <p className="text-muted small mb-3">
              ONにすると、入庫時に品番のデフォルト入庫棚番が未登録の場合、入庫した棚番を登録するか確認します。
              この設定は保存ボタンを待たず、切り替えた時点でシステム全体（PC・スマホ）に反映されます。
            </p>
            <div className="form-check form-switch">
              <input
                className="form-check-input"
                type="checkbox"
                role="switch"
                id="confirm-default-location"
                checked={!!confirmDefaultLocation}
                disabled={confirmDefaultLocation === null}
                onChange={(e) => handleConfirmDefaultLocationChange(e.target.checked)}
              />
              <label className="form-check-label fw-bold" htmlFor="confirm-default-location">
                {confirmDefaultLocation ? 'ON（確認する）' : 'OFF（確認しない）'}
              </label>
            </div>
            {optionMessage && (
              <div className={`alert alert-${optionMessage.type} mt-3 mb-0 py-2`} role="alert">
                {optionMessage.text}
              </div>
            )}
          </div>
        </div>

        <div className="card shadow-sm mb-4">
          <div className="card-body">
            <h5 className="fw-bold mb-2">入庫・出庫の予定日の初期値</h5>
            <p className="text-muted small mb-3">
              入庫処理・出庫処理（PC・スマホ共通）で、予定日の検索期間にあらかじめ入れておく値を、今日からの相対日数で指定します
              （例: 開始 -7、終了 14 なら「7日前〜14日後」、0 は今日）。空欄にすると日付で絞り込みません。
              画面を開いたとき（および条件リセット時）の初期値で、利用者は画面上で変更できます。
              バーコード・QRで品番を検索した場合も、この期間が適用されたままになります。
            </p>
            <div className="row g-3 align-items-end">
              <div className="col-12 col-md-4">
                <label className="form-label fw-bold" htmlFor="schedule-date-from-offset">開始日（今日から何日後）</label>
                <input
                  type="number"
                  step="1"
                  className="form-control"
                  id="schedule-date-from-offset"
                  value={dateFromOffset}
                  placeholder="指定なし"
                  disabled={!dateDefaultsLoaded}
                  onChange={(e) => setDateFromOffset(e.target.value)}
                />
                <div className="form-text">{datePreview(dateFromOffset)}</div>
              </div>
              <div className="col-12 col-md-4">
                <label className="form-label fw-bold" htmlFor="schedule-date-to-offset">終了日（今日から何日後）</label>
                <input
                  type="number"
                  step="1"
                  className="form-control"
                  id="schedule-date-to-offset"
                  value={dateToOffset}
                  placeholder="指定なし"
                  disabled={!dateDefaultsLoaded}
                  onChange={(e) => setDateToOffset(e.target.value)}
                />
                <div className="form-text">{datePreview(dateToOffset)}</div>
              </div>
              <div className="col-12 col-md-4">
                <button
                  type="button"
                  className="btn btn-primary fw-bold"
                  disabled={!dateDefaultsLoaded}
                  onClick={handleSaveDateDefaults}
                >
                  初期値を保存
                </button>
              </div>
            </div>
            {dateDefaultsMessage && (
              <div className={`alert alert-${dateDefaultsMessage.type} mt-3 mb-0 py-2`} role="alert">
                {dateDefaultsMessage.text}
              </div>
            )}
          </div>
        </div>

        <form onSubmit={handleSave}>
          <div className="feature-flow-cards-list">
            {WORKFLOW_TRACKS.map((track) => {
              const currentVal = settings[track.id as FlowTrackId] || 'visible';
              return (
                <div
                  key={track.id}
                  className={`card shadow-sm mb-3 feature-flow-setting-card status-${currentVal}`}
                  style={
                    {
                      '--card-accent': track.accentColor,
                      '--card-border': track.borderColor,
                    } as React.CSSProperties
                  }
                >
                  <div className="card-header bg-white d-flex align-items-center justify-content-between flex-wrap gap-2 py-3">
                    <div className="d-flex align-items-center gap-2">
                      <span
                        className="badge rounded-pill text-white fw-bold px-3 py-2"
                        style={{ backgroundColor: track.accentColor }}
                      >
                        {track.badge}
                      </span>
                      <h5 className="mb-0 fw-bold text-dark">{track.title}</h5>
                      <span className="text-muted small d-none d-md-inline">
                        — {track.subtitle}
                      </span>
                    </div>

                    <div className="current-status-tag">
                      {currentVal === 'visible' && (
                        <span className="badge bg-success-subtle text-success-emphasis border border-success-subtle px-3 py-1">
                          ● 表示中
                        </span>
                      )}
                      {currentVal === 'grayed' && (
                        <span className="badge bg-secondary-subtle text-secondary border border-secondary px-3 py-1">
                          ▲ グレーアウト
                        </span>
                      )}
                      {currentVal === 'hidden' && (
                        <span className="badge bg-danger-subtle text-danger border border-danger px-3 py-1">
                          ✕ 非表示
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="card-body">
                    <p className="text-muted small mb-3">
                      <strong>含まれる業務フェーズ：</strong>
                      {track.phases.map((p, i) => (
                        <span key={p.step} className="me-2">
                          {i > 0 && ' → '}
                          {p.title}
                        </span>
                      ))}
                    </p>

                    <div className="row g-2">
                      {VISIBILITY_OPTIONS.map((opt) => {
                        const isSelected = currentVal === opt.value;
                        return (
                          <div key={opt.value} className="col-12 col-md-4">
                            <label
                              className={`feature-visibility-option-box ${
                                isSelected ? `selected selected-${opt.value}` : ''
                              }`}
                            >
                              <div className="d-flex align-items-center gap-2 mb-1">
                                <input
                                  type="radio"
                                  name={`flow-visibility-${track.id}`}
                                  value={opt.value}
                                  checked={isSelected}
                                  onChange={() =>
                                    handleVisibilityChange(track.id as FlowTrackId, opt.value)
                                  }
                                  className="form-check-input mt-0"
                                />
                                <span className="fw-bold opt-label">{opt.label}</span>
                              </div>
                              <p className="opt-desc mb-0 text-muted small">
                                {opt.description}
                              </p>
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mt-4 pt-3 border-top">
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={handleReset}
            >
              初期設定（すべて表示）に戻す
            </button>
            <div className="d-flex gap-2">
              <Link to="/" className="btn btn-outline-primary">
                トップへ戻る
              </Link>
              <button type="submit" className="btn btn-primary px-4 fw-bold">
                設定を保存する
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default FeatureSettings;

