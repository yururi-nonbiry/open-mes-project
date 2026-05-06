import React from 'react';
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

const WorkProgressTable: React.FC<WorkProgressTableProps> = ({ 
    plans, loading, error, pageInfo, sorting, onSort, onOpenModal 
}) => {
    const formatDate = (dateString: string) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
    };

    const renderSortIndicator = (field: string) => {
        if (sorting.field !== field) return null;
        return sorting.direction === 'asc' ? '▲' : '▼';
    };

    if (loading) return <div className="text-center p-3">データを読み込み中です...</div>;
    if (error) return <div className="alert alert-danger">{error}</div>;

    return (
        <div className="table-responsive">
            <table className="table table-striped table-hover table-bordered">
                <thead>
                    <tr>
                        <th onClick={() => onSort('plan_name')} style={{ cursor: 'pointer' }}>
                            計画名 {renderSortIndicator('plan_name')}
                        </th>
                        <th onClick={() => onSort('product_code')} style={{ cursor: 'pointer' }}>
                            製品コード {renderSortIndicator('product_code')}
                        </th>
                        <th className="text-end" onClick={() => onSort('planned_quantity')} style={{ cursor: 'pointer' }}>
                            計画数量 {renderSortIndicator('planned_quantity')}
                        </th>
                        <th className="text-center" onClick={() => onSort('planned_start_datetime')} style={{ cursor: 'pointer' }}>
                            計画開始日 {renderSortIndicator('planned_start_datetime')}
                        </th>
                        <th className="text-center" onClick={() => onSort('status')} style={{ cursor: 'pointer' }}>
                            ステータス {renderSortIndicator('status')}
                        </th>
                        <th className="text-center">アクション</th>
                    </tr>
                </thead>
                <tbody>
                    {plans.length > 0 ? plans.map(plan => {
                        const statusInfo = AVAILABLE_STATUSES.find(s => s.key === plan.status);
                        return (
                            <tr key={plan.id}>
                                <td>{plan.plan_name}</td>
                                <td>{plan.product_code}</td>
                                <td className="text-end">{plan.planned_quantity}</td>
                                <td className="text-center">{formatDate(plan.planned_start_datetime)}</td>
                                <td className="text-center">
                                    <span className={`btn btn-sm ${statusInfo?.btnClass || 'btn-secondary'}`} style={{ pointerEvents: 'none' }}>
                                        {statusInfo?.label || plan.status}
                                    </span>
                                </td>
                                <td className="text-center">
                                    <button className="btn btn-sm btn-primary" onClick={() => onOpenModal(plan)}>
                                        進捗確認
                                    </button>
                                </td>
                            </tr>
                        );
                    }) : (
                        <tr><td colSpan={6} className="text-center">{pageInfo || '登録されている生産計画はありません。'}</td></tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default WorkProgressTable;
