import React, { useState, useEffect } from 'react';
import Modal from '../../components/Modal';
import { WarehouseLocation } from '../../services/warehouseLocationService';

interface WarehouseLocationEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (location: WarehouseLocation) => Promise<void>;
    onDelete?: (id: string) => Promise<void>;
    location: WarehouseLocation | null;
}

const WarehouseLocationEditModal: React.FC<WarehouseLocationEditModalProps> = ({
    isOpen,
    onClose,
    onSave,
    onDelete,
    location,
}) => {
    const [formData, setFormData] = useState<WarehouseLocation | null>(location);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setFormData(location);
            setError(null);
        }
    }, [isOpen, location]);

    if (!formData) return null;

    const handleChange = (field: keyof WarehouseLocation, value: string) => {
        setFormData((prev) => (prev ? { ...prev, [field]: value } : prev));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData) return;
        setSubmitting(true);
        setError(null);
        try {
            await onSave({
                ...formData,
                width: Number(formData.width) || 1,
                height: Number(formData.height) || 1,
                pos_x: Number(formData.pos_x),
                pos_y: Number(formData.pos_y),
            });
            onClose();
        } catch (err: any) {
            setError(err.message || '保存に失敗しました。');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!formData.id || !onDelete) return;
        if (!window.confirm(`ロケーション「${formData.code}」を削除しますか？`)) return;
        setSubmitting(true);
        try {
            await onDelete(formData.id);
            onClose();
        } catch (err: any) {
            setError(err.message || '削除に失敗しました。');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <div className="p-2">
                <h4 className="mb-4">{formData.id ? 'ロケーション修正' : 'ロケーション登録'}</h4>
                <form onSubmit={handleSubmit}>
                    <div className="mb-2 small text-muted">
                        座標: ({formData.pos_x}, {formData.pos_y})
                    </div>
                    <div className="mb-3">
                        <label className="form-label fw-bold small">棚番（コード）</label>
                        <input
                            type="text"
                            className="form-control form-control-sm"
                            value={formData.code}
                            onChange={(e) => handleChange('code', e.target.value)}
                            required
                        />
                    </div>
                    <div className="mb-3">
                        <label className="form-label fw-bold small">ロケーション名</label>
                        <input
                            type="text"
                            className="form-control form-control-sm"
                            value={formData.name || ''}
                            onChange={(e) => handleChange('name', e.target.value)}
                        />
                    </div>
                    <div className="row mb-3">
                        <div className="col-6">
                            <label className="form-label fw-bold small">幅(マス数)</label>
                            <input
                                type="number"
                                min={1}
                                className="form-control form-control-sm"
                                value={formData.width}
                                onChange={(e) => handleChange('width', e.target.value)}
                                required
                            />
                        </div>
                        <div className="col-6">
                            <label className="form-label fw-bold small">高さ(マス数)</label>
                            <input
                                type="number"
                                min={1}
                                className="form-control form-control-sm"
                                value={formData.height}
                                onChange={(e) => handleChange('height', e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    {error && <div className="alert alert-danger py-2 small">{error}</div>}

                    <div className="d-flex justify-content-between mt-4 pt-3 border-top">
                        <div>
                            {formData.id && onDelete && (
                                <button type="button" className="btn btn-outline-danger btn-sm" onClick={handleDelete} disabled={submitting}>
                                    削除
                                </button>
                            )}
                        </div>
                        <div>
                            <button type="button" className="btn btn-secondary btn-sm me-2" onClick={onClose}>キャンセル</button>
                            <button type="submit" className="btn btn-primary btn-sm" disabled={submitting}>
                                {submitting ? '保存中...' : '保存'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </Modal>
    );
};

export default WarehouseLocationEditModal;
