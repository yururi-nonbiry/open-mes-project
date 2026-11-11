import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Form, Spinner } from 'react-bootstrap';
import workCalendarService, { WorkCalendarDay, WorkCalendarSetting } from '../services/workCalendarService';
import type { ApiErrorLike } from './apiError';

const WEEKDAYS: { key: keyof WorkCalendarSetting; label: string }[] = [
    { key: 'monday', label: '月' },
    { key: 'tuesday', label: '火' },
    { key: 'wednesday', label: '水' },
    { key: 'thursday', label: '木' },
    { key: 'friday', label: '金' },
    { key: 'saturday', label: '土' },
    { key: 'sunday', label: '日' },
];

const DEFAULT_SETTING: WorkCalendarSetting = {
    monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: false, sunday: false,
};

const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

const WorkCalendarMaster: React.FC = () => {
    const today = new Date();
    const [year, setYear] = useState(today.getFullYear());
    const [month, setMonth] = useState(today.getMonth() + 1);
    const [setting, setSetting] = useState<WorkCalendarSetting>(DEFAULT_SETTING);
    const [days, setDays] = useState<WorkCalendarDay[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [selected, setSelected] = useState<string | null>(null);
    const [note, setNote] = useState('');

    const exceptions = useMemo(() => new Map(days.map(d => [d.date, d])), [days]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const last = new Date(year, month, 0).getDate();
            const [s, d] = await Promise.all([
                workCalendarService.getSetting(),
                workCalendarService.getDays(fmt(year, month, 1), fmt(year, month, last)),
            ]);
            setSetting(s);
            setDays(d);
            setError(null);
        } catch (e) {
            setError((e as ApiErrorLike).message || 'カレンダーの取得に失敗しました。');
        } finally {
            setLoading(false);
        }
    }, [year, month]);

    useEffect(() => {
        load();
    }, [load]);

    const isWorkday = (date: string, weekdayIdx: number) => {
        const ex = exceptions.get(date);
        return ex ? ex.is_workday : setting[WEEKDAYS[weekdayIdx].key];
    };

    const shiftMonth = (delta: number) => {
        const d = new Date(year, month - 1 + delta, 1);
        setYear(d.getFullYear());
        setMonth(d.getMonth() + 1);
        setSelected(null);
    };

    const handleSaveSetting = async () => {
        setError(null);
        setMessage(null);
        try {
            await workCalendarService.saveSetting(setting);
            setMessage('曜日ごとの稼働設定を保存しました。');
        } catch (e) {
            setError((e as ApiErrorLike).message || '稼働曜日の保存に失敗しました。');
        }
    };

    const selectDay = (date: string) => {
        setSelected(date);
        setNote(exceptions.get(date)?.note ?? '');
    };

    /** 選択日を休業日/特別稼働日に設定、または例外を解除して曜日パターンに戻す。 */
    const handleSetDay = async (mode: 'off' | 'on' | 'clear') => {
        if (!selected) return;
        setError(null);
        setMessage(null);
        try {
            const ex = exceptions.get(selected);
            if (mode === 'clear') {
                if (ex?.id) await workCalendarService.deleteDay(ex.id);
            } else {
                await workCalendarService.saveDay({ ...(ex ?? { date: selected }), date: selected, is_workday: mode === 'on', note: note.trim() });
            }
            setMessage(`${selected} を更新しました。`);
            await load();
        } catch (e) {
            setError((e as ApiErrorLike).message || '例外日の保存に失敗しました。');
        }
    };

    // 月曜始まりのカレンダーグリッド
    const first = new Date(year, month - 1, 1);
    const lead = (first.getDay() + 6) % 7;
    const lastDay = new Date(year, month, 0).getDate();
    const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: lastDay }, (_, i) => i + 1)];
    while (cells.length % 7 !== 0) cells.push(null);

    return (
        <div className="goods-receipt-page">
            <div className="goods-receipt-filter-panel">
                <div className="receipt-search-inputs-row">
                    <div className="receipt-search-field" style={{ flex: "none", width: "auto", maxWidth: "none" }}>
                        <span className="receipt-search-label">基本の稼働曜日</span>
                        <div className="d-flex gap-3 flex-nowrap">
                            {WEEKDAYS.map(w => (
                                <Form.Check
                                    key={w.key}
                                    id={`wd-${w.key}`}
                                    type="checkbox"
                                    label={w.label}
                                    checked={setting[w.key]}
                                    onChange={e => setSetting({ ...setting, [w.key]: e.target.checked })}
                                />
                            ))}
                        </div>
                    </div>
                    <div className="receipt-search-actions">
                        <Button size="sm" className="fw-bold px-3" onClick={handleSaveSetting}>曜日設定を保存</Button>
                    </div>
                </div>
            </div>

            {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}
            {message && <Alert variant="success" className="py-2 small">{message}</Alert>}

            <div className="goods-receipt-table-card p-3">
                <div className="d-flex align-items-center justify-content-between mb-2">
                    <Button size="sm" variant="outline-secondary" onClick={() => shiftMonth(-1)}>« 前月</Button>
                    <strong>{year}年{month}月</strong>
                    <Button size="sm" variant="outline-secondary" onClick={() => shiftMonth(1)}>翌月 »</Button>
                </div>
                {loading ? (
                    <div className="text-center py-4"><Spinner animation="border" size="sm" /></div>
                ) : (
                    <table className="table table-bordered text-center mb-2" style={{ tableLayout: 'fixed' }}>
                        <thead>
                            <tr>{WEEKDAYS.map(w => <th key={w.key}>{w.label}</th>)}</tr>
                        </thead>
                        <tbody>
                            {Array.from({ length: cells.length / 7 }, (_, r) => (
                                <tr key={r}>
                                    {cells.slice(r * 7, r * 7 + 7).map((d, c) => {
                                        if (d === null) return <td key={c} className="bg-light" />;
                                        const date = fmt(year, month, d);
                                        const ex = exceptions.get(date);
                                        const work = isWorkday(date, c);
                                        return (
                                            <td
                                                key={c}
                                                role="button"
                                                onClick={() => selectDay(date)}
                                                className={work ? '' : 'bg-secondary-subtle text-muted'}
                                                style={{ cursor: 'pointer', outline: selected === date ? '2px solid #0d6efd' : undefined }}
                                            >
                                                <div className="fw-bold">{d}</div>
                                                <div className="small">
                                                    {ex ? (ex.is_workday ? '特別稼働' : '休業') : work ? '' : '休'}
                                                </div>
                                                {ex?.note && <div className="small text-truncate" title={ex.note}>{ex.note}</div>}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                {selected && (
                    <div className="d-flex align-items-center gap-2 flex-wrap">
                        <strong>{selected}</strong>
                        <Form.Control
                            size="sm"
                            style={{ maxWidth: 240 }}
                            placeholder="備考（例: 年末休業）"
                            value={note}
                            onChange={e => setNote(e.target.value)}
                        />
                        <Button size="sm" variant="secondary" onClick={() => handleSetDay('off')}>休業日にする</Button>
                        <Button size="sm" variant="primary" onClick={() => handleSetDay('on')}>特別稼働日にする</Button>
                        <Button size="sm" variant="outline-secondary" onClick={() => handleSetDay('clear')} disabled={!exceptions.has(selected)}>
                            例外を解除
                        </Button>
                    </div>
                )}
            </div>
            <p className="small text-muted mt-2">
                調達リードタイムや中間品の所要日数は、このカレンダーの稼働日数で計算されます。日付をクリックして、祝日・休業日や休日出勤日を登録してください。
            </p>
        </div>
    );
};

export default WorkCalendarMaster;
