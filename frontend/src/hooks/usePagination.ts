import { useState, useCallback } from 'react';

export interface PaginationState {
    count: number;
    next: string | null;
    previous: string | null;
}

export const usePagination = (pageSize: number = 10) => {
    const [pagination, setPagination] = useState<PaginationState>({ count: 0, next: null, previous: null });
    const [pageInfo, setPageInfo] = useState('');

    const updatePagination = useCallback((data: { count: number, next: string | null, previous: string | null }, currentUrl: string) => {
        setPagination({ count: data.count, next: data.next, previous: data.previous });
        
        if (data.count > 0) {
            let currentPage = 1;
            try {
                const url = new URL(currentUrl, window.location.origin);
                const pageParam = url.searchParams.get('page');
                if (pageParam) {
                    currentPage = parseInt(pageParam, 10);
                } else if (data.next) {
                    const nextPageUrl = new URL(data.next);
                    const nextP = nextPageUrl.searchParams.get('page');
                    currentPage = nextP ? parseInt(nextP) - 1 : 1;
                } else if (data.previous) {
                    const prevPageUrl = new URL(data.previous);
                    const prevP = prevPageUrl.searchParams.get('page');
                    currentPage = prevP ? parseInt(prevP) + 1 : 2; // Assuming if prev exists and no next, we are on page 2+
                }
            } catch (e) {
                // Fallback if URL parsing fails
            }
            const totalPages = Math.ceil(data.count / pageSize);
            setPageInfo(`ページ ${currentPage} / ${totalPages} (全 ${data.count} 件)`);
        } else {
            setPageInfo('');
        }
    }, [pageSize]);

    return {
        pagination,
        pageInfo,
        updatePagination,
        setPageInfo
    };
};
