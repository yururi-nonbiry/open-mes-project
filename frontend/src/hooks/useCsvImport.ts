import { useState, useRef, useCallback, useEffect } from 'react';
import importService from '../services/importService';

export interface CsvResult {
    message: string;
    isError: boolean;
    errors: string[];
}

// 進捗の確認がこの回数続けて失敗したら、確認を中断してエラーを表示する
const MAX_POLLING_FAILURES = 3;

export const useCsvImport = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [taskId, setTaskId] = useState<string | null>(null);
    const [taskStatus, setTaskStatus] = useState<string | null>(null);
    const [progress, setProgress] = useState(0);
    const [csvResult, setCsvResult] = useState<CsvResult>({ message: '', isError: false, errors: [] });
    const [showResultModal, setShowResultModal] = useState(false);
    
    const pollingInterval = useRef<NodeJS.Timeout | null>(null);
    // 進捗の確認が続けて失敗した回数。一時的な通信エラーでは止めず、続いた場合だけエラーを表示する
    const pollingFailures = useRef(0);

    const stopPolling = useCallback(() => {
        if (pollingInterval.current) {
            clearInterval(pollingInterval.current);
            pollingInterval.current = null;
        }
        setTaskId(null);
    }, []);

    const startPolling = useCallback((currentTaskId: string) => {
        pollingFailures.current = 0;
        pollingInterval.current = setInterval(async () => {
            try {
                const result = await importService.getTaskStatus(currentTaskId);
                pollingFailures.current = 0;
                setTaskStatus(result.status_display ?? result.status);
                // 進捗は処理済みの行数で返るため、全行数に対する割合(%)にする
                setProgress(result.total > 0 ? Math.min(100, Math.round((result.progress || 0) / result.total * 100)) : 0);

                if (result.status === 'SUCCESS') {
                    stopPolling();
                    const done = result.result as { created?: number; updated?: number } | null;
                    setCsvResult({
                        message: done && typeof done.created === 'number'
                            ? `インポートが完了しました(登録 ${done.created} 件、更新 ${done.updated ?? 0} 件)`
                            : 'インポートが完了しました',
                        isError: false,
                        errors: [],
                    });
                    setShowResultModal(true);
                    setIsLoading(false);
                } else if (result.status === 'REVOKED') {
                    stopPolling();
                    setIsLoading(false);
                } else if (result.status === 'FAILURE') {
                    stopPolling();
                    // バックエンドは result に {errors: [行ごとのエラー]} または {error: 'メッセージ'} を入れて返す
                    const detail = result.result as { errors?: string[]; error?: string } | string | null;
                    const errors = typeof detail === 'string' ? [detail]
                        : detail?.errors?.length ? detail.errors
                            : detail?.error ? [detail.error] : [];
                    setCsvResult({ message: 'インポート中にエラーが発生しました', isError: true, errors: errors.length > 0 ? errors : ['不明なエラー'] });
                    setShowResultModal(true);
                    setIsLoading(false);
                }
            } catch (e) {
                pollingFailures.current += 1;
                if (pollingFailures.current < MAX_POLLING_FAILURES) return;
                stopPolling();
                setIsLoading(false);
                setCsvResult({
                    message: 'インポートの進捗を確認できませんでした',
                    isError: true,
                    errors: [
                        `通信エラーが続いたため、進捗の確認を中断しました。取込はサーバーで続いている場合があります。(${(e as Error).message})`,
                    ],
                });
                setShowResultModal(true);
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
        } catch (e) {
            setCsvResult({ message: '通信エラーが発生しました', isError: true, errors: [(e as Error).message] });
            setShowResultModal(true);
            setIsLoading(false);
        }
    };

    const cancelUpload = async () => {
        const currentTaskId = taskId;
        stopPolling();
        setIsLoading(false);
        // 画面側のポーリングを止めるだけでなく、バックエンドの取り込みも中止する
        if (currentTaskId) {
            try {
                await importService.cancelImport(currentTaskId);
            } catch { /* すでに完了している場合など。画面は取り込み前の状態に戻す */ }
        }
    };

    // コンポーネントのアンマウント時にポーリングを止める（画面遷移後もAPIを叩き続けるのを防ぐ）
    useEffect(() => {
        return () => stopPolling();
    }, [stopPolling]);

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
