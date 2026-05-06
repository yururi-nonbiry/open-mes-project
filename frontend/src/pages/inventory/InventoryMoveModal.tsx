import React, { useState, useEffect } from 'react';
import Modal from '../../components/Modal';
import inventoryService, { InventoryItem } from '../../services/inventoryService';

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
                target_warehouse: '',
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
            setError('移動数量は1以上である必要があります。');
            return;
        }
        if (!formData.target_warehouse) {
            setError('移動先倉庫は必須です。');
            return;
        }

        setSubmitting(true);
        try {
            const result = await inventoryService.moveInventory(item.id, {
                quantity_to_move: formData.quantity_to_move,
                target_warehouse: formData.target_warehouse.trim(),
                target_location: formData.target_location.trim(),
            });
            if (result.success) {
                setSuccess(result.message || '在庫を移動しました。');
                setTimeout(() => {
                    onSuccess();
                    onClose();
                }, 1500);
            } else {
                setError(result.error || '在庫の移動に失敗しました。');
            }
        } catch (err: any) {
            setError(err.message || '在庫移動中にエラーが発生しました。');
        } finally {
            setSubmitting(false);
        }
    };

    if (!item) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <div className="inventory-modal-content">
                <h2 className="mb-3">在庫移動</h2>
                <form onSubmit={handleSubmit}>
                    <p className="mb-1"><strong>品番:</strong> <span>{item.part_number}</span></p>
                    <p className="mb-1"><strong>移動元倉庫:</strong> <span>{item.warehouse}</span></p>
                    <p className="mb-1"><strong>移動元棚番:</strong> <span>{item.location}</span></p>
                    <p className="mb-3"><strong>現在数量:</strong> <span>{item.quantity}</span></p>
                    <hr />
                    <div className="mb-3">
                        <label htmlFor="move_quantity_input" className="form-label">移動数量:</label>
                        <input 
                            type="number" id="move_quantity_input" name="quantity_to_move" 
                            value={formData.quantity_to_move} onChange={handleFormChange} 
                            className="form-control form-control-sm" required min="1" max={item.quantity} 
                        />
                    </div>
                    <div className="mb-3">
                        <label htmlFor="move_target_warehouse_input" className="form-label">移動先倉庫:</label>
                        <input 
                            type="text" id="move_target_warehouse_input" name="target_warehouse" 
                            value={formData.target_warehouse} onChange={handleFormChange} 
                            className="form-control form-control-sm" required placeholder="例: 第二倉庫" 
                        />
                    </div>
                    <div className="mb-3">
                        <label htmlFor="move_target_location_input" className="form-label">移動先棚番:</label>
                        <input 
                            type="text" id="move_target_location_input" name="target_location" 
                            value={formData.target_location} onChange={handleFormChange} 
                            className="form-control form-control-sm" placeholder="例: B-02-01" 
                        />
                    </div>
                    {error && <div className="alert alert-danger p-2 small">{error}</div>}
                    {success && <div className="alert alert-success p-2 small">{success}</div>}
                    <div className="mt-3 text-end">
                        <button type="submit" className="btn btn-success btn-sm" disabled={submitting}>
                            {submitting ? '移動中...' : '移動実行'}
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm ms-2" onClick={onClose}>キャンセル</button>
                    </div>
                </form>
            </div>
        </Modal>
    );
};

export default InventoryMoveModal;
