import React from 'react';
import { ProductionPlan } from '../../types/production';

interface ProductionPlanTableProps {
    plans: ProductionPlan[];
    loading: boolean;
    error: string | null;
    onDetail: (plan: ProductionPlan) => void;
    onAllocate: (plan: ProductionPlan) => void;
}

const ProductionPlanTable: React.FC<ProductionPlanTableProps> = ({
    plans, loading, error, onDetail, onAllocate
}) => {
    const formatDate = (dateStr: string) => {
        if (!dateStr) return 'N/A';
        const options: Intl.DateTimeFormatOptions = { 
            year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' 
        };
        return new Date(dateStr).toLocaleString('ja-JP', options);
    };

    if (loading) return <div className="text-center p-3">読み込み中...</div>;
    if (error) return <div className="alert alert-danger">{error}</div>;

    return (
        <div className="table-responsive">
            <table className="table table-striped table-hover table-bordered table-sm">
                <thead className="thead-light">
                    <tr>
                        <th>計画名</th>
                        <th>製品コード</th>
                        <th className="text-end">計画数量</th>
                        <th className="text-center">計画開始日時</th>
                        <th className="text-center">計画終了日時</th>
                        <th className="text-center">ステータス</th>
                        <th className="text-center">親計画ID</th>
                        <th className="text-center">詳細</th>
                        <th className="text-center">材料引当</th>
                    </tr>
                </thead>
                <tbody>
                    {plans.length > 0 ? plans.map(plan => (
                        <tr key={plan.id}>
                            <td>{plan.plan_name || 'N/A'}</td>
                            <td>{plan.product_code || 'N/A'}</td>
                            <td className="text-end">{plan.planned_quantity}</td>
                            <td className="text-center">{formatDate(plan.planned_start_datetime)}</td>
                            <td className="text-center">{formatDate(plan.planned_end_datetime)}</td>
                            <td className="text-center">{plan.status || 'N/A'}</td>
                            <td className="text-center">{plan.production_plan || 'N/A'}</td>
                            <td className="text-center">
                                <button className="btn btn-sm btn-info" onClick={() => onDetail(plan)}>詳細</button>
                            </td>
                            <td className="text-center">
                                <button className="btn btn-sm btn-warning" onClick={() => onAllocate(plan)}>材料引当</button>
                            </td>
                        </tr>
                    )) : (
                        <tr><td colSpan={9} className="text-center">生産計画データがありません。</td></tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default ProductionPlanTable;
