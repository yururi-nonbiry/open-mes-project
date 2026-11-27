import { apiRequest } from '../utils/api';

export type FlowVisibility = 'visible' | 'grayed' | 'hidden';

export type FlowTrackId = 'receipt-flow' | 'production-plan-flow' | 'production-issue-flow';

export interface WorkflowFeatureSettings {
  'receipt-flow': FlowVisibility;
  'production-plan-flow': FlowVisibility;
  'production-issue-flow': FlowVisibility;
}

export const WORKFLOW_FEATURE_STORAGE_KEY = 'mes_workflow_feature_settings';

export const DEFAULT_WORKFLOW_FEATURE_SETTINGS: WorkflowFeatureSettings = {
  'receipt-flow': 'visible',
  'production-plan-flow': 'visible',
  'production-issue-flow': 'visible',
};

export function getWorkflowFeatureSettings(): WorkflowFeatureSettings {
  try {
    const raw = localStorage.getItem(WORKFLOW_FEATURE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_WORKFLOW_FEATURE_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      'receipt-flow': parsed['receipt-flow'] || 'visible',
      'production-plan-flow': parsed['production-plan-flow'] || 'visible',
      'production-issue-flow': parsed['production-issue-flow'] || 'visible',
    };
  } catch (_err) {
    return { ...DEFAULT_WORKFLOW_FEATURE_SETTINGS };
  }
}

const API_URL = '/api/base/workflow-visibility/';

/** 取得した設定を手元に控え(次に画面を開いたときの初期表示用)、表示中の画面へ知らせる */
function cacheAndNotify(settings: WorkflowFeatureSettings): void {
  try {
    localStorage.setItem(WORKFLOW_FEATURE_STORAGE_KEY, JSON.stringify(settings));
  } catch (_err) {
    // 保存できない環境でも、表示中の画面には反映する
  }
  window.dispatchEvent(
    new CustomEvent('workflow_feature_settings_changed', { detail: settings })
  );
}

/**
 * サーバーに保存された業務フローの表示設定を読み込む(システム全体で共通)。
 * 取得できなければ手元に控えた設定のまま表示する。
 */
export async function loadWorkflowFeatureSettings(): Promise<WorkflowFeatureSettings> {
  try {
    const settings = await apiRequest<WorkflowFeatureSettings>(API_URL, {}, '業務フローの表示設定の取得に失敗しました。');
    const merged = { ...DEFAULT_WORKFLOW_FEATURE_SETTINGS, ...settings };
    cacheAndNotify(merged);
    return merged;
  } catch (_err) {
    return getWorkflowFeatureSettings();
  }
}

/** 業務フローの表示設定をサーバーに保存する(管理者のみ)。失敗時は ApiError を送出する。 */
export async function saveWorkflowFeatureSettings(settings: WorkflowFeatureSettings): Promise<void> {
  const saved = await apiRequest<WorkflowFeatureSettings>(
    API_URL,
    { method: 'PUT', body: JSON.stringify(settings) },
    '業務フローの表示設定の保存に失敗しました。',
  );
  cacheAndNotify({ ...DEFAULT_WORKFLOW_FEATURE_SETTINGS, ...saved });
}

