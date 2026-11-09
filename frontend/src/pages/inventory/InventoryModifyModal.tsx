import React, { useState, useEffect } from 'react';
import { Modal, Button, Alert } from 'react-bootstrap';
import inventoryService, { InventoryItem } from '../../services/inventoryService';
import { NavIcon } from '../../config/navigationConfig';

interface InventoryModifyModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    item: InventoryItem | null;
}

const InventoryModifyModal: React.FC<InventoryModifyModalProps> = ({
    isOpen, onClose, onSuccess, item
}) => {
    const [formData, setFormData] = useState({
        location: '',
        quantity: 0,
    });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen && item) {
            setFormData({
                location: item.location === '-' ? '' : (item.location || ''),
                quantity: item.quantity,
            });
            setError('');
            setSuccess('');
        }
    }, [isOpen, item]);

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: name === 'quantity' ? parseInt(value) || 0 : value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!item) return;

        setError('');
        setSuccess('');
        setSubmitting(true);

        try {
            const result = await inventoryService.updateInventory(item.id, {
                quantity: formData.quantity,
                location: (formData.location || '').trim(),
            });
            setSuccess(result.message || '在庫数量・棚番を更新しました。');
            setTimeout(() => {
                onSuccess();
                onClose();
            }, 1200);
        } catch (err: any) {
            setError(err.message || '在庫の更新に失敗しました。');
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
                        <NavIcon name="inquiry" size={20} />
                    </span>
                    <div className="mes-modal-title-text">
                        <div className="mes-modal-title-row">
                            <Modal.Title className="mes-modal-title">在庫数量・棚番の修正</Modal.Title>
                            <span className="mes-modal-tag-pill">在庫調整</span>
                        </div>
                        <p className="mes-modal-subtitle">
                            実地棚卸や保管場所の整理に伴い、現在庫数または棚番を直接修正します。
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
                                <span className="summary-label">倉庫（変更不可）</span>
                                <span className="summary-value fw-bold">{item.warehouse}</span>
                            </div>
                            <div className="receipt-summary-item">
                                <span className="summary-label">引当済在庫</span>
                                <span className="summary-value">{item.reserved}</span>
                            </div>
                            <div className="receipt-summary-item highlight">
                                <span className="summary-label">利用可能数（参考）</span>
                                <span className="summary-value text-primary fw-bold">{item.available_quantity}</span>
                            </div>
                        </div>
                    </div>

                    <div className="row g-3">
                        <div className="col-12 col-md-6">
                            <div className="mes-modal-field-group">
                                <label htmlFor="modal_quantity_input" className="mes-modal-field-label">
                                    <span>修正後の在庫数</span>
                                    <span className="mes-field-badge required">必須</span>
                                </label>
                                <input
                                    type="number"
                                    id="modal_quantity_input"
                                    name="quantity"
                                    value={formData.quantity}
                                    onChange={handleFormChange}
                                    className="form-control mes-modal-input text-end fw-bold"
                                    required
                                />
                                <span className="mes-modal-field-help">実在庫の数量を入力してください</span>
                            </div>
                        </div>

                        <div className="col-12 col-md-6">
                            <div className="mes-modal-field-group">
                                <label htmlFor="modal_location_input" className="mes-modal-field-label">
                                    <span>棚番（ロケーション）</span>
                                    <span className="mes-field-badge optional">任意</span>
                                </label>
                                <input
                                    type="text"
                                    id="modal_location_input"
                                    name="location"
                                    value={formData.location}
                                    onChange={handleFormChange}
                                    className="form-control mes-modal-input"
                                    placeholder="例：A-01"
                                />
                                <span className="mes-modal-field-help">保管している棚番を入力します</span>
                            </div>
                        </div>
                    </div>

                    {error && <Alert variant="danger" className="mt-3 mb-0 py-2 small">{error}</Alert>}
                    {success && <Alert variant="success" className="mt-3 mb-0 py-2 small fw-bold">{success}</Alert>}
                </Modal.Body>
                <Modal.Footer className="mes-modal-footer">
                    <Button variant="outline-secondary" onClick={onClose}>
                        キャンセル
                    </Button>
                    <Button type="submit" variant="primary" className="fw-bold px-4" disabled={submitting}>
                        {submitting ? '保存中...' : '修正内容を保存する'}
                    </Button>
                </Modal.Footer>
            </form>
        </Modal>
    );
};

export default InventoryModifyModal;
