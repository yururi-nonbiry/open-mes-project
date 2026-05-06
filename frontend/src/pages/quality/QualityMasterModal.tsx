import React, { useState, useEffect, useRef } from 'react';
import Sortable from 'sortablejs';
import Modal from '../../components/Modal';
import qualityService, { InspectionItem, MeasurementDetail } from '../../services/qualityService';

interface QualityMasterModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    editingItem: InspectionItem | null;
}

const INSPECTION_TYPE_CHOICES = [
    ['acceptance', '受入検査'], ['in_process', '工程内検査'], ['final', '最終検査'],
    ['shipping', '出荷検査'], ['patrol', '巡回検査'],
];
const TARGET_OBJECT_CHOICES = [
    ['raw_material', '原材料'], ['component', '部品'], ['wip', '仕掛品'],
    ['finished_good', '完成品'], ['equipment', '設備'], ['process', '工程'],
];
const MEASUREMENT_TYPE_CHOICES = [
    ['quantitative', '定量測定'], ['qualitative', '定性判定'],
];

const QualityMasterModal: React.FC<QualityMasterModalProps> = ({ isOpen, onClose, onSuccess, editingItem }) => {
    const [currentItem, setCurrentItem] = useState<InspectionItem | null>(null);
    const [measurementDetails, setMeasurementDetails] = useState<MeasurementDetail[]>([]);
    const [formErrors, setFormErrors] = useState<any>({});
    const [globalMessage, setGlobalMessage] = useState({ text: '', type: '' });
    const [submitting, setSubmitting] = useState(false);

    const formsetTableBodyRef = useRef<HTMLTableSectionElement>(null);
    const sortable = useRef<Sortable | null>(null);

    useEffect(() => {
        if (isOpen) {
            if (editingItem) {
                // Fetch full data for editing
                const fetchFullItem = async () => {
                    try {
                        const data = await qualityService.getInspectionItem(editingItem.id!);
                        setCurrentItem(data);
                        setMeasurementDetails(data.measurement_details || []);
                    } catch (e: any) {
                        setGlobalMessage({ text: `データ読み込みエラー: ${e.message}`, type: 'danger' });
                    }
                };
                fetchFullItem();
            } else {
                setCurrentItem({
                    code: '', name: '', description: '',
                    inspection_type: 'acceptance',
                    target_object_type: 'raw_material',
                    is_active: true,
                });
                setMeasurementDetails([]);
            }
            setFormErrors({});
            setGlobalMessage({ text: '', type: '' });
        }
    }, [isOpen, editingItem]);

    useEffect(() => {
        if (isOpen && formsetTableBodyRef.current) {
            sortable.current = Sortable.create(formsetTableBodyRef.current, {
                handle: '.drag-handle',
                animation: 150,
                onEnd: (evt: Sortable.SortableEvent) => {
                    const { oldIndex, newIndex } = evt;
                    if (oldIndex !== undefined && newIndex !== undefined) {
                        setMeasurementDetails(currentDetails => {
                            const newDetails = [...currentDetails];
                            const [movedItem] = newDetails.splice(oldIndex, 1);
                            newDetails.splice(newIndex, 0, movedItem);
                            return newDetails;
                        });
                    }
                },
            });
        }
        return () => {
            sortable.current?.destroy();
            sortable.current = null;
        };
    }, [isOpen, measurementDetails]);

    const handleMainFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
        setCurrentItem(prev => prev ? ({ ...prev, [name]: val }) : null);
    };

    const handleDetailChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>, index: number) => {
        const { name, value, type } = e.target;
        setMeasurementDetails(prev => prev.map((detail, i) =>
            i === index ? { 
                ...detail, 
                [name]: type === 'number' ? (value === '' ? null : Number(value)) : value 
            } : detail
        ));
    };

    const addDetailRow = () => {
        const newRow: MeasurementDetail = {
            id: null, name: '', measurement_type: 'qualitative',
            specification_nominal: null, specification_upper_limit: null, specification_lower_limit: null,
            specification_unit: '', expected_qualitative_result: '',
        };
        setMeasurementDetails(prev => [...prev, newRow]);
    };

    const removeDetailRow = (index: number) => {
        setMeasurementDetails(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentItem) return;

        setSubmitting(true);
        setFormErrors({});
        setGlobalMessage({ text: '', type: '' });

        const orderedDetails = measurementDetails.map((detail, index) => ({
            ...detail,
            order: index + 1,
        }));

        const payload = { ...currentItem, measurement_details: orderedDetails };

        try {
            if (editingItem) {
                await qualityService.updateInspectionItem(editingItem.id!, payload);
            } else {
                await qualityService.createInspectionItem(payload);
            }
            setGlobalMessage({ text: '保存しました。', type: 'success' });
            setTimeout(() => {
                onSuccess();
                onClose();
                setSubmitting(false);
            }, 1000);
        } catch (err: any) {
            setSubmitting(false);
            if (err.data) {
                const errors = err.data;
                const flatErrors: any = {};
                if (errors.measurement_details && Array.isArray(errors.measurement_details)) {
                    errors.measurement_details.forEach((detailError: any, index: number) => {
                        if (detailError) {
                            for (const [field, messages] of Object.entries(detailError)) {
                                flatErrors[`measurement_details-${index}-${field}`] = (messages as string[]).join(' ');
                            }
                        }
                    });
                    delete errors.measurement_details;
                }
                setFormErrors({ ...errors, ...flatErrors });
                setGlobalMessage({ text: err.message || '入力内容を確認してください。', type: 'danger' });
            } else {
                setGlobalMessage({ text: `送信中にエラーが発生しました: ${err.message}`, type: 'danger' });
            }
        }
    };

    if (!currentItem) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} maxWidth="1140px">
            <div className="p-2">
                <h3>{editingItem ? `${editingItem.name} 変更` : '新規検査項目登録'}</h3>
                <hr />
                <form onSubmit={handleSubmit} noValidate>
                    <div id="mainInspectionItemFieldsContainer" className="d-flex flex-wrap gap-3 overflow-auto pb-3">
                        <div className="form-group" style={{ flex: '0 0 auto', minWidth: '200px' }}>
                            <label htmlFor="modal_id_code">検査項目コード*</label>
                            <input 
                                type="text" id="modal_id_code" name="code" 
                                value={currentItem.code} onChange={handleMainFormChange} 
                                className={`form-control ${formErrors.code ? 'is-invalid' : ''}`} 
                            />
                            <div className="invalid-feedback">{formErrors.code}</div>
                        </div>
                        <div className="form-group" style={{ flex: '0 0 auto', minWidth: '200px' }}>
                            <label htmlFor="modal_id_name">検査項目名*</label>
                            <input 
                                type="text" id="modal_id_name" name="name" 
                                value={currentItem.name} onChange={handleMainFormChange} 
                                className={`form-control ${formErrors.name ? 'is-invalid' : ''}`} 
                            />
                            <div className="invalid-feedback">{formErrors.name}</div>
                        </div>
                        <div className="form-group" style={{ flex: '0 0 auto', minWidth: '200px' }}>
                            <label htmlFor="modal_id_inspection_type">検査種別*</label>
                            <select 
                                id="modal_id_inspection_type" name="inspection_type" 
                                value={currentItem.inspection_type} onChange={handleMainFormChange} 
                                className={`form-control ${formErrors.inspection_type ? 'is-invalid' : ''}`}
                            >
                                {INSPECTION_TYPE_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </select>
                            <div className="invalid-feedback">{formErrors.inspection_type}</div>
                        </div>
                        <div className="form-group" style={{ flex: '0 0 auto', minWidth: '200px' }}>
                            <label htmlFor="modal_id_target_object_type">対象物タイプ*</label>
                            <select 
                                id="modal_id_target_object_type" name="target_object_type" 
                                value={currentItem.target_object_type} onChange={handleMainFormChange} 
                                className={`form-control ${formErrors.target_object_type ? 'is-invalid' : ''}`}
                            >
                                {TARGET_OBJECT_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </select>
                            <div className="invalid-feedback">{formErrors.target_object_type}</div>
                        </div>
                    </div>
                    <div className="mt-3 row">
                        <div className="col-md-6">
                            <div className="form-group">
                                <label htmlFor="modal_id_description">説明</label>
                                <textarea 
                                    id="modal_id_description" name="description" 
                                    value={currentItem.description || ''} onChange={handleMainFormChange} 
                                    className={`form-control ${formErrors.description ? 'is-invalid' : ''}`} rows={3} 
                                />
                                <div className="invalid-feedback">{formErrors.description}</div>
                            </div>
                        </div>
                        <div className="col-md-6 d-flex align-items-center">
                            <div className="form-group form-check mb-0">
                                <input 
                                    id="modal_id_is_active" name="is_active" type="checkbox" 
                                    checked={currentItem.is_active} onChange={handleMainFormChange} 
                                    className={`form-check-input ${formErrors.is_active ? 'is-invalid' : ''}`} 
                                />
                                <label htmlFor="modal_id_is_active" className="form-check-label">有効フラグ</label>
                                <div className="invalid-feedback">{formErrors.is_active}</div>
                            </div>
                        </div>
                    </div>
                    <hr />
                    <div id="measurementDetailsFormsetContainer">
                        <h5>測定・判定詳細</h5>
                        <div className="table-responsive">
                            <table className="table table-sm table-bordered" style={{ tableLayout: 'fixed', width: '100%' }}>
                                <thead className="thead-light">
                                    <tr>
                                        <th style={{ width: '30px' }}></th>
                                        <th style={{ width: '150px' }}>測定・判定名*</th>
                                        <th style={{ width: '90px' }}>タイプ*</th>
                                        <th style={{ width: '80px' }}>規格値(中心)</th>
                                        <th style={{ width: '80px' }}>規格上限</th>
                                        <th style={{ width: '80px' }}>規格下限</th>
                                        <th style={{ width: '60px' }}>単位</th>
                                        <th style={{ width: '100px' }}>期待結果(定性)</th>
                                        <th style={{ width: '60px' }}>削除</th>
                                    </tr>
                                </thead>
                                <tbody ref={formsetTableBodyRef}>
                                    {measurementDetails.map((detail, index) => {
                                        const prefix = `measurement_details-${index}`;
                                        const isQuantitative = detail.measurement_type === 'quantitative';
                                        return (
                                            <tr key={index} className="formset-row">
                                                <td className="drag-handle" style={{ cursor: 'move', textAlign: 'center' }}>☰</td>
                                                <td>
                                                    <input 
                                                        type="text" value={detail.name || ''} 
                                                        onChange={e => handleDetailChange(e, index)} name="name" 
                                                        className={`form-control form-control-sm ${formErrors[`${prefix}-name`] ? 'is-invalid' : ''}`} 
                                                    />
                                                    <div className="invalid-feedback">{formErrors[`${prefix}-name`]}</div>
                                                </td>
                                                <td>
                                                    <select 
                                                        value={detail.measurement_type || ''} 
                                                        onChange={e => handleDetailChange(e, index)} name="measurement_type" 
                                                        className={`form-control form-control-sm ${formErrors[`${prefix}-measurement_type`] ? 'is-invalid' : ''}`}
                                                    >
                                                        {MEASUREMENT_TYPE_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                                    </select>
                                                    <div className="invalid-feedback">{formErrors[`${prefix}-measurement_type`]}</div>
                                                </td>
                                                {['specification_nominal', 'specification_upper_limit', 'specification_lower_limit'].map(f => (
                                                    <td key={f} style={{ visibility: isQuantitative ? 'visible' : 'hidden' }}>
                                                        <input 
                                                            type="number" step="any" value={isQuantitative ? (detail as any)[f] ?? '' : ''} 
                                                            onChange={e => handleDetailChange(e, index)} name={f} 
                                                            className={`form-control form-control-sm ${formErrors[`${prefix}-${f}`] ? 'is-invalid' : ''}`} 
                                                        />
                                                        <div className="invalid-feedback">{formErrors[`${prefix}-${f}`]}</div>
                                                    </td>
                                                ))}
                                                <td style={{ visibility: isQuantitative ? 'visible' : 'hidden' }}>
                                                    <input 
                                                        type="text" value={isQuantitative ? detail.specification_unit || '' : ''} 
                                                        onChange={e => handleDetailChange(e, index)} name="specification_unit" 
                                                        className={`form-control form-control-sm ${formErrors[`${prefix}-specification_unit`] ? 'is-invalid' : ''}`} 
                                                    />
                                                    <div className="invalid-feedback">{formErrors[`${prefix}-specification_unit`]}</div>
                                                </td>
                                                <td style={{ visibility: !isQuantitative ? 'visible' : 'hidden' }}>
                                                    <input 
                                                        type="text" value={!isQuantitative ? detail.expected_qualitative_result || '' : ''} 
                                                        onChange={e => handleDetailChange(e, index)} name="expected_qualitative_result" 
                                                        className={`form-control form-control-sm ${formErrors[`${prefix}-expected_qualitative_result`] ? 'is-invalid' : ''}`} 
                                                    />
                                                    <div className="invalid-feedback">{formErrors[`${prefix}-expected_qualitative_result`]}</div>
                                                </td>
                                                <td>
                                                    <button 
                                                        type="button" className="btn btn-sm btn-danger" 
                                                        onClick={() => removeDetailRow(index)} title="行を削除"
                                                    >
                                                        <i className="fas fa-trash-alt"></i>
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <button type="button" onClick={addDetailRow} className="btn btn-sm btn-success mb-2">
                            <i className="fas fa-plus"></i> 詳細追加
                        </button>
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

export default QualityMasterModal;
