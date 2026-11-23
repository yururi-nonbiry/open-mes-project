import { useState, useEffect, useCallback, useMemo } from 'react';
import { Container, Form, Button, Card, Badge, Spinner, Alert, InputGroup } from 'react-bootstrap';
import authFetch, { handleError } from '../../utils/api';
import { useWorkCenters } from '../../hooks/useWorkCenters';
import type { MaterialAllocation, PaginationData } from '../../types/production';
import pickingSearchFieldsService, { DEFAULT_PICKING_SEARCH_FIELDS } from '../../services/pickingSearchFieldsService';
import type { PickingSearchField } from '../../services/pickingSearchFieldsService';
import inventoryService from '../../services/inventoryService';
import { PICKING_MOBILE_COLUMNS, PICKING_MOBILE_DATA_TYPE, applyColumnSettings } from '../../config/pickingColumns';
import type { PickingColumn } from '../../config/pickingColumns';
import { errorMessage } from './mobileTypes';
import './MobileLocationTransferPage.css'; // スタイルを再利用

interface PlanGroup {
    key: string;
    planName: string;
    productCode: string;
    productName: string;
    line: string;
    items: MaterialAllocation[];
    allocatedCount: number;
}

const STATUS_FILTERS = [
    { value: 'ALLOCATED', label: '未ピッキング' },
    { value: 'ISSUED', label: 'ピッキング済' },
    { value: '', label: 'すべて' },
];
registerTermTarget(STATUS_FILTERS);

const statusBadge = (a: MaterialAllocation) => {
    const bg = a.status === 'ALLOCATED' ? 'warning' : a.status === 'ISSUED' ? 'success' : 'secondary';
    return <Badge bg={bg} text={a.status === 'ALLOCATED' ? 'dark' : undefined}>{a.status_display}</Badge>;
};

/** モバイル用 順立て・ピッキング(部品の払い出し)画面。完成品の出庫は MobileGoodsIssuePage。 */
const MobilePickingPage = () => {
    const [allocations, setAllocations] = useState<MaterialAllocation[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'danger' } | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    const [keyword, setKeyword] = useState('');
    const [lineFilter, setLineFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALLOCATED');
    const workCenters = useWorkCenters();
    // キーワード検索の対象項目(管理者画面で設定。取得できるまでは既定)
    const [searchFields, setSearchFields] = useState<PickingSearchField[]>(DEFAULT_PICKING_SEARCH_FIELDS);
    useEffect(() => { pickingSearchFieldsService.get().then(setSearchFields); }, []);

    // 明細の項目の表示/非表示・並び順・表示名は、ページ項目表示設定(picking_mobile)で変更できる。
    // 設定が無い(取得できない)場合は既定の項目をすべて表示する。
    const [columns, setColumns] = useState<(PickingColumn & { title: string })[]>(
        PICKING_MOBILE_COLUMNS.map(c => ({ ...c, title: c.label }))
    );
    useEffect(() => {
        inventoryService.getDisplaySettings(PICKING_MOBILE_DATA_TYPE)
            .then(settings => setColumns(applyColumnSettings(PICKING_MOBILE_COLUMNS, settings)))
            .catch(() => { /* 設定を取得できなくても既定の項目で表示する */ });
    }, []);
    const isRightColumn = (name: string) => name === 'allocated_quantity' || name === 'status';

    const renderField = (a: MaterialAllocation, col: PickingColumn & { title: string }) => {
        switch (col.name) {
            case 'material_code': return (
                <div key={col.name}>
                    <strong>{a.material_code}</strong>
                    {a.allocation_type === 'ADDITIONAL' && <Badge bg="danger" className="ms-1">追加</Badge>}
                </div>
            );
            case 'material_name': return <div key={col.name} className="small text-muted">{a.material_name || ''}</div>;
            case 'purpose': return <div key={col.name} className="small">{col.title}: {a.purpose || '汎用'}</div>;
            case 'warehouse': return <div key={col.name} className="small">{col.title}: {a.warehouse || 'N/A'}</div>;
            case 'allocated_quantity': return <div key={col.name} className="fs-5 fw-bold">{a.allocated_quantity}</div>;
            case 'status': return <div key={col.name}>{statusBadge(a)}</div>;
            default: return null;
        }
    };

    const fetchAllocations = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await authFetch('/api/production/material-allocations/?page_size=300');
            await handleError(response, t('順立て（ピッキング）データの取得に失敗しました。'));
            const data = (await response.json()) as PaginationData<MaterialAllocation>;
            setAllocations(data.results || []);
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchAllocations(); }, [fetchAllocations]);

    const groups = useMemo(() => {
        const map = new Map<string, PlanGroup>();
        allocations.forEach((a) => {
            const planId = a.production_plan || 'UNKNOWN';
            const productCode = a.product_code || '';
            const key = `${productCode}__${planId}`;
            let g = map.get(key);
            if (!g) {
                g = {
                    key,
                    planName: a.production_plan_name || planId,
                    productCode,
                    productName: a.product_name || '',
                    line: a.line || '',
                    items: [],
                    allocatedCount: 0,
                };
                map.set(key, g);
            }
            g.items.push(a);
            if (a.status === 'ALLOCATED') g.allocatedCount += 1;
        });
        const list = Array.from(map.values());
        list.sort((a, b) => (b.allocatedCount > 0 ? 1 : 0) - (a.allocatedCount > 0 ? 1 : 0) || a.planName.localeCompare(b.planName));
        return list;
    }, [allocations]);

    const visibleGroups = useMemo(() => {
        const kw = keyword.trim().toLowerCase();
        return groups
            .filter((g) => {
                if (lineFilter === 'none' ? g.line : lineFilter && g.line !== lineFilter) return false;
                if (!kw) return true;
                const matches = (v?: string | null) => (v || '').toLowerCase().includes(kw);
                const on = (f: PickingSearchField) => searchFields.includes(f);
                return (on('product_code') && matches(g.productCode))
                    || (on('product_name') && matches(g.productName))
                    || (on('plan_name') && matches(g.planName))
                    || (on('line') && matches(g.line))
                    || g.items.some((i) =>
                        (on('purpose') && matches(i.purpose))
                        || (on('material_code') && matches(i.material_code))
                        || (on('material_name') && matches(i.material_name)));
            })
            .map((g) => ({ ...g, shown: g.items.filter((i) => !statusFilter || i.status === statusFilter) }))
            .filter((g) => g.shown.length > 0);
    }, [groups, keyword, lineFilter, statusFilter, searchFields]);

    const changeStatus = async (id: string, status: string) => {
        const response = await authFetch(`/api/production/material-allocations/${id}/change-status/`, {
            method: 'POST',
            body: JSON.stringify({ status }),
        });
        await handleError(response, 'ステータスの更新に失敗しました。');
    };

    const handlePick = async (a: MaterialAllocation) => {
        if (!window.confirm(t(`${a.material_code} ${a.material_name || ''} を ${a.allocated_quantity} 個ピッキングしますか？`))) return;
        setBusyId(a.id);
        setMessage(null);
        try {
            await changeStatus(a.id, 'ISSUED');
            setMessage({ text: t(`${a.material_code} をピッキングしました。`), type: 'success' });
            await fetchAllocations();
        } catch (e) {
            setMessage({ text: errorMessage(e), type: 'danger' });
        } finally {
            setBusyId(null);
        }
    };

    const handlePickAll = async (g: PlanGroup) => {
        const targets = g.items.filter((i) => i.status === 'ALLOCATED');
        if (targets.length === 0) return;
        if (!window.confirm(t(`【${g.productCode} ${g.productName}】の未ピッキング部品 ${targets.length} 件を一括ピッキングしますか？`))) return;
        setBusyId(g.key);
        setMessage(null);
        let ok = 0;
        let lastError = '';
        for (const t of targets) {
            try {
                await changeStatus(t.id, 'ISSUED');
                ok += 1;
            } catch (e) {
                lastError = errorMessage(e);
            }
        }
        setMessage(ok === targets.length
            ? { text: t(`${ok} 件の部品をピッキングしました。`), type: 'success' }
            : { text: `${targets.length} 件中 ${ok} 件のみ成功しました。${lastError}`, type: 'danger' });
        await fetchAllocations();
        setBusyId(null);
    };

    return (
        <Container>
            <h1 className="mb-3">{t('順立て・ピッキング')}</h1>

            <div className="mb-3 p-3 border rounded bg-light">
                <InputGroup size="sm" className="mb-2">
                    <Form.Control
                        type="text"
                        placeholder={t('キーワードで絞り込み')}
                        value={keyword}
                        onChange={(e) => setKeyword(e.target.value)}
                    />
                </InputGroup>
                <div className="d-flex gap-2">
                    <Form.Select size="sm" aria-label={t('出庫先ライン')} value={lineFilter} onChange={(e) => setLineFilter(e.target.value)}>
                        <option value="">ライン: すべて</option>
                        <option value="none">未指定</option>
                        {workCenters.map((w) => <option key={w.code} value={w.code}>{w.code}</option>)}
                    </Form.Select>
                    <Form.Select size="sm" aria-label="ステータス" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                        {STATUS_FILTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </Form.Select>
                </div>
            </div>

            {message && <Alert variant={message.type} dismissible onClose={() => setMessage(null)}>{message.text}</Alert>}

            {loading && !allocations.length ? (
                <div className="text-center"><Spinner animation="border" /></div>
            ) : error ? (
                <Alert variant="danger">{error}</Alert>
            ) : visibleGroups.length === 0 ? (
                <Alert variant="secondary" className="text-center">{t('該当するピッキング対象はありません。')}</Alert>
            ) : (
                visibleGroups.map((g) => (
                    <Card key={g.key} className="mb-3">
                        <Card.Header>
                            <div className="d-flex justify-content-between align-items-center">
                                <h5 className="mb-0">{g.productCode} {g.productName}</h5>
                                <Badge bg="info" text="dark">未 {g.allocatedCount}</Badge>
                            </div>
                            <small className="text-muted">
                                {g.planName}{g.line ? ` / ライン: ${g.line}` : ''}
                            </small>
                        </Card.Header>
                        <Card.Body className="p-2">
                            {g.shown.map((a) => (
                                <div key={a.id} className="border rounded p-2 mb-2">
                                    <div className="d-flex justify-content-between align-items-start">
                                        <div>{columns.filter(c => !isRightColumn(c.name)).map(c => renderField(a, c))}</div>
                                        <div className="text-end">{columns.filter(c => isRightColumn(c.name)).map(c => renderField(a, c))}</div>
                                    </div>
                                    {a.status === 'ALLOCATED' && (
                                        <Button
                                            variant="success"
                                            className="w-100 mt-2"
                                            onClick={() => handlePick(a)}
                                            disabled={busyId !== null}
                                        >
                                            {busyId === a.id ? <Spinner as="span" animation="border" size="sm" /> : t('ピッキング')}
                                        </Button>
                                    )}
                                </div>
                            ))}
                        </Card.Body>
                        {g.allocatedCount > 0 && (
                            <Card.Footer className="bg-white border-0 p-2">
                                <Button variant="primary" className="w-100" onClick={() => handlePickAll(g)} disabled={busyId !== null}>
                                    {busyId === g.key ? <Spinner as="span" animation="border" size="sm" /> : t(`未ピッキングを一括ピッキング (${g.allocatedCount}件)`)}
                                </Button>
                            </Card.Footer>
                        )}
                    </Card>
                ))
            )}
        </Container>
    );
};

export default MobilePickingPage;

import { t, registerTermTarget } from '../../utils/terms';