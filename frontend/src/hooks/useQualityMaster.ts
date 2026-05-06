import { useState, useCallback, useEffect } from 'react';
import qualityService, { InspectionItem } from '../services/qualityService';

export const useQualityMaster = () => {
    const [items, setItems] = useState<InspectionItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchItems = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await qualityService.getInspectionItems();
            setItems(data);
        } catch (e: any) {
            setError(`一覧の読み込みに失敗しました: ${e.message}`);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchItems();
    }, [fetchItems]);

    const deleteItem = useCallback(async (id: string, code: string) => {
        if (window.confirm(`検査項目「${code}」を本当に削除しますか？`)) {
            try {
                const result = await qualityService.deleteInspectionItem(id);
                alert(result.message);
                fetchItems();
                return true;
            } catch (err: any) {
                alert(`削除中にエラーが発生しました: ${err.message}`);
                return false;
            }
        }
        return false;
    }, [fetchItems]);

    return {
        items,
        loading,
        error,
        fetchItems,
        deleteItem
    };
};
