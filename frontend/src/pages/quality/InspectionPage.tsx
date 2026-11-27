import React, { useState } from 'react';
import { useInspectionItems } from '../../hooks/useInspectionItems';
import { InspectionItem } from '../../services/qualityService';
import InspectionItemTable from './InspectionItemTable';
import InspectionResultModal from '../../components/quality/InspectionResultModal';

/** 検査の実施画面(受入検査・工程内検査で共通)。inspectionType の検査項目を一覧し、選んだ項目の結果を登録する。 */
const InspectionPage: React.FC<{ inspectionType: 'acceptance' | 'in_process' }> = ({ inspectionType }) => {
    const { items, loading, error } = useInspectionItems(inspectionType);
    const [selectedItem, setSelectedItem] = useState<InspectionItem | null>(null);

    return (
        <div className="goods-receipt-page">
            {loading && <div className="text-center py-5 text-muted">読み込み中...</div>}
            {error && <div className="alert alert-danger">エラー: {error}</div>}

            {!loading && !error && (
                <InspectionItemTable
                    items={items}
                    onItemClick={setSelectedItem}
                />
            )}

            {selectedItem && (
                <InspectionResultModal
                    item={selectedItem}
                    onClose={() => setSelectedItem(null)}
                    onSuccess={() => setSelectedItem(null)}
                />
            )}
        </div>
    );
};

export default InspectionPage;
