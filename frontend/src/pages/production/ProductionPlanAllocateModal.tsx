import type { ApiErrorLike } from '../apiErrorTypes';
import React, { useState, useEffect } from 'react';
import Modal from '../../components/Modal';
import productionService from '../../services/productionService';
import { useWorkCenters } from '../../hooks/useWorkCenters';
import { ProductionPlan, RequiredPart } from '../../types/production';
import { unwrapList, type AllocationResultData, type MaybeWrapped, type RawRequiredPart } from './types';
import { t } from '../../utils/terms';
import inventoryService from '../../services/inventoryService';
import { ALLOCATION_COLUMNS, ALLOCATION_DATA_TYPE, type AllocationColumn } from '../../config/allocationColumns';

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
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [allocationResult, setAllocationResult] = useState<{ type: 'success' | 'error', message?: string, data?: AllocationResultData } | null>(null);
    // 引当の失敗は入力欄の上に表示し、入力内容を残したまま直して再送信できるようにする
    const [submitError, setSubmitError] = useState<string | null>(null);

    // 列の表示/非表示・並び順・表示名は、モデル項目表示設定(production_allocation)で変更できる。
    // 設定が無い(取得できない)場合は既定の列をすべて表示する。
    const [columns, setColumns] = useState<(AllocationColumn & { title: string })[]>(
        ALLOCATION_COLUMNS.map(c => ({ ...c, title: c.label }))
    );
    useEffect(() => {
        if (!isOpen) return;
        inventoryService.getDisplaySettings(ALLOCATION_DATA_TYPE).then(settings => {
            if (settings.length === 0) return;
            const byName = new Map(settings.map(s => [s.model_field_name, s]));
            const configured = ALLOCATION_COLUMNS
                .map((c, index) => ({ c, setting: byName.get(c.name), index }))
                // 設定に無い列(後から追加された列)は既定の位置に表示する
                .filter(({ c, setting }) => c.alwaysVisible || !setting || setting.is_list_display)
                .sort((a, b) => (a.setting?.display_order ?? (a.index + 1) * 10) - (b.setting?.display_order ?? (b.index + 1) * 10))
                .map(({ c, setting }) => ({ ...c, title: setting?.display_name || c.label }));
            setColumns(configured);
        }).catch(() => { /* 設定を取得できなくても既定の列で引当は続けられる */ });
    }, [isOpen]);

    useEffect(() => {
        if (isOpen && plan && !allocationResult) {
            const fetchRequiredParts = async () => {
                setLoading(true);
                setError(null);
                try {
                    const raw = await productionService.getRequiredParts(plan.id);
                    const list = unwrapList(raw as MaybeWrapped<'parts', RawRequiredPart>, 'parts');
                    setRequiredParts(list.map((part) => {
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
                } catch (e) {
                    setError((e as ApiErrorLike).message);
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
    // 在庫は整数で管理するため、引当数量も整数で扱う
    const allocQty = (part: AllocationRow) => (part.checked ? parseInt(String(part.quantity_to_allocate), 10) || 0 : 0);

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

        const fractional = requiredParts.find(part => part.checked && !Number.isInteger(Number(part.quantity_to_allocate)));
        if (fractional) {
            setSubmitError(`${fractional.part_code} の引当数量は整数で入力してください。`);
            return;
        }
        const allocationsData = requiredParts
            .filter(part => part.checked && allocQty(part) > 0 && part.selected_warehouse)
            .map(part => ({
                part_number: part.part_code,
                warehouse: part.selected_warehouse,
                quantity_to_allocate: allocQty(part),
                ...(part.selected_line ? { line: part.selected_line } : {})
            }));

        if (allocationsData.length === 0) {
            alert('引き当て対象の有効な部品がありません。チェック・引当数量・倉庫を確認してください。');
            return;
        }

        if (submitting) return; // 連打での二重引当を防ぐ
        setSubmitError(null);
        setSubmitting(true);
        try {
            const data = await productionService.allocateMaterials(plan.id, allocationsData);
            setAllocationResult({ type: 'success', data });
            try {
                const bc = new BroadcastChannel('allocation_results_channel');
                bc.postMessage({ type: 'allocationResult', data });
                bc.close();
            } catch (e) { console.error('Error broadcasting allocation result:', e); }
        } catch (e) {
            setSubmitError((e as ApiErrorLike).message || '部品の引き当てに失敗しました。');
        } finally {
            setSubmitting(false);
        }
    };

    if (!plan) return null;

    /** 結果表示中に×・Esc・背景クリックで閉じても、結果の状態を残さず一覧を更新する(別の計画を開いたとき前回の結果が出るのを防ぐ) */
    const handleClose = () => {
        const succeeded = allocationResult?.type === 'success';
        setAllocationResult(null);
        setSubmitError(null);
        if (succeeded) onSuccess();
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={handleClose} maxWidth="1200px">
            <div className="p-3">
                <div className="d-flex justify-content-between align-items-center mb-3 border-bottom pb-2">
                    <h5 className="mb-0">{allocationResult?.type === 'success' ? t('部品引き当て完了') : t('部品引き当て')}</h5>
                </div>

                {allocationResult ? (
                    <div>
                        <div className={`alert alert-${allocationResult.type === 'success' ? 'success' : 'danger'}`}>
                            {allocationResult.type === 'success' ? allocationResult.data?.message || t('部品の引き当てが完了しました。') : allocationResult.message}
                        </div>
                        {allocationResult.type === 'success' && allocationResult.data?.allocations_summary && (
                            <div className="border p-2 mb-3" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                <table className="table table-sm table-bordered">
                                    <thead className="table-light">
                                        <tr><th>{t('部品番号')}</th><th className="text-end">引当数量</th><th>ステータス</th></tr>
                                    </thead>
                                    <tbody>
                                        {allocationResult.data?.allocations_summary?.map((item, i) => (
                                            <tr key={i}><td>{item.part_number}</td><td className="text-end">{item.allocated_quantity}</td><td>{item.status}</td></tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <div className="text-end mt-4">
                            <button className="btn btn-primary" onClick={handleClose}>閉じる</button>
                        </div>
                    </div>
                ) : (
                    <div>
                        {submitError && (
                            <div className="alert alert-danger" role="alert">{submitError}</div>
                        )}
                        <dl className="row mb-2">
                            <dt className="col-sm-3">計画名:</dt><dd className="col-sm-9">{plan.plan_name || 'N/A'}</dd>
                            <dt className="col-sm-3">製品コード:</dt><dd className="col-sm-9">{plan.product_code || 'N/A'}</dd>
                            <dt className="col-sm-3">{t('出庫先ライン:')}</dt><dd className="col-sm-9">{plan.line || '未指定'}（引当ごとに変更できます）</dd>
                            <dt className="col-sm-3">計画数量:</dt><dd className="col-sm-9">{plan.planned_quantity}</dd>
                        </dl>
                        <h6 className="mt-3">{t('必要部品一覧')}</h6>
                        <div className="border p-2 mt-1 mb-3" style={{ maxHeight: '350px', overflowY: 'auto' }}>
                            {loading && <p>{t('部品情報を読み込み中...')}</p>}
                            {error && <p className="text-danger">{error}</p>}
                            {!loading && !error && (
                                <table className="table table-sm table-bordered table-hover">
                                    <thead className="table-light">
                                        <tr>
                                            <th style={{ width: '32px' }}>
                                                <input
                                                    type="checkbox" className="form-check-input"
                                                    aria-label="すべて選択"
                                                    disabled={!requiredParts.some(p => p.selected_warehouse)}
                                                    checked={requiredParts.some(p => p.selected_warehouse) && requiredParts.filter(p => p.selected_warehouse).every(p => p.checked)}
                                                    onChange={(e) => handleCheckAll(e.target.checked)}
                                                />
                                            </th>
                                            {columns.map(col => (
                                                <th key={col.name} className={col.align === 'end' ? 'text-end' : undefined}>{t(col.title)}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {requiredParts.length === 0 && (
                                            <tr className="table-secondary">
                                                <td colSpan={columns.length + 1} className="text-center py-3">
                                                    {plan.has_bom === false
                                                        ? <><span className="badge bg-secondary me-2">マスターなし</span>この製品には構成マスター(BOM)が登録されていません。</>
                                                        : t('この計画には所要部品が登録されていません。')}
                                                    {' '}{t('「部品構成」から登録するか、BOMマスターから読み込んでください。')}
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
                                            const cellClass = (name: string) =>
                                                name === 'stock_after' && stockAfter < 0 ? 'text-danger fw-bold'
                                                    : name === 'shortage_after' ? (shortAfter > 0 ? 'text-danger fw-bold' : 'text-success')
                                                        : '';
                                            const renderCell = (name: string): React.ReactNode => {
                                                switch (name) {
                                                    case 'part_code': return part.part_code;
                                                    case 'part_name': return (
                                                        <>
                                                            {part.part_name}
                                                            {shortage && <span className="badge bg-danger ms-1" title={`未引当 ${needed} に対し、引当可能な在庫は計 ${stock}`}>在庫不足 {needed - stock}</span>}
                                                        </>
                                                    );
                                                    case 'purpose': return plan.purpose || '汎用';
                                                    case 'required_quantity': return part.required_quantity;
                                                    case 'already_allocated_quantity': return part.already_allocated_quantity;
                                                    case 'additional_issued_quantity': return part.additional_issued_quantity;
                                                    case 'warehouse': return part.warehouses.length > 0 ? (
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
                                                    );
                                                    case 'line': return (
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
                                                    );
                                                    case 'quantity_to_allocate': return (
                                                        <input
                                                            type="number" step="1" className="form-control form-control-sm text-end"
                                                            value={part.quantity_to_allocate}
                                                            onChange={(e) => handleQuantityChange(part.part_code, e.target.value)}
                                                            min="0" max={availableIn(part, part.selected_warehouse)}
                                                            disabled={!part.selected_warehouse}
                                                            style={{ width: '80px' }}
                                                        />
                                                    );
                                                    case 'stock_after': return part.selected_warehouse ? stockAfter : '—';
                                                    case 'shortage_after': return shortAfter > 0 ? shortAfter : '充足';
                                                    case 'unit': return part.unit;
                                                    default: return null;
                                                }
                                            };
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
                                                {columns.map(col => (
                                                    <td key={col.name} className={`${col.align === 'end' ? 'text-end' : ''} ${cellClass(col.name)}`.trim()}>
                                                        {renderCell(col.name)}
                                                    </td>
                                                ))}
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
                                        ? t(' すべての部品の所要を満たせます。')
                                        : t(` ${lacking.length} 件の部品が不足のままです(${lacking.map(p => p.part_code).join('、')})。`)}
                                </div>
                            );
                        })()}
                        <div className="text-end mt-4">
                            <button className="btn btn-primary" onClick={handleSubmit} disabled={loading || submitting || !!error}>{t('チェックした部品を引き当て')}</button>
                            <button className="btn btn-secondary ms-2" onClick={handleClose}>キャンセル</button>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default ProductionPlanAllocateModal;
