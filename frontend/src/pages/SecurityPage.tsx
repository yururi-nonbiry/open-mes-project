import React, { useCallback, useEffect, useState } from 'react';
import { Tab, Tabs } from 'react-bootstrap';
import securityService, {
    AccessLog,
    AccessLogFilters,
    AccountLockStatus,
    IpBlockStatus,
} from '../services/securityService';
import { describeError } from '../utils/api';

type Message = { text: string; type: 'success' | 'danger' } | null;

const formatDateTime = (value: string | null) => (value ? new Date(value).toLocaleString('ja-JP') : '-');

const formatDetail = (detail: Record<string, unknown>) =>
    Object.keys(detail).length ? JSON.stringify(detail) : '';

/** ロック中・失敗回数のあるアカウントと、ブロック中のIPの一覧 */
const LockStatusPanel: React.FC<{ onMessage: (message: Message) => void }> = ({ onMessage }) => {
    const [users, setUsers] = useState<AccountLockStatus[]>([]);
    const [ips, setIps] = useState<IpBlockStatus[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await securityService.getLocks();
            setUsers(data.users);
            setIps(data.ips);
        } catch (err) {
            onMessage({ text: describeError(err), type: 'danger' });
        } finally {
            setLoading(false);
        }
    }, [onMessage]);

    useEffect(() => {
        load();
    }, [load]);

    const run = async (action: () => Promise<{ message: string }>, confirmText: string) => {
        if (!window.confirm(confirmText)) return;
        try {
            const result = await action();
            onMessage({ text: result.message, type: 'success' });
        } catch (err) {
            onMessage({ text: describeError(err), type: 'danger' });
        }
        load();
    };

    const lockState = (lock: AccountLockStatus) => {
        if (lock.requires_admin_unlock) return <span className="badge bg-danger">ロック中（管理者による解除が必要）</span>;
        if (lock.is_locked) return <span className="badge bg-warning text-dark">ロック中（{formatDateTime(lock.locked_until)} まで）</span>;
        return <span className="badge bg-secondary">ロックなし</span>;
    };

    return (
        <div>
            <div className="d-flex justify-content-end mb-2">
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={load} disabled={loading}>
                    再読み込み
                </button>
            </div>

            <h5>アカウント</h5>
            <table className="table table-striped table-bordered table-sm">
                <thead className="table-light">
                    <tr>
                        <th>ユーザーID</th>
                        <th>ユーザー名</th>
                        <th>状態</th>
                        <th className="text-end">連続失敗</th>
                        <th className="text-end">ロック段階</th>
                        <th>最終失敗日時</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody>
                    {loading ? (
                        <tr><td colSpan={7} className="text-center">読み込み中...</td></tr>
                    ) : users.length === 0 ? (
                        <tr><td colSpan={7} className="text-center">ロック中・ログイン失敗中のアカウントはありません。</td></tr>
                    ) : (
                        users.map(lock => (
                            <tr key={lock.id}>
                                <td>{lock.custom_id}</td>
                                <td>{lock.username || '-'}</td>
                                <td>{lockState(lock)}</td>
                                <td className="text-end">{lock.failure_count}</td>
                                <td className="text-end">{lock.lock_level}</td>
                                <td>{formatDateTime(lock.last_failure_at)}</td>
                                <td>
                                    <button
                                        type="button"
                                        className="btn btn-sm btn-outline-danger"
                                        onClick={() => run(
                                            () => securityService.unlockUser(lock.user_id),
                                            `ユーザー "${lock.custom_id}" のロックを解除し、失敗回数を0に戻しますか？`
                                        )}
                                    >
                                        解除
                                    </button>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>

            <h5 className="mt-4">ブロック中のIPアドレス</h5>
            <table className="table table-striped table-bordered table-sm">
                <thead className="table-light">
                    <tr>
                        <th>IPアドレス</th>
                        <th>ブロック期限</th>
                        <th className="text-end">失敗回数</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody>
                    {loading ? (
                        <tr><td colSpan={4} className="text-center">読み込み中...</td></tr>
                    ) : ips.length === 0 ? (
                        <tr><td colSpan={4} className="text-center">ブロック中のIPアドレスはありません。</td></tr>
                    ) : (
                        ips.map(block => (
                            <tr key={block.id}>
                                <td>{block.ip_address}</td>
                                <td>{formatDateTime(block.blocked_until)}</td>
                                <td className="text-end">{block.failure_count}</td>
                                <td>
                                    <button
                                        type="button"
                                        className="btn btn-sm btn-outline-danger"
                                        onClick={() => run(
                                            () => securityService.unblockIp(block.id),
                                            `IPアドレス ${block.ip_address} のブロックを解除しますか？`
                                        )}
                                    >
                                        解除
                                    </button>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
};

const EMPTY_FILTERS: AccessLogFilters = { event_type: '', username: '', ip_address: '', date_from: '', date_to: '' };

/** アクセスログの一覧(絞り込み・ページ送り・CSV出力) */
const AccessLogPanel: React.FC<{ onMessage: (message: Message) => void }> = ({ onMessage }) => {
    const [form, setForm] = useState<AccessLogFilters>(EMPTY_FILTERS);
    const [filters, setFilters] = useState<AccessLogFilters>(EMPTY_FILTERS);
    const [page, setPage] = useState(1);
    const [logs, setLogs] = useState<AccessLog[]>([]);
    const [count, setCount] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [eventTypes, setEventTypes] = useState<{ value: string; label: string }[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        securityService.getAccessLogs(filters, page)
            .then(data => {
                if (cancelled) return;
                setLogs(data.results);
                setCount(data.count);
                setTotalPages(data.total_pages);
                setEventTypes(data.event_types);
            })
            .catch(err => !cancelled && onMessage({ text: describeError(err), type: 'danger' }))
            .finally(() => !cancelled && setLoading(false));
        return () => { cancelled = true; };
    }, [filters, page, onMessage]);

    const updateForm = (key: keyof AccessLogFilters) =>
        (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(prev => ({ ...prev, [key]: e.target.value }));

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
        setFilters({ ...form });
    };

    const handleReset = () => {
        setForm(EMPTY_FILTERS);
        setPage(1);
        setFilters(EMPTY_FILTERS);
    };

    const handleExport = async () => {
        try {
            await securityService.exportAccessLogs(filters);
        } catch (err) {
            onMessage({ text: describeError(err), type: 'danger' });
        }
    };

    return (
        <div>
            <form className="row g-2 align-items-end mb-3" onSubmit={handleSearch}>
                <div className="col-md-3">
                    <label className="form-label" htmlFor="log-event-type">イベント</label>
                    <select id="log-event-type" className="form-select form-select-sm" value={form.event_type} onChange={updateForm('event_type')}>
                        <option value="">すべて</option>
                        {eventTypes.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
                    </select>
                </div>
                <div className="col-md-2">
                    <label className="form-label" htmlFor="log-username">ユーザー</label>
                    <input id="log-username" className="form-control form-control-sm" value={form.username} onChange={updateForm('username')} />
                </div>
                <div className="col-md-2">
                    <label className="form-label" htmlFor="log-ip">IPアドレス</label>
                    <input id="log-ip" className="form-control form-control-sm" value={form.ip_address} onChange={updateForm('ip_address')} />
                </div>
                <div className="col-md-2">
                    <label className="form-label" htmlFor="log-date-from">開始日</label>
                    <input id="log-date-from" type="date" className="form-control form-control-sm" value={form.date_from} onChange={updateForm('date_from')} />
                </div>
                <div className="col-md-2">
                    <label className="form-label" htmlFor="log-date-to">終了日</label>
                    <input id="log-date-to" type="date" className="form-control form-control-sm" value={form.date_to} onChange={updateForm('date_to')} />
                </div>
                <div className="col-md-1 d-flex gap-1">
                    <button type="submit" className="btn btn-sm btn-primary">検索</button>
                    <button type="button" className="btn btn-sm btn-outline-secondary" onClick={handleReset}>クリア</button>
                </div>
            </form>

            <div className="d-flex justify-content-between align-items-center mb-2">
                <span className="text-muted">全 {count} 件</span>
                <button type="button" className="btn btn-sm btn-outline-primary" onClick={handleExport}>CSV出力</button>
            </div>

            <div className="table-responsive">
                <table className="table table-striped table-bordered table-sm" style={{ fontSize: '0.875rem' }}>
                    <thead className="table-light">
                        <tr>
                            <th style={{ whiteSpace: 'nowrap' }}>日時</th>
                            <th>イベント</th>
                            <th>ユーザーID</th>
                            <th>IPアドレス</th>
                            <th>パス</th>
                            <th>詳細</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={6} className="text-center">読み込み中...</td></tr>
                        ) : logs.length === 0 ? (
                            <tr><td colSpan={6} className="text-center">該当するログはありません。</td></tr>
                        ) : (
                            logs.map(log => (
                                <tr key={log.id}>
                                    <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(log.created_at)}</td>
                                    <td>{log.event_type_display}</td>
                                    <td>{log.username || '-'}</td>
                                    <td>{log.ip_address || '-'}</td>
                                    <td title={log.user_agent}>{log.method} {log.path}</td>
                                    <td style={{ wordBreak: 'break-all' }}>{formatDetail(log.detail)}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <div className="text-center mt-3 mb-5">
                <button type="button" className="btn btn-outline-primary mx-1" onClick={() => setPage(p => p - 1)} disabled={loading || page <= 1}>
                    前へ
                </button>
                <span className="mx-3 align-middle text-muted">ページ {page} / {Math.max(totalPages, 1)}</span>
                <button type="button" className="btn btn-outline-primary mx-1" onClick={() => setPage(p => p + 1)} disabled={loading || page >= totalPages}>
                    次へ
                </button>
            </div>
        </div>
    );
};

const SecurityPage: React.FC = () => {
    const [message, setMessage] = useState<Message>(null);

    return (
        <div>
            <h1>セキュリティ</h1>
            {message && (
                <div className={`alert alert-${message.type} alert-dismissible`} role="alert">
                    {message.text}
                    <button type="button" className="btn-close" aria-label="Close" onClick={() => setMessage(null)}></button>
                </div>
            )}
            <Tabs defaultActiveKey="locks" className="mb-3" mountOnEnter>
                <Tab eventKey="locks" title="ロック状況">
                    <LockStatusPanel onMessage={setMessage} />
                </Tab>
                <Tab eventKey="logs" title="アクセスログ">
                    <AccessLogPanel onMessage={setMessage} />
                </Tab>
            </Tabs>
        </div>
    );
};

export default SecurityPage;
