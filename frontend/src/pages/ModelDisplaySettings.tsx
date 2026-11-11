import { useState, useEffect, useCallback } from 'react';
import type { DropResult } from '@hello-pangea/dnd';
import { Link } from 'react-router-dom';
import { Table, Button, Form, Spinner, Alert, Tooltip, OverlayTrigger } from 'react-bootstrap';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import authFetch, { apiRequest, describeError } from '../utils/api';
import type { ModelDisplayRow, ModelDisplaySettingRecord, ModelFieldInfo, SaveStatus, BulkSaveResult, FieldChangeEvent } from './types/displaySettings';

// This could be moved to a shared constants file
const DATA_TYPE_CHOICES = [
    { value: 'item', label: '品番マスター' },
    { value: 'supplier', label: 'サプライヤーマスター' },
    { value: 'warehouse', label: '倉庫マスター' },
    { value: 'purchase_order', label: '入庫予定' },
    { value: 'sales_order', label: '出庫予定' },
    { value: 'production_plan', label: '生産計画' },
    { value: 'customer', label: '顧客マスター' },
    { value: 'work_center', label: 'ワークセンターマスター' },
    { value: 'unit_cost', label: '標準単価' },
];

const ModelDisplaySettings = () => {
    const [fieldsData, setFieldsData] = useState<ModelDisplayRow[]>([]);
    const [selectedDataType, setSelectedDataType] = useState(DATA_TYPE_CHOICES[0].value);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>({ message: '', variant: '', show: false });

    const fetchAllData = useCallback(async (dataType: string) => {
        setLoading(true);
        setError(null);
        setSaveStatus(prev => ({ ...prev, show: false }));
        try {
            const [settingsRes, fieldsRes] = await Promise.all([
                authFetch(`/api/base/model-display-settings/?data_type=${dataType}`),
                authFetch(`/api/base/model-fields/?data_type=${dataType}`)
            ]);

            if (!settingsRes.ok) throw new Error(`表示設定の取得に失敗しました: ${settingsRes.statusText}`);
            if (!fieldsRes.ok) throw new Error(`モデル情報の取得に失敗しました: ${fieldsRes.statusText}`);

            const settings: ModelDisplaySettingRecord[] = await settingsRes.json();
            const modelFields: ModelFieldInfo[] = await fieldsRes.json();

            const data = modelFields
                .filter(field => field.name !== 'id') // 'id'フィールドは設定対象外
                .map((field, index) => {
                const existingSetting = settings.find(s => s.model_field_name === field.name);

                return {
                    // Model field info (read-only)
                    model_field_name: field.name,
                    verbose_name: field.verbose_name,
                    display_name: existingSetting?.display_name || '',
                    help_text: field.help_text,
                    display_order: existingSetting?.display_order ?? (index + 1) * 10, // Use ?? to allow order 0
                    is_list_display: existingSetting?.is_list_display ?? true,
                    is_search_field: existingSetting?.is_search_field ?? false,
                    is_list_filter: existingSetting?.is_list_filter ?? false,
                };
            });

            data.sort((a, b) => a.display_order - b.display_order);
            setFieldsData(data);

        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (selectedDataType) {
            fetchAllData(selectedDataType);
        }
    }, [selectedDataType, fetchAllData]);

    const handleInputChange = (index: number, e: FieldChangeEvent) => {
        const target = e.target as HTMLInputElement;
        const { name, value, type, checked } = target;
        const newFieldsData = [...fieldsData];
        newFieldsData[index] = {
            ...newFieldsData[index],
            [name]: type === 'checkbox' ? checked : value
        } as ModelDisplayRow;
        setFieldsData(newFieldsData);
    };

    const handleSave = async () => {
        setIsSaving(true);
        setSaveStatus({ message: '', variant: '', show: false });

        const payload = fieldsData.map(item => ({
            model_field_name: item.model_field_name,
            display_name: item.display_name,
            display_order: Number(item.display_order) || 0,
            is_list_display: item.is_list_display,
            is_search_field: item.is_search_field,
            is_list_filter: item.is_list_filter,
        }));

        try {
            const result = await apiRequest<BulkSaveResult>(`/api/base/model-display-settings/bulk-save/?data_type=${selectedDataType}`, {
                method: 'POST',
                body: JSON.stringify(payload),
            }, '保存に失敗しました。');
            setSaveStatus({ message: result.message, variant: 'success', show: true });
            fetchAllData(selectedDataType);
        } catch (err) {
            setSaveStatus({ message: describeError(err), variant: 'danger', show: true });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDragEnd = (result: DropResult) => {
        if (!result.destination) {
            return;
        }

        const items = Array.from(fieldsData);
        const [reorderedItem] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, reorderedItem);

        const updatedItems = items.map((item, index) => ({
            ...item,
            display_order: (index + 1) * 10,
        }));

        setFieldsData(updatedItems);
    };

    return (
        <div className="goods-receipt-page">
            <div className="system-subnav-bar">
                <Link to="/system/settings" className="system-subnav-link">← システム設定一覧</Link>
                <Link to="/system/csv-mappings" className="system-subnav-link">① CSVマッピング設定</Link>
                <Link to="/system/model-display-settings" className="system-subnav-link active">② モデル項目表示設定</Link>
                <Link to="/system/page-display-settings" className="system-subnav-link">③ ページ項目表示設定</Link>
                <Link to="/system/qr-code-actions" className="system-subnav-link">④ QRコードアクション設定</Link>
            </div>

            <div className="goods-receipt-filter-panel">
                <div className="receipt-status-tabs-row">
                    <span className="filter-section-label">対象データ種別：</span>
                    <div className="receipt-status-tabs" role="tablist">
                        {DATA_TYPE_CHOICES.map(choice => (
                            <button
                                key={choice.value}
                                type="button"
                                className={`receipt-status-tab ${selectedDataType === choice.value ? 'active' : ''}`}
                                onClick={() => setSelectedDataType(choice.value)}
                            >
                                {choice.label}
                            </button>
                        ))}
                    </div>
                    <div className="ms-auto">
                        <Button variant="primary" size="sm" className="fw-bold px-3" onClick={handleSave} disabled={loading || isSaving}>
                            {isSaving ? <><Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" /> 保存中...</> : 'この設定で保存'}
                        </Button>
                    </div>
                </div>
            </div>

            {saveStatus.show && <Alert variant={saveStatus.variant} onClose={() => setSaveStatus(prev => ({ ...prev, show: false }))} dismissible>{saveStatus.message}</Alert>}
            {loading && (
                <div className="text-center py-4">
                    <Spinner animation="border" variant="primary" size="sm" className="me-2" />
                    <span className="text-muted">項目表示設定を読み込んでいます...</span>
                </div>
            )}
            {error && <Alert variant="danger">{error}</Alert>}

            {!loading && !error && (
                <div className="goods-receipt-table-card">
                    <DragDropContext onDragEnd={handleDragEnd}>
                        <Table hover responsive className="goods-receipt-table align-middle mb-0">
                            <thead>
                                <tr>
                                    <th className="text-center" style={{ width: '60px' }}>順序</th>
                                    <th style={{ minWidth: '180px' }}>モデル項目</th>
                                    <th style={{ minWidth: '180px' }}>カスタム表示名</th>
                                    <th className="text-center" style={{ minWidth: '100px' }}>一覧表示</th>
                                    <th className="text-center" style={{ minWidth: '100px' }}>検索対象</th>
                                    <th className="text-center" style={{ minWidth: '100px' }}>フィルタ対象</th>
                                </tr>
                            </thead>
                            <Droppable droppableId="model-display-droppable">
                                {(provided) => (
                                    <tbody {...provided.droppableProps} ref={provided.innerRef}>
                                        {fieldsData.map((item, index) => (
                                            <Draggable key={item.model_field_name} draggableId={item.model_field_name} index={index}>
                                                {(provided, snapshot) => (
                                                    <tr
                                                        ref={provided.innerRef}
                                                        {...provided.draggableProps}
                                                        className={`${snapshot.isDragging ? 'table-info' : ''}`}
                                                        style={{ ...provided.draggableProps.style }}
                                                    >
                                                        <td className="text-center align-middle fw-bold text-secondary" {...provided.dragHandleProps} style={{ cursor: 'grab' }}>
                                                            <span title="ドラッグして順序を変更">↕</span>
                                                        </td>
                                                        <td className="align-middle fw-bold text-dark">
                                                            <OverlayTrigger placement="top" overlay={<Tooltip id={`tooltip-${index}`}>{`フィールド名: ${item.model_field_name}`}<br />{`ヘルプ: ${item.help_text || 'なし'}`}</Tooltip>}>
                                                                <span>{item.verbose_name}</span>
                                                            </OverlayTrigger>
                                                        </td>
                                                        <td className="align-middle">
                                                            <Form.Control size="sm" type="text" name="display_name" value={item.display_name || ''} onChange={(e) => handleInputChange(index, e)} placeholder={item.verbose_name} />
                                                        </td>
                                                        <td className="text-center align-middle">
                                                            <Form.Check type="switch" id={`is_list_display-${index}`} name="is_list_display" checked={item.is_list_display} onChange={(e) => handleInputChange(index, e)} />
                                                        </td>
                                                        <td className="text-center align-middle">
                                                            <Form.Check type="switch" id={`is_search_field-${index}`} name="is_search_field" checked={item.is_search_field} onChange={(e) => handleInputChange(index, e)} />
                                                        </td>
                                                        <td className="text-center align-middle">
                                                            <Form.Check type="switch" id={`is_list_filter-${index}`} name="is_list_filter" checked={item.is_list_filter} onChange={(e) => handleInputChange(index, e)} />
                                                        </td>
                                                    </tr>
                                                )}
                                            </Draggable>
                                        ))}
                                        {provided.placeholder}
                                    </tbody>
                                )}
                            </Droppable>
                        </Table>
                    </DragDropContext>
                </div>
            )}
        </div>
    );
};

export default ModelDisplaySettings;