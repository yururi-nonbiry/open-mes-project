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
  } catch {
    return { ...DEFAULT_WORKFLOW_FEATURE_SETTINGS };
  }
}

export function saveWorkflowFeatureSettings(settings: WorkflowFeatureSettings): void {
  localStorage.setItem(WORKFLOW_FEATURE_STORAGE_KEY, JSON.stringify(settings));
  window.dispatchEvent(
    new CustomEvent('workflow_feature_settings_changed', { detail: settings })
  );
}

