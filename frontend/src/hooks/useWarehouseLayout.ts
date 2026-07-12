import { useState, useEffect, useCallback } from 'react';
import warehouseLocationService, { Warehouse, WarehouseLocation } from '../services/warehouseLocationService';

export const useWarehouseLayout = () => {
    const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
    const [selectedWarehouseNumber, setSelectedWarehouseNumber] = useState<string>('');
    const [locations, setLocations] = useState<WarehouseLocation[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchWarehouses = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await warehouseLocationService.getWarehouses();
            setWarehouses(data);
            if (data.length > 0 && !selectedWarehouseNumber) {
                setSelectedWarehouseNumber(data[0].warehouse_number);
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchLocations = useCallback(async (warehouseNumber: string) => {
        if (!warehouseNumber) {
            setLocations([]);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const data = await warehouseLocationService.getLocations(warehouseNumber);
            setLocations(data);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchWarehouses();
    }, [fetchWarehouses]);

    useEffect(() => {
        fetchLocations(selectedWarehouseNumber);
    }, [selectedWarehouseNumber, fetchLocations]);

    const selectedWarehouse = warehouses.find((w) => w.warehouse_number === selectedWarehouseNumber) || null;

    const saveLayoutSize = async (cols: number, rows: number) => {
        if (!selectedWarehouse) return;
        await warehouseLocationService.saveWarehouseLayout({ ...selectedWarehouse, layout_cols: cols, layout_rows: rows });
        await fetchWarehouses();
    };

    const saveLocation = async (location: WarehouseLocation) => {
        await warehouseLocationService.saveLocation(location);
        await fetchLocations(selectedWarehouseNumber);
    };

    const deleteLocation = async (id: string) => {
        await warehouseLocationService.deleteLocation(id);
        await fetchLocations(selectedWarehouseNumber);
    };

    return {
        warehouses,
        selectedWarehouseNumber,
        setSelectedWarehouseNumber,
        selectedWarehouse,
        locations,
        loading,
        error,
        saveLayoutSize,
        saveLocation,
        deleteLocation,
    };
};
