import React, { useState } from 'react';
import { useInspectionItems } from '../hooks/useInspectionItems';
import { InspectionItem } from '../services/qualityService';
import InspectionItemTable from './quality/InspectionItemTable';
import InspectionResultModal from '../components/quality/InspectionResultModal';

const AcceptanceInspection: React.FC = () => {
    const { items, loading, error } = useInspectionItems('acceptance');
    const [selectedItem, setSelectedItem] = useState<InspectionItem | null>(null);

    const handleSuccess = () => {
        setSelectedItem(null);
    };

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
                    onSuccess={handleSuccess}
                />
            )}
        </div>
    );
};

export default AcceptanceInspection;