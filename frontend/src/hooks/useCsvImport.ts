import { useState, useRef, useCallback } from 'react';
import importService from '../services/importService';

export interface CsvResult {
    message: string;
    isError: boolean;
    errors: string[];
}

export const useCsvImport = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [taskId, setTaskId] = useState<string | null>(null);
    const [taskStatus, setTaskStatus] = useState<string | null>(null);
    const [progress, setProgress] = useState(0);
    const [csvResult, setCsvResult] = useState<CsvResult>({ message: '', isError: false, errors: [] });
    const [showResultModal, setShowResultModal] = useState(false);
    
    const pollingInterval = useRef<NodeJS.Timeout | null>(null);

    const stopPolling = useCallback(() => {
        if (pollingInterval.current) {
            clearInterval(pollingInterval.current);
            pollingInterval.current = null;
        }
        setTaskId(null);
    }, []);

    const startPolling = useCallback((currentTaskId: string) => {
        pollingInterval.current = setInterval(async () => {
            try {
                const result = await importService.getTaskStatus(currentTaskId);
                setTaskStatus(result.status_display);
                setProgress(result.progress || 0);

                if (result.status === 'SUCCESS') {
                    stopPolling();
                    setCsvResult({ message: 'インポートが完了しました', isError: false, errors: [] });
                    setShowResultModal(true);
                    setIsLoading(false);
                } else if (result.status === 'FAILURE') {
                    stopPolling();
                    setCsvResult({ message: 'インポート中にエラーが発生しました', isError: true, errors: [result.error_message || '不明なエラー'] });
                    setShowResultModal(true);
                    setIsLoading(false);
                }
            } catch (e) {
                stopPolling();
                setIsLoading(false);
            }
        }, 2000);
    }, [stopPolling]);

    const uploadCsv = async (file: File, dataType: string) => {
        setIsLoading(true);
        try {
            const result = await importService.importCsv(file, dataType);
            if (result.task_id) {
                setTaskId(result.task_id);
                startPolling(result.task_id);
            } else {
                setCsvResult({ message: result.message || 'アップロードに失敗しました', isError: true, errors: result.errors || [] });
                setShowResultModal(true);
                setIsLoading(false);
            }
        } catch (e: any) {
            setCsvResult({ message: '通信エラーが発生しました', isError: true, errors: [e.message] });
            setShowResultModal(true);
            setIsLoading(false);
        }
    };

    const cancelUpload = () => {
        stopPolling();
        setIsLoading(false);
    };

    return {
        isLoading,
        taskId,
        taskStatus,
        progress,
        csvResult,
        showResultModal,
        setShowResultModal,
        uploadCsv,
        cancelUpload
    };
};
