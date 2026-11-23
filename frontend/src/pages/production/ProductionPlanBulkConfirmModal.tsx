import React from 'react';
import Modal from '../../components/Modal';

interface ProductionPlanBulkConfirmModalProps {
    isOpen: boolean;
    /** チェックした計画の件数 */
    count: number;
    /** そのうち在庫が不足している計画の件数 */
    shortageCount: number;
    onConfirm: () => void;
    onCancel: () => void;
}

/** チェックした計画をまとめて引き当てる前の確認(ブラウザ標準のダイアログの代わり) */
const ProductionPlanBulkConfirmModal: React.FC<ProductionPlanBulkConfirmModalProps> = ({
    isOpen, count, shortageCount, onConfirm, onCancel
}) => (
    <Modal isOpen={isOpen} onClose={onCancel} maxWidth="560px">
        <div className="p-3">
            <h5 className="fw-bold mb-3 border-bottom pb-2">まとめて引き当てますか？</h5>
            <p className="mb-2">
                チェックした <strong>{count}</strong> 件の生産計画の未引当分を、在庫の多い倉庫から引き当てます。
            </p>
            {shortageCount > 0 && (
                <div className="alert alert-warning small mb-0">
                    在庫不足の計画が {shortageCount} 件あり、引き当てられる分のみ引き当てます。
                </div>
            )}
            <div className="d-flex justify-content-end gap-2 mt-4">
                <button type="button" className="btn btn-outline-secondary" onClick={onCancel}>キャンセル</button>
                <button type="button" className="btn btn-primary fw-bold" onClick={onConfirm}>引き当てる</button>
            </div>
        </div>
    </Modal>
);

export default ProductionPlanBulkConfirmModal;
