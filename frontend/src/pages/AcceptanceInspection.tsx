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
        <div className="container mt-4">
            <h3>受入検査 登録</h3>
            <p className="text-muted">検査する項目を選択してください。</p>

            {loading && <p>読み込み中...</p>}
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