import React, { useState, useEffect } from 'react';
import Modal from '../../components/Modal';
import authFetch from '../../utils/api';
import bomService, { BillOfMaterial } from '../../services/bomService';

interface BomMasterModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    editingItem: BillOfMaterial | null;
}

interface MasterItem {
    id: string;
    code: string;
    name: string;
    item_type: string;
}

const emptyForm: BillOfMaterial = {
    product: '',
    material: '',
    quantity: '',
    remarks: '',
};

const BomMasterModal: React.FC<BomMasterModalProps> = ({ isOpen, onClose, onSuccess, editingItem }) => {
    const [currentItem, setCurrentItem] = useState<BillOfMaterial>(emptyForm);
    const [productOptions, setProductOptions] = useState<MasterItem[]>([]);
    const [materialOptions, setMaterialOptions] = useState<MasterItem[]>([]);
    const [formErrors, setFormErrors] = useState<any>({});
    const [globalMessage, setGlobalMessage] = useState({ text: '', type: '' });
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!isOpen) return;

        const loadItems = async () => {
            try {
                const res = await authFetch('/api/master/items/');
                if (!res.ok) return;
                const data = await res.json();
                const list: MasterItem[] = data.data || data;
                // item_type は表示名 ("Product"/"Material") で返るため大文字小文字を無視して判定する
                setProductOptions(list.filter((i) => i.item_type?.toLowerCase() === 'product'));
                setMaterialOptions(list.filter((i) => i.item_type?.toLowerCase() === 'material'));
            } catch (e) {
                console.error('Failed to load items:', e);
            }
        };
        loadItems();

        setCurrentItem(editingItem ? { ...editingItem } : { ...emptyForm });
        setFormErrors({});
        setGlobalMessage({ text: '', type: '' });
    }, [isOpen, editingItem]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setCurrentItem(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setFormErrors({});
        setGlobalMessage({ text: '', type: '' });

        const payload: BillOfMaterial = {
            ...currentItem,
            remarks: currentItem.remarks || null,
        };

        try {
            if (editingItem) {
                await bomService.updateBillOfMaterial(editingItem.id!, payload);
            } else {
                await bomService.createBillOfMaterial(payload);
            }
            setGlobalMessage({ text: '保存しました。', type: 'success' });
            setTimeout(() => {
                onSuccess();
                onClose();
                setSubmitting(false);
            }, 800);
        } catch (err: any) {
            setSubmitting(false);
            if (err.data) {
                const nonField = Array.isArray(err.data.non_field_errors) ? err.data.non_field_errors.join(' ') : '';
                setFormErrors(err.data);
                setGlobalMessage({ text: nonField || err.message || '入力内容を確認してください。', type: 'danger' });
            } else {
                setGlobalMessage({ text: `送信中にエラーが発生しました: ${err.message}`, type: 'danger' });
            }
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} maxWidth="600px">
            <div className="p-2">
                <h3>{editingItem ? '使用部品構成 変更' : '使用部品構成 新規登録'}</h3>
                <hr />
                <form onSubmit={handleSubmit} noValidate>
                    <div className="form-group">
                        <label htmlFor="bom_product">製品*</label>
                        <select
                            id="bom_product" name="product"
                            value={currentItem.product} onChange={handleChange}
                            className={`form-control ${formErrors.product ? 'is-invalid' : ''}`}
                            required
                        >
                            <option value="">-- 製品を選択 --</option>
                            {productOptions.map((item) => (
                                <option key={item.id} value={item.code}>[{item.code}] {item.name}</option>
                            ))}
                        </select>
                        <div className="invalid-feedback">{formErrors.product}</div>
                    </div>

                    <div className="form-group">
                        <label htmlFor="bom_material">使用部品*</label>
                        <select
                            id="bom_material" name="material"
                            value={currentItem.material} onChange={handleChange}
                            className={`form-control ${formErrors.material ? 'is-invalid' : ''}`}
                            required
                        >
                            <option value="">-- 部品を選択 --</option>
                            {materialOptions.map((item) => (
                                <option key={item.id} value={item.code}>[{item.code}] {item.name}</option>
                            ))}
                        </select>
                        <div className="invalid-feedback">{formErrors.material}</div>
                    </div>

                    <div className="form-group">
                        <label htmlFor="bom_quantity">所要数量（製品1個あたり）*</label>
                        <input
                            type="number" id="bom_quantity" name="quantity" step="0.001" min="0.001"
                            value={currentItem.quantity} onChange={handleChange}
                            className={`form-control ${formErrors.quantity ? 'is-invalid' : ''}`}
                            required
                        />
                        <div className="invalid-feedback">{formErrors.quantity}</div>
                    </div>

                    <div className="form-group">
                        <label htmlFor="bom_remarks">備考</label>
                        <textarea
                            id="bom_remarks" name="remarks" rows={3}
                            value={currentItem.remarks || ''} onChange={handleChange}
                            className={`form-control ${formErrors.remarks ? 'is-invalid' : ''}`}
                        />
                        <div className="invalid-feedback">{formErrors.remarks}</div>
                    </div>

                    {globalMessage.text && <div className={`alert alert-${globalMessage.type} mt-3`}>{globalMessage.text}</div>}

                    <div className="mt-4 text-right border-top pt-3">
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? '保存中...' : '保存'}
                        </button>
                        <button type="button" className="btn btn-secondary ml-2" onClick={onClose}>閉じる</button>
                    </div>
                </form>
            </div>
        </Modal>
    );
};

export default BomMasterModal;
