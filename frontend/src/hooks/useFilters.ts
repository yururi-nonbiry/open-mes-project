import { useState, useCallback } from 'react';

export const useFilters = <T extends Record<string, any>>(initialFilters: T, initialSorting: { field: string, direction: 'asc' | 'desc' }) => {
    const [filters, setFilters] = useState<T>(initialFilters);
    const [sorting, setSorting] = useState(initialSorting);

    const handleFilterChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
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
