import { useState, useCallback, useEffect } from 'react';
import productionService from '../../services/productionService';
import type { ProductionPlan } from '../../types/production';
import { PartsSupplySimulationResult } from '../../types/production';

const STATUS_OPTIONS: { value: string; label: string }[] = [
    { value: 'PENDING', label: '未着手' },
    { value: 'IN_PROGRESS', label: '進行中' },
    { value: 'ON_HOLD', label: '保留' },
    { value: 'COMPLETED', label: '完了' },
    { value: 'CANCELLED', label: '中止' },
];

const PartsSupplySimulationPage = () => {
    const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set(['PENDING', 'IN_PROGRESS']));
    const [plans, setPlans] = useState<ProductionPlan[]>([]);
    const [plansLoading, setPlansLoading] = useState(false);
    const [selectedPlanIds, setSelectedPlanIds] = useState<Set<string>>(new Set());
    const [result, setResult] = useState<PartsSupplySimulationResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const toggleStatus = (value: string) => {
        setSelectedStatuses(prev => {
            const next = new Set(prev);
            if (next.has(value)) next.delete(value); else next.add(value);
            return next;
        });
    };

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setPlansLoading(true);
            try {
                const data = await productionService.getProductionPlans({
                    page_size: 200,
                    ordering: 'planned_start_datetime',
                    ...(selectedStatuses.size > 0 ? { status__in: Array.from(selectedStatuses).join(',') } : {}),
                });
                if (cancelled) return;
                setPlans(data.results);
                // 一覧に無くなった計画の選択は外す
                setSelectedPlanIds(prev => new Set([...prev].filter(id => data.results.some(p => p.id === id))));
            } catch (e: any) {
                if (!cancelled) setError(e.message);
            } finally {
                if (!cancelled) setPlansLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [selectedStatuses]);

    const togglePlan = (id: string) => {
        setSelectedPlanIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const allSelected = plans.length > 0 && plans.every(p => selectedPlanIds.has(p.id));
    const toggleAll = () => setSelectedPlanIds(allSelected ? new Set() : new Set(plans.map(p => p.id)));

    const runSimulation = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const planIds = Array.from(selectedPlanIds);
            const data = await productionService.getPartsSupplySimulation({
                planIds,
                statuses: Array.from(selectedStatuses),
            });
            setResult(data);
        } catch (e: any) {
            setError(e.message);
            setResult(null);
        } finally {
            setLoading(false);
        }
    }, [selectedPlanIds, selectedStatuses]);

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleString('ja-JP', {
            year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
        });
    };

    const shortageParts = result?.parts.filter(p => p.shortage_quantity > 0) ?? [];
    const overdueParts = shortageParts.filter(p => p.order_overdue);

    return (
        <div className="goods-receipt-page">
            <div className="goods-receipt-filter-panel mb-3">
                <div className="card-body p-4">
                    <div className="mb-3">
                        <label className="form-label fw-semibold text-secondary">生産計画の表示ステータス</label>
                        <div className="d-flex flex-wrap gap-3">
                            {STATUS_OPTIONS.map(opt => (
                                <div className="form-check" key={opt.value}>
                                    <input
                                        className="form-check-input"
                                        type="checkbox"
                                        id={`status-${opt.value}`}
                                        checked={selectedStatuses.has(opt.value)}
                                        onChange={() => toggleStatus(opt.value)}
                                    />
                                    <label className="form-check-label" htmlFor={`status-${opt.value}`}>{opt.label}</label>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="mb-3">
                        <label className="form-label fw-semibold text-secondary">
                            対象の生産計画（選択しない場合は、表示中の計画すべてが対象）
                        </label>
                        <div className="border rounded" style={{ maxHeight: 320, overflowY: 'auto' }}>
                            <table className="table table-sm table-hover align-middle mb-0">
                                <thead className="table-light" style={{ position: 'sticky', top: 0 }}>
                                    <tr>
                                        <th className="ps-3" style={{ width: 40 }}>
                                            <input type="checkbox" className="form-check-input" checked={allSelected}
                                                onChange={toggleAll} disabled={plans.length === 0} aria-label="すべて選択" />
                                        </th>
                                        <th>計画名</th>
                                        <th>製品コード</th>
                                        <th>計画開始日時</th>
                                        <th className="text-end">計画数量</th>
                                        <th>ステータス</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {plansLoading ? (
                                        <tr><td colSpan={6} className="text-center py-3 text-muted">読み込み中...</td></tr>
                                    ) : plans.length === 0 ? (
                                        <tr><td colSpan={6} className="text-center py-3 text-muted">該当する生産計画がありません。</td></tr>
                                    ) : plans.map(plan => (
                                        <tr key={plan.id} style={{ cursor: 'pointer' }} onClick={() => togglePlan(plan.id)}>
                                            <td className="ps-3">
                                                <input type="checkbox" className="form-check-input"
                                                    checked={selectedPlanIds.has(plan.id)}
                                                    onChange={() => togglePlan(plan.id)}
                                                    onClick={(e) => e.stopPropagation()} />
                                            </td>
                                            <td>{plan.plan_name}</td>
                                            <td>{plan.product_code || '-'}</td>
                                            <td>{formatDate(plan.planned_start_datetime)}</td>
                                            <td className="text-end">{plan.planned_quantity}</td>
                                            <td>{plan.status_display || plan.status}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="form-text">{selectedPlanIds.size}件選択中。比較したい組み合わせ（例: Aのみ／A+B）にチェックしてください。</div>
                    </div>
                    <button className="btn btn-primary" onClick={runSimulation} disabled={loading}>
                        {loading ? '計算中...' : 'シミュレーション実行'}
                    </button>
                </div>
            </div>

            {error && <div className="alert alert-danger">{error}</div>}

            {result && (
                <>
                    <div className="card border-0 shadow-sm rounded-3 mb-4">
                        <div className="card-body p-0">
                            <h5 className="p-3 mb-0 border-bottom">生産計画別の生産可否（納期順）</h5>
                            <div className="table-responsive">
                                <table className="table table-hover align-middle mb-0">
                                    <thead className="table-light">
                                        <tr>
                                            <th className="ps-3">計画名</th>
                                            <th>製品コード</th>
                                            <th>計画開始日時（納期相当）</th>
                                            <th className="text-end">計画数量</th>
                                            <th>判定</th>
                                            <th>不足部品</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {result.plans.length === 0 ? (
                                            <tr><td colSpan={6} className="text-center py-4 text-muted">対象の生産計画がありません。</td></tr>
                                        ) : result.plans.map(plan => (
                                            <tr key={plan.plan_id} className={!plan.feasible ? 'table-danger' : undefined}>
                                                <td className="ps-3">{plan.plan_name}</td>
                                                <td>{plan.product_code || '-'}</td>
                                                <td>{formatDate(plan.planned_start_datetime)}</td>
                                                <td className="text-end">{plan.planned_quantity}</td>
                                                <td>
                                                    {plan.feasible
                                                        ? <span className="badge bg-success">生産可能</span>
                                                        : <span className="badge bg-danger">供給不足</span>}
                                                </td>
                                                <td>
                                                    {plan.limiting_parts.map(lp => (
                                                        <div key={lp.part_code} className="small">
                                                            {lp.part_name}（{lp.part_code}） 不足 {lp.shortage_quantity}
                                                        </div>
                                                    ))}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    <div className="card border-0 shadow-sm rounded-3">
                        <div className="card-body p-0">
                            <h5 className="p-3 mb-0 border-bottom">部品別 供給状況（支給元連絡用）</h5>
                            <p className="px-3 text-muted small mb-2">
                                不足が見込まれる部品は、不足発生日から部品マスターの調達リードタイム分をさかのぼった
                                「発注要否期限」までに支給元へ必要数の連絡が必要です。期限を過ぎている行は赤色で表示されます。
                                「入荷見込み（生産予定）」は計画終了日時に入荷するとみなした生産計画で、入荷分は先に発生した不足の穴埋めに充てます。
                                不足数量は、すべての計画を賄うために前倒しで追加手配が必要な数量です。
                                「要注意」は、その生産計画自身が部品不足で予定どおり作れない見込みであることを示します。
                            </p>
                            <div className="table-responsive">
                                <table className="table table-hover align-middle mb-0">
                                    <thead className="table-light">
                                        <tr>
                                            <th className="ps-3">部品コード</th>
                                            <th>部品名</th>
                                            <th>倉庫</th>
                                            <th className="text-end">現在庫（利用可能）</th>
                                            <th>入荷見込み（生産予定）</th>
                                            <th className="text-end">対象期間の累計必要数</th>
                                            <th className="text-end">不足数量</th>
                                            <th>不足が発生する計画</th>
                                            <th>不足発生日</th>
                                            <th className="text-end">調達リードタイム</th>
                                            <th>発注要否期限</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {result.parts.length === 0 ? (
                                            <tr><td colSpan={11} className="text-center py-4 text-muted">対象の部品データがありません。</td></tr>
                                        ) : result.parts.map(part => (
                                            <tr
                                                key={`${part.part_code}-${part.warehouse ?? 'ALL'}`}
                                                className={part.order_overdue ? 'table-danger' : part.shortage_quantity > 0 ? 'table-warning' : undefined}
                                            >
                                                <td className="ps-3 font-monospace">{part.part_code}</td>
                                                <td>{part.part_name}</td>
                                                <td>{part.warehouse || '(全倉庫合計)'}</td>
                                                <td className="text-end">{part.available_quantity}</td>
                                                <td>
                                                    {part.incoming_plans.length === 0 ? '-' : (
                                                        <>
                                                            <div className="fw-semibold">計 {part.incoming_quantity}</div>
                                                            {part.incoming_plans.map(incoming => (
                                                                <div key={incoming.plan_id} className="small text-nowrap">
                                                                    {incoming.plan_name}：{incoming.quantity}（{formatDate(incoming.planned_end_datetime)}）
                                                                    {incoming.at_risk && <span className="badge bg-danger ms-1">要注意</span>}
                                                                </div>
                                                            ))}
                                                        </>
                                                    )}
                                                </td>
                                                <td className="text-end">{part.total_required_quantity}</td>
                                                <td className="text-end fw-bold">{part.shortage_quantity > 0 ? part.shortage_quantity : '-'}</td>
                                                <td>{part.shortage_plan_name || '-'}</td>
                                                <td>{formatDate(part.shortage_date)}</td>
                                                <td className="text-end">{part.shortage_quantity > 0 ? `${part.lead_time_days}日` : '-'}</td>
                                                <td>
                                                    {part.order_by_date ? (
                                                        <span className={part.order_overdue ? 'fw-bold text-danger' : undefined}>
                                                            {formatDate(part.order_by_date)}
                                                            {part.order_overdue && <span className="badge bg-danger ms-2">期限超過</span>}
                                                        </span>
                                                    ) : '-'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    {overdueParts.length > 0 && (
                        <div className="alert alert-danger mt-4">
                            <strong>{overdueParts.length}件の部品で、リードタイムを考慮した発注要否期限を既に過ぎています。</strong>
                            至急、支給元へ連絡してください。
                        </div>
                    )}
                    {shortageParts.length > 0 && (
                        <div className="alert alert-warning mt-4">
                            <strong>{shortageParts.length}件の部品で供給不足が見込まれます。</strong>
                            対象の生産計画の納期に間に合うよう、上表の「不足数量」「発注要否期限」を目安に支給元へ連絡してください。
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default PartsSupplySimulationPage;
