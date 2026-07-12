import React, { useState, useEffect } from 'react';
import Modal from '../../components/Modal';
import inventoryService from '../../services/inventoryService';
import { WarehouseLocationMap } from '../../services/warehouseLocationService';
import WarehouseLayoutGrid from '../master/WarehouseLayoutGrid';

interface WarehouseLocationMapModalProps {
    isOpen: boolean;
    onClose: () => void;
    orderId: string | number | null;
}

const WarehouseLocationMapModal: React.FC<WarehouseLocationMapModalProps> = ({ isOpen, onClose, orderId }) => {
    const [map, setMap] = useState<WarehouseLocationMap | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen || !orderId) {
            return;
        }
        setLoading(true);
        setError(null);
        inventoryService
            .getSalesOrderLocationMap(orderId)
            .then(setMap)
            .catch((e: any) => setError(e.message || 'ロケーションマップの取得に失敗しました。'))
            .finally(() => setLoading(false));
    }, [isOpen, orderId]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} maxWidth="900px">
            <div className="p-2">
                <h4 className="mb-3">出庫ロケーション地図</h4>
                {loading && <div className="text-center p-4"><div className="spinner-border text-primary" role="status"></div></div>}
                {error && <div className="alert alert-danger">{error}</div>}
                {!loading && !error && map && (
                    <>
                        <div className="mb-2 small">
                            <strong>倉庫:</strong> {map.warehouse.warehouse_number} - {map.warehouse.name}
                        </div>
                        <div className="mb-3 small text-muted">
                            <span style={{ display: 'inline-block', width: 12, height: 12, background: '#f0ad4e', marginRight: 4 }}></span>
                            在庫あり（数量を表示）
                            <span style={{ display: 'inline-block', width: 12, height: 12, background: '#e9ecef', marginLeft: 12, marginRight: 4 }}></span>
                            在庫なし
                        </div>
                        {map.locations.length === 0 ? (
                            <div className="text-muted">この倉庫にはロケーションが登録されていません。</div>
                        ) : (
                            <div className="table-responsive">
                                <WarehouseLayoutGrid
                                    cols={map.warehouse.cols}
                                    rows={map.warehouse.rows}
                                    locations={map.locations}
                                    mode="view"
                                />
                            </div>
                        )}
                    </>
                )}
                <div className="text-end mt-3">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>閉じる</button>
                </div>
            </div>
        </Modal>
    );
};

export default WarehouseLocationMapModal;
