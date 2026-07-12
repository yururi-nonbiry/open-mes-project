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
        <div className="container mt-4">
            <h2 className="mb-4">倉庫レイアウト管理</h2>

            <div className="row mb-3">
                <div className="col-md-4">
                    <label className="form-label fw-bold small">倉庫</label>
                    <select
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
                <div className="col-md-2">
                    <label className="form-label fw-bold small">列数</label>
                    <input type="number" min={1} className="form-control form-control-sm" value={cols} onChange={(e) => setCols(Number(e.target.value))} />
                </div>
                <div className="col-md-2">
                    <label className="form-label fw-bold small">行数</label>
                    <input type="number" min={1} className="form-control form-control-sm" value={rows} onChange={(e) => setRows(Number(e.target.value))} />
                </div>
                <div className="col-md-2 d-flex align-items-end">
                    <button className="btn btn-secondary btn-sm" onClick={handleSaveSize} disabled={sizeSaving || !selectedWarehouse}>
                        {sizeSaving ? '保存中...' : 'サイズを保存'}
                    </button>
                </div>
            </div>

            <p className="text-muted small">空いているマスをクリックするとロケーションを新規登録できます。既存のロケーションをクリックすると編集・削除できます。</p>

            {loading && <div className="text-center p-4"><div className="spinner-border text-primary" role="status"></div></div>}
            {error && <div className="alert alert-danger">エラーが発生しました: {error}</div>}

            {!loading && !error && selectedWarehouse && (
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
