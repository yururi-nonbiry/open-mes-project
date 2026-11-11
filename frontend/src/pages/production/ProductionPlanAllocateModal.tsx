import React, { useState, useEffect } from 'react';
import Modal from '../../components/Modal';
import productionService from '../../services/productionService';
import { useWorkCenters } from '../../hooks/useWorkCenters';
import { ProductionPlan, RequiredPart } from '../../types/production';

/** 画面上の行。倉庫は引当時に選ぶため、行ごとに選択中の倉庫を持つ */
interface AllocationRow extends RequiredPart {
    selected_warehouse: string;
    /** 出庫先ライン。生産計画のラインが既定値で、引当ごとに変更できる */
    selected_line: string;
    quantity_to_allocate: string | number;
    /** まとめて引当の対象にするか */
    checked: boolean;
}

interface ProductionPlanAllocateModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    plan: ProductionPlan | null;
}

/** 未引当の所要数(追加ピッキングは別枠のため含めない) */
const stillNeeded = (part: RequiredPart) =>
    Math.max(0, (part.required_quantity || 0) - (part.already_allocated_quantity || 0));

/** 全倉庫の引当可能数の合計 */
const totalAvailable = (part: RequiredPart) =>
    (part.warehouses || []).reduce((sum, w) => sum + (w.available_quantity || 0), 0);

const availableIn = (part: RequiredPart, warehouse: string) =>
    (part.warehouses || []).find(w => w.warehouse === warehouse)?.available_quantity ?? 0;

/** 未引当の所要数と、選んだ倉庫の引当可能数の小さい方を既定の引当数量にする */
const defaultQuantity = (part: RequiredPart, warehouse: string) => {
    const stillNeeded = Math.max(0, (part.required_quantity || 0) - (part.already_allocated_quantity || 0));
    return Math.max(0, Math.min(stillNeeded, availableIn(part, warehouse)));
};

const ProductionPlanAllocateModal: React.FC<ProductionPlanAllocateModalProps> = ({
    isOpen, onClose, onSuccess, plan
}) => {
    const workCenters = useWorkCenters();
    const [requiredParts, setRequiredParts] = useState<AllocationRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [allocationResult, setAllocationResult] = useState<{ type: 'success' | 'error', message?: string, data?: any } | null>(null);

    useEffect(() => {
        if (isOpen && plan && !allocationResult) {
            const fetchRequiredParts = async () => {
                setLoading(true);
                setError(null);
                try {
                    const raw = await productionService.getRequiredParts(plan.id);
                    const list = Array.isArray(raw) ? raw : Array.isArray((raw as any)?.parts) ? (raw as any).parts : [];
                    setRequiredParts(list.map((part: any) => {
                        const warehouses = Array.isArray(part.warehouses) ? part.warehouses : Array.isArray(part.inventories) ? part.inventories : [];
                        const normalizedPart: RequiredPart = {
                            ...part,
                            already_allocated_quantity: part.already_allocated_quantity ?? part.allocated_quantity ?? 0,
                            warehouses,
                        };
                        // 候補は引当可能数の多い順に並んでいるため、先頭を既定の倉庫にする
                        const warehouse = warehouses[0]?.warehouse ?? '';
                        return { ...normalizedPart, selected_warehouse: warehouse, selected_line: plan.line || '', quantity_to_allocate: defaultQuantity(normalizedPart, warehouse), checked: defaultQuantity(normalizedPart, warehouse) > 0 };
                    }));
                } catch (e: any) {
                    setError(e.message);
                } finally {
                    setLoading(false);
                }
            };
            fetchRequiredParts();
        }
    }, [isOpen, plan, allocationResult]);

    const handleQuantityChange = (partCode: string, value: string) => {
        setRequiredParts(prev => prev.map(part =>
            part.part_code === partCode ? { ...part, quantity_to_allocate: value } : part
        ));
    };

    const handleCheckChange = (partCode: string, checked: boolean) => {
        setRequiredParts(prev => prev.map(part => part.part_code === partCode ? { ...part, checked } : part));
    };

    const handleCheckAll = (checked: boolean) => {
        setRequiredParts(prev => prev.map(part => ({ ...part, checked: checked && !!part.selected_warehouse })));
    };

    /** チェック済みで引当数量がある行 */
    const allocQty = (part: AllocationRow) => (part.checked ? parseFloat(part.quantity_to_allocate as string) || 0 : 0);

    const handleLineChange = (partCode: string, line: string) => {
        setRequiredParts(prev => prev.map(part =>
            part.part_code === partCode ? { ...part, selected_line: line } : part
        ));
    };

    const handleWarehouseChange = (partCode: string, warehouse: string) => {
        setRequiredParts(prev => prev.map(part =>
            part.part_code === partCode
                ? { ...part, selected_warehouse: warehouse, quantity_to_allocate: defaultQuantity(part, warehouse) }
                : part
        ));
    };

    const handleSubmit = async () => {
        if (!plan) return;

        const allocationsData = requiredParts
            .filter(part => part.checked && (parseFloat(part.quantity_to_allocate as string) || 0) > 0 && part.selected_warehouse)
            .map(part => ({
                part_number: part.part_code,
                warehouse: part.selected_warehouse,
                quantity_to_allocate: parseFloat(part.quantity_to_allocate as string),
                ...(part.selected_line ? { line: part.selected_line } : {})
            }));

        if (allocationsData.length === 0) {
            alert('引き当て対象の有効な部品がありません。チェック・引当数量・倉庫を確認してください。');
            return;
        }

        try {
            const data = await productionService.allocateMaterials(plan.id, allocationsData);
            setAllocationResult({ type: 'success', data });
            try {
                const bc = new BroadcastChannel('allocation_results_channel');
                bc.postMessage({ type: 'allocationResult', data });
                bc.close();
            } catch (e) { console.error('Error broadcasting allocation result:', e); }
        } catch (e: any) {
            setAllocationResult({ type: 'error', message: e.message });
        }
    };

    if (!plan) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} maxWidth="1200px">
            <div className="p-3">
                <div className="d-flex justify-content-between align-items-center mb-3 border-bottom pb-2">
                    <h5 className="mb-0">{allocationResult?.type === 'success' ? '材料引き当て完了' : '材料引き当て'}</h5>
                    <button type="button" className="btn-close" aria-label="Close" onClick={onClose}></button>
                </div>

                {allocationResult ? (
                    <div>
                        <div className={`alert alert-${allocationResult.type === 'success' ? 'success' : 'danger'}`}>
                            {allocationResult.type === 'success' ? allocationResult.data.message || '材料の引き当てが完了しました。' : allocationResult.message}
                        </div>
                        {allocationResult.type === 'success' && allocationResult.data.allocations_summary && (
                            <div className="border p-2 mb-3" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                <table className="table table-sm table-bordered">
                                    <thead className="table-light">
                                        <tr><th>部品番号</th><th className="text-end">引当数量</th><th>ステータス</th></tr>
                                    </thead>
                                    <tbody>
                                        {allocationResult.data.allocations_summary.map((item: any, i: number) => (
                                            <tr key={i}><td>{item.part_number}</td><td className="text-end">{item.allocated_quantity}</td><td>{item.status}</td></tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <div className="text-end mt-4">
                            <button className="btn btn-primary" onClick={() => { setAllocationResult(null); onSuccess(); onClose(); }}>閉じる</button>
                        </div>
                    </div>
                ) : (
                    <div>
                        <dl className="row mb-2">
                            <dt className="col-sm-3">計画名:</dt><dd className="col-sm-9">{plan.plan_name || 'N/A'}</dd>
                            <dt className="col-sm-3">製品コード:</dt><dd className="col-sm-9">{plan.product_code || 'N/A'}</dd>
                            <dt className="col-sm-3">出庫先ライン:</dt><dd className="col-sm-9">{plan.line || '未指定'}（引当ごとに変更できます）</dd>
                            <dt className="col-sm-3">計画数量:</dt><dd className="col-sm-9 text-end">{plan.planned_quantity}</dd>
                        </dl>
                        <h6 className="mt-3">必要部品一覧</h6>
                        <div className="border p-2 mt-1 mb-3" style={{ maxHeight: '350px', overflowY: 'auto' }}>
                            {loading && <p>部品情報を読み込み中...</p>}
                            {error && <p className="text-danger">{error}</p>}
                            {!loading && !error && (
                                <table className="table table-sm table-bordered table-hover">
                                    <thead className="table-light">
                                        <tr>
                                            <th style={{ width: '32px' }}>
                                                <input
                                                    type="checkbox" className="form-check-input"
                                                    aria-label="すべて選択"
                                                    disabled={requiredParts.length === 0}
                                                    checked={requiredParts.length > 0 && requiredParts.every(p => p.checked)}
                                                    onChange={(e) => handleCheckAll(e.target.checked)}
                                                />
                                            </th>
                                            <th>部品コード</th><th>部品名</th><th className="text-end">所要数</th>
                                            <th className="text-end">引当済</th><th className="text-end">追加ピッキング済</th>
                                            <th>引当倉庫（引当可能数）</th><th>出庫先ライン</th><th className="text-end">引当数量</th>
                                            <th className="text-end">引当後の在庫</th><th className="text-end">引当後の不足</th><th>単位</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {requiredParts.length === 0 && (
                                            <tr className="table-secondary">
                                                <td colSpan={12} className="text-center py-3">
                                                    {plan.has_bom === false
                                                        ? <><span className="badge bg-secondary me-2">マスターなし</span>この製品には構成マスター(BOM)が登録されていません。</>
                                                        : 'この計画には所要部品が登録されていません。'}
                                                    {' '}「部品構成」から登録するか、BOMマスターから読み込んでください。
                                                </td>
                                            </tr>
                                        )}
                                        {requiredParts.map(part => {
                                            const needed = stillNeeded(part);
                                            const stock = totalAvailable(part);
                                            const shortage = needed > stock; // 在庫を全部使っても所要に足りない
                                            const qty = allocQty(part);
                                            const stockAfter = availableIn(part, part.selected_warehouse) - qty;
                                            const shortAfter = Math.max(0, needed - qty);
                                            return (
                                            <tr key={part.part_code} className={shortage ? 'table-danger' : needed === 0 ? 'table-light text-muted' : ''}>
                                                <td className="text-center">
                                                    <input
                                                        type="checkbox" className="form-check-input"
                                                        aria-label={`${part.part_code}を引当対象にする`}
                                                        checked={part.checked}
                                                        disabled={!part.selected_warehouse}
                                                        onChange={(e) => handleCheckChange(part.part_code, e.target.checked)}
                                                    />
                                                </td>
                                                <td>{part.part_code}</td>
                                                <td>
                                                    {part.part_name}
                                                    {shortage && <span className="badge bg-danger ms-1" title={`未引当 ${needed} に対し、引当可能な在庫は計 ${stock}`}>在庫不足 {needed - stock}</span>}
                                                </td>
                                                <td className="text-end">{part.required_quantity}</td>
                                                <td className="text-end">{part.already_allocated_quantity}</td>
                                                <td className="text-end">{part.additional_issued_quantity}</td>
                                                <td>
                                                    {part.warehouses.length > 0 ? (
                                                        <select
                                                            className="form-select form-select-sm"
                                                            value={part.selected_warehouse}
                                                            onChange={(e) => handleWarehouseChange(part.part_code, e.target.value)}
                                                        >
                                                            {part.warehouses.map(w => (
                                                                <option key={w.warehouse} value={w.warehouse}>
                                                                    {w.warehouse}（{w.available_quantity}）
                                                                </option>
                                                            ))}
                                                        </select>
                                                    ) : (
                                                        <span className="text-danger">引当可能な在庫なし</span>
                                                    )}
                                                </td>
                                                <td>
                                                    <select
                                                        className="form-select form-select-sm"
                                                        value={part.selected_line}
                                                        onChange={(e) => handleLineChange(part.part_code, e.target.value)}
                                                    >
                                                        <option value="">未指定</option>
                                                        {workCenters.map(w => (
                                                            <option key={w.code} value={w.code}>{w.code}{w.name ? `（${w.name}）` : ''}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td className="text-end">
                                                    <input
                                                        type="number" className="form-control form-control-sm text-end"
                                                        value={part.quantity_to_allocate}
                                                        onChange={(e) => handleQuantityChange(part.part_code, e.target.value)}
                                                        min="0" max={availableIn(part, part.selected_warehouse)}
                                                        disabled={!part.selected_warehouse}
                                                        style={{ width: '80px' }}
                                                    />
                                                </td>
                                                <td className={`text-end ${stockAfter < 0 ? 'text-danger fw-bold' : ''}`}>
                                                    {part.selected_warehouse ? stockAfter : '—'}
                                                </td>
                                                <td className={`text-end ${shortAfter > 0 ? 'text-danger fw-bold' : 'text-success'}`}>
                                                    {shortAfter > 0 ? shortAfter : '充足'}
                                                </td>
                                                <td>{part.unit}</td>
                                            </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                        {!loading && !error && requiredParts.length > 0 && (() => {
                            const checkedParts = requiredParts.filter(p => allocQty(p) > 0);
                            const lacking = requiredParts.filter(p => stillNeeded(p) - allocQty(p) > 0);
                            return (
                                <div className={`alert ${lacking.length === 0 ? 'alert-success' : 'alert-warning'} py-2 mb-0`}>
                                    チェックした {checkedParts.length} 件を引き当てると、
                                    {lacking.length === 0
                                        ? ' すべての部品の所要を満たせます。'
                                        : ` ${lacking.length} 件の部品が不足のままです(${lacking.map(p => p.part_code).join('、')})。`}
                                </div>
                            );
                        })()}
                        <div className="text-end mt-4">
                            <button className="btn btn-primary" onClick={handleSubmit} disabled={loading || !!error}>チェックした部品を引き当て</button>
                            <button className="btn btn-secondary ms-2" onClick={onClose}>キャンセル</button>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default ProductionPlanAllocateModal;
