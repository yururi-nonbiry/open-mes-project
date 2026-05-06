import React, { useState, useEffect } from 'react';
import Modal from '../../components/Modal';
import productionService from '../../services/productionService';
import { ProductionPlan } from '../../types/production';

interface RequiredPart {
    part_code: string;
    part_name: string;
    warehouse: string;
    required_quantity: string | number;
    already_allocated_quantity: string | number;
    inventory_quantity: number;
    unit: string;
    quantity_to_allocate: string | number;
}

interface ProductionPlanAllocateModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    plan: ProductionPlan | null;
}

const ProductionPlanAllocateModal: React.FC<ProductionPlanAllocateModalProps> = ({
    isOpen, onClose, onSuccess, plan
}) => {
    const [requiredParts, setRequiredParts] = useState<RequiredPart[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [allocationResult, setAllocationResult] = useState<{ type: 'success' | 'error', message?: string, data?: any } | null>(null);

    const calculateDefaultAllocation = (requiredStr: any, inventoryStr: any, alreadyAllocatedStr: any) => {
        const requiredQty = parseFloat(requiredStr) || 0;
        const inventoryQty = parseInt(inventoryStr, 10) || 0;
        const alreadyAllocatedQty = parseFloat(alreadyAllocatedStr) || 0;
        const stillNeeded = Math.max(0, requiredQty - alreadyAllocatedQty);
        return Math.max(0, Math.min(stillNeeded, inventoryQty));
    };

    useEffect(() => {
        if (isOpen && plan && !allocationResult) {
            const fetchRequiredParts = async () => {
                setLoading(true);
                setError(null);
                try {
                    const data = await productionService.getRequiredParts(plan.id);
                    const partsWithAllocation = data.map((part: any) => ({
                        ...part,
                        quantity_to_allocate: calculateDefaultAllocation(part.required_quantity, part.inventory_quantity, part.already_allocated_quantity)
                    }));
                    setRequiredParts(partsWithAllocation);
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

    const handleSubmit = async () => {
        if (!plan) return;

        const allocationsData = requiredParts
            .filter(part => (parseFloat(part.quantity_to_allocate as string) || 0) > 0 && part.warehouse && part.warehouse !== 'N/A')
            .map(part => ({
                part_number: part.part_code,
                warehouse: part.warehouse,
                quantity_to_allocate: parseFloat(part.quantity_to_allocate as string)
            }));

        if (allocationsData.length === 0) {
            alert('引き当て対象の有効な部品がありません。');
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

    const formatDecimalQuantity = (value: any) => {
        const num = parseFloat(value);
        if (isNaN(num)) return value;
        return (num % 1 === 0) ? num.toFixed(0) : num.toString();
    };

    if (!plan) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} maxWidth="900px">
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
                                            <th>部品コード</th><th>部品名</th><th>倉庫</th><th className="text-end">総必要数</th>
                                            <th className="text-end">引当済</th><th className="text-end">在庫</th><th className="text-end">引当数量</th><th>単位</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {requiredParts.map(part => (
                                            <tr key={part.part_code}>
                                                <td>{part.part_code || 'N/A'}</td><td>{part.part_name || 'N/A'}</td><td>{part.warehouse || 'N/A'}</td>
                                                <td className="text-end">{formatDecimalQuantity(part.required_quantity)}</td>
                                                <td className="text-end">{formatDecimalQuantity(part.already_allocated_quantity)}</td>
                                                <td className="text-end">{part.inventory_quantity}</td>
                                                <td className="text-end">
                                                    <input 
                                                        type="number" className="form-control form-control-sm text-end" 
                                                        value={part.quantity_to_allocate} 
                                                        onChange={(e) => handleQuantityChange(part.part_code, e.target.value)} 
                                                        min="0" style={{ width: '80px' }}
                                                    />
                                                </td>
                                                <td>{part.unit || 'N/A'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                        <div className="text-end mt-4">
                            <button className="btn btn-primary" onClick={handleSubmit} disabled={loading || !!error}>引き当て実行</button>
                            <button className="btn btn-secondary ms-2" onClick={onClose}>キャンセル</button>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default ProductionPlanAllocateModal;
