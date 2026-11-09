import React from 'react';
import { WarehouseLocation, WarehouseLocationMapEntry } from '../../services/warehouseLocationService';

type GridLocation = WarehouseLocation | WarehouseLocationMapEntry;

interface WarehouseLayoutGridProps {
    cols: number;
    rows: number;
    locations: GridLocation[];
    mode: 'edit' | 'view';
    cellSize?: number;
    onCellClick?: (x: number, y: number) => void;
    onLocationClick?: (location: GridLocation) => void;
}

const findLocationAt = (locations: GridLocation[], x: number, y: number) =>
    locations.find(
        (loc) => x >= loc.pos_x && x < loc.pos_x + loc.width && y >= loc.pos_y && y < loc.pos_y + loc.height
    );

const WarehouseLayoutGrid: React.FC<WarehouseLayoutGridProps> = ({
    cols,
    rows,
    locations,
    mode,
    cellSize = 32,
    onCellClick,
    onLocationClick,
}) => {
    const width = cols * cellSize;
    const height = rows * cellSize;

    const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
        if (mode !== 'edit') return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = Math.floor((e.clientX - rect.left) / cellSize);
        const y = Math.floor((e.clientY - rect.top) / cellSize);
        if (x < 0 || y < 0 || x >= cols || y >= rows) return;

        const hit = findLocationAt(locations, x, y);
        if (hit) {
            onLocationClick?.(hit);
        } else {
            onCellClick?.(x, y);
        }
    };

    const locationFill = (loc: GridLocation) => {
        const mapEntry = loc as WarehouseLocationMapEntry;
        if (mode === 'view') {
            return mapEntry.highlighted ? '#fde68a' : '#f1f5f9';
        }
        return '#bae6fd';
    };

    const locationStroke = (loc: GridLocation) => {
        const mapEntry = loc as WarehouseLocationMapEntry;
        if (mode === 'view') {
            return mapEntry.highlighted ? '#d97706' : '#94a3b8';
        }
        return '#0284c7';
    };

    return (
        <svg
            width={width}
            height={height}
            style={{ border: '1.5px solid #93c5fd', borderRadius: '6px', cursor: mode === 'edit' ? 'pointer' : 'default', background: '#ffffff' }}
            onClick={handleSvgClick}
        >
            {Array.from({ length: cols + 1 }).map((_, i) => (
                <line key={`v-${i}`} x1={i * cellSize} y1={0} x2={i * cellSize} y2={height} stroke="#e2e8f0" strokeWidth={1} />
            ))}
            {Array.from({ length: rows + 1 }).map((_, i) => (
                <line key={`h-${i}`} x1={0} y1={i * cellSize} x2={width} y2={i * cellSize} stroke="#e2e8f0" strokeWidth={1} />
            ))}

            {locations.map((loc) => {
                const mapEntry = loc as WarehouseLocationMapEntry;
                return (
                    <g key={loc.code} onClick={(e) => { e.stopPropagation(); onLocationClick?.(loc); }}>
                        <rect
                            x={loc.pos_x * cellSize + 1}
                            y={loc.pos_y * cellSize + 1}
                            width={loc.width * cellSize - 2}
                            height={loc.height * cellSize - 2}
                            rx={3}
                            fill={locationFill(loc)}
                            stroke={locationStroke(loc)}
                            strokeWidth={1.5}
                            style={{ cursor: 'pointer' }}
                        />
                        <text
                            x={loc.pos_x * cellSize + (loc.width * cellSize) / 2}
                            y={loc.pos_y * cellSize + (loc.height * cellSize) / 2}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fontSize={11}
                            fontWeight={700}
                            fill="#0f172a"
                            pointerEvents="none"
                        >
                            {loc.code}
                            {mode === 'view' && mapEntry.quantity ? ` (${mapEntry.quantity})` : ''}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
};

export default WarehouseLayoutGrid;
