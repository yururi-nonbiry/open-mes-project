import React from 'react';

interface PaginationProps {
    next: string | null;
    previous: string | null;
    pageInfo: string;
    onPageChange: (url: string | null) => void;
}

const Pagination: React.FC<PaginationProps> = ({ next, previous, pageInfo, onPageChange }) => {
    return (
        <div className="pagination-controls text-center mt-4 mb-5">
            <button 
                className="btn btn-outline-primary mx-1" 
                onClick={() => onPageChange(previous)} 
                disabled={!previous}
            >
                <i className="bi bi-chevron-left"></i> 前へ
            </button>
            
            <span className="mx-3 align-middle text-muted">
                {pageInfo}
            </span>
            
            <button 
                className="btn btn-outline-primary mx-1" 
                onClick={() => onPageChange(next)} 
                disabled={!next}
            >
                次へ <i className="bi bi-chevron-right"></i>
            </button>
        </div>
    );
};

export default Pagination;
