import React, { useEffect, useState } from 'react';
import { Spinner } from 'react-bootstrap';
import { BulkAllocationResult, PlanAllocationOverview, ProductionPlan } from '../../types/production';
import { t } from '../../utils/terms';
import Modal from '../../components/Modal';
import { PLAN_LIST_COLUMNS, PLAN_LIST_DATA_TYPE, type PlanListColumn } from '../../config/planListColumns';
import inventoryService from '../../services/inventoryService';

interface ProductionPlanTableProps {
    plans: ProductionPlan[];
    loading: boolean;
    error: string | null;
    onDetail: (plan: ProductionPlan) => void;
    onAllocate: (plan: ProductionPlan) => void;
    onMaterials: (plan: ProductionPlan) => void;
    onAdditionalIssue: (plan: ProductionPlan) => void;
    onIntermediates: (plan: ProductionPlan) => void;
    onUnmerge: (plan: ProductionPlan) => void;
    /** 計画ごとの引当状況(マスター・引当の進み具合・在庫) */
    overviews: Record<string, PlanAllocationOverview>;
    /** まとめ引当の対象にできる計画か */
    isSelectable: (plan: ProductionPlan) => boolean;
    selectedIds: Set<string>;
    onToggleSelected: (id: string, checked: boolean) => void;
    onToggleAll: (checked: boolean) => void;
    onBulkAllocate: () => void;
    bulkLoading: boolean;
    bulkResults: BulkAllocationResult[] | null;
    bulkError: string | null;
    onCloseBulkResults: () => void;
}

const BULK_RESULT_META: Record<BulkAllocationResult['status'], { label: string; className: string }> = {
    success: { label: '引当済', className: 'bg-success' },
    partial: { label: '一部不足', className: 'bg-warning text-dark' },
    skipped: { label: '対象外', className: 'bg-secondary' },
    error: { label: 'エラー', className: 'bg-danger' },
};

/** 引当状況の列の表示 */
const renderMaterialStatus = (overview: PlanAllocationOverview | undefined) => {
    if (!overview) return <span className="text-muted">—</span>;
    const progress = t(`引当 ${overview.allocated_part_count}/${overview.part_count} 部品`);
    switch (overview.state) {
        case 'NO_MASTER':
            return <span className="badge bg-secondary" title="この製品には構成マスター(BOM)が登録されていません">マスターなし</span>;
        case 'NO_PARTS':
            return <span className="badge bg-secondary" title={t('計画に所要部品がありません。「部品構成」から登録してください')}>{t('部品未登録')}</span>;
        case 'ALLOCATED':
            return <><span className="badge bg-success">引当済</span><div className="small text-muted">{progress}</div></>;
        case 'SHORTAGE':
            return (
                <>
                    <span className="badge bg-danger" title={t(`在庫が足りない部品: ${overview.shortage_parts.join('、')}`)}>
                        在庫不足 {overview.shortage_part_count}件
                    </span>
                    <div className="small text-muted">{progress}</div>
                </>
            );
        default:
            return <><span className="badge bg-primary">引当可（在庫あり）</span><div className="small text-muted">{progress}</div></>;
    }
};

const PLAN_STATUS_META: Record<string, { label: string; className: string }> = {
    PENDING: { label: '未着手', className: 'receipt-status-badge status-pending' },
    IN_PROGRESS: { label: '進行中', className: 'receipt-status-badge status-partial' },
    COMPLETED: { label: '完了', className: 'receipt-status-badge status-completed' },
    ON_HOLD: { label: '保留', className: 'receipt-status-badge status-canceled' },
    CANCELLED: { label: '中止', className: 'receipt-status-badge status-canceled' },
    MERGED: { label: '統合済', className: 'receipt-status-badge status-canceled' },
};

const ProductionPlanTable: React.FC<ProductionPlanTableProps> = ({
    plans, loading, error, onDetail, onAllocate, onMaterials, onAdditionalIssue, onIntermediates, onUnmerge,
    overviews, isSelectable, selectedIds, onToggleSelected, onToggleAll, onBulkAllocate,
    bulkLoading, bulkResults, bulkError, onCloseBulkResults
}) => {
    // 列の表示/非表示・並び順・表示名は、モデル項目表示設定(production_plan)で変更できる。
    // 設定が無い(取得できない)場合は既定の列をすべて表示する。
    const [columns, setColumns] = useState<(PlanListColumn & { title: string })[]>(
        PLAN_LIST_COLUMNS.map(c => ({ ...c, title: c.label }))
    );
    useEffect(() => {
        inventoryService.getDisplaySettings(PLAN_LIST_DATA_TYPE).then(settings => {
            if (settings.length === 0) return;
            const byName = new Map(settings.map(s => [s.model_field_name, s]));
            setColumns(PLAN_LIST_COLUMNS
                .map((c, index) => ({ c, setting: byName.get(c.name), index }))
                // 設定に無い列(後から追加された列)は既定の位置に表示する
                .filter(({ setting }) => !setting || setting.is_list_display)
                .sort((a, b) => (a.setting?.display_order ?? (a.index + 1) * 10) - (b.setting?.display_order ?? (b.index + 1) * 10))
                .map(({ c, setting }) => ({ ...c, title: setting?.display_name || c.label })));
        }).catch(() => { /* 設定を取得できなくても既定の列で表示する */ });
    }, []);
    const colCount = columns.length + 2; // 選択チェック列と操作列を加える

    const selectablePlans = plans.filter(isSelectable);
    const allChecked = selectablePlans.length > 0 && selectablePlans.every(p => selectedIds.has(p.id));

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '—';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleString('ja-JP', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const renderBody = () => {
        if (loading) {
            return (
                <tr>
                    <td colSpan={colCount} className="text-center py-5">
                        <Spinner animation="border" variant="primary" size="sm" className="me-2" />
                        <span className="text-muted">生産計画データを読み込んでいます...</span>
                    </td>
                </tr>
            );
        }
        if (error) {
            return (
                <tr>
                    <td colSpan={colCount} className="text-center text-danger py-4 fw-bold">
                        {error}
                    </td>
                </tr>
            );
        }
        if (plans.length === 0) {
            return (
                <tr>
                    <td colSpan={colCount} className="text-center py-5 text-muted">
                        <div className="fw-bold mb-1">該当する生産計画データがありません</div>
                        <div className="small">「＋ 生産計画を作成」から新規計画を登録するか、検索条件を切り替えてご確認ください。</div>
                    </td>
                </tr>
            );
        }

        const renderCell = (plan: ProductionPlan, name: string, meta: { label: string; className: string }): React.ReactNode => {
            switch (name) {
                case 'plan_name': return (
                    <>
                        <div className="fw-bold text-dark">{plan.plan_name || '—'}</div>
                        {plan.parent_plan_name && <div className="small text-muted">親計画: {plan.parent_plan_name}</div>}
                        {!!plan.child_plan_count && <div className="small text-muted">子計画: {plan.child_plan_count}件</div>}
                        {plan.merged_into_name && <div className="small text-muted">統合先: {plan.merged_into_name}</div>}
                        {!!plan.merged_plan_count && <div className="small text-muted">統合元: {plan.merged_plan_count}件</div>}
                    </>
                );
                case 'product_code': return plan.product_code || '—';
                case 'purpose': return plan.purpose || '汎用';
                case 'planned_quantity': return <span className="receipt-remaining-qty has-remaining">{plan.planned_quantity}</span>;
                case 'planned_start_datetime': return formatDate(plan.planned_start_datetime);
                case 'planned_end_datetime': return formatDate(plan.planned_end_datetime);
                case 'status': return <span className={meta.className}>{meta.label}</span>;
                case 'material_status': return renderMaterialStatus(overviews[plan.id]);
                default: return null;
            }
        };

        return plans.map(plan => {
            const meta = PLAN_STATUS_META[plan.status] || {
                label: plan.status || '—',
                className: 'receipt-status-badge',
            };
            return (
                <tr key={plan.id}>
                    <td className="text-center">
                        <input
                            type="checkbox" className="form-check-input"
                            aria-label={`${plan.plan_name}をまとめ引当の対象にする`}
                            disabled={!isSelectable(plan)}
                            checked={selectedIds.has(plan.id)}
                            onChange={(e) => onToggleSelected(plan.id, e.target.checked)}
                        />
                    </td>
                    {columns.map(col => (
                        <td key={col.name} className={col.name === 'product_code' ? 'fw-semibold' : col.align === 'end' ? 'text-end' : col.align === 'center' ? 'text-center' : undefined}>
                            {renderCell(plan, col.name, meta)}
                        </td>
                    ))}
                    <td className="text-center text-nowrap sticky-action-col">
                        {plan.status === 'MERGED' ? (
                            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => onDetail(plan)}>
                                詳細
                            </button>
                        ) : (<>
                        <button type="button" className="btn btn-sm btn-outline-primary fw-bold" onClick={() => onMaterials(plan)}>
                            {t('① 部品構成')}
                        </button>
                        <button type="button" className="btn btn-sm btn-primary fw-bold ms-1" onClick={() => onAllocate(plan)}>
                            {t('② 部品引当')}
                        </button>
                        <button type="button" className="btn btn-sm btn-outline-secondary ms-1" onClick={() => onIntermediates(plan)}>
                            中間品
                            {!!plan.pending_intermediate_count && ['PENDING', 'IN_PROGRESS'].includes(plan.status) && (
                                <span className="badge bg-warning text-dark ms-1" title="子計画を立てるか在庫を使うかが未決定の中間品">
                                    要判断 {plan.pending_intermediate_count}
                                </span>
                            )}
                        </button>
                        <button type="button" className="btn btn-sm btn-outline-secondary ms-1" onClick={() => onAdditionalIssue(plan)}>
                            {t('追加ピッキング')}
                        </button>
                        <button type="button" className="btn btn-sm btn-outline-secondary ms-1" onClick={() => onDetail(plan)}>
                            詳細
                        </button>
                        {!!plan.merged_plan_count && plan.status === 'PENDING' && (
                            <button type="button" className="btn btn-sm btn-outline-danger ms-1" onClick={() => onUnmerge(plan)}>
                                統合解除
                            </button>
                        )}
                        </>)}
                    </td>
                </tr>
            );
        });
    };

    return (
        <div className="goods-receipt-table-card">
            <div className="d-flex align-items-center gap-2 p-2 border-bottom">
                <button
                    type="button" className="btn btn-primary btn-sm fw-bold"
                    onClick={onBulkAllocate}
                    disabled={selectedIds.size === 0 || bulkLoading}
                >
                    {bulkLoading ? '引当中...' : `チェックした計画をまとめて引当（${selectedIds.size}件）`}
                </button>
                <span className="small text-muted">{t('在庫の多い倉庫から未引当分を引き当てます。倉庫・数量・ラインを指定する場合は各計画の「② 部品引当」から行ってください。')}</span>
            </div>
            <Modal isOpen={!!bulkError || !!bulkResults} onClose={onCloseBulkResults} maxWidth="640px">
                <div className="p-3">
                    <div className="d-flex justify-content-between align-items-center mb-3 border-bottom pb-2">
                        <h5 className="mb-0">まとめ引当の結果</h5>
                    </div>
                    {bulkError && <div className="alert alert-danger mb-0">{bulkError}</div>}
                    {bulkResults && (
                        <ul className="list-unstyled mb-0">
                            {bulkResults.map(r => (
                                <li key={r.plan_id} className="mb-1">
                                    <span className={`badge me-2 ${BULK_RESULT_META[r.status].className}`}>{BULK_RESULT_META[r.status].label}</span>
                                    {r.plan_name}: {r.message}
                                </li>
                            ))}
                        </ul>
                    )}
                    <div className="text-end mt-4">
                        <button type="button" className="btn btn-secondary" onClick={onCloseBulkResults}>閉じる</button>
                    </div>
                </div>
            </Modal>
            <div className="table-responsive mb-0">
                <table className="table table-hover align-middle goods-receipt-table mb-0">
                    <thead>
                        <tr>
                            <th style={{ width: '32px' }}>
                                <input
                                    type="checkbox" className="form-check-input"
                                    aria-label="引当できる計画をすべて選択"
                                    disabled={selectablePlans.length === 0}
                                    checked={allChecked}
                                    onChange={(e) => onToggleAll(e.target.checked)}
                                />
                            </th>
                            {columns.map(col => (
                                <th key={col.name} className={col.align === 'end' ? 'text-end' : col.align === 'center' ? 'text-center' : undefined}>
                                    {col.name === 'material_status' ? t(col.title) : col.title}
                                </th>
                            ))}
                            <th className="text-center sticky-action-col" style={{ width: '360px' }}>構成・引当・操作</th>
                        </tr>
                    </thead>
                    <tbody>{renderBody()}</tbody>
                </table>
            </div>
        </div>
    );
};

export default ProductionPlanTable;
