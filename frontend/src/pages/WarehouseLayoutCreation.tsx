import React, { useState, useEffect } from 'react';
import { useWarehouseLayout } from '../hooks/useWarehouseLayout';
import { WarehouseLocation } from '../services/warehouseLocationService';
import WarehouseLayoutGrid from './master/WarehouseLayoutGrid';
import WarehouseLocationEditModal from './master/WarehouseLocationEditModal';

const WarehouseLayoutCreation: React.FC = () => {
    const {
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
    } = useWarehouseLayout();

    const [cols, setCols] = useState(20);
    const [rows, setRows] = useState(20);
    const [sizeSaving, setSizeSaving] = useState(false);
    const [editingLocation, setEditingLocation] = useState<WarehouseLocation | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    useEffect(() => {
        if (selectedWarehouse) {
            setCols(selectedWarehouse.layout_cols);
            setRows(selectedWarehouse.layout_rows);
        }
    }, [selectedWarehouse]);

    const handleSaveSize = async () => {
        setSizeSaving(true);
        try {
            await saveLayoutSize(cols, rows);
        } finally {
            setSizeSaving(false);
        }
    };

    const handleCellClick = (x: number, y: number) => {
        setEditingLocation({
            warehouse: selectedWarehouseNumber,
            code: '',
            name: '',
            pos_x: x,
            pos_y: y,
            width: 1,
            height: 1,
        });
        setIsModalOpen(true);
    };

    const handleLocationClick = (location: WarehouseLocation) => {
        setEditingLocation(location);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingLocation(null);
    };

    return (
        <div className="goods-receipt-page">
            <div className="goods-receipt-filter-panel">
                <div className="receipt-search-inputs-row">
                    <div className="receipt-search-field">
                        <label className="receipt-search-label" htmlFor="warehouse-layout-select">対象倉庫</label>
                        <select
                            id="warehouse-layout-select"
                            className="form-select form-select-sm"
                            value={selectedWarehouseNumber}
                            onChange={(e) => setSelectedWarehouseNumber(e.target.value)}
                        >
                            {warehouses.map((w) => (
                                <option key={w.warehouse_number} value={w.warehouse_number}>
                                    {w.warehouse_number} - {w.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="receipt-search-field" style={{ maxWidth: '140px' }}>
                        <label className="receipt-search-label" htmlFor="warehouse-cols-input">横マス数（列数）</label>
                        <input
                            id="warehouse-cols-input"
                            type="number"
                            min={1}
                            className="form-control form-control-sm"
                            value={cols}
                            onChange={(e) => setCols(Number(e.target.value))}
                        />
                    </div>
                    <div className="receipt-search-field" style={{ maxWidth: '140px' }}>
                        <label className="receipt-search-label" htmlFor="warehouse-rows-input">縦マス数（行数）</label>
                        <input
                            id="warehouse-rows-input"
                            type="number"
                            min={1}
                            className="form-control form-control-sm"
                            value={rows}
                            onChange={(e) => setRows(Number(e.target.value))}
                        />
                    </div>
                    <div className="receipt-search-actions">
                        <button
                            type="button"
                            className="btn btn-primary btn-sm fw-bold px-3"
                            onClick={handleSaveSize}
                            disabled={sizeSaving || !selectedWarehouse}
                        >
                            {sizeSaving ? '保存中...' : 'マップサイズを保存'}
                        </button>
                    </div>
                    <span className="receipt-result-count ms-auto">
                        登録棚番：<strong>{locations.length}</strong> 箇所
                    </span>
                </div>
            </div>

            {loading && <div className="text-center p-4"><div className="spinner-border text-primary" role="status"></div></div>}
            {error && <div className="alert alert-danger">エラーが発生しました: {error}</div>}

            {!loading && !error && selectedWarehouse && (
                <div className="goods-receipt-table-card p-3">
                    <div className="small text-secondary fw-semibold mb-2">
                        ※ 空いているマスをクリックすると棚番（ロケーション）を新規登録できます。配置済みの棚番をクリックすると編集・削除できます。
                    </div>
                    <div className="table-responsive">
                        <WarehouseLayoutGrid
                            cols={selectedWarehouse.layout_cols}
                            rows={selectedWarehouse.layout_rows}
                            locations={locations}
                            mode="edit"
                            onCellClick={handleCellClick}
                            onLocationClick={(loc) => handleLocationClick(loc as WarehouseLocation)}
                        />
                    </div>
                </div>
            )}

            <WarehouseLocationEditModal
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                onSave={saveLocation}
                onDelete={deleteLocation}
                location={editingLocation}
            />
        </div>
    );
};

export default WarehouseLayoutCreation;
