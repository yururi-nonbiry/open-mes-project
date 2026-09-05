import { useState, useCallback } from 'react';
import productionService from '../../services/productionService';
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
    const [planIdsInput, setPlanIdsInput] = useState('');
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

    const runSimulation = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const planIds = planIdsInput.split(',').map(s => s.trim()).filter(Boolean);
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
    }, [planIdsInput, selectedStatuses]);

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleString('ja-JP', {
            year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
        });
    };

    const shortageParts = result?.parts.filter(p => p.shortage_quantity > 0) ?? [];

    return (
        <div className="container mt-4">
            <div className="mb-4">
                <h2 className="fw-bold text-dark">部品供給シミュレーション</h2>
                <p className="text-muted mb-0">
                    複数の生産計画（納入品番）を横断し、共通部品の在庫が納期順にどこまで賄えるかを判定します。
                    比較したい生産計画だけに絞り込むことで「単独なら」「同時なら」の違いを確認できます。
                </p>
            </div>

            <div className="card border-0 shadow-sm rounded-3 mb-4">
                <div className="card-body p-4">
                    <div className="mb-3">
                        <label className="form-label fw-semibold text-secondary">対象ステータス（生産計画IDを指定しない場合に使用）</label>
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
                            生産計画IDで絞り込み（カンマ区切り、任意）
                        </label>
                        <input
                            type="text"
                            className="form-control border-secondary-subtle"
                            placeholder="例: 比較したい計画のIDをカンマ区切りで指定（例: 納入品番Aのみ、A・B両方 等）"
                            value={planIdsInput}
                            onChange={(e) => setPlanIdsInput(e.target.value)}
                        />
                        <div className="form-text">
                            生産計画一覧画面で対象の計画IDを確認し、比較したい組み合わせ（例: Aのみ／A+B）を指定してください。
                        </div>
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
                                不足が見込まれる部品は、対象生産計画の納期までに支給元へ必要数の連絡が必要です。
                            </p>
                            <div className="table-responsive">
                                <table className="table table-hover align-middle mb-0">
                                    <thead className="table-light">
                                        <tr>
                                            <th className="ps-3">部品コード</th>
                                            <th>部品名</th>
                                            <th>倉庫</th>
                                            <th className="text-end">現在庫（利用可能）</th>
                                            <th className="text-end">対象期間の累計必要数</th>
                                            <th className="text-end">不足数量</th>
                                            <th>不足が発生する計画</th>
                                            <th>不足発生日（連絡期限の目安）</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {result.parts.length === 0 ? (
                                            <tr><td colSpan={8} className="text-center py-4 text-muted">対象の部品データがありません。</td></tr>
                                        ) : result.parts.map(part => (
                                            <tr key={`${part.part_code}-${part.warehouse ?? 'ALL'}`} className={part.shortage_quantity > 0 ? 'table-warning' : undefined}>
                                                <td className="ps-3 font-monospace">{part.part_code}</td>
                                                <td>{part.part_name}</td>
                                                <td>{part.warehouse || '(全倉庫合計)'}</td>
                                                <td className="text-end">{part.available_quantity}</td>
                                                <td className="text-end">{part.total_required_quantity}</td>
                                                <td className="text-end fw-bold">{part.shortage_quantity > 0 ? part.shortage_quantity : '-'}</td>
                                                <td>{part.shortage_plan_name || '-'}</td>
                                                <td>{formatDate(part.shortage_date)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    {shortageParts.length > 0 && (
                        <div className="alert alert-warning mt-4">
                            <strong>{shortageParts.length}件の部品で供給不足が見込まれます。</strong>
                            対象の生産計画の納期に間に合うよう、上表の「不足数量」「不足発生日」を目安に支給元へ連絡してください。
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default PartsSupplySimulationPage;
