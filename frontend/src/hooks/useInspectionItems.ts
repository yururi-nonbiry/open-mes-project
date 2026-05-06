import { useState, useEffect, useCallback } from 'react';
import qualityService, { InspectionItem } from '../services/qualityService';

export const useInspectionItems = (typeFilter: string) => {
    const [items, setItems] = useState<InspectionItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchItems = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const allItems = await qualityService.getInspectionItems();
            const filtered = allItems.filter(item => 
                item.inspection_type === typeFilter && item.is_active
            );
            setItems(filtered);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [typeFilter]);

    useEffect(() => {
        fetchItems();
    }, [fetchItems]);

    return { items, loading, error, refresh: fetchItems };
};
