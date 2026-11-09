import React from 'react';
import { Spinner } from 'react-bootstrap';
import { ProductionPlan, AVAILABLE_STATUSES } from '../../types/production';

interface WorkProgressTableProps {
    plans: ProductionPlan[];
    loading: boolean;
    error: string | null;
    pageInfo: string;
    sorting: { field: string, direction: 'asc' | 'desc' };
    onSort: (field: string) => void;
    onOpenModal: (plan: ProductionPlan) => void;
}

const PROGRESS_STATUS_BADGE: Record<string, string> = {
    PENDING: 'receipt-status-badge status-pending',
    IN_PROGRESS: 'receipt-status-badge status-partial',
    COMPLETED: 'receipt-status-badge status-completed',
    ON_HOLD: 'receipt-status-badge status-canceled',
    CANCELLED: 'receipt-status-badge status-canceled',
};

const WorkProgressTable: React.FC<WorkProgressTableProps> = ({
    plans, loading, error, pageInfo, sorting, onSort, onOpenModal
}) => {
    const formatDate = (dateString: string) => {
        if (!dateString) return '—';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;
        return date.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
    };

    const renderSortIndicator = (field: string) => {
        if (sorting.field !== field) return null;
        return sorting.direction === 'asc' ? ' ▲' : ' ▼';
    };

    const renderBody = () => {
        if (loading) {
            return (
                <tr>
                    <td colSpan={6} className="text-center py-5">
                        <Spinner animation="border" variant="primary" size="sm" className="me-2" />
                        <span className="text-muted">作業進捗データを読み込んでいます...</span>
                    </td>
                </tr>
            );
        }
        if (error) {
            return (
                <tr>
                    <td colSpan={6} className="text-center text-danger py-4 fw-bold">
                        {error}
                    </td>
                </tr>
            );
        }
        if (plans.length === 0) {
            return (
                <tr>
                    <td colSpan={6} className="text-center py-5 text-muted">
                        {pageInfo || '該当する生産計画はありません。'}
                    </td>
                </tr>
            );
        }

        return plans.map(plan => {
            const statusInfo = AVAILABLE_STATUSES.find(s => s.key === plan.status);
            const badgeClass = PROGRESS_STATUS_BADGE[plan.status] || 'receipt-status-badge';
            return (
                <tr key={plan.id}>
                    <td className="fw-bold text-dark">{plan.plan_name || '—'}</td>
                    <td className="fw-semibold">{plan.product_code || '—'}</td>
                    <td className="text-end">
                        <span className="receipt-remaining-qty has-remaining">{plan.planned_quantity}</span>
                    </td>
                    <td className="text-center">{formatDate(plan.planned_start_datetime)}</td>
                    <td className="text-center">
                        <span className={badgeClass}>
                            {statusInfo?.label || plan.status}
                        </span>
                    </td>
                    <td className="text-center text-nowrap">
                        <button
                            type="button"
                            className="btn btn-sm btn-primary fw-bold px-3"
                            onClick={() => onOpenModal(plan)}
                        >
                            進捗・完了登録
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
                            <th onClick={() => onSort('plan_name')} style={{ cursor: 'pointer' }}>
                                計画名{renderSortIndicator('plan_name')}
                            </th>
                            <th onClick={() => onSort('product_code')} style={{ cursor: 'pointer' }}>
                                製品コード（品番）{renderSortIndicator('product_code')}
                            </th>
                            <th className="text-end" onClick={() => onSort('planned_quantity')} style={{ cursor: 'pointer' }}>
                                計画数量{renderSortIndicator('planned_quantity')}
                            </th>
                            <th className="text-center" onClick={() => onSort('planned_start_datetime')} style={{ cursor: 'pointer' }}>
                                開始予定日{renderSortIndicator('planned_start_datetime')}
                            </th>
                            <th className="text-center" onClick={() => onSort('status')} style={{ cursor: 'pointer' }}>
                                状態{renderSortIndicator('status')}
                            </th>
                            <th className="text-center" style={{ width: '160px' }}>進捗操作</th>
                        </tr>
                    </thead>
                    <tbody>{renderBody()}</tbody>
                </table>
            </div>
        </div>
    );
};

export default WorkProgressTable;
