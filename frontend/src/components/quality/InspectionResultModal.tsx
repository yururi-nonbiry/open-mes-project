import React, { useState, useEffect, useCallback } from 'react';
import Modal from '../Modal';
import qualityService, { InspectionItem, MeasurementDetail } from '../../services/qualityService';

interface InspectionResultModalProps {
    item: InspectionItem;
    onClose: () => void;
    onSuccess: () => void;
}

interface FormField {
    name: string;
    type: string;
    label: string;
    choices?: [string, string][];
}

const InspectionResultModal: React.FC<InspectionResultModalProps> = ({ item, onClose, onSuccess }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [baseFields, setBaseFields] = useState<FormField[]>([]);
    const [measurementDetails, setMeasurementDetails] = useState<MeasurementDetail[]>([]);
    const [formData, setFormData] = useState<Record<string, any>>({});
    const [submitting, setSubmitting] = useState(false);
    const [alert, setAlert] = useState({ show: false, type: '', message: '' });

    const fetchModalData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await qualityService.getInspectionFormData(item.id!);
            setBaseFields(data.result_form_fields);
            setMeasurementDetails(data.measurement_details);

            const initialFormData: Record<string, any> = {};
            data.result_form_fields.forEach((field: FormField) => {
                initialFormData[field.name] = field.type === 'file' ? null : '';
            });
            data.measurement_details.forEach((detail: MeasurementDetail) => {
                initialFormData[`measurement_value_${detail.id}`] = '';
            });
            setFormData(initialFormData);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [item.id]);

    useEffect(() => {
        fetchModalData();
    }, [fetchModalData]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        const val = type === 'file' ? (e.target as HTMLInputElement).files?.[0] : value;
        setFormData(prev => ({ ...prev, [name]: val }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setAlert({ show: false, type: '', message: '' });

        const submissionData = new FormData();
        const measurementDetailsPayload: any[] = [];

        for (const key in formData) {
            if (key.startsWith('measurement_value_')) {
                const detailId = key.replace('measurement_value_', '');
                measurementDetailsPayload.push({
                    measurement_detail_id: detailId,
                    value: formData[key]
                });
            } else if (formData[key] !== null) {
                submissionData.append(key, formData[key]);
            }
        }
        submissionData.append('measurement_details_payload', JSON.stringify(measurementDetailsPayload));

        try {
            const result = await qualityService.recordInspectionResult(item.id!, submissionData);
            setAlert({ show: true, type: 'success', message: result.message || '検査結果を登録しました。' });
            setTimeout(() => {
                onSuccess();
                onClose();
            }, 2000);
        } catch (err: any) {
            setAlert({ show: true, type: 'danger', message: `登録エラー: ${err.message}` });
        } finally {
            setSubmitting(false);
        }
    };

    const renderField = (field: FormField) => {
        const commonProps = { 
            id: `id_${field.name}`, 
            name: field.name, 
            className: 'form-control form-control-sm', 
            onChange: handleInputChange 
        };
        
        let inputElement;
        if (field.type === 'select') {
            inputElement = (
                <select {...commonProps} value={formData[field.name] || ''}>
                    <option value="">---------</option>
                    {field.choices?.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
            );
        } else if (field.type === 'textarea') {
            inputElement = <textarea {...commonProps as any} rows={3} value={formData[field.name] || ''} />;
        } else if (field.type === 'file') {
            inputElement = <input type="file" {...commonProps as any} />;
        } else {
            inputElement = <input type={field.type} {...commonProps as any} value={formData[field.name] || ''} />;
        }
        
        return (
            <div key={field.name} style={{ flex: '1 1 auto', minWidth: '200px' }} className="mb-3">
                <label htmlFor={`id_${field.name}`} className="form-label">{field.label}</label>
                {inputElement}
            </div>
        );
    };

    const renderMeasurementDetail = (detail: MeasurementDetail) => {
        let specInfo = ` (タイプ: ${detail.measurement_type === 'quantitative' ? '定量' : '定性'}`;
        if (detail.measurement_type === 'quantitative') {
            if (detail.specification_nominal !== null) specInfo += `, 規格値: ${detail.specification_nominal}`;
            if (detail.specification_lower_limit !== null) specInfo += `, 下限: ${detail.specification_lower_limit}`;
            if (detail.specification_upper_limit !== null) specInfo += `, 上限: ${detail.specification_upper_limit}`;
            if (detail.specification_unit) specInfo += ` ${detail.specification_unit}`;
        } else if (detail.expected_qualitative_result) {
            specInfo += `, 期待結果: ${detail.expected_qualitative_result}`;
        }
        specInfo += `)`;

        return (
            <div key={detail.id} className="col-12 mb-3 p-2 border rounded">
                <strong>{detail.name}</strong>
                <small className="text-muted d-block">{specInfo}</small>
                <input 
                    type={detail.measurement_type === 'quantitative' ? 'number' : 'text'} 
                    className="form-control form-control-sm mt-1" 
                    name={`measurement_value_${detail.id}`} 
                    value={formData[`measurement_value_${detail.id}`] || ''} 
                    onChange={handleInputChange} 
                    step={detail.measurement_type === 'quantitative' ? 'any' : undefined} 
                />
            </div>
        );
    };

    return (
        <Modal isOpen={true} onClose={onClose} maxWidth="800px">
            <div className="p-2">
                <h3>検査実施: {item.name}</h3>
                <hr />
                {alert.show && <div className={`alert alert-${alert.type}`} role="alert">{alert.message}</div>}
                {loading && <p>ロード中...</p>}
                {error && <p className="text-danger">エラー: {error}</p>}
                
                {!loading && !error && (
                    <form onSubmit={handleSubmit}>
                        <div className="d-flex flex-wrap gap-3">
                            {baseFields.map(renderField)}
                        </div>
                        <h5 className="mt-4">測定・判定項目</h5>
                        <div className="row mx-0">
                            {measurementDetails.length > 0 ? 
                                measurementDetails.map(renderMeasurementDetail) : 
                                <p className="text-muted">この検査項目に紐づく測定・判定項目はありません。</p>
                            }
                        </div>
                        <div className="mt-4 text-end border-top pt-3">
                            <button type="button" className="btn btn-secondary" onClick={onClose}>閉じる</button>
                            <button type="submit" className="btn btn-primary ml-2" disabled={submitting || loading}>
                                {submitting ? '登録中...' : '検査結果を登録'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </Modal>
    );
};

export default InspectionResultModal;