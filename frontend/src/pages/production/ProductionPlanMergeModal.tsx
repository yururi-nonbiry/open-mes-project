import React from 'react';
import Modal from '../../components/Modal';
import { MergeCandidateGroup } from '../../types/production';

interface ProductionPlanMergeModalProps {
    isOpen: boolean;
    groups: MergeCandidateGroup[];
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

/** 同一品番の計画があるとき、1つの計画にまとめて引き当てるかをユーザーに確認する */
const ProductionPlanMergeModal: React.FC<ProductionPlanMergeModalProps> = ({
    isOpen, groups, loading, onMerge, onSeparate, onCancel
}) => (
    <Modal isOpen={isOpen} onClose={onCancel} maxWidth="720px">
        <h5 className="fw-bold mb-3">同一品番の計画をまとめますか？</h5>
        <p className="small text-muted">
            同じ品番の計画が複数あります。1つの統合計画にまとめると、部品のピッキングと生産を一括で行えます。
            統合計画の納期は最も早い計画のものになり、生産完了時の数量は納期の早い元の計画から順に割り振られます。
            統合は、引当・生産の前であれば「統合解除」で元に戻せます。
        </p>
        {groups.map(g => (
            <div key={g.product_code} className="border rounded p-2 mb-2">
                <div className="fw-bold">
                    {g.product_code}{g.product_name ? `（${g.product_name}）` : ''}
                    <span className="ms-2 badge bg-primary">合計 {g.total_quantity} 個 / 納期 {formatDate(g.earliest_end_datetime)}</span>
                </div>
                <ul className="small mb-0 mt-1">
                    {g.plans.map(p => (
                        <li key={p.id}>{p.plan_name}: {p.planned_quantity} 個（納期 {formatDate(p.planned_end_datetime)}）</li>
                    ))}
                </ul>
            </div>
        ))}
        <div className="d-flex justify-content-end gap-2 mt-3">
            <button type="button" className="btn btn-outline-secondary" onClick={onCancel} disabled={loading}>キャンセル</button>
            <button type="button" className="btn btn-outline-primary" onClick={onSeparate} disabled={loading}>まとめずに引き当てる</button>
            <button type="button" className="btn btn-primary fw-bold" onClick={onMerge} disabled={loading}>まとめて引き当てる</button>
        </div>
    </Modal>
);

export default ProductionPlanMergeModal;
