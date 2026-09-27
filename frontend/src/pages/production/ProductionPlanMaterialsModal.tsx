import React, { useState, useEffect, useCallback } from 'react';
import Modal from '../../components/Modal';
import productionService from '../../services/productionService';
import bomService, { MasterItem, isConsumableItem, itemTypeLabel } from '../../services/bomService';
import { ApiError } from '../../utils/api';
import { PlanMaterial, ProductionPlan } from '../../types/production';

interface ProductionPlanMaterialsModalProps {
    isOpen: boolean;
    onClose: () => void;
    plan: ProductionPlan | null;
}

// 完了・中止した計画の構成は履歴として固定する(サーバー側でも拒否される)
const READ_ONLY_STATUSES = ['COMPLETED', 'CANCELLED'];

const errorText = (e: unknown) => {
    if (e instanceof ApiError && e.errors) {
        return Object.values(e.errors).flat().join(' ') || e.message;
    }
    return e instanceof Error ? e.message : String(e);
};

/**
 * 生産計画ごとの部品構成(所要部品)の確認・編集。
 * 計画作成時にBOMマスターの構成(1階層目)がコピーされ、同じ製品でも計画ごとに変えられる。
 */
const ProductionPlanMaterialsModal: React.FC<ProductionPlanMaterialsModalProps> = ({ isOpen, onClose, plan }) => {
    const [materials, setMaterials] = useState<PlanMaterial[]>([]);
    const [itemOptions, setItemOptions] = useState<MasterItem[]>([]);
    const [newMaterial, setNewMaterial] = useState({ material_code: '', quantity_per_unit: '' });
    const [message, setMessage] = useState({ text: '', type: '' });
    const [loading, setLoading] = useState(false);

    const readOnly = !plan || READ_ONLY_STATUSES.includes(plan.status);

    const load = useCallback(async () => {
        if (!plan) return;
        setLoading(true);
        try {
            setMaterials(await productionService.getPlanMaterials(plan.id));
        } catch (e) {
            setMessage({ text: errorText(e), type: 'danger' });
        } finally {
            setLoading(false);
        }
    }, [plan]);

    useEffect(() => {
        if (!isOpen || !plan) return;
        setMessage({ text: '', type: '' });
        setNewMaterial({ material_code: '', quantity_per_unit: '' });
        load();
        bomService.getItems()
            .then(list => setItemOptions(list.filter(item => isConsumableItem(item) && item.code !== plan.product_code)))
            .catch(e => setMessage({ text: errorText(e), type: 'danger' }));
    }, [isOpen, plan, load]);

    const run = async (action: () => Promise<unknown>, successText: string) => {
        setMessage({ text: '', type: '' });
        try {
            await action();
            setMessage({ text: successText, type: 'success' });
            await load();
        } catch (e) {
            setMessage({ text: errorText(e), type: 'danger' });
        }
    };

    const handleQuantityChange = (id: string, value: string) => {
        setMaterials(prev => prev.map(m => (m.id === id ? { ...m, quantity_per_unit: value } : m)));
    };

    const handleSave = (material: PlanMaterial) =>
        run(
            () => productionService.savePlanMaterial({
                id: material.id,
                production_plan: material.production_plan,
                material_code: material.material_code,
                quantity_per_unit: material.quantity_per_unit,
            }),
            `${material.material_code} を更新しました。`
        );

    const handleDelete = (material: PlanMaterial) => {
        if (!window.confirm(`${material.material_code} をこの計画の部品構成から削除しますか？`)) return;
        run(() => productionService.deletePlanMaterial(material.id!), `${material.material_code} を削除しました。`);
    };

    const handleAdd = (e: React.FormEvent) => {
        e.preventDefault();
        if (!plan) return;
        run(async () => {
            await productionService.savePlanMaterial({ production_plan: plan.id, ...newMaterial });
            setNewMaterial({ material_code: '', quantity_per_unit: '' });
        }, `${newMaterial.material_code} を追加しました。`);
    };

    const handleReset = () => {
        if (!plan) return;
        if (!window.confirm('BOMマスターの構成で読み込み直します。この計画で編集した内容は失われます。よろしいですか？')) return;
        run(() => productionService.resetPlanMaterials(plan.id), '部品構成をBOMマスターから読み込み直しました。');
    };

    if (!plan) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} maxWidth="900px">
            <div className="p-3">
                <div className="d-flex justify-content-between align-items-center mb-3 border-bottom pb-2">
                    <h5 className="mb-0">部品構成（{plan.plan_name}）</h5>
                    <button type="button" className="btn-close" aria-label="Close" onClick={onClose}></button>
                </div>
                <dl className="row mb-2">
                    <dt className="col-sm-3">製品コード:</dt><dd className="col-sm-9">{plan.product_code || 'N/A'}</dd>
                    <dt className="col-sm-3">計画数量:</dt><dd className="col-sm-9">{plan.planned_quantity}</dd>
                </dl>
                <p className="text-muted small">
                    計画作成時にBOMマスターの構成がコピーされています。この計画だけ構成を変える場合はここで編集します。
                    所要数は「1個あたり × 計画数量」を切り上げた値です。歩留まり・ロスによる不足分は「追加出庫」で出庫してください。
                    中間品の見込みが足りなくなった場合は子計画が自動で作られます（「中間品」ボタンで確認・手配）。
                    {readOnly && <><br /><strong>完了・中止した計画の部品構成は変更できません。</strong></>}
                </p>

                {message.text && <div className={`alert alert-${message.type}`}>{message.text}</div>}

                <div className="table-responsive">
                    <table className="table table-sm table-bordered">
                        <thead className="table-light">
                            <tr>
                                <th>部品</th><th className="text-end">1個あたり</th><th className="text-end">所要数</th><th>単位</th>
                                {!readOnly && <th style={{ width: '150px' }}>操作</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={5}>読み込み中...</td></tr>
                            ) : materials.length === 0 ? (
                                <tr><td colSpan={5}>部品構成が登録されていません。</td></tr>
                            ) : materials.map(m => (
                                <tr key={m.id}>
                                    <td>
                                        [{m.material_code}] {m.material_name}
                                        {m.material_item_type === 'intermediate' && (
                                            <span className="badge bg-info text-dark ms-1">中間品{m.supply_method ? `・${m.supply_method_display}` : ''}</span>
                                        )}
                                    </td>
                                    <td className="text-end">
                                        {readOnly ? m.quantity_per_unit : (
                                            <input
                                                type="number" className="form-control form-control-sm text-end"
                                                step="0.001" min="0.001" style={{ width: '110px', marginLeft: 'auto' }}
                                                value={m.quantity_per_unit}
                                                onChange={e => handleQuantityChange(m.id!, e.target.value)}
                                            />
                                        )}
                                    </td>
                                    <td className="text-end">{m.required_quantity}</td>
                                    <td>{m.material_unit}</td>
                                    {!readOnly && (
                                        <td>
                                            <button type="button" className="btn btn-sm btn-primary" onClick={() => handleSave(m)}>保存</button>
                                            <button type="button" className="btn btn-sm btn-danger ms-2" onClick={() => handleDelete(m)}>削除</button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {!readOnly && (
                    <>
                        <form className="d-flex flex-wrap gap-2 align-items-end mb-3" onSubmit={handleAdd}>
                            <div>
                                <label htmlFor="plan_material_code" className="form-label">部品を追加</label>
                                <select
                                    id="plan_material_code" className="form-select form-select-sm"
                                    value={newMaterial.material_code}
                                    onChange={e => setNewMaterial(prev => ({ ...prev, material_code: e.target.value }))}
                                    required
                                >
                                    <option value="">-- 材料・中間品を選択 --</option>
                                    {itemOptions.map(item => (
                                        <option key={item.id} value={item.code}>
                                            [{item.code}] {item.name}（{itemTypeLabel(item.item_type)}）
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="plan_material_qty" className="form-label">1個あたり</label>
                                <input
                                    id="plan_material_qty" type="number" className="form-control form-control-sm"
                                    step="0.001" min="0.001" style={{ width: '110px' }} required
                                    value={newMaterial.quantity_per_unit}
                                    onChange={e => setNewMaterial(prev => ({ ...prev, quantity_per_unit: e.target.value }))}
                                />
                            </div>
                            <button type="submit" className="btn btn-sm btn-success">追加</button>
                        </form>
                        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={handleReset}>
                            BOMマスターから読み込み直す
                        </button>
                    </>
                )}

                <div className="text-end mt-4">
                    <button className="btn btn-secondary" onClick={onClose}>閉じる</button>
                </div>
            </div>
        </Modal>
    );
};

export default ProductionPlanMaterialsModal;
