import { useState, useEffect, useCallback } from 'react';
import machineService, { Machine } from '../services/machineService';

export const useMachineMaster = () => {
    const [machines, setMachines] = useState<Machine[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchMachines = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await machineService.getMachines();
            setMachines(data);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchMachines();
    }, [fetchMachines]);

    const saveMachine = async (machine: Machine) => {
        try {
            await machineService.saveMachine(machine);
            await fetchMachines();
            return true;
        } catch (e: any) {
            throw e;
        }
    };

    const deleteMachine = async (id: string) => {
        try {
            await machineService.deleteMachine(id);
            await fetchMachines();
            return true;
        } catch (e: any) {
            alert(`削除に失敗しました: ${e.message}`);
            return false;
        }
    };

    return { machines, loading, error, saveMachine, deleteMachine, refresh: fetchMachines };
};
