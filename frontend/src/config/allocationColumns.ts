/**
 * 生産計画の「部品引き当て」画面の列定義。
 * この画面はモデルの一覧ではないため、列はここで定義し、表示/非表示・並び順・表示名だけを
 * モデル項目表示設定(data_type = production_allocation)で変更できるようにする。
 */
export const ALLOCATION_DATA_TYPE = 'production_allocation';

export interface AllocationColumn {
    name: string;
    label: string;
    help: string;
    /** 引当の操作に必須の列。設定で非表示にしても常に表示する */
    alwaysVisible?: boolean;
    align?: 'end';
}

export const ALLOCATION_COLUMNS: AllocationColumn[] = [
    { name: 'part_code', label: '部品コード', help: '所要部品の品番です。' },
    { name: 'part_name', label: '部品名', help: '在庫不足のときは不足数のバッジも表示されます。' },
    { name: 'required_quantity', label: '所要数', help: '計画全体で必要な数量です。', align: 'end' },
    { name: 'already_allocated_quantity', label: '引当済', help: 'すでに引き当てた数量です。', align: 'end' },
    { name: 'additional_issued_quantity', label: '追加ピッキング済', help: '追加で出庫した数量です。', align: 'end' },
    { name: 'warehouse', label: '引当倉庫（引当可能数）', help: '引当操作に必要なため、常に表示されます。', alwaysVisible: true },
    { name: 'line', label: '出庫先ライン', help: '非表示にした場合は、生産計画のラインで引き当てます。' },
    { name: 'quantity_to_allocate', label: '引当数量', help: '引当操作に必要なため、常に表示されます。', alwaysVisible: true, align: 'end' },
    { name: 'stock_after', label: '引当後の在庫', help: '選んだ倉庫の、引当後の引当可能数です。', align: 'end' },
    { name: 'shortage_after', label: '引当後の不足', help: '引当後も足りない数量です。', align: 'end' },
    { name: 'unit', label: '単位', help: '部品の単位です。' },
];
