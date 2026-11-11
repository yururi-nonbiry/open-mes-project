import { useState, useCallback, useEffect } from 'react';
import bomService, { BillOfMaterial } from '../services/bomService';

export const useBomMaster = () => {
    const [items, setItems] = useState<BillOfMaterial[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchItems = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await bomService.getBillOfMaterials();
            setItems(data);
        } catch (e) {
            setError(`一覧の読み込みに失敗しました: ${(e as Error).message}`);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchItems();
    }, [fetchItems]);

    const deleteItem = useCallback(async (id: string, product: string, material: string) => {
        if (window.confirm(`使用部品構成「${product} → ${material}」を本当に削除しますか？`)) {
            try {
                const result = await bomService.deleteBillOfMaterial(id);
                alert(result.message);
                fetchItems();
                return true;
            } catch (err) {
                alert(`削除中にエラーが発生しました: ${(err as Error).message}`);
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
        deleteItem,
    };
};
