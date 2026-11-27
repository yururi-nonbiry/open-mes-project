import React, { useState, useEffect, useCallback } from 'react';
import { Spinner } from 'react-bootstrap';
import authFetch from '../utils/api';
import type { DisplaySetting, SearchParamValue, StockMovementRow } from './types/listPage';
import { registerTermTarget } from '../utils/terms';
import { STOCK_MOVEMENT_DEFAULT_COLUMNS } from '../config/listDefaultColumns';

const AVAILABLE_MOVEMENT_TYPES = [
    { key: 'incoming', label: '入庫', badgeClass: 'status-partial', default_selected: true },
    { key: 'outgoing', label: '出庫', badgeClass: 'status-pending', default_selected: true },
    { key: 'used', label: '生産使用', badgeClass: 'status-canceled', default_selected: true },
    { key: 'PRODUCTION_OUTPUT', label: '生産完了入庫', badgeClass: 'status-completed', default_selected: true },
    { key: 'PRODUCTION_REVERSAL', label: '生産完了取消', badgeClass: 'status-pending', default_selected: true },
    { key: 'adjustment', label: '在庫調整', badgeClass: 'status-canceled', default_selected: true },
];
registerTermTarget(AVAILABLE_MOVEMENT_TYPES);

const DEFAULT_COLUMNS = STOCK_MOVEMENT_DEFAULT_COLUMNS;

const DEFAULT_SEARCH_FIELDS = [
    { model_field_name: 'part_number', verbose_name: '品番', display_name: '品番' },
    { model_field_name: 'warehouse', verbose_name: '倉庫', display_name: '倉庫' },
    { model_field_name: 'reference_document', verbose_name: '参照伝票', display_name: '参照伝票' },
];

const getDefaultSelectedTypes = () => {
    const defaultTypes = new Set<string>();
    AVAILABLE_MOVEMENT_TYPES.forEach(type => {
        if (type.default_selected) {
            defaultTypes.add(type.key);
        }
    });
    return defaultTypes;
};

const StockMovementHistory: React.FC = () => {
    const [history, setHistory] = useState<StockMovementRow[]>([]);
    const [pagination, setPagination] = useState<{
        count: number;
        num_pages: number;
        current_page: number;
        next: string | null;
        previous: string | null;
    }>({
        count: 0,
        num_pages: 1,
        current_page: 1,
        next: null,
        previous: null,
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [displaySettings, setDisplaySettings] = useState<DisplaySetting[]>([]);
    const [searchFields, setSearchFields] = useState<DisplaySetting[]>([]);

    const [searchCriteria, setSearchCriteria] = useState<Record<string, string>>({
        part_number: '',
        warehouse: '',
        operator: '',
        movement_date_from: '',
        movement_date_to: '',
        reference_document: '',
    });
    const [selectedTypes, setSelectedTypes] = useState<Set<string>>(getDefaultSelectedTypes());
    const [activeSearch, setActiveSearch] = useState<Record<string, SearchParamValue>>({});
    const [currentPage, setCurrentPage] = useState(1);

    const pageSize = 25;

    // 列・検索項目の表示設定は画面を開いたときに1回だけ取得する(検索・ページ送りのたびに取得しない)。
    // 列名は表示設定APIが返す項目名を使い、管理者専用の model-fields は呼ばない
    // (一般ユーザーが呼ぶと403になり、権限エラーとして監査ログに記録されてしまうため)
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const response = await authFetch('/api/base/model-display-settings/?data_type=stock_movement');
                const settings = response.ok ? (await response.json()) as DisplaySetting[] : [];
                if (cancelled) return;
                const combinedSettings = settings.map((s): DisplaySetting => ({
                    ...s,
                    verbose_name: s.verbose_name || s.model_field_name,
                }));
                setDisplaySettings(combinedSettings
                    .filter((s) => s.is_list_display)
                    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)));
                setSearchFields(combinedSettings
                    .filter((s) => s.is_search_field && s.model_field_name !== 'movement_type')
                    .sort((a, b) => (a.search_order ?? 0) - (b.search_order ?? 0)));
            } catch (_err) {
                if (cancelled) return;
                setDisplaySettings([]);
                setSearchFields([]);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const fetchHistory = useCallback(async (page: number, params: Record<string, SearchParamValue>) => {
        // 移動種別を1つも選んでいない場合は該当なし(条件なしとして全件を表示しない)
        const types = params.movement_type;
        if (types instanceof Set && types.size === 0) {
            setHistory([]);
            setPagination({ count: 0, num_pages: 1, current_page: 1, next: null, previous: null });
            setCurrentPage(1);
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);

        const dataUrl = new URL(`${window.location.origin}/api/inventory/stock-movements/`);
        dataUrl.searchParams.append('page', String(page));
        dataUrl.searchParams.append('page_size', String(pageSize));

        Object.entries(params).forEach(([key, value]) => {
            if (value) {
                if (key === 'movement_type' && value instanceof Set && value.size > 0) {
                    value.forEach((type: string) => {
                        dataUrl.searchParams.append('search_movement_type', type);
                    });
                } else if (key !== 'movement_type' && value !== '') {
                    dataUrl.searchParams.append(`search_${key}`, String(value));
                }
            }
        });

        try {
            const dataResponse = await authFetch(dataUrl.pathname + dataUrl.search);

            if (!dataResponse.ok) {
                throw new Error(`HTTP error! status: ${dataResponse.status}`);
            }
            const data = await dataResponse.json();
            setHistory(data.results || []);
            setPagination({
                count: data.count ?? 0,
                num_pages: data.total_pages ?? 1,
                current_page: data.current_page ?? 1,
                next: data.next ?? null,
                previous: data.previous ?? null,
            });
            setCurrentPage(data.current_page ?? 1);
        } catch (e) {
            setError('入出庫履歴データの取得に失敗しました。');
            console.error('Error fetching stock movement history:', e);
        } finally {
            setLoading(false);
        }
    }, [pageSize]);

    useEffect(() => {
        const initialParams = {
            ...searchCriteria,
            movement_type: getDefaultSelectedTypes(),
        };
        setActiveSearch(initialParams);
        fetchHistory(1, initialParams);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setSearchCriteria(prev => ({ ...prev, [name]: value }));
    };

    const handleTypeToggle = (typeKey: string) => {
        setSelectedTypes(prev => {
            const newTypes = new Set(prev);
            if (newTypes.has(typeKey)) {
                newTypes.delete(typeKey);
            } else {
                newTypes.add(typeKey);
            }
            return newTypes;
        });
    };

    const handleSearch = () => {
        const newActiveSearch = {
            ...searchCriteria,
            movement_type: selectedTypes,
        };
        setActiveSearch(newActiveSearch);
        fetchHistory(1, newActiveSearch);
    };

    const handleReset = () => {
        const defaultTypes = getDefaultSelectedTypes();
        const clearedCriteria = Object.fromEntries(Object.keys(searchCriteria).map(k => [k, '']));
        setSearchCriteria(clearedCriteria);
        setSelectedTypes(defaultTypes);
        const resetParams = {
            ...clearedCriteria,
            movement_type: defaultTypes,
        };
        setActiveSearch(resetParams);
        fetchHistory(1, resetParams);
    };

    const handlePageChange = (newPage: number) => {
        if (newPage >= 1 && newPage <= pagination.num_pages) {
            fetchHistory(newPage, activeSearch);
        }
    };

    const columns = displaySettings.length > 0 ? displaySettings : DEFAULT_COLUMNS;
    // 移動日時は期間(開始日・終了日)の入力欄で検索するため、検索項目の入力欄からは除く
    const activeSearchFields = (searchFields.length > 0 ? searchFields : DEFAULT_SEARCH_FIELDS)
        .filter((field) => !field.model_field_name.startsWith('movement_date'));
    const colSpan = columns.length;

    const renderTableHeaders = () => (
        <tr>
            {columns.map((setting: DisplaySetting) => {
                const isNumeric = setting.model_field_name === 'quantity';
                return (
                    <th key={setting.model_field_name} className={isNumeric ? 'text-end' : ''}>
                        {setting.display_name || setting.verbose_name}
                    </th>
                );
            })}
        </tr>
    );

    const renderTableBody = () => {
        if (loading) {
            return (
                <tr>
                    <td colSpan={colSpan} className="text-center py-5">
                        <Spinner animation="border" variant="primary" size="sm" className="me-2" />
                        <span className="text-muted">入出庫履歴を読み込んでいます...</span>
                    </td>
                </tr>
            );
        }
        if (error) {
            return (
                <tr>
                    <td colSpan={colSpan} className="text-center text-danger py-4 fw-bold">
                        {error}
                    </td>
                </tr>
            );
        }
        if (history.length === 0) {
            return (
                <tr>
                    <td colSpan={colSpan} className="text-center py-5 text-muted">
                        該当する入出庫履歴がありません。
                    </td>
                </tr>
            );
        }

        return history.map(item => (
            <tr key={item.id}>
                {columns.map((setting: DisplaySetting) => {
                    const fieldName = setting.model_field_name;
                    if (fieldName === 'movement_date') {
                        const val = item.movement_date
                            ? new Date(item.movement_date as string | number).toLocaleString('ja-JP', {
                                  year: 'numeric',
                                  month: '2-digit',
                                  day: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit',
                              })
                            : '—';
                        return <td key={fieldName}>{val}</td>;
                    }
                    if (fieldName === 'movement_type') {
                        const typeObj = AVAILABLE_MOVEMENT_TYPES.find(t => t.key === item.movement_type);
                        return (
                            <td key={fieldName}>
                                <span className={`receipt-status-badge ${typeObj?.badgeClass || 'status-partial'}`}>
                                    {item.movement_type_display || typeObj?.label || item.movement_type || '—'}
                                </span>
                            </td>
                        );
                    }
                    if (fieldName === 'quantity') {
                        return (
                            <td key={fieldName} className="text-end fw-bold">
                                {item.quantity ?? 0}
                            </td>
                        );
                    }
                    if (fieldName === 'part_number') {
                        return (
                            <td key={fieldName} className="fw-bold text-dark">
                                {item.part_number || '—'}
                            </td>
                        );
                    }
                    if (fieldName === 'operator') {
                        return <td key={fieldName}>{item.operator_username || '—'}</td>;
                    }
                    const val = item[fieldName];
                    return <td key={fieldName}>{val !== null && val !== undefined && val !== '' ? val : '—'}</td>;
                })}
            </tr>
        ));
    };

    return (
        <div id="schedule-container" className="goods-receipt-page">
            <div id="search-criteria-area" className="goods-receipt-filter-panel">
                <div className="receipt-status-tabs-row">
                    <span className="filter-section-label">移動種別：</span>
                    <div id="movement-type-filters-container" className="receipt-status-tabs">
                        {AVAILABLE_MOVEMENT_TYPES.map(type => {
                            const isChecked = selectedTypes.has(type.key);
                            return (
                                <button
                                    key={type.key}
                                    type="button"
                                    className={`receipt-status-tab ${isChecked ? 'active' : ''}`}
                                    onClick={() => handleTypeToggle(type.key)}
                                >
                                    {type.label}
                                </button>
                            );
                        })}
                    </div>
                    <span className="receipt-result-count ms-auto">
                        履歴件数：<strong>{pagination.count}</strong> 件
                    </span>
                </div>

                <div className="receipt-search-inputs-row">
                    {activeSearchFields.map((field: DisplaySetting) => {
                        const labelText = field.display_name || field.verbose_name;
                        return (
                            <div className="receipt-search-field" key={field.model_field_name}>
                                <label htmlFor={`search-${field.model_field_name}`} className="receipt-search-label">
                                    {labelText}
                                </label>
                                <input
                                    type={field.model_field_name.includes('date') ? 'date' : 'text'}
                                    id={`search-${field.model_field_name}`}
                                    name={field.model_field_name}
                                    className="form-control form-control-sm"
                                    value={searchCriteria[field.model_field_name] || ''}
                                    onChange={handleSearchChange}
                                    placeholder={`${labelText}を入力...`}
                                />
                            </div>
                        );
                    })}
                    <div className="receipt-search-field">
                        <label htmlFor="search-movement_date_from" className="receipt-search-label">期間（開始日）</label>
                        <input
                            type="date"
                            id="search-movement_date_from"
                            name="movement_date_from"
                            className="form-control form-control-sm"
                            value={searchCriteria.movement_date_from || ''}
                            onChange={handleSearchChange}
                        />
                    </div>
                    <div className="receipt-search-field">
                        <label htmlFor="search-movement_date_to" className="receipt-search-label">期間（終了日）</label>
                        <input
                            type="date"
                            id="search-movement_date_to"
                            name="movement_date_to"
                            className="form-control form-control-sm"
                            value={searchCriteria.movement_date_to || ''}
                            onChange={handleSearchChange}
                        />
                    </div>
                    <div className="receipt-search-actions">
                        <button id="advanced-search-button" type="button" className="btn btn-primary btn-sm fw-bold px-3" onClick={handleSearch}>
                            検索
                        </button>
                        <button id="reset-search-button" type="button" className="btn btn-outline-secondary btn-sm" onClick={handleReset}>
                            条件リセット
                        </button>
                    </div>
                </div>
            </div>

            <div className="goods-receipt-table-card">
                <div className="table-responsive mb-0">
                    <table id="schedule-table" className="table table-hover align-middle goods-receipt-table mb-0">
                        <thead>{renderTableHeaders()}</thead>
                        <tbody>{renderTableBody()}</tbody>
                    </table>
                </div>
            </div>

            <div className="pagination-controls d-flex justify-content-center align-items-center mt-2">
                <button
                    type="button"
                    onClick={() => handlePageChange(currentPage - 1)}
                    className="btn btn-outline-primary btn-sm"
                    disabled={!pagination.previous}
                >
                    ← 前へ
                </button>
                <span className="mx-3 small fw-semibold text-secondary">
                    {pagination.count > 0
                        ? `ページ ${pagination.current_page} / ${pagination.num_pages} （全 ${pagination.count} 件）`
                        : '0 件'}
                </span>
                <button
                    type="button"
                    onClick={() => handlePageChange(currentPage + 1)}
                    className="btn btn-outline-primary btn-sm"
                    disabled={!pagination.next}
                >
                    次へ →
                </button>
            </div>
        </div>
    );
};

export default StockMovementHistory;
