import React, { useState, useEffect } from 'react';
import { Modal, Button, Alert } from 'react-bootstrap';
import inventoryService, { InventoryItem } from '../../services/inventoryService';
import { NavIcon } from '../../config/navigationConfig';

interface InventoryMoveModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    item: InventoryItem | null;
}

const InventoryMoveModal: React.FC<InventoryMoveModalProps> = ({
    isOpen, onClose, onSuccess, item
}) => {
    const [formData, setFormData] = useState({
        target_warehouse: '',
        target_location: '',
        quantity_to_move: 1
    });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen && item) {
            setFormData({
                target_warehouse: item.warehouse || '',
                target_location: '',
                quantity_to_move: 1
            });
            setError('');
            setSuccess('');
        }
    }, [isOpen, item]);

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: name === 'quantity_to_move' ? parseInt(value) || 0 : value
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!item) return;

        setError('');
        setSuccess('');

        if (formData.quantity_to_move <= 0) {
            setError('移動数量は1以上の整数を入力してください。');
            return;
        }
        if (!formData.target_warehouse) {
            setError('移動先の倉庫番号を入力してください。');
            return;
        }

        setSubmitting(true);
        try {
            const result = await inventoryService.moveInventory(item.id, {
                quantity_to_move: formData.quantity_to_move,
                target_warehouse: formData.target_warehouse.trim(),
                target_location: formData.target_location.trim(),
            });
            setSuccess(result.message || '在庫の棚移動が完了しました。');
            setTimeout(() => {
                onSuccess();
                onClose();
            }, 1200);
        } catch (err: any) {
            setError(err.message || '在庫移動中にエラーが発生しました。');
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
                        <NavIcon name="warehouse-map" size={20} />
                    </span>
                    <div className="mes-modal-title-text">
                        <div className="mes-modal-title-row">
                            <Modal.Title className="mes-modal-title">在庫の倉庫・棚番移動</Modal.Title>
                            <span className="mes-modal-tag-pill">ロケーション移動</span>
                        </div>
                        <p className="mes-modal-subtitle">
                            選択した在庫を指定数量分、別の倉庫または別の棚番へ移動します。
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
                                <span className="summary-label">用途</span>
                                <span className="summary-value fw-bold">{item.purpose || '汎用'}</span>
                            </div>
                            <div className="receipt-summary-item">
                                <span className="summary-label">移動元の倉庫 / 棚番</span>
                                <span className="summary-value fw-bold">
                                    {item.warehouse} / {item.location || '（棚番なし）'}
                                </span>
                            </div>
                            <div className="receipt-summary-item highlight">
                                <span className="summary-label">現在の在庫数量</span>
                                <span className="summary-value text-primary fw-bold fs-6">{item.quantity}</span>
                            </div>
                        </div>
                    </div>

                    <div className="row g-3">
                        <div className="col-12">
                            <div className="mes-modal-field-group">
                                <label htmlFor="move_quantity_input" className="mes-modal-field-label">
                                    <span>移動する数量</span>
                                    <span className="mes-field-badge required">必須</span>
                                </label>
                                <div className="d-flex align-items-center gap-2">
                                    <input
                                        type="number"
                                        id="move_quantity_input"
                                        name="quantity_to_move"
                                        value={formData.quantity_to_move}
                                        onChange={handleFormChange}
                                        className="form-control mes-modal-input text-end fw-bold"
                                        required
                                        min="1"
                                        max={item.quantity}
                                    />
                                    <button
                                        type="button"
                                        className="btn btn-outline-primary btn-sm text-nowrap fw-bold"
                                        onClick={() => setFormData(prev => ({ ...prev, quantity_to_move: item.quantity }))}
                                    >
                                        全量（{item.quantity}）をセット
                                    </button>
                                </div>
                                <span className="mes-modal-field-help">1〜{item.quantity} の範囲で移動数を指定します</span>
                            </div>
                        </div>

                        <div className="col-12 col-md-6">
                            <div className="mes-modal-field-group">
                                <label htmlFor="move_target_warehouse_input" className="mes-modal-field-label">
                                    <span>移動先の倉庫番号</span>
                                    <span className="mes-field-badge required">必須</span>
                                </label>
                                <input
                                    type="text"
                                    id="move_target_warehouse_input"
                                    name="target_warehouse"
                                    value={formData.target_warehouse}
                                    onChange={handleFormChange}
                                    className="form-control mes-modal-input"
                                    required
                                    placeholder="例：FG-MAIN / W001"
                                />
                                <span className="mes-modal-field-help">同じ倉庫内の棚移動はそのままにします</span>
                            </div>
                        </div>

                        <div className="col-12 col-md-6">
                            <div className="mes-modal-field-group">
                                <label htmlFor="move_target_location_input" className="mes-modal-field-label">
                                    <span>移動先の棚番</span>
                                    <span className="mes-field-badge optional">任意</span>
                                </label>
                                <input
                                    type="text"
                                    id="move_target_location_input"
                                    name="target_location"
                                    value={formData.target_location}
                                    onChange={handleFormChange}
                                    className="form-control mes-modal-input"
                                    placeholder="例：B-02-01"
                                />
                                <span className="mes-modal-field-help">新しい保管先の棚番を入力します</span>
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
                        {submitting ? '移動中...' : '棚移動を実行する'}
                    </Button>
                </Modal.Footer>
            </form>
        </Modal>
    );
};

export default InventoryMoveModal;
