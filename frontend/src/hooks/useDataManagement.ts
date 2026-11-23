import { useState, useCallback } from 'react';
import importService, { DataRecord } from '../services/importService';
import { DATA_CONFIG, getFormFields, getTableConfig } from '../config/dataImportConfigs';

export interface ModalConfig {
    type: string;
    name: string;
    recordId?: string | number | null;
}

export interface ListData {
    headers: string[];
    rows: DataRecord[];
    rowKeys: string[];
    idKey: string;
}

export const useDataManagement = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [modalConfig, setModalConfig] = useState<ModalConfig>({ type: '', name: '', recordId: null });
    const [listData, setListData] = useState<ListData>({ headers: [], rows: [], rowKeys: [], idKey: 'id' });
    const [formData, setFormData] = useState<DataRecord>({});

    const errorMessage = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

    const fetchListData = useCallback(async (type: string) => {
        if (!type || !DATA_CONFIG[type]) return;
        setIsLoading(true);
        setError(null);
        const config = getTableConfig(type);
        const headers = [...config.map(c => c.label), '操作'];
        const rowKeys = config.map(c => c.name);

        try {
            const result = await importService.getList(DATA_CONFIG[type].listUrl);
            const rows = result.results || result.data || [];
            setListData({ headers, rowKeys, rows: Array.isArray(rows) ? rows : [], idKey: 'id' });
        } catch (e) {
            // 取得に失敗したときはサンプルデータなどを出さず、空の一覧とエラーを表示する
            setListData({ headers, rowKeys, rows: [], idKey: 'id' });
            setError(errorMessage(e, '一覧の取得に失敗しました。'));
        } finally {
            setIsLoading(false);
        }
    }, []);

    const fetchRecordDetail = useCallback(async (type: string, recordId: string | number) => {
        const config = DATA_CONFIG[type];
        setIsLoading(true);
        setError(null);
        try {
            const result = await importService.getDetail(config.detailUrl(recordId));
            setFormData(result.data || result);
        } catch (e) {
            setError(errorMessage(e, 'データの取得に失敗しました。'));
        } finally {
            setIsLoading(false);
        }
    }, []);

    /** 保存に成功したら true。失敗したときはエラーを表示して false を返す(保存できたように見せない)。 */
    const saveRecord = async () => {
        const { type, recordId } = modalConfig;
        const config = DATA_CONFIG[type];
        setIsLoading(true);
        setError(null);

        try {
            const url = recordId ? config.detailUrl(recordId) : config.createUrl;
            const method = recordId ? 'PUT' : 'POST';
            // 任意項目の空欄は、空文字ではなく null で送る(数値・日時・選択項目は空文字だとバックエンドが400にするため)
            const payload: DataRecord = { ...formData };
            for (const field of getFormFields(type)) {
                const isTyped = field.type === 'number' || field.type === 'select' || field.type?.startsWith('date');
                if (!field.required && isTyped && payload[field.name] === '') payload[field.name] = null;
            }
            await importService.saveRecord(url, method, payload);
            return true;
        } catch (e) {
            setError(errorMessage(e, '保存に失敗しました。'));
            return false;
        } finally {
            setIsLoading(false);
        }
    };

    const deleteRecord = async (type: string, id: string | number) => {
        const config = DATA_CONFIG[type];
        setIsLoading(true);
        setError(null);
        try {
            await importService.deleteRecord(config.deleteUrl(id));
            await fetchListData(type);
            return true;
        } catch (e) {
            setError(errorMessage(e, '削除に失敗しました。'));
            return false;
        } finally {
            setIsLoading(false);
        }
    };

    return {
        isLoading,
        error,
        modalConfig,
        setModalConfig,
        listData,
        formData,
        setFormData,
        fetchListData,
        fetchRecordDetail,
        saveRecord,
        deleteRecord
    };
};
