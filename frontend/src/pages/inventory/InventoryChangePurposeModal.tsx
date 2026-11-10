import React, { useState, useEffect } from 'react';
import { Modal, Button, Alert } from 'react-bootstrap';
import inventoryService, { InventoryItem } from '../../services/inventoryService';
import { useStockPurposes } from '../../hooks/useStockPurposes';
import { NavIcon } from '../../config/navigationConfig';

interface InventoryChangePurposeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    item: InventoryItem | null;
}

/** 在庫の用途変更(例: 緊急時にA製品用の在庫を汎用へ切り替える)。 */
const InventoryChangePurposeModal: React.FC<InventoryChangePurposeModalProps> = ({
    isOpen, onClose, onSuccess, item
}) => {
    const purposes = useStockPurposes();
    const [quantity, setQuantity] = useState(1);
    const [purpose, setPurpose] = useState('');
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const movable = item ? Math.max(0, item.quantity - item.reserved) : 0;
    const currentPurpose = item?.purpose || '';

    useEffect(() => {
        if (isOpen && item) {
            setQuantity(Math.max(1, Math.min(item.quantity - item.reserved, item.quantity)));
            // 既定の変更先: 用途付きなら汎用、汎用なら未選択
            setPurpose('');
            setReason('');
            setError('');
            setSuccess('');
        }
    }, [isOpen, item]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!item) return;
        setError('');
        setSuccess('');
        if (quantity <= 0 || quantity > movable) {
            setError(`変更する数量は1〜${movable}（引当済みを除く）の範囲で入力してください。`);
            return;
        }
        if (purpose === currentPurpose) {
            setError('変更前と同じ用途です。変更先の用途を選んでください。');
            return;
        }
        setSubmitting(true);
        try {
            const result = await inventoryService.changeInventoryPurpose(item.id, { quantity, purpose, reason: reason.trim() });
            setSuccess(result.message || '在庫の用途を変更しました。');
            setTimeout(() => {
                onSuccess();
                onClose();
            }, 1000);
        } catch (err: any) {
            setError(err.message || '用途の変更中にエラーが発生しました。');
        } finally {
            setSubmitting(false);
        }
    };

    if (!item) return null;

    return (
        <Modal show={isOpen} onHide={onClose} centered scrollable className="mes-clean-modal">
            <Modal.Header closeButton className="mes-modal-header">
                <div className="mes-modal-title-wrap">
                    <span className="mes-modal-icon-box" aria-hidden="true">
                        <NavIcon name="master" size={20} />
                    </span>
                    <div className="mes-modal-title-text">
                        <div className="mes-modal-title-row">
                            <Modal.Title className="mes-modal-title">在庫の用途変更</Modal.Title>
                            <span className="mes-modal-tag-pill">用途の付け替え</span>
                        </div>
                        <p className="mes-modal-subtitle">
                            指定数量を別の用途（汎用を含む）の在庫へ付け替えます。履歴に変更前後の用途を記録します。
                        </p>
                    </div>
                </div>
            </Modal.Header>
            <form onSubmit={handleSubmit}>
                <Modal.Body className="mes-modal-body">
                    <div className="receipt-modal-summary-card mb-3">
                        <div className="receipt-summary-grid">
                            <div className="receipt-summary-item">
                                <span className="summary-label">品番</span>
                                <span className="summary-value fw-bold">{item.part_number}</span>
                            </div>
                            <div className="receipt-summary-item">
                                <span className="summary-label">倉庫 / 棚番</span>
                                <span className="summary-value fw-bold">{item.warehouse} / {item.location || '（棚番なし）'}</span>
                            </div>
                            <div className="receipt-summary-item">
                                <span className="summary-label">現在の用途</span>
                                <span className="summary-value fw-bold">{currentPurpose || '汎用'}</span>
                            </div>
                            <div className="receipt-summary-item highlight">
                                <span className="summary-label">変更できる数量（引当済み除く）</span>
                                <span className="summary-value text-primary fw-bold fs-6">{movable}</span>
                            </div>
                        </div>
                    </div>

                    <div className="row g-3">
                        <div className="col-12 col-md-6">
                            <div className="mes-modal-field-group">
                                <label htmlFor="purpose_change_qty" className="mes-modal-field-label">
                                    <span>変更する数量</span>
                                    <span className="mes-field-badge required">必須</span>
                                </label>
                                <input
                                    type="number"
                                    id="purpose_change_qty"
                                    className="form-control mes-modal-input text-end fw-bold"
                                    value={quantity}
                                    onChange={e => setQuantity(parseInt(e.target.value, 10) || 0)}
                                    min="1"
                                    max={movable}
                                    required
                                />
                            </div>
                        </div>
                        <div className="col-12 col-md-6">
                            <div className="mes-modal-field-group">
                                <label htmlFor="purpose_change_to" className="mes-modal-field-label">
                                    <span>変更先の用途</span>
                                    <span className="mes-field-badge required">必須</span>
                                </label>
                                <select
                                    id="purpose_change_to"
                                    className="form-select mes-modal-input"
                                    value={purpose}
                                    onChange={e => setPurpose(e.target.value)}
                                >
                                    <option value="">汎用（どの用途にも使える）</option>
                                    {purposes.map(p => (
                                        <option key={p.code} value={p.code}>{p.code} - {p.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="col-12">
                            <div className="mes-modal-field-group">
                                <label htmlFor="purpose_change_reason" className="mes-modal-field-label">
                                    <span>理由</span>
                                    <span className="mes-field-badge optional">任意</span>
                                </label>
                                <input
                                    type="text"
                                    id="purpose_change_reason"
                                    className="form-control mes-modal-input"
                                    value={reason}
                                    onChange={e => setReason(e.target.value)}
                                    placeholder="例：緊急対応のためB製品の生産へ融通"
                                />
                            </div>
                        </div>
                    </div>

                    {error && <Alert variant="danger" className="mt-3 mb-0 py-2 small">{error}</Alert>}
                    {success && <Alert variant="success" className="mt-3 mb-0 py-2 small fw-bold">{success}</Alert>}
                </Modal.Body>
                <Modal.Footer className="mes-modal-footer">
                    <Button variant="outline-secondary" onClick={onClose}>キャンセル</Button>
                    <Button type="submit" variant="primary" className="fw-bold px-4" disabled={submitting || movable <= 0}>
                        {submitting ? '変更中...' : '用途を変更する'}
                    </Button>
                </Modal.Footer>
            </form>
        </Modal>
    );
};

export default InventoryChangePurposeModal;
