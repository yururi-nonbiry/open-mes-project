import { useState, useEffect, useCallback } from 'react';
import type { DropResult, DraggableProvided, DraggableStateSnapshot } from '@hello-pangea/dnd';
import { Link } from 'react-router-dom';
import { Table, Button, Form, Spinner, Alert, Tooltip, OverlayTrigger } from 'react-bootstrap';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import authFetch, { describeError, toApiError } from '../utils/api';
import type { PageDisplayRow, ModelDisplaySettingRecord, ModelFieldInfo, SaveStatus, BulkSaveResult, FieldChangeEvent } from './types/displaySettings';
import { registerTermTarget } from '../utils/terms';
import { ALLOCATION_COLUMNS, ALLOCATION_DATA_TYPE } from '../config/allocationColumns';
import { PICKING_PC_COLUMNS, PICKING_PC_DATA_TYPE, PICKING_MOBILE_COLUMNS, PICKING_MOBILE_DATA_TYPE } from '../config/pickingColumns';
import { PLAN_LIST_COLUMNS, PLAN_LIST_DATA_TYPE } from '../config/planListColumns';
import {
    GOODS_ISSUE_DEFAULT_COLUMNS, GOODS_RECEIPT_DEFAULT_COLUMNS, INVENTORY_DEFAULT_COLUMNS, STOCK_MOVEMENT_DEFAULT_COLUMNS,
    type DefaultColumn,
} from '../config/listDefaultColumns';

// This could be moved to a shared constants file
const DATA_TYPE_CHOICES = [
    { value: 'goods_receipt', label: '入庫処理' },
    { value: 'sales_order', label: '出庫処理' },
    { value: 'inventory', label: '在庫照会' },
    { value: 'stock_movement', label: '入出庫履歴' },
    { value: PLAN_LIST_DATA_TYPE, label: '生産計画(一覧)' },
    { value: ALLOCATION_DATA_TYPE, label: '部品引当(生産計画)' },
    { value: PICKING_PC_DATA_TYPE, label: '順立て・ピッキング(PC)' },
    { value: PICKING_MOBILE_DATA_TYPE, label: '順立て・ピッキング(モバイル)' },
];
registerTermTarget(DATA_TYPE_CHOICES);

interface DataTypeConfig {
    fetch: string[];
    save: string[];
    model_source_labels?: Record<string, string>;
    /** モデルを持たない画面の固定の項目。model-fields APIは使わずこの一覧を項目として扱う */
    virtualFields?: ModelFieldInfo[];
    /** モデルのフィールドではない一覧画面の計算項目(未出庫残・利用可能数など)。source は保存先のデータ種別 */
    computedFields?: (ModelFieldInfo & { source: string })[];
    /** 一覧画面の既定の列。設定が1件も無い画面で、初めて設定するときに表示ONにする列 */
    defaultColumns?: DefaultColumn[];
    /**
     * 一覧画面が検索欄として使い、サーバーが絞り込みに対応している項目。未指定の画面は検索欄の設定を出さない
     * (検索できない項目を検索ONにしても、画面に入力欄が出るだけで絞り込まれないため)
     */
    searchableFields?: string[];
}

interface CombinedField extends ModelFieldInfo {
    source_data_type: string;
    model_source_label: string | null;
}

type SettingWithSource = ModelDisplaySettingRecord & { source_data_type: string };

const DATA_TYPE_MAP: Record<string, DataTypeConfig> = {
    goods_receipt: {
        fetch: ['purchase_order', 'goods_receipt'],
        save: ['goods_receipt'],
        model_source_labels: {
            purchase_order: '入庫予定',
            goods_receipt: '入庫実績',
        },
        computedFields: [
            { name: 'remaining_quantity', verbose_name: '未入庫残', help_text: '発注数 - 入庫済', source: 'goods_receipt' },
        ],
        defaultColumns: GOODS_RECEIPT_DEFAULT_COLUMNS,
        // backend: PurchaseOrderViewSet の search_<項目> (文字列は部分一致、数量は完全一致)
        searchableFields: [
            'order_number', 'shipment_number', 'supplier', 'part_number', 'warehouse', 'purpose', 'item', 'product_name',
            'parent_part_number', 'instruction_document', 'model_type', 'color_info', 'delivery_destination',
            'delivery_source', 'location', 'remarks1', 'remarks2', 'remarks3', 'remarks4', 'remarks5',
            'quantity', 'received_quantity', 'delivered_quantity',
        ],
    },
    sales_order: {
        fetch: ['sales_order'],
        save: ['sales_order'],
        computedFields: [
            { name: 'remaining_quantity', verbose_name: '未出庫残', help_text: '予定数量 - 出庫済', source: 'sales_order' },
        ],
        defaultColumns: GOODS_ISSUE_DEFAULT_COLUMNS,
    },
    inventory: {
        fetch: ['inventory'],
        save: ['inventory'],
        computedFields: [
            { name: 'available_quantity', verbose_name: '利用可能数', help_text: '現在庫数 - 引当済', source: 'inventory' },
            { name: 'part_name', verbose_name: '品名', help_text: '品番マスターから自動的に取得される品名です。', source: 'inventory' },
        ],
        defaultColumns: INVENTORY_DEFAULT_COLUMNS,
        // backend: InventoryViewSet の <項目>_query
        searchableFields: ['part_number', 'warehouse', 'location', 'purpose', 'part_name'],
    },
    stock_movement: {
        fetch: ['stock_movement'],
        save: ['stock_movement'],
        defaultColumns: STOCK_MOVEMENT_DEFAULT_COLUMNS,
        // backend: StockMovementViewSet の search_<項目>(移動日時は画面の期間の入力欄で検索する)
        searchableFields: ['part_number', 'warehouse', 'reference_document', 'description', 'operator', 'location', 'purpose', 'quantity'],
    },
    [PLAN_LIST_DATA_TYPE]: {
        fetch: [PLAN_LIST_DATA_TYPE],
        save: [PLAN_LIST_DATA_TYPE],
        virtualFields: PLAN_LIST_COLUMNS.map(c => ({ name: c.name, verbose_name: c.label, help_text: c.help })),
    },
    [ALLOCATION_DATA_TYPE]: {
        fetch: [ALLOCATION_DATA_TYPE],
        save: [ALLOCATION_DATA_TYPE],
        virtualFields: ALLOCATION_COLUMNS.map(c => ({ name: c.name, verbose_name: c.label, help_text: c.help })),
    },
    [PICKING_PC_DATA_TYPE]: {
        fetch: [PICKING_PC_DATA_TYPE],
        save: [PICKING_PC_DATA_TYPE],
        virtualFields: PICKING_PC_COLUMNS.map(c => ({ name: c.name, verbose_name: c.label, help_text: c.help })),
    },
    [PICKING_MOBILE_DATA_TYPE]: {
        fetch: [PICKING_MOBILE_DATA_TYPE],
        save: [PICKING_MOBILE_DATA_TYPE],
        virtualFields: PICKING_MOBILE_COLUMNS.map(c => ({ name: c.name, verbose_name: c.label, help_text: c.help })),
    },
};

const PageDisplaySettings = () => {
    const [fieldsData, setFieldsData] = useState<PageDisplayRow[]>([]);
    const [selectedDataType, setSelectedDataType] = useState(DATA_TYPE_CHOICES[0].value);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>({ message: '', variant: '', show: false });

    // keepStatus: 保存直後の再読み込みでは、保存結果のメッセージを消さない
    const fetchAllData = useCallback(async (selectedType: string, keepStatus = false) => {
        setLoading(true);
        setError(null);
        if (!keepStatus) setSaveStatus(prev => ({ ...prev, show: false }));
        try {
            const config = DATA_TYPE_MAP[selectedType];
            if (!config) {
                throw new Error(`設定されていないデータタイプです: ${selectedType}`);
            }

            const dataTypesToFetch = config.fetch;

            const promises = dataTypesToFetch.flatMap(type => [
                authFetch(`/api/base/model-display-settings/?data_type=${type}`),
                // 仕入先・品番・倉庫などの外部キー項目も選択できるよう、外部キーを含めて取得する。
                // モデルを持たない画面(部品引当)は固定の項目一覧を使う。
                config.virtualFields
                    ? Promise.resolve(new Response(JSON.stringify(config.virtualFields)))
                    : authFetch(`/api/base/model-fields/?data_type=${type}&include_relations=true`)
            ]);

            const responses = await Promise.all(promises);

            for (const res of responses) {
                if (!res.ok) {
                    const errorText = await res.text();
                    throw new Error(`データの取得に失敗しました (${res.status} ${res.statusText}): ${errorText}`);
                }
            }
            
            const results: unknown[] = await Promise.all(responses.map(res => res.json()));
            
            const allSettings: SettingWithSource[] = [];
            const combinedFieldsMap = new Map<string, CombinedField>();

            dataTypesToFetch.forEach((type, i) => {
                const settings = results[i * 2] as ModelDisplaySettingRecord[];
                const fields = results[i * 2 + 1] as ModelFieldInfo[];

                allSettings.push(...settings.map(s => ({ ...s, source_data_type: type })));

                fields.forEach(field => {
                    if (field.name !== 'id' && !combinedFieldsMap.has(field.name)) {
                        const modelSourceLabel = dataTypesToFetch.length > 1 ? (config.model_source_labels || {})[type] : null;
                        combinedFieldsMap.set(field.name, { ...field, source_data_type: type, model_source_label: modelSourceLabel });
                    }
                });
            });

            // 既存の設定にしか存在しない項目（モデルのプロパティなど）を追加
            allSettings.forEach(setting => {
                if (!combinedFieldsMap.has(setting.model_field_name)) {
                    // model-fields APIの結果になかった項目を、設定情報から復元する
                    combinedFieldsMap.set(setting.model_field_name, {
                        name: setting.model_field_name,
                        verbose_name: setting.verbose_name || setting.model_field_name, // シリアライザからverbose_nameが返されることを期待
                        help_text: '',
                        source_data_type: setting.source_data_type,
                        model_source_label: 'カスタム項目',
                    });
                }
            });

            // モデルのフィールドではない計算項目(未出庫残・利用可能数・品名など)も選べるようにする。
            // 選択肢に無いと、一度保存しただけで一覧画面からその列が消えてしまうため
            (config.computedFields || []).forEach(({ source, ...field }) => {
                if (!combinedFieldsMap.has(field.name)) {
                    combinedFieldsMap.set(field.name, { ...field, source_data_type: source, model_source_label: null });
                }
            });

            // 設定が1件も無い画面は、一覧画面の既定の列だけを表示ONで始める(それ以外の項目は表示OFF)
            // (並び順も既定の列の順にし、それ以外の項目は後ろに並べる)
            const defaultColumnNames = allSettings.length === 0 && config.defaultColumns
                ? new Set(config.defaultColumns.map(c => c.model_field_name))
                : null;
            const defaultOrder = (name: string, index: number) => {
                const position = config.defaultColumns?.findIndex(c => c.model_field_name === name) ?? -1;
                return defaultColumnNames && position >= 0 ? (position + 1) * 10 : (index + 1) * 10 + (defaultColumnNames ? 1000 : 0);
            };

            const modelFields = Array.from(combinedFieldsMap.values());
            
            const data = modelFields
                .map((field, index) => {
                const existingSetting = allSettings.find(s => s.model_field_name === field.name);

                return {
                    model_field_name: field.name,
                    verbose_name: field.model_source_label ? `${field.verbose_name} (${field.model_source_label})` : field.verbose_name,
                    help_text: field.help_text,
                    source_data_type: field.source_data_type,
                    // 以前の保存で項目名そのものが表示名として書き込まれた設定は、未入力として扱う(次の保存で空欄に戻す)
                    display_name: existingSetting?.display_name && existingSetting.display_name !== field.verbose_name
                        ? existingSetting.display_name
                        : '',
                    display_order: existingSetting?.display_order ?? defaultOrder(field.name, index),
                    search_order: existingSetting?.search_order ?? (index + 1) * 10,
                    is_list_display: existingSetting?.is_list_display
                        ?? (defaultColumnNames ? defaultColumnNames.has(field.name) : !config.defaultColumns),
                    is_search_field: existingSetting?.is_search_field ?? false,
                    is_list_filter: existingSetting?.is_list_filter ?? false,
                };
            });

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
        } as PageDisplayRow;
        setFieldsData(newFieldsData);
    };

    // この画面で検索に使える項目(未対応の画面は null で、検索の設定を出さない)
    const searchableList = DATA_TYPE_MAP[selectedDataType]?.searchableFields;
    const searchable = searchableList ? new Set(searchableList) : null;

    const handleSave = async () => {
        setIsSaving(true);
        setSaveStatus({ message: '', variant: '', show: false });

        try {
            const config = DATA_TYPE_MAP[selectedDataType];
            if (!config) {
                throw new Error(`設定されていないデータタイプです: ${selectedDataType}`);
            }
            // ページに関連するすべてのデータタイプの設定を保存する
            const dataTypesToSave = config.fetch;

            const savePromises = dataTypesToSave.map(type => {
                const payload = fieldsData
                    .filter(item => item.source_data_type === type)
                    .map(item => {
                        // 表示名は入力したときだけ保存する(空欄は項目名を使う)。項目名を書き込むと、
                        // 後から用語設定で呼び方を変えてもこの画面の列名だけ古いまま残ってしまう
                        return {
                            model_field_name: item.model_field_name,
                            display_name: (item.display_name || '').trim(),
                            display_order: Number(item.display_order) || 0,
                            search_order: Number(item.search_order) || 0,
                            is_list_display: item.is_list_display,
                            // 検索に対応していない項目・画面では検索ONを保存しない
                            is_search_field: !!searchable?.has(item.model_field_name) && item.is_search_field,
                            is_list_filter: item.is_list_filter,
                        };
                    });

                // このデータタイプに属するフィールドがなければ保存処理をスキップ
                if (payload.length === 0) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve({ message: '' }) });
                }

                return authFetch(`/api/base/model-display-settings/bulk-save/?data_type=${type}`, {
                    method: 'POST',
                    body: JSON.stringify(payload),
                });
            });

            const responses = await Promise.all(savePromises);

            const errorResponse = responses.find(res => !res.ok);
            if (errorResponse) {
                throw await toApiError(errorResponse as Response, '保存に失敗しました。');
            }

            const successMessages = await Promise.all(responses.map(res => res.json().then((r: BulkSaveResult) => r.message)));
            setSaveStatus({ message: successMessages.filter(Boolean).join(' ') || '設定を保存しました。', variant: 'success', show: true });
            fetchAllData(selectedDataType, true);
        } catch (err) {
            setSaveStatus({ message: describeError(err), variant: 'danger', show: true });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDragEnd = (result: DropResult, type: 'list' | 'search') => {
        if (!result.destination) {
            return;
        }
 
        const orderKey = type === 'list' ? 'display_order' : 'search_order';
        
        // The list is rendered sorted by orderKey, so we must replicate that here.
        const items = Array.from(fieldsData)
            .sort((a, b) => a[orderKey] - b[orderKey]);

        // Reorder this list based on the drag result.
        const [reorderedItem] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, reorderedItem);

        // Create a map of the new order for efficient lookup.
        const orderMap = new Map();
        items.forEach((item, index) => {
            orderMap.set(item.model_field_name, (index + 1) * 10);
        });

        // Update the order on the main data array, preserving the original array structure
        // and other properties.
        const newFieldsData = fieldsData.map(item => ({
            ...item,
            [orderKey]: orderMap.get(item.model_field_name)
        }));

        setFieldsData(newFieldsData);
    };

    const onDragEnd = (result: DropResult) => {
        if (!result.destination) {
            return;
        }
        // 一覧と検索の表をまたぐドラッグは、並び順が壊れるため無視する
        if (result.destination.droppableId !== result.source.droppableId) {
            return;
        }
        // droppableIdは 'list-droppable' または 'search-droppable'
        const type = result.source.droppableId === 'list-droppable' ? 'list' : 'search';
        handleDragEnd(result, type);
    };


    const renderTableRow = (item: PageDisplayRow, provided: DraggableProvided, snapshot: DraggableStateSnapshot, type: 'list' | 'search') => {
        const originalIndex = fieldsData.findIndex(f => f.model_field_name === item.model_field_name);
        const filterKey = type === 'list' ? 'is_list_display' : 'is_search_field';
        const isActive = item[filterKey];

        return (
            <tr
                ref={provided.innerRef}
                {...provided.draggableProps}
                className={`${snapshot.isDragging ? 'table-info' : ''} ${!isActive ? 'receipt-row-completed' : ''}`}
                style={{ ...provided.draggableProps.style }}
            >
                <td className="text-center align-middle fw-bold text-secondary" {...provided.dragHandleProps} style={{ cursor: 'grab' }}>
                    <span title="ドラッグして順序を変更">↕</span>
                </td>
                <td className="align-middle fw-bold text-dark">
                    <OverlayTrigger placement="top" overlay={<Tooltip id={`tooltip-${type}-${originalIndex}`}>{`フィールド名: ${item.model_field_name}`}<br />{`ヘルプ: ${item.help_text || 'なし'}`}</Tooltip>}>
                        <span>{item.verbose_name}</span>
                    </OverlayTrigger>
                </td>
                <td className="align-middle">
                    <Form.Control
                        type="text"
                        size="sm"
                        name="display_name"
                        value={item.display_name}
                        placeholder={item.verbose_name.replace(/ \(.+\)$/, '') || item.verbose_name}
                        onChange={(e) => handleInputChange(originalIndex, e)}
                    />
                </td>
                <td className="text-center align-middle">
                    <Form.Check type="switch" id={`is_list_display-${type}-${originalIndex}`} name="is_list_display" checked={item.is_list_display} onChange={(e) => handleInputChange(originalIndex, e)} />
                </td>
                {searchable && (
                    <td className="text-center align-middle">
                        <Form.Check
                            type="switch" id={`is_search_field-${type}-${originalIndex}`} name="is_search_field"
                            checked={item.is_search_field && searchable.has(item.model_field_name)}
                            disabled={!searchable.has(item.model_field_name)}
                            title={searchable.has(item.model_field_name) ? undefined : 'この項目では検索できません'}
                            onChange={(e) => handleInputChange(originalIndex, e)}
                        />
                    </td>
                )}
            </tr>
        );
    };

    const renderTable = (type: 'list' | 'search') => {
        const orderKey = type === 'list' ? 'display_order' : 'search_order';
        const droppableId = type === 'list' ? 'list-droppable' : 'search-droppable';
        const title = type === 'list' ? '一覧表示項目（テーブル列の順序）' : '検索対象項目（検索欄の順序）';

        // stateを直接変更しないように、配列のコピーを作成してからソートする
        const itemsToRender = [...fieldsData]
            .sort((a, b) => a[orderKey] - b[orderKey]);

        return (
            <div className="goods-receipt-table-card mb-3">
                <div className="px-3 py-2 border-bottom bg-light d-flex align-items-center justify-content-between">
                    <strong className="text-dark">{title}</strong>
                    <span className="small text-secondary">↕ をドラッグして並び替え</span>
                </div>
                <Table hover responsive className="goods-receipt-table align-middle mb-0">
                    <thead>
                        <tr>
                            <th className="text-center" style={{ width: '60px' }}>順序</th>
                            <th style={{ minWidth: '120px' }}>モデル項目</th>
                            <th style={{ minWidth: '120px' }}>表示名</th>
                            <th className="text-center" style={{ width: '80px' }}>一覧</th>
                            {searchable && <th className="text-center" style={{ width: '80px' }}>検索</th>}
                        </tr>
                    </thead>
                    <Droppable droppableId={droppableId}>
                        {(provided) => (
                            <tbody {...provided.droppableProps} ref={provided.innerRef}>
                                {itemsToRender.map((item, index) => (
                                    <Draggable key={item.model_field_name} draggableId={`${type}-${item.model_field_name}`} index={index}>
                                        {(provided, snapshot) => renderTableRow(item, provided, snapshot, type)}
                                    </Draggable>
                                ))}
                                {provided.placeholder}
                            </tbody>
                        )}
                    </Droppable>
                </Table>
            </div>
        );
    };

    return (
        <div className="goods-receipt-page">
            <div className="system-subnav-bar">
                <Link to="/system/settings" className="system-subnav-link">← システム設定一覧</Link>
                <Link to="/system/csv-mappings" className="system-subnav-link">① CSVマッピング設定</Link>
                <Link to="/system/model-display-settings" className="system-subnav-link">② モデル項目表示設定</Link>
                <Link to="/system/page-display-settings" className="system-subnav-link active">③ ページ項目表示設定</Link>
                <Link to="/system/qr-code-actions" className="system-subnav-link">④ QRコードアクション設定</Link>
            </div>

            <div className="goods-receipt-filter-panel">
                <div className="receipt-status-tabs-row">
                    <span className="filter-section-label">対象ページ種別：</span>
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
                    <span className="text-muted">ページ表示設定を読み込んでいます...</span>
                </div>
            )}
            {error && <Alert variant="danger">{error}</Alert>}

            {!loading && !error && (
                <DragDropContext onDragEnd={onDragEnd}>
                    {renderTable('list')}
                    {searchable && renderTable('search')}
                </DragDropContext>
            )}
        </div>
    );
};

export default PageDisplaySettings;