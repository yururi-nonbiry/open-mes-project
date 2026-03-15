export interface FormField {
    name: string;
    label: string;
    type?: string;
}

export interface DataConfigItem {
    name: string;
    listUrl: string;
    createUrl: string;
    detailUrl: (id: string | number) => string;
    deleteUrl: (id: string | number) => string;
}

export const DATA_CONFIG: Record<string, DataConfigItem> = {
    'item': {
        name: '品番マスター',
        listUrl: '/api/master/items/',
        createUrl: '/api/master/items/',
        detailUrl: (id) => `/api/master/items/${id}/`,
        deleteUrl: (id) => `/api/master/items/${id}/`
    },
    'supplier': {
        name: 'サプライヤーマスター',
        listUrl: '/api/master/suppliers/',
        createUrl: '/api/master/suppliers/',
        detailUrl: (id) => `/api/master/suppliers/${id}/`,
        deleteUrl: (id) => `/api/master/suppliers/${id}/`
    },
    'warehouse': {
        name: '倉庫マスター',
        listUrl: '/api/master/warehouses/',
        createUrl: '/api/master/warehouses/',
        detailUrl: (id) => `/api/master/warehouses/${id}/`,
        deleteUrl: (id) => `/api/master/warehouses/${id}/`
    },
    'unit-cost': {
        name: '標準単価',
        listUrl: '/api/master/unit-costs/',
        createUrl: '/api/master/unit-costs/',
        detailUrl: (id) => `/api/master/unit-costs/${id}/`,
        deleteUrl: (id) => `/api/master/unit-costs/${id}/`
    },
    'production-plan': {
        name: '生産計画',
        listUrl: '/api/production/plans/',
        createUrl: '/api/production/plans/',
        detailUrl: (id) => `/api/production/plans/${id}/`,
        deleteUrl: (id) => `/api/production/plans/${id}/`
    },
    'customer': {
        name: '顧客マスター',
        listUrl: '/api/master/customers/',
        createUrl: '/api/master/customers/',
        detailUrl: (id) => `/api/master/customers/${id}/`,
        deleteUrl: (id) => `/api/master/customers/${id}/`
    },
    'work-center': {
        name: 'ワークセンターマスター',
        listUrl: '/api/master/work-centers/',
        createUrl: '/api/master/work-centers/',
        detailUrl: (id) => `/api/master/work-centers/${id}/`,
        deleteUrl: (id) => `/api/master/work-centers/${id}/`
    }
};

export const getFormFields = (type: string): FormField[] => {
    const allFields: Record<string, FormField[]> = {
        item: [
            { name: 'code', label: 'コード' },
            { name: 'name', label: '名称' },
            { name: 'material_type', label: '材料区分' },
            { name: 'uom', label: '単位' },
            { name: 'is_active', label: '有効', type: 'boolean' }
        ],
        supplier: [
            { name: 'code', label: 'コード' },
            { name: 'name', label: '名称' },
            { name: 'contact_person', label: '担当者' },
            { name: 'is_active', label: '有効', type: 'boolean' }
        ],
        warehouse: [
            { name: 'code', label: 'コード' },
            { name: 'name', label: '名称' },
            { name: 'is_active', label: '有効', type: 'boolean' }
        ],
        'unit-cost': [
            { name: 'item', label: '品目コード' },
            { name: 'cost', label: '標準単価' }
        ],
        'production-plan': [
            { name: 'order_number', label: '製造指令番号' },
            { name: 'product', label: '製品コード' },
            { name: 'planned_quantity', label: '計画数量' },
            { name: 'planned_start_datetime', label: '開始予定日時' }
        ],
        customer: [
            { name: 'code', label: 'コード' },
            { name: 'name', label: '名称' }
        ],
        'work-center': [
            { name: 'code', label: 'コード' },
            { name: 'name', label: '名称' }
        ]
    };
    return allFields[type] || [];
};

export const getTableConfig = (type: string): FormField[] => {
    return getFormFields(type);
};

export const MASTER_CARDS = [
    { id: 'item', title: '品番マスター', description: '製品や部品の情報を管理します。', icon: '📦' },
    { id: 'supplier', title: 'サプライヤー', description: '仕入先の情報を管理します。', icon: '🏢' },
    { id: 'warehouse', title: '倉庫マスター', description: '保管場所の情報を管理します。', icon: '🏠' },
    { id: 'customer', title: '顧客マスター', description: '得意先の情報を管理します。', icon: '👥' },
    { id: 'work-center', title: 'ワークセンター', description: '作業場所・設備の情報を管理します。', icon: '🏭' },
];

export const BUSINESS_CARDS = [
    { id: 'unit-cost', title: '標準単価', description: '品目ごとの標準原価を管理します。', icon: '💰' },
    { id: 'production-plan', title: '生産計画', description: '製造のスケジュールを管理します。', icon: '📅' },
];

export const CSV_DATA_TYPES = [
    { value: 'item', label: '品番マスター' },
    { value: 'supplier', label: '共通サプライヤー' },
    { value: 'warehouse', label: '倉庫マスター' },
    { value: 'customer', label: '顧客マスター' },
    { value: 'work-center', label: 'ワークセンターマスター' },
    { value: 'unit-cost', label: '標準単価' },
    { value: 'production-plan', label: '生産計画' },
];
