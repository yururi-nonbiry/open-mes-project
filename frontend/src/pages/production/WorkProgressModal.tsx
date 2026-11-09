import React, { useState, useEffect } from 'react';
import { Modal, Button, Alert } from 'react-bootstrap';
import productionService from '../../services/productionService';
import { ProductionPlan } from '../../types/production';
import { NavIcon } from '../../config/navigationConfig';

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
            setModalQuantities({
                actual: String(plan.planned_quantity ?? ''),
                good: String(plan.planned_quantity ?? ''),
                defective: '0',
            });

            if (plan.status === 'COMPLETED') {
                productionService.getWorkProgressForPlan(plan.id)
                    .then(records => {
                        const overall = records.find(r => r.process_step === 'Overall Plan Progress') || records[0];
                        if (overall) {
                            setModalQuantities({
                                actual: (overall.actual_reported_quantity ?? overall.quantity_completed).toString(),
                                good: overall.quantity_completed.toString(),
                                defective: (overall.defective_reported_quantity ?? 0).toString(),
                            });
                        }
                    })
                    .catch(() => {
                        setModalError('実績数量の取得に失敗しました。');
                    });
            }
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
        if (!dateString) return '—';
        const date = new Date(dateString);
        return date.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
    };

    return (
        <Modal show={isOpen} onHide={onClose} size="lg" centered scrollable className="mes-clean-modal">
            <Modal.Header closeButton className="mes-modal-header">
                <div className="mes-modal-title-wrap">
                    <span className="mes-modal-icon-box" aria-hidden="true">
                        <NavIcon name="progress" size={20} />
                    </span>
                    <div className="mes-modal-title-text">
                        <div className="mes-modal-title-row">
                            <Modal.Title className="mes-modal-title">作業進捗・完了の登録</Modal.Title>
                            <span className="mes-modal-tag-pill">完成品入庫・材料消費</span>
                        </div>
                        <p className="mes-modal-subtitle">
                            ステータスを「完了」にして製作数量・NG数量を登録すると、OK数量分の完成品が自動入庫されます。
                        </p>
                    </div>
                </div>
            </Modal.Header>
            <Modal.Body className="mes-modal-body">
                <div className="receipt-modal-summary-card mb-3">
                    <div className="receipt-summary-grid">
                        <div className="receipt-summary-item">
                            <span className="summary-label">計画名</span>
                            <span className="summary-value fw-bold">{plan.plan_name}</span>
                        </div>
                        <div className="receipt-summary-item">
                            <span className="summary-label">製品コード（品番）</span>
                            <span className="summary-value fw-bold">{plan.product_code}</span>
                        </div>
                        <div className="receipt-summary-item">
                            <span className="summary-label">開始予定日</span>
                            <span className="summary-value">{formatDate(plan.planned_start_datetime)}</span>
                        </div>
                        <div className="receipt-summary-item highlight">
                            <span className="summary-label">計画数量</span>
                            <span className="summary-value text-primary fw-bold fs-6">{plan.planned_quantity}</span>
                        </div>
                    </div>
                </div>

                <div className="mes-modal-field-group mb-3">
                    <label className="mes-modal-field-label">
                        <span>進捗ステータスの選択</span>
                        <span className="mes-field-badge required">必須</span>
                    </label>
                    <div className="receipt-status-tabs mt-1">
                        {availableStatuses.map(statusInfo => (
                            <button
                                key={statusInfo.key}
                                type="button"
                                className={`receipt-status-tab ${modalStatus === statusInfo.key ? 'active' : ''}`}
                                onClick={() => setModalStatus(statusInfo.key)}
                            >
                                {statusInfo.label}
                            </button>
                        ))}
                    </div>
                </div>

                {modalStatus === 'COMPLETED' && (
                    <div className="row g-3">
                        <div className="col-12 col-md-4">
                            <div className="mes-modal-field-group">
                                <label htmlFor="modalActualQuantity" className="mes-modal-field-label">
                                    <span>製作数量（総数）</span>
                                    <span className="mes-field-badge required">必須</span>
                                </label>
                                <input
                                    type="number"
                                    className="form-control mes-modal-input text-end fw-bold"
                                    id="modalActualQuantity"
                                    name="actual"
                                    value={modalQuantities.actual}
                                    onChange={handleQuantityChange}
                                    min="0"
                                />
                                <span className="mes-modal-field-help">実際に製造した総数</span>
                            </div>
                        </div>
                        <div className="col-12 col-md-4">
                            <div className="mes-modal-field-group">
                                <label htmlFor="modalDefectiveQuantity" className="mes-modal-field-label">
                                    <span>NG数量（不良数）</span>
                                    <span className="mes-field-badge required">必須</span>
                                </label>
                                <input
                                    type="number"
                                    className="form-control mes-modal-input text-end fw-bold"
                                    id="modalDefectiveQuantity"
                                    name="defective"
                                    value={modalQuantities.defective}
                                    onChange={handleQuantityChange}
                                    min="0"
                                />
                                <span className="mes-modal-field-help">不良品の数量（0以上）</span>
                            </div>
                        </div>
                        <div className="col-12 col-md-4">
                            <div className="mes-modal-field-group">
                                <label htmlFor="modalGoodQuantity" className="mes-modal-field-label">
                                    <span>OK数量（良品入庫数）</span>
                                    <span className="mes-field-badge optional">自動計算</span>
                                </label>
                                <input
                                    type="number"
                                    className="form-control mes-modal-input text-end fw-bold bg-light"
                                    id="modalGoodQuantity"
                                    name="good"
                                    value={modalQuantities.good}
                                    readOnly
                                />
                                <span className="mes-modal-field-help">製作数量 − NG数量（完成品入庫数）</span>
                            </div>
                        </div>
                    </div>
                )}

                {modalError && (
                    <Alert variant="danger" className="mt-3 mb-0 py-2 small">
                        {modalError}
                    </Alert>
                )}
            </Modal.Body>
            <Modal.Footer className="mes-modal-footer">
                <Button variant="outline-secondary" onClick={onClose}>
                    キャンセル
                </Button>
                <Button variant="primary" className="fw-bold px-4" onClick={handleSubmit} disabled={submitting}>
                    {submitting ? '登録中...' : '進捗を保存する'}
                </Button>
            </Modal.Footer>
        </Modal>
    );
};

export default WorkProgressModal;
