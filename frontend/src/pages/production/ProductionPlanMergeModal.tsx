import React from 'react';
import Modal from '../../components/Modal';
import { MergeCandidateGroup, ProductionPlan } from '../../types/production';

interface ProductionPlanMergeModalProps {
    isOpen: boolean;
    groups: MergeCandidateGroup[];
    /** チェックした計画(まとめ後の一覧を作るため) */
    targets: ProductionPlan[];
    loading: boolean;
    /** 同一品番の計画を統合して引き当てる */
    onMerge: () => void;
    /** 統合せず、計画ごとに引き当てる */
    onSeparate: () => void;
    onCancel: () => void;
}

const formatDate = (value: string) => {
    const d = new Date(value);
    return isNaN(d.getTime()) ? value : d.toLocaleDateString('ja-JP');
};

interface AfterMergeRow {
    key: string;
    name: string;
    quantity: number;
    endDatetime: string;
    note: string;
    merged: boolean;
}

/** まとめた後の計画一覧(統合される計画は、グループの先頭の位置に統合計画として並べる。バックエンドの処理と同じ並び) */
const buildAfterMergeRows = (groups: MergeCandidateGroup[], targets: ProductionPlan[]): AfterMergeRow[] => {
    const groupByFirstId = new Map(groups.map(g => [g.plans[0].id, g]));
    const mergedIds = new Set(groups.flatMap(g => g.plans.map(p => p.id)));
    const rows: AfterMergeRow[] = [];
    for (const plan of targets) {
        const g = groupByFirstId.get(plan.id);
        if (g) {
            rows.push({
                key: `merged-${plan.id}`,
                name: `統合 ${g.product_code} (${g.plans.length}件)`,
                quantity: g.total_quantity,
                endDatetime: g.earliest_end_datetime,
                note: `統合元: ${g.plans.map(p => p.plan_name).join('、')}`,
                merged: true,
            });
        } else if (!mergedIds.has(plan.id)) {
            rows.push({
                key: plan.id, name: plan.plan_name, quantity: plan.planned_quantity,
                endDatetime: plan.planned_end_datetime, note: '', merged: false,
            });
        }
    }
    return rows;
};

/** 同一品番の計画があるとき、1つの計画にまとめて引き当てるかをユーザーに確認する */
const ProductionPlanMergeModal: React.FC<ProductionPlanMergeModalProps> = ({
    isOpen, groups, targets, loading, onMerge, onSeparate, onCancel
}) => (
    <Modal isOpen={isOpen} onClose={onCancel} maxWidth="720px">
        <h5 className="fw-bold mb-3">同一品番の計画をまとめますか？</h5>
        <p className="small text-muted">
            同じ品番の計画が複数あります。1つの統合計画にまとめると、部品のピッキングと生産を一括で行えます。
            統合計画の納期は最も早い計画のものになり、生産完了時の数量は納期の早い元の計画から順に割り振られます。
            統合は、引当・生産の前であれば「統合解除」で元に戻せます。
        </p>
        {groups.map(g => (
            <div key={`${g.product_code}-${g.purpose ?? ''}`} className="border rounded p-2 mb-2">
                <div className="fw-bold">
                    {g.product_code}{g.product_name ? `（${g.product_name}）` : ''}
                    {g.purpose && <span className="ms-2 badge bg-secondary">用途 {g.purpose}</span>}
                    <span className="ms-2 badge bg-primary">合計 {g.total_quantity} 個 / 納期 {formatDate(g.earliest_end_datetime)}</span>
                </div>
                <ul className="small mb-0 mt-1">
                    {g.plans.map(p => (
                        <li key={p.id}>{p.plan_name}: {p.planned_quantity} 個（納期 {formatDate(p.planned_end_datetime)}）</li>
                    ))}
                </ul>
            </div>
        ))}
        <h6 className="fw-bold mt-3 mb-1">まとめ後の計画一覧</h6>
        <table className="table table-sm small mb-0" data-testid="after-merge-plans">
            <thead>
                <tr><th>計画</th><th className="text-end">数量</th><th>納期</th><th>備考</th></tr>
            </thead>
            <tbody>
                {buildAfterMergeRows(groups, targets).map(r => (
                    <tr key={r.key} className={r.merged ? 'table-primary' : ''}>
                        <td className={r.merged ? 'fw-bold' : ''}>{r.name}</td>
                        <td className="text-end">{r.quantity}</td>
                        <td>{formatDate(r.endDatetime)}</td>
                        <td>{r.note}</td>
                    </tr>
                ))}
            </tbody>
        </table>
        <div className="d-flex justify-content-end gap-2 mt-3">
            <button type="button" className="btn btn-outline-secondary" onClick={onCancel} disabled={loading}>キャンセル</button>
            <button type="button" className="btn btn-outline-primary" onClick={onSeparate} disabled={loading}>まとめずに引き当てる</button>
            <button type="button" className="btn btn-primary fw-bold" onClick={onMerge} disabled={loading}>まとめて引き当てる</button>
        </div>
    </Modal>
);

export default ProductionPlanMergeModal;
