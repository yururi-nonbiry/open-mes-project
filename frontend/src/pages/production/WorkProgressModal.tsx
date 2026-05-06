import React, { useState, useEffect } from 'react';
import Modal from '../../components/Modal';
import productionService from '../../services/productionService';
import { ProductionPlan } from '../../types/production';

interface WorkProgressModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    plan: ProductionPlan | null;
    availableStatuses: any[];
}

const WorkProgressModal: React.FC<WorkProgressModalProps> = ({
    isOpen, onClose, onSuccess, plan, availableStatuses
}) => {
    const [modalQuantities, setModalQuantities] = useState({ actual: '', good: '', defective: '' });
    const [modalStatus, setModalStatus] = useState('');
    const [modalError, setModalError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen && plan) {
            setModalStatus(plan.status);
            setModalError('');

            let quantities = { actual: '', good: '', defective: '' };
            if (plan.status === 'COMPLETED') {
                quantities = {
                    actual: plan.planned_quantity.toString(),
                    good: plan.planned_quantity.toString(),
                    defective: '0'
                };
            }
            setModalQuantities(quantities);
        }
    }, [isOpen, plan]);

    const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        const newQuantities = { ...modalQuantities, [name]: value };

        const actual = parseInt(newQuantities.actual, 10) || 0;
        const defective = parseInt(newQuantities.defective, 10) || 0;
        newQuantities.good = Math.max(0, actual - defective).toString();

        setModalQuantities(newQuantities);
    };

    const handleSubmit = async () => {
        setModalError('');
        if (!plan || !modalStatus) return;

        const payload: any = { status: modalStatus };

        if (modalStatus === 'COMPLETED') {
            const actual = parseInt(modalQuantities.actual, 10);
            const good = parseInt(modalQuantities.good, 10);
            const defective = parseInt(modalQuantities.defective, 10);

            if (isNaN(actual) || actual < 0) { setModalError('製作数量を正しく入力してください。'); return; }
            if (isNaN(good) || good < 0) { setModalError('OK数量を正しく入力してください。'); return; }
            if (isNaN(defective) || defective < 0) { setModalError('NG数量を正しく入力してください。'); return; }
            if (good + defective > actual) { setModalError('OK数量とNG数量の合計は、製作数量を超えることはできません。'); return; }

            payload.actual_quantity = actual;
            payload.good_quantity = good;
            payload.defective_quantity = defective;
        }

        setSubmitting(true);
        try {
            await productionService.updateProgress(plan.id, payload);
            onSuccess();
            onClose();
        } catch (e: any) {
            setModalError(e.message);
        } finally {
            setSubmitting(false);
        }
    };

    if (!plan) return null;

    const formatDate = (dateString: string) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <div className="modal-header d-flex justify-content-between align-items-center w-100 p-0 mb-3 border-bottom pb-2">
                <h5 className="modal-title m-0">作業進捗確認 - 計画ID: {plan.id}</h5>
            </div>
            <div className="modal-body p-0">
                <p><strong>計画名:</strong> {plan.plan_name}</p>
                <p><strong>製品コード:</strong> {plan.product_code}</p>
                <p><strong>計画数量:</strong> {plan.planned_quantity}</p>
                <p><strong>計画開始日:</strong> {formatDate(plan.planned_start_datetime)}</p>
                <p><strong>現在のステータス:</strong> {availableStatuses.find(s => s.key === plan.status)?.label}</p>
                <hr />
                <form onSubmit={(e) => e.preventDefault()}>
                    <div className="mb-3">
                        <label className="form-label">ステータス変更</label>
                        <div>
                            {availableStatuses.map(statusInfo => (
                                <button
                                    key={statusInfo.key}
                                    type="button"
                                    className={`btn btn-sm me-1 mb-1 ${modalStatus === statusInfo.key ? statusInfo.btnClass : statusInfo.btnOutlineClass}`}
                                    onClick={() => setModalStatus(statusInfo.key)}
                                >
                                    {statusInfo.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {modalStatus === 'COMPLETED' && (
                        <div>
                            <h5>進捗数量入力</h5>
                            <div className="mb-3">
                                <label htmlFor="modalActualQuantity" className="form-label">製作数量</label>
                                <input type="number" className="form-control" id="modalActualQuantity" name="actual" value={modalQuantities.actual} onChange={handleQuantityChange} min="0" />
                            </div>
                            <div className="mb-3">
                                <label htmlFor="modalDefectiveQuantity" className="form-label">NG数量</label>
                                <input type="number" className="form-control" id="modalDefectiveQuantity" name="defective" value={modalQuantities.defective} onChange={handleQuantityChange} min="0" />
                            </div>
                            <div className="mb-3">
                                <label htmlFor="modalGoodQuantity" className="form-label">OK数量</label>
                                <input type="number" className="form-control" id="modalGoodQuantity" name="good" value={modalQuantities.good} readOnly />
                            </div>
                        </div>
                    )}
                    {modalError && <div className="alert alert-danger mt-2">{modalError}</div>}
                </form>
            </div>
            <div className="modal-footer border-top pt-3 mt-3 d-flex justify-content-end gap-2">
                <button type="button" className="btn btn-secondary" onClick={onClose}>閉じる</button>
                <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
                    {submitting ? '登録中...' : '進捗を登録'}
                </button>
            </div>
        </Modal>
    );
};

export default WorkProgressModal;
