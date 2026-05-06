import { useState, useCallback } from 'react';
import importService from '../services/importService';
import { DATA_CONFIG, getTableConfig } from '../config/dataImportConfigs';

export interface ModalConfig {
    type: string;
    name: string;
    recordId?: string | number | null;
}

export interface ListData {
    headers: string[];
    rows: Record<string, any>[];
    rowKeys: string[];
    idKey: string;
}

export const useDataManagement = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [modalConfig, setModalConfig] = useState<ModalConfig>({ type: '', name: '', recordId: null });
    const [listData, setListData] = useState<ListData>({ headers: [], rows: [], rowKeys: [], idKey: 'id' });
    const [formData, setFormData] = useState<Record<string, any>>({});

    const fetchListData = useCallback(async (type: string) => {
        if (!type || !DATA_CONFIG[type]) return;
        setIsLoading(true);
        setError(null);
        try {
            const result = await importService.getList(DATA_CONFIG[type].listUrl);
            const rows = result.results || result.data || [];
            const config = getTableConfig(type);
            setListData({
                headers: [...config.map(c => c.label), '操作'],
                rowKeys: config.map(c => c.name),
                rows,
                idKey: 'id'
            });
        } catch (e: any) {
            setError(e.message);
            setListData(prev => ({ ...prev, rows: [] }));
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
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const saveRecord = async () => {
        const { type, recordId } = modalConfig;
        const config = DATA_CONFIG[type];
        setIsLoading(true);
        setError(null);
        try {
            const url = recordId ? config.detailUrl(recordId) : config.createUrl;
            const method = recordId ? 'PUT' : 'POST';
            await importService.saveRecord(url, method, formData);
            return true;
        } catch (e: any) {
            setError(e.message);
            return false;
        } finally {
            setIsLoading(false);
        }
    };

    const deleteRecord = async (type: string, id: string | number) => {
        const config = DATA_CONFIG[type];
        setIsLoading(true);
        try {
            await importService.deleteRecord(config.deleteUrl(id));
            await fetchListData(type);
            return true;
        } catch (e: any) {
            alert(`削除に失敗しました: ${e.message}`);
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
