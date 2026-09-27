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
