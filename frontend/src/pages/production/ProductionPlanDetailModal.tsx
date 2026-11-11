import React, { useEffect, useState } from 'react';
import Modal from '../../components/Modal';
import productionService from '../../services/productionService';
import { useWorkCenters } from '../../hooks/useWorkCenters';
import { ProductionPlan } from '../../types/production';

interface ProductionPlanDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    plan: ProductionPlan | null;
    /** ライン変更の保存後に呼ばれる(一覧の再取得用) */
    onUpdated?: (plan: ProductionPlan) => void;
}

const ProductionPlanDetailModal: React.FC<ProductionPlanDetailModalProps> = ({
    isOpen, onClose, plan, onUpdated
}) => {
    const workCenters = useWorkCenters();
    const [line, setLine] = useState('');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'danger'; text: string } | null>(null);

    useEffect(() => {
        setLine(plan?.line || '');
        setMessage(null);
    }, [plan]);

    if (!plan) return null;

    const lineChanged = line !== (plan.line || '');
    const handleSaveLine = async () => {
        setSaving(true);
        setMessage(null);
        try {
            const updated = await productionService.updatePlanLine(plan.id, line);
            setMessage({ type: 'success', text: '出庫先ラインを更新しました。今後の引当の既定値に使われます(引当済みの出庫先は変わりません)。' });
            onUpdated?.({ ...plan, ...updated });
        } catch (e: any) {
            setMessage({ type: 'danger', text: e.message });
        } finally {
            setSaving(false);
        }
    };

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
                    <dt className="col-sm-4">使用する在庫の用途:</dt><dd className="col-sm-8">{plan.purpose ? `${plan.purpose}（この用途→汎用の順で使用）` : '汎用のみ'}</dd>
                    <dt className="col-sm-4">出庫先ライン:</dt><dd className="col-sm-8">
                        <div className="d-flex gap-2">
                            <select
                                className="form-select form-select-sm" value={line}
                                onChange={(e) => setLine(e.target.value)} disabled={saving}
                            >
                                <option value="">未指定</option>
                                {workCenters.map(w => (
                                    <option key={w.code} value={w.code}>{w.code}{w.name ? `（${w.name}）` : ''}</option>
                                ))}
                            </select>
                            <button
                                type="button" className="btn btn-sm btn-primary text-nowrap"
                                onClick={handleSaveLine} disabled={!lineChanged || saving}
                            >
                                {saving ? '保存中...' : 'ラインを保存'}
                            </button>
                        </div>
                        {message && <div className={`small mt-1 text-${message.type}`}>{message.text}</div>}
                    </dd>
                    <dt className="col-sm-4">計画数量:</dt><dd className="col-sm-8 text-end">{plan.planned_quantity}</dd>
                    <dt className="col-sm-4">計画開始日時:</dt><dd className="col-sm-8">{fullFormat(plan.planned_start_datetime)}</dd>
                    <dt className="col-sm-4">計画終了日時:</dt><dd className="col-sm-8">{fullFormat(plan.planned_end_datetime)}</dd>
                    <dt className="col-sm-4">実績開始日時:</dt><dd className="col-sm-8">{fullFormat(plan.actual_start_datetime)}</dd>
                    <dt className="col-sm-4">実績終了日時:</dt><dd className="col-sm-8">{fullFormat(plan.actual_end_datetime)}</dd>
                    <dt className="col-sm-4">ステータス:</dt><dd className="col-sm-8">{plan.status || 'N/A'}</dd>
                    <dt className="col-sm-4">参照生産計画（旧BOMキー）:</dt><dd className="col-sm-8">{plan.production_plan || 'N/A'}</dd>
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
