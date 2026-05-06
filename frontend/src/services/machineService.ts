import authFetch from '../utils/api';

export interface Machine {
    id?: string;
    machine_number: string;
    name: string;
    location?: string;
    description?: string;
    created_at?: string;
}

const machineService = {
    getMachines: async () => {
        const response = await authFetch('/api/machine/machines/');
        if (!response.ok) throw new Error('Failed to fetch machines');
        const data = await response.json();
        return data.data as Machine[];
    },

    saveMachine: async (machine: Machine) => {
        const url = machine.id ? `/api/machine/machines/${machine.id}/` : '/api/machine/machines/';
        const method = machine.id ? 'PUT' : 'POST';
        const response = await authFetch(url, {
            method,
            body: JSON.stringify(machine),
        });
        const data = await response.json();
        if (!response.ok || data.status !== 'success') {
            throw { message: data.message || 'Failed to save machine', data: data.data || data };
        }
        return data;
    },

    deleteMachine: async (id: string) => {
        const response = await authFetch(`/api/machine/machines/${id}/`, {
            method: 'DELETE',
        });
        const data = await response.json();
        if (!response.ok || data.status !== 'success') {
            throw new Error(data.message || 'Failed to delete machine');
        }
        return data;
    }
};

export default machineService;
