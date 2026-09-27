import React, { useState, useEffect, useCallback } from 'react';
import Modal from '../../components/Modal';
import { describeError } from '../../utils/api';
import bomService, { BomExplosion, BomExplosionNode, MasterItem, isProducibleItem, itemTypeLabel } from '../../services/bomService';

interface BomExplodeModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** 開いたときに展開する親品目コード */
    initialProduct?: string;
}

/** 展開結果の木を、階層を字下げした行の並びにする */
const flatten = (nodes: BomExplosionNode[]): BomExplosionNode[] =>
    nodes.flatMap(node => [node, ...flatten(node.children)]);

const BomExplodeModal: React.FC<BomExplodeModalProps> = ({ isOpen, onClose, initialProduct }) => {
    const [productOptions, setProductOptions] = useState<MasterItem[]>([]);
    const [product, setProduct] = useState('');
    const [quantity, setQuantity] = useState('1');
    const [result, setResult] = useState<BomExplosion | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const explode = useCallback(async (code: string, qty: string) => {
        if (!code) return;
        setLoading(true);
        setError('');
        try {
            setResult(await bomService.explodeBom(code, qty || '1'));
        } catch (e) {
            setResult(null);
            setError(describeError(e));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        bomService.getItems()
            .then(list => setProductOptions(list.filter(isProducibleItem)))
            .catch(e => setError(describeError(e)));
        setProduct(initialProduct || '');
        setQuantity('1');
        setResult(null);
        setError('');
        if (initialProduct) explode(initialProduct, '1');
    }, [isOpen, initialProduct, explode]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        explode(product, quantity);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} maxWidth="900px">
            <div className="p-2">
                <h3>部品構成の展開（多階層）</h3>
                <p className="text-muted small mb-2">
                    中間品は自身の生産計画で作って在庫から引き当てます。生産計画の所要部品になるのは1階層目のみで、
                    この画面は構成の確認と、最下位の材料の総所要量の把握に使います。
                </p>
                <hr />
                <form className="d-flex flex-wrap gap-2 align-items-end mb-3" onSubmit={handleSubmit}>
                    <div>
                        <label htmlFor="explode_product" className="form-label">親品目</label>
                        <select id="explode_product" className="form-select" value={product} onChange={e => setProduct(e.target.value)}>
                            <option value="">-- 選択 --</option>
                            {productOptions.map(item => (
                                <option key={item.id} value={item.code}>[{item.code}] {item.name}（{itemTypeLabel(item.item_type)}）</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="explode_quantity" className="form-label">数量</label>
                        <input
                            id="explode_quantity" type="number" className="form-control" min="0.001" step="any"
                            value={quantity} onChange={e => setQuantity(e.target.value)} style={{ width: '120px' }}
                        />
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={!product || loading}>展開</button>
                </form>

                {error && <div className="alert alert-danger">{error}</div>}
                {loading && <p>展開中...</p>}

                {result && !loading && (
                    result.tree.length === 0 ? (
                        <p>この品目には使用部品構成が登録されていません。</p>
                    ) : (
                        <>
                            <h6>構成（{result.item_code} {result.item_name} × {result.quantity}）</h6>
                            <div className="table-responsive mb-3">
                                <table className="table table-sm table-bordered">
                                    <thead className="table-light">
                                        <tr>
                                            <th>階層</th><th>品目</th><th>区分</th>
                                            <th className="text-end">親1個あたり</th><th className="text-end">所要量</th><th>単位</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {flatten(result.tree).map((node, i) => (
                                            <tr key={`${node.item_code}-${i}`}>
                                                <td>{node.level}</td>
                                                <td style={{ paddingLeft: `${(node.level - 1) * 1.5 + 0.5}rem` }}>
                                                    [{node.item_code}] {node.item_name}
                                                </td>
                                                <td>{itemTypeLabel(node.item_type)}</td>
                                                <td className="text-end">{node.quantity_per_parent}</td>
                                                <td className="text-end">{node.required_quantity}</td>
                                                <td>{node.unit}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <h6>最下位の材料の合計所要量</h6>
                            <div className="table-responsive">
                                <table className="table table-sm table-bordered">
                                    <thead className="table-light">
                                        <tr><th>品目</th><th className="text-end">合計所要量</th><th>単位</th></tr>
                                    </thead>
                                    <tbody>
                                        {result.totals.map(t => (
                                            <tr key={t.item_code}>
                                                <td>[{t.item_code}] {t.item_name}</td>
                                                <td className="text-end">{t.required_quantity}</td>
                                                <td>{t.unit}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )
                )}

                <div className="mt-3 text-end border-top pt-3">
                    <button type="button" className="btn btn-secondary" onClick={onClose}>閉じる</button>
                </div>
            </div>
        </Modal>
    );
};

export default BomExplodeModal;
