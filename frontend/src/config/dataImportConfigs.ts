import { NavIconName } from './navigationConfig';

export interface SelectOption {
    value: string;
    label: string;
}

export interface FormField {
    name: string;
    label: string;
    type?: string;
    placeholder?: string;
    helpText?: string;
    required?: boolean;
    colSpan?: 6 | 12;
    options?: SelectOption[];
}

export interface DataCardItem {
    id: string;
    title: string;
    description: string;
    icon: NavIconName;
    tag?: string;
}

export interface DataConfigItem {
    name: string;
    description: string;
    icon: NavIconName;
    tag: string;
    listUrl: string;
    createUrl: string;
    detailUrl: (id: string | number) => string;
    deleteUrl: (id: string | number) => string;
}

export const DATA_CONFIG: Record<string, DataConfigItem> = {
    'item': {
        name: '品番マスター',
        description: '製品・部品・材料の品番コードや区分、標準の入庫倉庫を設定します。',
        icon: 'inventory',
        tag: '品目・材料',
        listUrl: '/api/master/items/',
        createUrl: '/api/master/items/',
        detailUrl: (id) => `/api/master/items/${id}/`,
        deleteUrl: (id) => `/api/master/items/${id}/`
    },
    'supplier': {
        name: 'サプライヤーマスター',
        description: '材料・部品の仕入先（サプライヤー）の番号と連絡先を設定します。',
        icon: 'supplier',
        tag: '仕入先',
        listUrl: '/api/master/suppliers/',
        createUrl: '/api/master/suppliers/',
        detailUrl: (id) => `/api/master/suppliers/${id}/`,
        deleteUrl: (id) => `/api/master/suppliers/${id}/`
    },
    'warehouse': {
        name: '倉庫マスター',
        description: '入庫・出庫・在庫管理を行う倉庫の番号と名称を設定します。',
        icon: 'warehouse-map',
        tag: '保管場所',
        listUrl: '/api/master/warehouses/',
        createUrl: '/api/master/warehouses/',
        detailUrl: (id) => `/api/master/warehouses/${id}/`,
        deleteUrl: (id) => `/api/master/warehouses/${id}/`
    },
    'unit-cost': {
        name: '標準単価',
        description: '品目ごとの標準原価（単価）を設定します。',
        icon: 'cost',
        tag: '原価管理',
        listUrl: '/api/master/unit-costs/',
        createUrl: '/api/master/unit-costs/',
        detailUrl: (id) => `/api/master/unit-costs/${id}/`,
        deleteUrl: (id) => `/api/master/unit-costs/${id}/`
    },
    'production-plan': {
        name: '生産計画',
        description: '製造する製品の品番・計画数量・開始／終了予定日時を登録します。',
        icon: 'plan',
        tag: '製造スケジュール',
        listUrl: '/api/production/plans/',
        createUrl: '/api/production/plans/',
        detailUrl: (id) => `/api/production/plans/${id}/`,
        deleteUrl: (id) => `/api/production/plans/${id}/`
    },
    'customer': {
        name: '顧客マスター',
        description: '製品の出荷先・得意先となる顧客コードと名称を設定します。',
        icon: 'users',
        tag: '出荷先',
        listUrl: '/api/master/customers/',
        createUrl: '/api/master/customers/',
        detailUrl: (id) => `/api/master/customers/${id}/`,
        deleteUrl: (id) => `/api/master/customers/${id}/`
    },
    'work-center': {
        name: 'ワークセンターマスター',
        description: '製造ライン・作業工程・設備のコードと名称を設定します。',
        icon: 'production',
        tag: '作業場所',
        listUrl: '/api/master/work-centers/',
        createUrl: '/api/master/work-centers/',
        detailUrl: (id) => `/api/master/work-centers/${id}/`,
        deleteUrl: (id) => `/api/master/work-centers/${id}/`
    }
};

export const getDataTypeDisplayName = (typeOrName?: string): string => {
    if (!typeOrName) return 'データ';
    const normalized = typeOrName === 'production_plan' ? 'production-plan' : typeOrName;
    if (DATA_CONFIG[normalized]) {
        return DATA_CONFIG[normalized].name;
    }
    return typeOrName;
};

export const getFormFields = (type: string): FormField[] => {
    const normalized = type === 'production_plan' ? 'production-plan' : type;
    const allFields: Record<string, FormField[]> = {
        item: [
            {
                name: 'code',
                label: '品番コード',
                placeholder: '例：PROD-001 / MAT-001',
                helpText: '製品や材料を一意に識別するコード',
                required: true,
                colSpan: 6
            },
            {
                name: 'name',
                label: '品名（名称）',
                placeholder: '例：メイン基板ユニット',
                helpText: '画面や帳票に表示される名称',
                required: true,
                colSpan: 6
            },
            {
                name: 'item_type',
                label: '品目区分',
                type: 'select',
                required: true,
                colSpan: 6,
                helpText: '製品（完成品）・材料（部品）・中間品から選択',
                options: [
                    { value: 'product', label: '製品（完成品）' },
                    { value: 'material', label: '材料・部品' },
                    { value: 'intermediate', label: '中間品（半製品）' }
                ]
            },
            {
                name: 'unit',
                label: '単位',
                placeholder: '例：個 / kg / 本 / 式',
                helpText: '数量を数える単位（初期値：kg）',
                colSpan: 6
            },
            {
                name: 'default_warehouse',
                label: '標準入庫倉庫',
                placeholder: '例：W001',
                helpText: '入庫時に初期選択される倉庫番号',
                colSpan: 6
            },
            {
                name: 'default_location',
                label: '標準入庫棚番',
                placeholder: '例：A-01-01',
                helpText: '入庫時に初期選択される棚番',
                colSpan: 6
            },
            {
                name: 'provision_type',
                label: '支給種別',
                type: 'select',
                colSpan: 6,
                helpText: '取引先からの支給形態を選択',
                options: [
                    { value: 'none', label: '支給なし（自社手配）' },
                    { value: 'paid', label: '有償支給' },
                    { value: 'free', label: '無償支給' }
                ]
            },
            {
                name: 'lead_time_days',
                label: '調達リードタイム（日）',
                type: 'number',
                placeholder: '例：7',
                helpText: '発注から入庫までの標準日数',
                colSpan: 6
            },
            {
                name: 'description',
                label: '備考・説明',
                placeholder: '仕様や補足事項があれば入力してください',
                colSpan: 12
            }
        ],
        supplier: [
            {
                name: 'supplier_number',
                label: 'サプライヤー番号（仕入先コード）',
                placeholder: '例：SUP-001',
                required: true,
                colSpan: 6
            },
            {
                name: 'name',
                label: 'サプライヤー名（仕入先名）',
                placeholder: '例：〇〇金属工業株式会社',
                required: true,
                colSpan: 6
            },
            {
                name: 'contact_person',
                label: '担当者名',
                placeholder: '例：山田 太郎',
                colSpan: 6
            },
            {
                name: 'phone',
                label: '電話番号',
                placeholder: '例：03-1234-5678',
                colSpan: 6
            },
            {
                name: 'email',
                label: 'メールアドレス',
                type: 'email',
                placeholder: '例：contact@example.com',
                colSpan: 6
            },
            {
                name: 'address',
                label: '住所',
                placeholder: '例：東京都〇〇区〇〇 1-2-3',
                colSpan: 6
            }
        ],
        warehouse: [
            {
                name: 'warehouse_number',
                label: '倉庫番号（倉庫コード）',
                placeholder: '例：W001',
                helpText: '入出庫や在庫照会で使用する倉庫コード',
                required: true,
                colSpan: 6
            },
            {
                name: 'name',
                label: '倉庫名',
                placeholder: '例：第1資材倉庫',
                helpText: '画面に表示される倉庫の名称',
                required: true,
                colSpan: 6
            },
            {
                name: 'location',
                label: '場所・所在地',
                placeholder: '例：本社工場 1F 東エリア',
                colSpan: 12
            }
        ],
        'unit-cost': [
            {
                name: 'item',
                label: '品番コード',
                placeholder: '例：MAT-001',
                helpText: '品番マスターに登録済みの品番コード',
                required: true,
                colSpan: 6
            },
            {
                name: 'cost',
                label: '標準単価（円）',
                type: 'number',
                placeholder: '例：1500',
                helpText: '1単位あたりの標準原価',
                required: true,
                colSpan: 6
            }
        ],
        'production-plan': [
            {
                name: 'plan_name',
                label: '計画名',
                placeholder: '例：2026年5月 第1ロット生産',
                helpText: '生産計画を識別するための名称',
                required: true,
                colSpan: 12
            },
            {
                name: 'product_code',
                label: '製品コード（品番）',
                placeholder: '例：PROD-001',
                helpText: '製造する「製品」または「中間品」の品番コード',
                required: true,
                colSpan: 6
            },
            {
                name: 'purpose',
                label: '使用する在庫の用途コード',
                placeholder: '例：PRD-A（空欄は汎用のみ）',
                helpText: 'この用途の在庫を先に使い、足りなければ汎用の在庫を使います。空欄の場合は汎用の在庫のみ使用します',
                colSpan: 6
            },
            {
                name: 'planned_quantity',
                label: '計画数量',
                type: 'number',
                placeholder: '例：100',
                helpText: '製造する予定数量',
                required: true,
                colSpan: 6
            },
            {
                name: 'planned_start_datetime',
                label: '開始予定日時',
                type: 'datetime-local',
                helpText: '製造を開始する予定の日時',
                required: true,
                colSpan: 6
            },
            {
                name: 'planned_end_datetime',
                label: '終了予定日時',
                type: 'datetime-local',
                helpText: '製造を完了する予定の日時',
                required: true,
                colSpan: 6
            }
        ],
        customer: [
            {
                name: 'code',
                label: '顧客コード',
                placeholder: '例：CUST-001',
                required: true,
                colSpan: 6
            },
            {
                name: 'name',
                label: '顧客名（出荷先名）',
                placeholder: '例：株式会社〇〇製作所',
                required: true,
                colSpan: 6
            }
        ],
        'work-center': [
            {
                name: 'code',
                label: 'ワークセンターコード',
                placeholder: '例：WC-01',
                required: true,
                colSpan: 6
            },
            {
                name: 'name',
                label: 'ワークセンター名（作業場所・ライン名）',
                placeholder: '例：第1組立ライン',
                required: true,
                colSpan: 6
            }
        ]
    };
    return allFields[normalized] || [];
};

export const getTableConfig = (type: string): FormField[] => {
    return getFormFields(type);
};

export const MASTER_CARDS: DataCardItem[] = [
    { id: 'item', title: '品番マスター', description: '製品・部品・材料の品目コードや標準倉庫を管理します。', icon: 'inventory', tag: '品目・材料' },
    { id: 'warehouse', title: '倉庫マスター', description: '入出庫・保管を行う倉庫コードと名称を管理します。', icon: 'warehouse-map', tag: '保管場所' },
    { id: 'supplier', title: 'サプライヤー', description: '材料・支給品の仕入先情報を管理します。', icon: 'supplier', tag: '仕入先' },
    { id: 'customer', title: '顧客マスター', description: '製品の出荷先・得意先情報を管理します。', icon: 'users', tag: '出荷先' },
    { id: 'work-center', title: 'ワークセンター', description: '製造ライン・作業場所・設備の情報を管理します。', icon: 'production', tag: '作業場所' },
];

export const BUSINESS_CARDS: DataCardItem[] = [
    { id: 'production-plan', title: '生産計画', description: '製品の製造スケジュール（計画名・数量・予定日時）を登録・管理します。', icon: 'plan', tag: '製造スケジュール' },
    { id: 'unit-cost', title: '標準単価', description: '品目ごとの標準原価を登録・管理します。', icon: 'cost', tag: '原価管理' },
];

// value はバックエンドの DATA_TYPE_MODEL_MAPPING (backend/src/base/models.py) のキーと
// 一致させる必要がある（アンダースコア区切り）。DATA_CONFIG等のフロント内部キー（ハイフン区切り）とは別物。
export const CSV_DATA_TYPES = [
    { value: 'item', label: '品番マスター' },
    { value: 'supplier', label: '共通サプライヤー' },
    { value: 'warehouse', label: '倉庫マスター' },
    { value: 'customer', label: '顧客マスター' },
    { value: 'work_center', label: 'ワークセンターマスター' },
    { value: 'unit_cost', label: '標準単価' },
    { value: 'production_plan', label: '生産計画' },
];
