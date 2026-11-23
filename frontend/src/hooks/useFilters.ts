import { useState, useCallback } from 'react';

export const useFilters = <T extends object>(initialFilters: T, initialSorting: { field: string, direction: 'asc' | 'desc' }) => {
    const [filters, setFilters] = useState<T>(initialFilters);
    const [sorting, setSorting] = useState(initialSorting);

    const handleFilterChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const target = e.target as HTMLInputElement;
        // チェックボックスは value ではなく checked(真偽値)を保持する
        const next = target.type === 'checkbox' ? target.checked : target.value;
        setFilters(prev => ({ ...prev, [target.name]: next }));
    }, []);

    const handleSort = useCallback((field: string) => {
        setSorting(prev => {
            const direction = (prev.field === field && prev.direction === 'asc') ? 'desc' : 'asc';
            return { field, direction };
        });
    }, []);

    const resetFilters = useCallback(() => {
        setFilters(initialFilters);
        setSorting(initialSorting);
    }, [initialFilters, initialSorting]);

    return {
        filters,
        setFilters,
        sorting,
        handleFilterChange,
        handleSort,
        resetFilters
    };
};
