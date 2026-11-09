import React from 'react';
import { Spinner } from 'react-bootstrap';
import { ProductionPlan } from '../../types/production';

interface ProductionPlanTableProps {
    plans: ProductionPlan[];
    loading: boolean;
    error: string | null;
    onDetail: (plan: ProductionPlan) => void;
    onAllocate: (plan: ProductionPlan) => void;
    onMaterials: (plan: ProductionPlan) => void;
    onAdditionalIssue: (plan: ProductionPlan) => void;
    onIntermediates: (plan: ProductionPlan) => void;
}

const PLAN_STATUS_META: Record<string, { label: string; className: string }> = {
    PENDING: { label: '未着手', className: 'receipt-status-badge status-pending' },
    IN_PROGRESS: { label: '進行中', className: 'receipt-status-badge status-partial' },
    COMPLETED: { label: '完了', className: 'receipt-status-badge status-completed' },
    ON_HOLD: { label: '保留', className: 'receipt-status-badge status-canceled' },
    CANCELLED: { label: '中止', className: 'receipt-status-badge status-canceled' },
};

const ProductionPlanTable: React.FC<ProductionPlanTableProps> = ({
    plans, loading, error, onDetail, onAllocate, onMaterials, onAdditionalIssue, onIntermediates
}) => {
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
                    <td colSpan={7} className="text-center py-5">
                        <Spinner animation="border" variant="primary" size="sm" className="me-2" />
                        <span className="text-muted">生産計画データを読み込んでいます...</span>
                    </td>
                </tr>
            );
        }
        if (error) {
            return (
                <tr>
                    <td colSpan={7} className="text-center text-danger py-4 fw-bold">
                        {error}
                    </td>
                </tr>
            );
        }
        if (plans.length === 0) {
            return (
                <tr>
                    <td colSpan={7} className="text-center py-5 text-muted">
                        <div className="fw-bold mb-1">該当する生産計画データがありません</div>
                        <div className="small">「＋ 生産計画を作成」から新規計画を登録するか、検索条件を切り替えてご確認ください。</div>
                    </td>
                </tr>
            );
        }

        return plans.map(plan => {
            const meta = PLAN_STATUS_META[plan.status] || {
                label: plan.status || '—',
                className: 'receipt-status-badge',
            };
            return (
                <tr key={plan.id}>
                    <td>
                        <div className="fw-bold text-dark">{plan.plan_name || '—'}</div>
                        {plan.parent_plan_name && <div className="small text-muted">親計画: {plan.parent_plan_name}</div>}
                        {!!plan.child_plan_count && <div className="small text-muted">子計画: {plan.child_plan_count}件</div>}
                    </td>
                    <td className="fw-semibold">{plan.product_code || '—'}</td>
                    <td className="text-end">
                        <span className="receipt-remaining-qty has-remaining">{plan.planned_quantity}</span>
                    </td>
                    <td className="text-center">{formatDate(plan.planned_start_datetime)}</td>
                    <td className="text-center">{formatDate(plan.planned_end_datetime)}</td>
                    <td className="text-center">
                        <span className={meta.className}>{meta.label}</span>
                    </td>
                    <td className="text-center text-nowrap">
                        <button type="button" className="btn btn-sm btn-outline-primary fw-bold" onClick={() => onMaterials(plan)}>
                            ① 部品構成
                        </button>
                        <button type="button" className="btn btn-sm btn-primary fw-bold ms-1" onClick={() => onAllocate(plan)}>
                            ② 材料引当
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
                            追加出庫
                        </button>
                        <button type="button" className="btn btn-sm btn-outline-secondary ms-1" onClick={() => onDetail(plan)}>
                            詳細
                        </button>
                    </td>
                </tr>
            );
        });
    };

    return (
        <div className="goods-receipt-table-card">
            <div className="table-responsive mb-0">
                <table className="table table-hover align-middle goods-receipt-table mb-0">
                    <thead>
                        <tr>
                            <th>計画名</th>
                            <th>製品コード（品番）</th>
                            <th className="text-end">計画数量</th>
                            <th className="text-center">開始予定日時</th>
                            <th className="text-center">終了予定日時</th>
                            <th className="text-center">状態</th>
                            <th className="text-center" style={{ width: '360px' }}>構成・引当・操作</th>
                        </tr>
                    </thead>
                    <tbody>{renderBody()}</tbody>
                </table>
            </div>
        </div>
    );
};

export default ProductionPlanTable;
