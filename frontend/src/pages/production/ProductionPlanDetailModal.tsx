import React from 'react';
import Modal from '../../components/Modal';
import { ProductionPlan } from '../../types/production';

interface ProductionPlanDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    plan: ProductionPlan | null;
}

const ProductionPlanDetailModal: React.FC<ProductionPlanDetailModalProps> = ({
    isOpen, onClose, plan
}) => {
    if (!plan) return null;

    const fullFormat = (d: string | null | undefined) => d ? new Date(d).toLocaleString('ja-JP') : 'N/A';

    return (
        <Modal isOpen={isOpen} onClose={onClose} maxWidth="800px">
            <div className="p-3">
                <div className="d-flex justify-content-between align-items-center mb-3 border-bottom pb-2">
                    <h5 className="mb-0">生産計画詳細</h5>
                    <button type="button" className="btn-close" aria-label="Close" onClick={onClose}></button>
                </div>
                <dl className="row mb-3">
                    <dt className="col-sm-4">計画名:</dt><dd className="col-sm-8">{plan.plan_name || 'N/A'}</dd>
                    <dt className="col-sm-4">製品コード:</dt><dd className="col-sm-8">{plan.product_code || 'N/A'}</dd>
                    <dt className="col-sm-4">計画数量:</dt><dd className="col-sm-8 text-end">{plan.planned_quantity}</dd>
                    <dt className="col-sm-4">計画開始日時:</dt><dd className="col-sm-8">{fullFormat(plan.planned_start_datetime)}</dd>
                    <dt className="col-sm-4">計画終了日時:</dt><dd className="col-sm-8">{fullFormat(plan.planned_end_datetime)}</dd>
                    <dt className="col-sm-4">実績開始日時:</dt><dd className="col-sm-8">{fullFormat(plan.actual_start_datetime)}</dd>
                    <dt className="col-sm-4">実績終了日時:</dt><dd className="col-sm-8">{fullFormat(plan.actual_end_datetime)}</dd>
                    <dt className="col-sm-4">ステータス:</dt><dd className="col-sm-8">{plan.status || 'N/A'}</dd>
                    <dt className="col-sm-4">親計画ID:</dt><dd className="col-sm-8">{plan.production_plan || 'N/A'}</dd>
                    <dt className="col-sm-4">備考:</dt><dd className="col-sm-8">{plan.remarks || ''}</dd>
                    <dt className="col-sm-4">作成日時:</dt><dd className="col-sm-8">{fullFormat(plan.created_at)}</dd>
                    <dt className="col-sm-4">更新日時:</dt><dd className="col-sm-8">{fullFormat(plan.updated_at)}</dd>
                </dl>
                <div className="text-end mt-4">
                    <button className="btn btn-secondary" onClick={onClose}>閉じる</button>
                </div>
            </div>
        </Modal>
    );
};

export default ProductionPlanDetailModal;
