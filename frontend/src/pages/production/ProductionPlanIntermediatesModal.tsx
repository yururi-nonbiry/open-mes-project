import React, { useState, useEffect, useCallback } from 'react';
import Modal from '../../components/Modal';
import productionService from '../../services/productionService';
import { describeError } from '../../utils/api';
import { IntermediateDecision, IntermediateRequirement, ProductionPlan } from '../../types/production';

interface ProductionPlanIntermediatesModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** 子計画の作成・手配方法の変更後に一覧を更新する */
    onChanged: () => void;
    plan: ProductionPlan | null;
}

// 手配できるのは未着手・進行中の計画だけ(サーバー側でも拒否される)
const ARRANGEABLE_STATUSES = ['PENDING', 'IN_PROGRESS'];

const STATUS_BADGES: Record<IntermediateRequirement['status'], { label: string; className: string }> = {
    SHORTAGE: { label: '不足', className: 'bg-danger' },
    DECISION_REQUIRED: { label: '要判断', className: 'bg-warning text-dark' },
    COVERED: { label: '手配済', className: 'bg-success' },
};

const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

/** 子計画で作る数量の既定値: 不足があれば不足分、なければまだ賄えていない数量 */
const defaultChildQuantity = (row: IntermediateRequirement) =>
    String(row.shortage_quantity || row.uncovered_quantity || '');

/**
 * 中間品の手配。計画作成時に見込みが足りない中間品は子計画が自動で作られる。
 * 見込み(在庫・他の生産予定)で足りる中間品は、子計画を立てるか在庫を使うかをここで選ぶ。
 */
const ProductionPlanIntermediatesModal: React.FC<ProductionPlanIntermediatesModalProps> = ({ isOpen, onClose, onChanged, plan }) => {
    const [rows, setRows] = useState<IntermediateRequirement[]>([]);
    const [quantities, setQuantities] = useState<Record<string, string>>({});
    const [message, setMessage] = useState({ text: '', type: '' });
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const applyRows = (list: IntermediateRequirement[]) => {
        setRows(list);
        setQuantities(Object.fromEntries(list.map(row => [row.material_code, defaultChildQuantity(row)])));
    };

    const load = useCallback(async () => {
        if (!plan) return;
        setLoading(true);
        try {
            applyRows(await productionService.getIntermediateRequirements(plan.id));
        } catch (e) {
            setMessage({ text: describeError(e), type: 'danger' });
        } finally {
            setLoading(false);
        }
    }, [plan]);

    useEffect(() => {
        if (!isOpen || !plan) return;
        setMessage({ text: '', type: '' });
        load();
    }, [isOpen, plan, load]);

    const arrange = async (decision: IntermediateDecision) => {
        if (!plan) return;
        setSubmitting(true);
        setMessage({ text: '', type: '' });
        try {
            const result = await productionService.arrangeIntermediates(plan.id, [decision]);
            applyRows(result.data.requirements);
            setMessage({ text: result.message, type: 'success' });
            onChanged();
        } catch (e) {
            setMessage({ text: describeError(e), type: 'danger' });
        } finally {
            setSubmitting(false);
        }
    };

    const createChildPlan = (row: IntermediateRequirement) => {
        const quantity = parseInt(quantities[row.material_code], 10);
        if (!(quantity > 0)) {
            setMessage({ text: `${row.material_code} の子計画で作る数量を入力してください。`, type: 'danger' });
            return;
        }
        arrange({ material_code: row.material_code, method: 'CHILD_PLAN', quantity });
    };

    if (!plan) return null;
    const readOnly = !ARRANGEABLE_STATUSES.includes(plan.status);

    return (
        <Modal isOpen={isOpen} onClose={onClose} maxWidth="1000px">
            <div className="p-3">
                <div className="d-flex justify-content-between align-items-center mb-3 border-bottom pb-2">
                    <h5 className="mb-0">中間品の手配（{plan.plan_name}）</h5>
                    <button type="button" className="btn-close" aria-label="Close" onClick={onClose}></button>
                </div>
                <p className="text-muted small">
                    「開始時点の見込み」は、未引当の在庫に計画開始までに終わる他の生産予定を足し、先に始まる計画の未引当の所要数を引いた数です（他の計画の子計画はその計画専用とみなし、その計画の所要数を子計画で賄う分は差し引きません）。
                    見込みが足りない中間品は、計画の作成時・所要数の変更時に不足分の子計画が自動で作られます。所要数が減った場合は未着手の子計画が減り（0になれば中止）、計画を中止すると未着手・保留の子計画も中止されます（着手済みの子計画は残ります）。
                    見込みで足りる中間品は、子計画を立てるか在庫を使うかを選んでください。
                    子計画は親の計画開始日時に終わるよう、中間品の調達リードタイム（未設定なら親と同じ期間）で作られます。
                    {readOnly && <><br /><strong>未着手・進行中の計画だけ手配できます。</strong></>}
                </p>

                {message.text && <div className={`alert alert-${message.type}`}>{message.text}</div>}

                <div className="table-responsive">
                    <table className="table table-sm table-bordered align-middle">
                        <thead className="table-light">
                            <tr>
                                <th>中間品</th><th className="text-end">所要数</th><th className="text-end">引当済</th>
                                <th className="text-end">子計画で生産</th><th className="text-end">開始時点の見込み</th>
                                <th>状況</th>{!readOnly && <th>手配</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={7}>読み込み中...</td></tr>
                            ) : rows.length === 0 ? (
                                <tr><td colSpan={7}>この計画の部品構成に中間品はありません。</td></tr>
                            ) : rows.map(row => (
                                <tr key={row.material_code}>
                                    <td>
                                        [{row.material_code}] {row.material_name}
                                        {row.child_plans.map(child => (
                                            <div key={child.id} className="small text-muted ms-2">
                                                └ {child.plan_name}：{child.planned_quantity}（{formatDate(child.planned_end_datetime)} 終了予定・{child.status_display}）
                                            </div>
                                        ))}
                                    </td>
                                    <td className="text-end">{row.required_quantity}</td>
                                    <td className="text-end">{row.allocated_quantity}</td>
                                    <td className="text-end">{row.child_planned_quantity}</td>
                                    <td className={`text-end${row.projected_available_quantity < 0 ? ' text-danger' : ''}`}>
                                        {row.projected_available_quantity}
                                    </td>
                                    <td className="text-nowrap">
                                        <span className={`badge ${STATUS_BADGES[row.status].className}`}>{STATUS_BADGES[row.status].label}</span>
                                        {row.shortage_quantity > 0 && <div className="small text-danger">不足 {row.shortage_quantity} {row.unit}</div>}
                                        {row.supply_method && <div className="small">{row.supply_method_display}</div>}
                                    </td>
                                    {!readOnly && (
                                        <td>
                                            <div className="d-flex flex-wrap gap-1 align-items-center">
                                                <input
                                                    type="number" className="form-control form-control-sm text-end" min="1" step="1"
                                                    style={{ width: '90px' }} aria-label={`${row.material_code} の子計画数量`}
                                                    value={quantities[row.material_code] ?? ''}
                                                    onChange={e => setQuantities(prev => ({ ...prev, [row.material_code]: e.target.value }))}
                                                />
                                                <button
                                                    type="button" className="btn btn-sm btn-primary" disabled={submitting}
                                                    onClick={() => createChildPlan(row)}
                                                >
                                                    {row.status === 'COVERED' ? '子計画を追加' : '子計画を立てる'}
                                                </button>
                                                {row.status === 'DECISION_REQUIRED' && (
                                                    <button
                                                        type="button" className="btn btn-sm btn-outline-success" disabled={submitting}
                                                        onClick={() => arrange({ material_code: row.material_code, method: 'STOCK' })}
                                                    >
                                                        在庫を使う
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="text-end mt-3">
                    <button className="btn btn-secondary" onClick={onClose}>閉じる</button>
                </div>
            </div>
        </Modal>
    );
};

export default ProductionPlanIntermediatesModal;
