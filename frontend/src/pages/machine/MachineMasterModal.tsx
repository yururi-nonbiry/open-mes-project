import React, { useState, useEffect } from 'react';
import Modal from '../../components/Modal';
import { Machine } from '../../services/machineService';

interface MachineMasterModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (machine: Machine) => Promise<boolean>;
    editingMachine: Machine | null;
}

const MachineMasterModal: React.FC<MachineMasterModalProps> = ({ isOpen, onClose, onSave, editingMachine }) => {
    const initialFormState: Machine = {
        machine_number: '',
        name: '',
        location: '',
        description: '',
    };

    const [formData, setFormData] = useState<Machine>(initialFormState);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setFormData(editingMachine || initialFormState);
            setError(null);
        }
    }, [isOpen, editingMachine]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);
        try {
            await onSave(formData);
            onClose();
        } catch (e: any) {
            setError(e.message || '保存に失敗しました。');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <div className="p-2">
                <h4 className="mb-4">{editingMachine ? '設備修正' : '設備登録'}</h4>
                <form onSubmit={handleSubmit}>
                    <div className="mb-3">
                        <label className="form-label fw-bold small">設備番号</label>
                        <input 
                            type="text" name="machine_number" value={formData.machine_number} 
                            onChange={handleInputChange} className="form-control form-control-sm" required 
                        />
                    </div>
                    <div className="mb-3">
                        <label className="form-label fw-bold small">設備名</label>
                        <input 
                            type="text" name="name" value={formData.name} 
                            onChange={handleInputChange} className="form-control form-control-sm" required 
                        />
                    </div>
                    <div className="mb-3">
                        <label className="form-label fw-bold small">設置場所</label>
                        <input 
                            type="text" name="location" value={formData.location} 
                            onChange={handleInputChange} className="form-control form-control-sm" 
                        />
                    </div>
                    <div className="mb-3">
                        <label className="form-label fw-bold small">説明</label>
                        <textarea 
                            name="description" value={formData.description} 
                            onChange={handleInputChange} className="form-control form-control-sm" rows={3}
                        />
                    </div>

                    {error && <div className="alert alert-danger py-2 small">{error}</div>}

                    <div className="text-end mt-4 pt-3 border-top">
                        <button type="button" className="btn btn-secondary btn-sm me-2" onClick={onClose}>キャンセル</button>
                        <button type="submit" className="btn btn-primary btn-sm" disabled={submitting}>
                            {submitting ? '保存中...' : '保存'}
                        </button>
                    </div>
                </form>
            </div>
        </Modal>
    );
};

export default MachineMasterModal;
