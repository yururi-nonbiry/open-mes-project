import React, { useState, useEffect } from 'react';
import Modal from '../../components/Modal';
import productionService from '../../services/productionService';
import { describeError } from '../../utils/api';
import { ProductionPlan, RequiredPart } from '../../types/production';
import { unwrapList, type MaybeWrapped, type RawRequiredPart } from './types';

interface ProductionPlanAdditionalIssueModalProps {
    isOpen: boolean;
    onClose: () => void;
    plan: ProductionPlan | null;
}

interface IssueRow extends RequiredPart {
    selected_warehouse: string;
    quantity: string;
}

/**
 * 歩留まり・ロス等で所要量を超えて必要になった部品の追加ピッキング。
 * 所要量には含めず、引当を経ずに即時ピッキングする(順立て（ピッキング）の一覧には「追加ピッキング」として記録される)。
 */
const ProductionPlanAdditionalIssueModal: React.FC<ProductionPlanAdditionalIssueModalProps> = ({ isOpen, onClose, plan }) => {
    const [rows, setRows] = useState<IssueRow[]>([]);
    const [remarks, setRemarks] = useState('');
    const [message, setMessage] = useState({ text: '', type: '' });
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const load = async (planId: string) => {
        setLoading(true);
        try {
            const raw = await productionService.getRequiredParts(planId);
            const parts = unwrapList(raw as MaybeWrapped<'parts', RawRequiredPart>, 'parts');
            setRows(parts.map((part) => {
                const warehouses = Array.isArray(part.warehouses) ? part.warehouses : Array.isArray(part.inventories) ? part.inventories : [];
                return {
                    ...part,
                    already_allocated_quantity: part.already_allocated_quantity ?? part.allocated_quantity ?? 0,
                    warehouses,
                    selected_warehouse: warehouses[0]?.warehouse ?? '',
                    quantity: '',
                };
            }));
        } catch (e) {
            setMessage({ text: describeError(e), type: 'danger' });
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!isOpen || !plan) return;
        setMessage({ text: '', type: '' });
        setRemarks('');
        load(plan.id);
    }, [isOpen, plan]);

    const updateRow = (partCode: string, patch: Partial<IssueRow>) => {
        setRows(prev => prev.map(row => (row.part_code === partCode ? { ...row, ...patch } : row)));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!plan) return;
        const items = rows
            .filter(row => (parseInt(row.quantity, 10) || 0) > 0 && row.selected_warehouse)
            .map(row => ({ part_number: row.part_code, warehouse: row.selected_warehouse, quantity: parseInt(row.quantity, 10) }));
        if (items.length === 0) {
            setMessage({ text: '追加ピッキングする数量を入力してください。', type: 'danger' });
            return;
        }
        setSubmitting(true);
        setMessage({ text: '', type: '' });
        try {
            const result = await productionService.issueAdditionalMaterials(plan.id, items, remarks);
            setMessage({ text: result.message, type: 'success' });
            setRemarks('');
            await load(plan.id);
        } catch (err) {
            setMessage({ text: describeError(err), type: 'danger' });
        } finally {
            setSubmitting(false);
        }
    };

    if (!plan) return null;
    const cancelled = plan.status === 'CANCELLED';

    return (
        <Modal isOpen={isOpen} onClose={onClose} maxWidth="900px">
            <div className="p-3">
                <div className="d-flex justify-content-between align-items-center mb-3 border-bottom pb-2">
                    <h5 className="mb-0">追加ピッキング（{plan.plan_name}）</h5>
                    <button type="button" className="btn-close" aria-label="Close" onClick={onClose}></button>
                </div>
                <p className="text-muted small">
                    歩留まり・ロス等で所要量を超えて必要になった部品を、引当を経ずにすぐピッキングします。所要量の引当とは別に記録され、
                    生産完了を取り消しても在庫には戻りません。使わなかった分は順立て（ピッキング）画面から「返却」で在庫に戻せます。
                </p>
                {cancelled && <div className="alert alert-warning">中止された生産計画には追加ピッキングできません。</div>}
                {message.text && <div className={`alert alert-${message.type}`}>{message.text}</div>}

                <form onSubmit={handleSubmit}>
                    <div className="table-responsive">
                        <table className="table table-sm table-bordered">
                            <thead className="table-light">
                                <tr>
                                    <th>部品</th><th className="text-end">所要数</th><th className="text-end">引当済</th>
                                    <th className="text-end">追加ピッキング済</th><th>ピッキング元倉庫（ピッキング可能数）</th><th className="text-end">追加ピッキング数</th><th>単位</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={7}>読み込み中...</td></tr>
                                ) : rows.length === 0 ? (
                                    <tr><td colSpan={7}>この計画には部品構成が登録されていません。</td></tr>
                                ) : rows.map(row => (
                                    <tr key={row.part_code}>
                                        <td>[{row.part_code}] {row.part_name}</td>
                                        <td className="text-end">{row.required_quantity}</td>
                                        <td className="text-end">{row.already_allocated_quantity}</td>
                                        <td className="text-end">{row.additional_issued_quantity}</td>
                                        <td>
                                            {row.warehouses.length > 0 ? (
                                                <select
                                                    className="form-select form-select-sm" value={row.selected_warehouse}
                                                    onChange={e => updateRow(row.part_code, { selected_warehouse: e.target.value })}
                                                >
                                                    {row.warehouses.map(w => (
                                                        <option key={w.warehouse} value={w.warehouse}>{w.warehouse}（{w.available_quantity}）</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <span className="text-danger">ピッキング可能な在庫なし</span>
                                            )}
                                        </td>
                                        <td className="text-end">
                                            <input
                                                type="number" className="form-control form-control-sm text-end" min="0" step="1"
                                                style={{ width: '90px', marginLeft: 'auto' }}
                                                value={row.quantity} disabled={!row.selected_warehouse || cancelled}
                                                onChange={e => updateRow(row.part_code, { quantity: e.target.value })}
                                            />
                                        </td>
                                        <td>{row.unit}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="mb-3">
                        <label htmlFor="additional_issue_remarks" className="form-label">理由・備考</label>
                        <input
                            id="additional_issue_remarks" type="text" className="form-control"
                            placeholder="例: 加工不良による補充" value={remarks} onChange={e => setRemarks(e.target.value)}
                        />
                    </div>
                    <div className="text-end">
                        <button type="submit" className="btn btn-warning" disabled={submitting || loading || cancelled}>
                            {submitting ? 'ピッキング中...' : '追加ピッキングを実行'}
                        </button>
                        <button type="button" className="btn btn-secondary ms-2" onClick={onClose}>閉じる</button>
                    </div>
                </form>
            </div>
        </Modal>
    );
};

export default ProductionPlanAdditionalIssueModal;
