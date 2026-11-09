import React, { useState, useEffect } from 'react';
import { Modal, Button, Alert } from 'react-bootstrap';
import bomService, { BillOfMaterial, MasterItem, isConsumableItem, isProducibleItem, itemTypeLabel } from '../../services/bomService';
import { NavIcon } from '../../config/navigationConfig';

interface BomMasterModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    editingItem: BillOfMaterial | null;
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
                const list = await bomService.getItems();
                setProductOptions(list.filter(isProducibleItem));
                setMaterialOptions(list.filter(isConsumableItem));
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
            setGlobalMessage({ text: '使用部品構成を保存しました。', type: 'success' });
            setTimeout(() => {
                onSuccess();
                onClose();
                setSubmitting(false);
            }, 800);
        } catch (err: any) {
            setSubmitting(false);
            if (err.errors) {
                setFormErrors(err.errors);
                setGlobalMessage({ text: err.message || '入力内容を確認してください。', type: 'danger' });
            } else {
                setGlobalMessage({ text: `送信中にエラーが発生しました: ${err.message}`, type: 'danger' });
            }
        }
    };

    return (
        <Modal show={isOpen} onHide={onClose} size="lg" centered scrollable className="mes-clean-modal">
            <Modal.Header closeButton className="mes-modal-header">
                <div className="mes-modal-title-wrap">
                    <span className="mes-modal-icon-box" aria-hidden="true">
                        <NavIcon name="bom" size={20} />
                    </span>
                    <div className="mes-modal-title-text">
                        <div className="mes-modal-title-row">
                            <Modal.Title className="mes-modal-title">
                                {editingItem ? '使用部品構成の編集' : '使用部品構成の新規登録'}
                            </Modal.Title>
                            <span className="mes-modal-tag-pill">部品構成（BOM）</span>
                        </div>
                        <p className="mes-modal-subtitle">
                            親品目（製品・中間品）1個を製造するために必要な使用部品と所要数量を設定します。
                        </p>
                    </div>
                </div>
            </Modal.Header>
            <form onSubmit={handleSubmit} noValidate>
                <Modal.Body className="mes-modal-body">
                    <div className="row g-3">
                        <div className="col-12 col-md-6">
                            <div className="mes-modal-field-group">
                                <label htmlFor="bom_product" className="mes-modal-field-label">
                                    <span>親品目（製品・中間品）</span>
                                    <span className="mes-field-badge required">必須</span>
                                </label>
                                <select
                                    id="bom_product"
                                    name="product"
                                    value={currentItem.product}
                                    onChange={handleChange}
                                    className={`form-select mes-modal-input ${formErrors.product ? 'is-invalid' : ''}`}
                                    required
                                >
                                    <option value="">-- 親品目を選択してください --</option>
                                    {productOptions.map(item => (
                                        <option key={item.id} value={item.code}>
                                            [{item.code}] {item.name}（{itemTypeLabel(item.item_type)}）
                                        </option>
                                    ))}
                                </select>
                                {formErrors.product && <div className="invalid-feedback d-block">{formErrors.product}</div>}
                                <span className="mes-modal-field-help">生産計画で製造する側の品目</span>
                            </div>
                        </div>

                        <div className="col-12 col-md-6">
                            <div className="mes-modal-field-group">
                                <label htmlFor="bom_material" className="mes-modal-field-label">
                                    <span>使用部品（材料・中間品）</span>
                                    <span className="mes-field-badge required">必須</span>
                                </label>
                                <select
                                    id="bom_material"
                                    name="material"
                                    value={currentItem.material}
                                    onChange={handleChange}
                                    className={`form-select mes-modal-input ${formErrors.material ? 'is-invalid' : ''}`}
                                    required
                                >
                                    <option value="">-- 使用部品を選択してください --</option>
                                    {materialOptions.map(item => (
                                        <option key={item.id} value={item.code}>
                                            [{item.code}] {item.name}（{itemTypeLabel(item.item_type)}）
                                        </option>
                                    ))}
                                </select>
                                {formErrors.material && <div className="invalid-feedback d-block">{formErrors.material}</div>}
                                <span className="mes-modal-field-help">製造に使用する部品・材料</span>
                            </div>
                        </div>

                        <div className="col-12 col-md-6">
                            <div className="mes-modal-field-group">
                                <label htmlFor="bom_quantity" className="mes-modal-field-label">
                                    <span>所要数量（親品目1個あたり）</span>
                                    <span className="mes-field-badge required">必須</span>
                                </label>
                                <input
                                    type="number"
                                    id="bom_quantity"
                                    name="quantity"
                                    step="0.001"
                                    min="0.001"
                                    value={currentItem.quantity}
                                    onChange={handleChange}
                                    className={`form-control mes-modal-input text-end fw-bold ${formErrors.quantity ? 'is-invalid' : ''}`}
                                    placeholder="例：2"
                                    required
                                />
                                {formErrors.quantity && <div className="invalid-feedback d-block">{formErrors.quantity}</div>}
                                <span className="mes-modal-field-help">親品目1単位を作るのに必要な数量</span>
                            </div>
                        </div>

                        <div className="col-12 col-md-6">
                            <div className="mes-modal-field-group">
                                <label htmlFor="bom_remarks" className="mes-modal-field-label">
                                    <span>備考</span>
                                    <span className="mes-field-badge optional">任意</span>
                                </label>
                                <input
                                    type="text"
                                    id="bom_remarks"
                                    name="remarks"
                                    value={currentItem.remarks || ''}
                                    onChange={handleChange}
                                    className={`form-control mes-modal-input ${formErrors.remarks ? 'is-invalid' : ''}`}
                                    placeholder="補足事項があれば入力"
                                />
                            </div>
                        </div>
                    </div>

                    {globalMessage.text && (
                        <Alert variant={globalMessage.type === 'success' ? 'success' : 'danger'} className="mt-3 mb-0 py-2 small fw-bold">
                            {globalMessage.text}
                        </Alert>
                    )}
                </Modal.Body>
                <Modal.Footer className="mes-modal-footer">
                    <Button variant="outline-secondary" onClick={onClose}>
                        キャンセル
                    </Button>
                    <Button type="submit" variant="primary" className="fw-bold px-4" disabled={submitting}>
                        {submitting ? '保存中...' : '構成を保存する'}
                    </Button>
                </Modal.Footer>
            </form>
        </Modal>
    );
};

export default BomMasterModal;
