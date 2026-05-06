import React, { useState, useEffect } from 'react';
import Modal from '../../components/Modal';
import inventoryService, { InventoryItem } from '../../services/inventoryService';

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
                location: item.location === '-' ? '' : item.location,
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
            setSuccess(result.message || '在庫を更新しました。');
            setTimeout(() => {
                onSuccess();
                onClose();
            }, 1500);
        } catch (err: any) {
            setError(err.message || '在庫の更新に失敗しました。');
        } finally {
            setSubmitting(false);
        }
    };

    if (!item) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <div className="inventory-modal-content">
                <h2 className="mb-3">在庫修正</h2>
                <form onSubmit={handleSubmit}>
                    <table className="table table-sm table-bordered mb-3">
                        <tbody>
                            <tr>
                                <td style={{ width: '35%' }}><label className="mb-0">製品/材料名:</label></td>
                                <td><p className="mb-0">{item.part_number}</p></td>
                            </tr>
                            <tr>
                                <td><label className="mb-0">倉庫 (変更不可):</label></td>
                                <td><p className="form-control-plaintext form-control-sm ps-2 mb-0">{item.warehouse}</p></td>
                            </tr>
                            <tr>
                                <td><label htmlFor="modal_location_input" className="mb-0">場所:</label></td>
                                <td><input type="text" id="modal_location_input" name="location" value={formData.location} onChange={handleFormChange} className="form-control form-control-sm" /></td>
                            </tr>
                            <tr>
                                <td><label htmlFor="modal_quantity_input" className="mb-0">在庫数:</label></td>
                                <td><input type="number" id="modal_quantity_input" name="quantity" value={formData.quantity} onChange={handleFormChange} className="form-control form-control-sm text-end" required /></td>
                            </tr>
                            <tr>
                                <td><label className="mb-0">引当在庫 (変更不可):</label></td>
                                <td><p className="mb-0 text-end" style={{ paddingRight: '0.5rem' }}>{item.reserved}</p></td>
                            </tr>
                            <tr>
                                <td><label className="mb-0">利用可能数 (参考):</label></td>
                                <td><p className="mb-0 text-end" style={{ paddingRight: '0.5rem' }}>{item.available_quantity}</p></td>
                            </tr>
                        </tbody>
                    </table>
                    {error && <div className="alert alert-danger p-2 small">{error}</div>}
                    {success && <div className="alert alert-success p-2 small">{success}</div>}
                    <div className="mt-3 text-end">
                        <button type="submit" className="btn btn-primary btn-sm" disabled={submitting}>
                            {submitting ? '保存中...' : '保存'}
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm ms-2" onClick={onClose}>キャンセル</button>
                    </div>
                </form>
            </div>
        </Modal>
    );
};

export default InventoryModifyModal;
