import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Form, Spinner } from 'react-bootstrap';
import stockPurposeService, { StockPurpose } from '../services/stockPurposeService';

const EMPTY: StockPurpose = { code: '', name: '', is_active: true };

const StockPurposeMaster: React.FC = () => {
    const [purposes, setPurposes] = useState<StockPurpose[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [form, setForm] = useState<StockPurpose>(EMPTY);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setPurposes(await stockPurposeService.getPurposes());
            setError(null);
        } catch (e: any) {
            setError(e.message || '用途一覧の取得に失敗しました。');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setMessage(null);
        try {
            await stockPurposeService.savePurpose({ ...form, code: form.code.trim(), name: form.name.trim() });
            setMessage(form.id ? '用途を更新しました。' : '用途を登録しました。');
            setForm(EMPTY);
            await load();
        } catch (e: any) {
            setError(e.message || '用途の保存に失敗しました。');
        }
    };

    const handleDelete = async (p: StockPurpose) => {
        if (!p.id || !window.confirm(`用途「${p.name}」を削除しますか？`)) return;
        setError(null);
        setMessage(null);
        try {
            await stockPurposeService.deletePurpose(p.id);
            setMessage('用途を削除しました。');
            await load();
        } catch (e: any) {
            setError(e.message || '用途の削除に失敗しました。');
        }
    };

    return (
        <div className="goods-receipt-page">
            <div className="goods-receipt-filter-panel">
                <form onSubmit={handleSave} className="receipt-search-inputs-row">
                    <div className="receipt-search-field">
                        <label className="receipt-search-label" htmlFor="purpose-code">用途コード</label>
                        <Form.Control
                            id="purpose-code"
                            size="sm"
                            value={form.code}
                            onChange={e => setForm({ ...form, code: e.target.value })}
                            readOnly={!!form.id}
                            required
                            placeholder="例: PRD-A"
                        />
                    </div>
                    <div className="receipt-search-field">
                        <label className="receipt-search-label" htmlFor="purpose-name">用途名</label>
                        <Form.Control
                            id="purpose-name"
                            size="sm"
                            value={form.name}
                            onChange={e => setForm({ ...form, name: e.target.value })}
                            required
                            placeholder="例: A製品用"
                        />
                    </div>
                    <div className="d-flex align-items-center pt-3">
                        <Form.Check
                            id="purpose-active"
                            type="checkbox"
                            label="有効"
                            checked={form.is_active}
                            onChange={e => setForm({ ...form, is_active: e.target.checked })}
                            className="fw-semibold small text-secondary"
                        />
                    </div>
                    <div className="receipt-search-actions">
                        <Button type="submit" size="sm" className="fw-bold px-3">
                            {form.id ? '更新' : '登録'}
                        </Button>
                        {form.id && (
                            <Button type="button" size="sm" variant="outline-secondary" onClick={() => setForm(EMPTY)}>
                                キャンセル
                            </Button>
                        )}
                    </div>
                </form>
            </div>

            {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}
            {message && <Alert variant="success" className="py-2 small">{message}</Alert>}

            <div className="goods-receipt-table-card">
                <div className="table-responsive mb-0">
                    <table className="table table-hover align-middle goods-receipt-table mb-0">
                        <thead>
                            <tr>
                                <th>用途コード</th>
                                <th>用途名</th>
                                <th>状態</th>
                                <th className="text-center" style={{ width: '160px' }}>操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={4} className="text-center py-4"><Spinner animation="border" size="sm" /></td></tr>
                            ) : purposes.length === 0 ? (
                                <tr><td colSpan={4} className="text-center py-4 text-muted">用途が登録されていません。</td></tr>
                            ) : (
                                purposes.map(p => (
                                    <tr key={p.id}>
                                        <td className="fw-bold">{p.code}</td>
                                        <td>{p.name}</td>
                                        <td>{p.is_active ? '有効' : <span className="text-muted">無効</span>}</td>
                                        <td className="text-center text-nowrap">
                                            <Button size="sm" variant="primary" className="fw-bold me-1" onClick={() => setForm(p)}>編集</Button>
                                            <Button size="sm" variant="outline-danger" className="fw-bold" onClick={() => handleDelete(p)}>削除</Button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            <p className="small text-muted mt-2">
                用途は、同じ品番の在庫を「何用の部品か」で区別して持つための区分です。在庫で使用中の用途は削除できないため、無効にしてください。
            </p>
        </div>
    );
};

export default StockPurposeMaster;
