def fk_id_alias(fk_name):
    """
    ForeignKey の生の値(<fk_name>_id)を別名で読み書きするプロパティを返す。

    例: part_number = fk_id_alias("part_number_rel") により、instance.part_number で
    part_number_rel_id(品番コード)を参照・設定できる。Django は property をモデルの
    コンストラクタ引数として受け付けるため、Model(part_number="X") のようにも使える。
    ただし実フィールドではないため、QuerySet の filter()/values() では使えない
    (part_number_rel_id 等の実フィールド名を使うこと)。
    """
    attname = f"{fk_name}_id"

    def getter(self):
        return getattr(self, attname)

    def setter(self, value):
        setattr(self, attname, value)

    return property(getter, setter, doc=f"{attname} の別名")


# CSVインポートで取り込める外部キー項目(CSVでは品番・倉庫などの外部キーは対象外だが、用途コードだけは
# 発注・受注・生産計画の登録に使えるよう許可する)。{データ種別: {CSV項目名(別名): モデルの外部キーフィールド名}}
CSV_IMPORT_FK_ALIASES = {
    "purchase_order": {"purpose": "purpose_rel"},
    "sales_order": {"purpose": "purpose_rel", "line": "line_rel"},
    "production_plan": {"purpose": "purpose_rel", "line": "line_rel"},
}


def fk_alias_name(model, field):
    """
    fk_id_alias で別名を付けた ForeignKey (<別名>_rel) の別名を返す。該当しなければ None。

    APIのシリアライザは別名(例: supplier)で値を返すため、画面の表示設定など
    APIの項目名と対応付ける場面ではフィールド名(supplier_rel)ではなく別名を使う。
    """
    if not (field.many_to_one and field.name.endswith("_rel")):
        return None
    alias = field.name[: -len("_rel")]
    return alias if isinstance(getattr(model, alias, None), property) else None
