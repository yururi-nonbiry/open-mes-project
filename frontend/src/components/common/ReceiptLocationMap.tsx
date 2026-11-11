import React, { useEffect, useState } from 'react';
import warehouseLocationService, {
    Warehouse,
    WarehouseLocation,
} from '../../services/warehouseLocationService';
import WarehouseLayoutGrid from '../../pages/master/WarehouseLayoutGrid';

interface ReceiptLocationMapProps {
    /** 入庫先の倉庫番号(入力中の値) */
    warehouse: string;
    /** 入庫先の棚番(入力中の値)。一致するロケーションをハイライトする */
    location: string;
    cellSize?: number;
}

/**
 * 入庫画面用の倉庫レイアウト表示。入力中(またはデフォルト)の倉庫・棚番を地図上でハイライトする。
 */
const ReceiptLocationMap: React.FC<ReceiptLocationMapProps> = ({ warehouse, location, cellSize = 32 }) => {
    const [warehouseInfo, setWarehouseInfo] = useState<Warehouse | null>(null);
    const [locations, setLocations] = useState<WarehouseLocation[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const warehouseKey = warehouse.trim();
    const locationKey = location.trim();

    // 入力が落ち着いてから倉庫レイアウトを取得する
    useEffect(() => {
        setWarehouseInfo(null);
        setLocations([]);
        setError(null);
        if (!warehouseKey) return;

        let cancelled = false;
        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                const warehouses = await warehouseLocationService.getWarehouses();
                const found = warehouses.find(w => w.warehouse_number === warehouseKey) || null;
                if (cancelled) return;
                setWarehouseInfo(found);
                if (found) {
                    const locs = await warehouseLocationService.getLocations(found.warehouse_number);
                    if (!cancelled) setLocations(locs);
                }
            } catch (e) {
                if (!cancelled) setError((e as Error).message || 'レイアウトの取得に失敗しました。');
            } finally {
                if (!cancelled) setLoading(false);
            }
        }, 400);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [warehouseKey]);

    if (!warehouseKey) {
        return <div className="small text-muted">倉庫番号を入力すると、倉庫のレイアウトが表示されます。</div>;
    }
    if (loading) {
        return <div className="small text-muted">レイアウトを読み込み中...</div>;
    }
    if (error) {
        return <div className="small text-danger">{error}</div>;
    }
    if (!warehouseInfo) {
        return <div className="small text-muted">倉庫「{warehouseKey}」が見つかりません。</div>;
    }
    if (locations.length === 0) {
        return <div className="small text-muted">この倉庫にはロケーションが登録されていません。</div>;
    }

    const entries = locations.map(loc => ({
        code: loc.code,
        name: loc.name || '',
        pos_x: loc.pos_x,
        pos_y: loc.pos_y,
        width: loc.width,
        height: loc.height,
        quantity: 0,
        highlighted: !!locationKey && loc.code === locationKey,
    }));
    const matched = entries.some(e => e.highlighted);

    return (
        <div>
            <div className="small mb-1">
                <strong>{warehouseInfo.warehouse_number} - {warehouseInfo.name}</strong>
                <span className="ms-2 text-muted">
                    <span style={{ display: 'inline-block', width: 12, height: 12, background: '#fde68a', border: '1px solid #d97706', marginRight: 4 }}></span>
                    入庫先
                </span>
            </div>
            <div style={{ overflowX: 'auto' }}>
                <WarehouseLayoutGrid
                    cols={warehouseInfo.layout_cols}
                    rows={warehouseInfo.layout_rows}
                    locations={entries}
                    mode="view"
                    cellSize={cellSize}
                />
            </div>
            {locationKey && !matched && (
                <div className="small text-warning mt-1">棚番「{locationKey}」はこの倉庫のレイアウトに登録されていません。</div>
            )}
            {!locationKey && <div className="small text-muted mt-1">棚番を入力すると該当の棚がハイライトされます。</div>}
        </div>
    );
};

export default ReceiptLocationMap;
