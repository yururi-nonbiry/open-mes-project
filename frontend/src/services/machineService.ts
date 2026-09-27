import { apiRequest } from '../utils/api';

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
        const data = await apiRequest('/api/machine/machines/', {}, 'Failed to fetch machines');
        return data.data as Machine[];
    },

    saveMachine: (machine: Machine) => {
        const url = machine.id ? `/api/machine/machines/${machine.id}/` : '/api/machine/machines/';
        const method = machine.id ? 'PUT' : 'POST';
        return apiRequest(url, { method, body: JSON.stringify(machine) }, 'Failed to save machine');
    },

    deleteMachine: (id: string) =>
        apiRequest(`/api/machine/machines/${id}/`, { method: 'DELETE' }, 'Failed to delete machine'),
};

export default machineService;
