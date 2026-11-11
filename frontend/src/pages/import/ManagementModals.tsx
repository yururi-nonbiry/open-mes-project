import React, { useState, useMemo, useEffect } from 'react';
import { Modal, Button, Form, Table, Spinner, Alert } from 'react-bootstrap';
import { DATA_CONFIG, getDataTypeDisplayName, getFormFields, FormField } from '../../config/dataImportConfigs';
import { NavIcon } from '../../config/navigationConfig';

interface GenericFormProps {
    fields: FormField[];
    formData: Record<string, any>;
    setFormData: (data: any) => void;
}

const toDateTimeLocalValue = (val: any): string => {
    if (!val) return '';
    const str = String(val);
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(str)) {
        return str;
    }
    const parsed = new Date(str);
    if (isNaN(parsed.getTime())) {
        return str.slice(0, 16);
    }
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
};

const formatCellValue = (key: string, value: any): string => {
    if (value === null || value === undefined || value === '') return '—';
    if (key === 'item_type') {
        const map: Record<string, string> = {
            product: '製品（完成品）',
            material: '材料・部品',
            intermediate: '中間品（半製品）'
        };
        return map[String(value)] || String(value);
    }
    if (key === 'provision_type') {
        const map: Record<string, string> = {
            none: '支給なし',
            paid: '有償支給',
            free: '無償支給'
        };
        return map[String(value)] || String(value);
    }
    if (key.endsWith('_datetime') || key === 'created_at' || key === 'updated_at') {
        const d = new Date(String(value));
        if (!isNaN(d.getTime())) {
            return d.toLocaleString('ja-JP', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
    }
    return String(value);
};

const GenericForm: React.FC<GenericFormProps> = ({ fields, formData, setFormData }) => (
    <Form>
        <div className="row g-3">
            {fields.map(field => {
                const colClass = field.colSpan === 6 ? 'col-12 col-md-6' : 'col-12';
                const rawVal = formData[field.name];
                const inputValue = field.type === 'datetime-local' ? toDateTimeLocalValue(rawVal) : (rawVal ?? '');

                return (
                    <div className={colClass} key={field.name}>
                        <Form.Group controlId={`modal-field-${field.name}`} className="mes-modal-field-group">
                            <Form.Label className="mes-modal-field-label">
                                <span>{field.label}</span>
                                {field.required ? (
                                    <span className="mes-field-badge required">必須</span>
                                ) : (
                                    <span className="mes-field-badge optional">任意</span>
                                )}
                            </Form.Label>
                            {field.type === 'boolean' ? (
                                <Form.Check
                                    type="checkbox"
                                    label={field.label}
                                    name={field.name}
                                    checked={!!formData[field.name]}
                                    onChange={e => setFormData({ ...formData, [field.name]: e.target.checked })}
                                />
                            ) : field.type === 'select' ? (
                                <Form.Select
                                    name={field.name}
                                    className="mes-modal-input"
                                    value={inputValue}
                                    onChange={e => setFormData({ ...formData, [field.name]: e.target.value })}
                                >
                                    <option value="">選択してください</option>
                                    {field.options?.map(option => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </Form.Select>
                            ) : (
                                <Form.Control
                                    type={field.type || 'text'}
                                    className="mes-modal-input"
                                    placeholder={field.placeholder || `${field.label}を入力してください`}
                                    name={field.name}
                                    value={inputValue}
                                    onChange={e => setFormData({ ...formData, [field.name]: e.target.value })}
                                />
                            )}
                            {field.helpText && (
                                <Form.Text className="mes-modal-field-help">
                                    {field.helpText}
                                </Form.Text>
                            )}
                        </Form.Group>
                    </div>
                );
            })}
        </div>
    </Form>
);

export const RegisterModal = ({ show, onHide, config, formData, setFormData, isLoading, error, onSave }: any) => {
    const normalizedType = config?.type === 'production_plan' ? 'production-plan' : config?.type;
    const dataConfig = DATA_CONFIG[normalizedType];
    const displayName = dataConfig?.name || getDataTypeDisplayName(config?.name || config?.type);
    const isEdit = Boolean(config?.recordId);
    const modalTitle = `${displayName}の${isEdit ? '編集' : '登録'}`;

    return (
        <Modal show={show} onHide={onHide} size="lg" centered scrollable className="mes-clean-modal">
            <Modal.Header closeButton className="mes-modal-header">
                <div className="mes-modal-title-wrap">
                    <span className="mes-modal-icon-box" aria-hidden="true">
                        <NavIcon name={dataConfig?.icon || 'import'} size={20} />
                    </span>
                    <div className="mes-modal-title-text">
                        <div className="mes-modal-title-row">
                            <Modal.Title className="mes-modal-title">{modalTitle}</Modal.Title>
                            {dataConfig?.tag && (
                                <span className="mes-modal-tag-pill">{dataConfig.tag}</span>
                            )}
                        </div>
                        {dataConfig?.description && (
                            <p className="mes-modal-subtitle">{dataConfig.description}</p>
                        )}
                    </div>
                </div>
            </Modal.Header>
            <Modal.Body className="mes-modal-body">
                {isLoading ? (
                    <div className="text-center py-5">
                        <Spinner animation="border" variant="primary" />
                        <p className="text-muted small mt-2 mb-0">データを読み込んでいます...</p>
                    </div>
                ) : (
                    <GenericForm
                        fields={getFormFields(normalizedType)}
                        formData={formData}
                        setFormData={setFormData}
                    />
                )}
                {error && (
                    <Alert variant="danger" className="mt-3 mb-0 py-2 small">
                        <strong>入力エラー：</strong> {error}
                    </Alert>
                )}
            </Modal.Body>
            <Modal.Footer className="mes-modal-footer">
                <Button variant="outline-secondary" onClick={onHide}>
                    キャンセル
                </Button>
                <Button variant="primary" className="fw-bold px-4" onClick={onSave} disabled={isLoading}>
                    {isEdit ? '変更を保存する' : `${displayName}を登録する`}
                </Button>
            </Modal.Footer>
        </Modal>
    );
};

export const ListModal = ({ show, onHide, config, listData, isLoading, error, onEdit, onDelete, onOpenRegister }: any) => {
    const normalizedType = config?.type === 'production_plan' ? 'production-plan' : config?.type;
    const dataConfig = DATA_CONFIG[normalizedType];
    const displayName = dataConfig?.name || getDataTypeDisplayName(config?.name || config?.type);
    const modalTitle = `${displayName}の一覧`;

    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | null }>({
        key: '',
        direction: null,
    });
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        setSortConfig({ key: '', direction: null });
        setSearchQuery('');
    }, [config?.type, show]);

    const handleSort = (key: string) => {
        if (!key) return;
        setSortConfig(prev => {
            if (prev.key === key) {
                if (prev.direction === 'asc') return { key, direction: 'desc' };
                if (prev.direction === 'desc') return { key: '', direction: null };
            }
            return { key, direction: 'asc' };
        });
    };

    const filteredAndSortedRows = useMemo(() => {
        let rows = listData?.rows || [];

        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            rows = rows.filter((row: any) => {
                return (listData?.rowKeys || []).some((k: string) => {
                    const cellVal = formatCellValue(k, row[k]);
                    return (
                        cellVal.toLowerCase().includes(q) ||
                        String(row[k] ?? '').toLowerCase().includes(q)
                    );
                });
            });
        }

        if (sortConfig.key && sortConfig.direction) {
            const { key, direction } = sortConfig;
            rows = [...rows].sort((a, b) => {
                const rawA = a[key];
                const rawB = b[key];
                if (rawA === null || rawA === undefined || rawA === '') return direction === 'asc' ? 1 : -1;
                if (rawB === null || rawB === undefined || rawB === '') return direction === 'asc' ? -1 : 1;

                const numA = Number(rawA);
                const numB = Number(rawB);
                const isNum = !isNaN(numA) && !isNaN(numB) && typeof rawA !== 'boolean' && typeof rawB !== 'boolean';
                if (isNum) {
                    return direction === 'asc' ? numA - numB : numB - numA;
                }

                if (key.endsWith('_datetime') || key.endsWith('_date') || key === 'created_at' || key === 'updated_at') {
                    const timeA = new Date(rawA).getTime();
                    const timeB = new Date(rawB).getTime();
                    if (!isNaN(timeA) && !isNaN(timeB)) {
                        return direction === 'asc' ? timeA - timeB : timeB - timeA;
                    }
                }

                const strA = String(formatCellValue(key, rawA));
                const strB = String(formatCellValue(key, rawB));
                return direction === 'asc'
                    ? strA.localeCompare(strB, 'ja', { numeric: true })
                    : strB.localeCompare(strA, 'ja', { numeric: true });
            });
        }

        return rows;
    }, [listData?.rows, listData?.rowKeys, searchQuery, sortConfig]);

    return (
        <Modal
            show={show}
            onHide={onHide}
            dialogClassName="mes-modal-extra-wide"
            centered
            scrollable
            className="mes-clean-modal"
        >
            <Modal.Header closeButton className="mes-modal-header">
                <div className="mes-modal-title-wrap">
                    <span className="mes-modal-icon-box" aria-hidden="true">
                        <NavIcon name={dataConfig?.icon || 'import'} size={20} />
                    </span>
                    <div className="mes-modal-title-text">
                        <div className="mes-modal-title-row">
                            <Modal.Title className="mes-modal-title">{modalTitle}</Modal.Title>
                            <span className="mes-modal-count-pill">
                                全 {listData?.rows?.length ?? 0} 件
                            </span>
                        </div>
                        {dataConfig?.description && (
                            <p className="mes-modal-subtitle">{dataConfig.description}</p>
                        )}
                    </div>
                </div>
            </Modal.Header>
            <Modal.Body className="mes-modal-body" style={{ maxHeight: '62vh', overflowY: 'auto' }}>
                {isLoading && (
                    <div className="text-center py-5">
                        <Spinner animation="border" variant="primary" />
                        <p className="text-muted small mt-2 mb-0">{displayName}を読み込んでいます...</p>
                    </div>
                )}
                {!isLoading && listData?.rows && listData.rows.length > 0 && (
                    <>
                        <div className="mes-modal-toolbar mb-3 d-flex align-items-center justify-content-between flex-wrap gap-2">
                            <div className="d-flex align-items-center gap-2 flex-grow-1" style={{ maxWidth: '440px' }}>
                                <div className="position-relative flex-grow-1">
                                    <Form.Control
                                        type="text"
                                        size="sm"
                                        placeholder="🔍 キーワードで絞り込み..."
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        className="mes-modal-search-input pe-4"
                                    />
                                    {searchQuery && (
                                        <button
                                            type="button"
                                            className="btn btn-sm btn-link position-absolute end-0 top-50 translate-middle-y text-secondary text-decoration-none py-0 px-2"
                                            onClick={() => setSearchQuery('')}
                                            title="検索条件をクリア"
                                        >
                                            ×
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="d-flex align-items-center gap-2 small text-secondary">
                                {sortConfig.key && sortConfig.direction && (
                                    <button
                                        type="button"
                                        className="btn btn-sm btn-outline-secondary py-0 px-2 small fw-semibold"
                                        onClick={() => setSortConfig({ key: '', direction: null })}
                                    >
                                        ソート解除
                                    </button>
                                )}
                                <span className="fw-semibold">
                                    {searchQuery ? `絞り込み: ${filteredAndSortedRows.length} 件 / ` : ''}全 {listData.rows.length} 件
                                </span>
                            </div>
                        </div>

                        {filteredAndSortedRows.length > 0 ? (
                            <Table hover responsive className="mes-modal-table align-middle mb-0">
                                <thead>
                                    <tr>
                                        {listData.headers.map((h: string, idx: number) => {
                                            const isActionCol = idx === listData.rowKeys.length;
                                            const rowKey = listData.rowKeys[idx];
                                            const isSorted = sortConfig.key === rowKey && sortConfig.direction !== null;
                                            const sortDir = isSorted ? sortConfig.direction : null;

                                            if (isActionCol) {
                                                return (
                                                    <th key="action" className="text-center text-nowrap" style={{ width: '130px' }}>
                                                        {h}
                                                    </th>
                                                );
                                            }

                                            return (
                                                <th
                                                    key={rowKey || h}
                                                    onClick={() => handleSort(rowKey)}
                                                    className={`text-nowrap mes-sortable-th ${isSorted ? 'is-sorted' : ''}`}
                                                    title={`${h}で並び替え（クリックで昇順/降順/解除）`}
                                                >
                                                    <div className="d-flex align-items-center justify-content-between gap-2">
                                                        <span>{h}</span>
                                                        <span className={`mes-sort-indicator ${isSorted ? 'active' : ''}`}>
                                                            {sortDir === 'asc' ? '▲' : sortDir === 'desc' ? '▼' : '⇅'}
                                                        </span>
                                                    </div>
                                                </th>
                                            );
                                        })}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredAndSortedRows.map((row: any) => (
                                        <tr key={row[listData.idKey]}>
                                            {listData.rowKeys.map((key: string) => (
                                                <td key={key} className="text-nowrap">{formatCellValue(key, row[key])}</td>
                                            ))}
                                            <td className="text-center text-nowrap">
                                                <Button
                                                    variant="outline-primary"
                                                    size="sm"
                                                    className="me-2 py-0 px-2 fw-bold"
                                                    onClick={() => onEdit(row[listData.idKey])}
                                                >
                                                    編集
                                                </Button>
                                                <Button
                                                    variant="outline-danger"
                                                    size="sm"
                                                    className="py-0 px-2 fw-bold"
                                                    onClick={() => onDelete(row)}
                                                >
                                                    削除
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </Table>
                        ) : (
                            <div className="text-center py-4 text-muted mes-modal-empty-state">
                                <p className="mb-2 fw-semibold">「{searchQuery}」に一致するデータは見つかりませんでした</p>
                                <Button variant="outline-secondary" size="sm" onClick={() => setSearchQuery('')}>
                                    検索条件をクリア
                                </Button>
                            </div>
                        )}
                    </>
                )}
                {!isLoading && (!listData?.rows || listData.rows.length === 0) && (
                    <div className="mes-modal-empty-state">
                        <p className="mb-2 fw-bold text-secondary">登録されている{displayName}はまだありません</p>
                        {onOpenRegister && (
                            <Button variant="primary" size="sm" className="fw-bold" onClick={onOpenRegister}>
                                ＋ 新しく{displayName}を登録する
                            </Button>
                        )}
                    </div>
                )}
                {error && <Alert variant="danger" className="mt-3 mb-0 py-2 small">{error}</Alert>}
            </Modal.Body>
            <Modal.Footer className="mes-modal-footer justify-content-between">
                <div>
                    {onOpenRegister && (
                        <Button variant="primary" size="sm" className="fw-bold" onClick={onOpenRegister}>
                            ＋ {displayName}を新規登録
                        </Button>
                    )}
                </div>
                <Button variant="outline-secondary" onClick={onHide}>
                    閉じる
                </Button>
            </Modal.Footer>
        </Modal>
    );
};

export const DeleteConfirmModal = ({ show, onHide, item, onConfirm, isLoading }: any) => (
    <Modal show={show} onHide={onHide} centered size="sm" className="mes-clean-modal">
        <Modal.Header closeButton className="mes-modal-header">
            <Modal.Title className="fs-6 fw-bold text-danger">データの削除確認</Modal.Title>
        </Modal.Header>
        <Modal.Body className="mes-modal-body small">
            「<strong>{item?.displayName}</strong>」を削除してもよろしいですか？
            <div className="text-muted mt-1">※この操作は取り消せません。</div>
        </Modal.Body>
        <Modal.Footer className="mes-modal-footer">
            <Button variant="outline-secondary" size="sm" onClick={onHide}>
                キャンセル
            </Button>
            <Button variant="danger" size="sm" className="fw-bold" onClick={onConfirm} disabled={isLoading}>
                削除する
            </Button>
        </Modal.Footer>
    </Modal>
);

export const CsvResultModal = ({ show, onHide, result }: any) => (
    <Modal show={show} onHide={onHide} centered className="mes-clean-modal">
        <Modal.Header closeButton className="mes-modal-header">
            <Modal.Title className="mes-modal-title">CSV一括取込の結果</Modal.Title>
        </Modal.Header>
        <Modal.Body className="mes-modal-body">
            <Alert variant={result.isError ? 'danger' : 'success'} className="py-2 small mb-2">
                {result.message}
            </Alert>
            {result.errors.length > 0 && (
                <ul className="small text-danger mb-0 ps-3">
                    {result.errors.map((err: string, i: number) => (
                        <li key={i}>{err}</li>
                    ))}
                </ul>
            )}
        </Modal.Body>
        <Modal.Footer className="mes-modal-footer">
            <Button variant="primary" size="sm" className="fw-bold px-3" onClick={onHide}>
                閉じる
            </Button>
        </Modal.Footer>
    </Modal>
);
