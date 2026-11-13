import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Form, Nav, Spinner } from 'react-bootstrap';
import inventoryService, { AdminPurchaseOrder, SalesOrder } from '../services/inventoryService';
import type { ApiErrorLike } from './apiError';

type Kind = 'purchase' | 'sales';

const PAGE_SIZE = 20;

const PURCHASE_STATUS: Record<string, string> = {
    pending: '未入庫',
    partially_received: '一部入庫',
    fully_received: '入庫済み',
    canceled: 'キャンセル',
};

const SALES_STATUS: Record<string, string> = {
    pending: '未出庫',
    partially_shipped: '一部出庫',
    shipped: '出庫済み',
    canceled: 'キャンセル',
};

const formatDate = (value: string | null) => (value ? value.slice(0, 10) : '-');

/** 管理者専用: 入庫予定・出庫予定の削除画面。誤削除を避けるため一般の入出庫画面には削除操作を置かない。 */
const OrderDeletion: React.FC = () => {
    const [kind, setKind] = useState<Kind>('purchase');
    const [q, setQ] = useState('');
    const [appliedQ, setAppliedQ] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [purchaseOrders, setPurchaseOrders] = useState<AdminPurchaseOrder[]>([]);
    const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            if (kind === 'purchase') {
                const data = await inventoryService.getPurchaseOrdersForAdmin({ page, pageSize: PAGE_SIZE, q: appliedQ });
                setPurchaseOrders(data.results);
                setTotalPages(data.total_pages || 1);
            } else {
                const data = await inventoryService.getSalesOrdersForAdmin({ page, pageSize: PAGE_SIZE, q: appliedQ });
                setSalesOrders(data.results);
                setTotalPages(data.total_pages || 1);
            }
            setError(null);
        } catch (e) {
            setError((e as ApiErrorLike).message || 'データの読み込みに失敗しました。');
        } finally {
            setLoading(false);
        }
    }, [kind, page, appliedQ]);

    useEffect(() => {
        load();
    }, [load]);

    const switchKind = (next: Kind) => {
        setKind(next);
        setPage(1);
        setQ('');
        setAppliedQ('');
        setMessage(null);
        setError(null);
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
        setAppliedQ(q.trim());
    };

    const handleDelete = async (id: string, orderNumber: string | null) => {
        const label = kind === 'purchase' ? '入庫予定' : '出庫予定';
        if (!window.confirm(`${label}「${orderNumber ?? id}」を削除します。この操作は元に戻せません。よろしいですか？`)) return;
        setError(null);
        setMessage(null);
        try {
            if (kind === 'purchase') await inventoryService.deletePurchaseOrder(id);
            else await inventoryService.deleteSalesOrder(id);
            setMessage(`${label}「${orderNumber ?? id}」を削除しました。`);
            await load();
        } catch (e) {
            setError((e as ApiErrorLike).message || `${label}の削除に失敗しました。`);
        }
    };

    const colSpan = 7;

    return (
        <div className="goods-receipt-page">
            <Nav variant="tabs" activeKey={kind} onSelect={k => k && switchKind(k as Kind)} className="mb-3">
                <Nav.Item><Nav.Link eventKey="purchase">入庫予定</Nav.Link></Nav.Item>
                <Nav.Item><Nav.Link eventKey="sales">出庫予定</Nav.Link></Nav.Item>
            </Nav>

            <div className="goods-receipt-filter-panel">
                <form onSubmit={handleSearch} className="receipt-search-inputs-row">
                    <div className="receipt-search-field">
                        <label className="receipt-search-label" htmlFor="order-deletion-q">キーワード</label>
                        <Form.Control
                            id="order-deletion-q"
                            size="sm"
                            value={q}
                            onChange={e => setQ(e.target.value)}
                            placeholder={kind === 'purchase' ? '発注番号・品番・品名・仕入先' : '受注番号・品番・品名・倉庫'}
                        />
                    </div>
                    <div className="receipt-search-actions">
                        <Button type="submit" size="sm" className="fw-bold px-3">検索</Button>
                    </div>
                </form>
            </div>

            {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}
            {message && <Alert variant="success" className="py-2 small">{message}</Alert>}

            <div className="goods-receipt-table-card">
                <div className="table-responsive mb-0">
                    <table className="table table-hover align-middle goods-receipt-table mb-0">
                        <thead>
                            {kind === 'purchase' ? (
                                <tr>
                                    <th>発注番号</th><th>品番</th><th>数量</th><th>入庫済</th>
                                    <th>入荷予定日</th><th>状態</th>
                                    <th className="text-center" style={{ width: '100px' }}>操作</th>
                                </tr>
                            ) : (
                                <tr>
                                    <th>受注番号</th><th>品番</th><th>数量</th><th>出庫済</th>
                                    <th>出庫予定日</th><th>状態</th>
                                    <th className="text-center" style={{ width: '100px' }}>操作</th>
                                </tr>
                            )}
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={colSpan} className="text-center py-4"><Spinner animation="border" size="sm" /></td></tr>
                            ) : kind === 'purchase' ? (
                                purchaseOrders.length === 0 ? (
                                    <tr><td colSpan={colSpan} className="text-center py-4 text-muted">入庫予定がありません。</td></tr>
                                ) : purchaseOrders.map(o => (
                                    <tr key={o.id}>
                                        <td className="fw-bold">{o.order_number ?? '-'}</td>
                                        <td>{o.part_number ?? o.item ?? '-'}</td>
                                        <td>{o.quantity ?? '-'}</td>
                                        <td>{o.received_quantity}</td>
                                        <td>{formatDate(o.expected_arrival)}</td>
                                        <td>{PURCHASE_STATUS[o.status] ?? o.status}</td>
                                        <td className="text-center">
                                            <Button size="sm" variant="outline-danger" className="fw-bold" onClick={() => handleDelete(o.id, o.order_number)}>削除</Button>
                                        </td>
                                    </tr>
                                ))
                            ) : salesOrders.length === 0 ? (
                                <tr><td colSpan={colSpan} className="text-center py-4 text-muted">出庫予定がありません。</td></tr>
                            ) : salesOrders.map(o => (
                                <tr key={o.id}>
                                    <td className="fw-bold">{o.order_number}</td>
                                    <td>{o.item ?? '-'}</td>
                                    <td>{o.quantity}</td>
                                    <td>{o.shipped_quantity}</td>
                                    <td>{formatDate(o.expected_shipment)}</td>
                                    <td>{SALES_STATUS[o.status] ?? o.status}</td>
                                    <td className="text-center">
                                        <Button size="sm" variant="outline-danger" className="fw-bold" onClick={() => handleDelete(o.id, o.order_number)}>削除</Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {totalPages > 1 && (
                <div className="d-flex justify-content-center align-items-center gap-3 mt-3">
                    <Button size="sm" variant="outline-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>前へ</Button>
                    <span className="small">{page} / {totalPages}</span>
                    <Button size="sm" variant="outline-secondary" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>次へ</Button>
                </div>
            )}

            <p className="small text-muted mt-2">
                削除すると元に戻せません。入庫実績が紐づく入庫予定は削除できません。出庫予定を削除すると、その引当は在庫へ解放されます(生産計画の材料引当用の内部受注は削除できません)。
            </p>
        </div>
    );
};

export default OrderDeletion;
