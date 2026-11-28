import { Modal, Button } from 'react-bootstrap';
import type { DefaultLocationConfirmState } from '../../hooks/useDefaultLocationConfirm';

/** PC の入庫画面の「デフォルト入庫棚番に登録するか」の確認。×・Esc で閉じたら入庫を取りやめる(null)。 */
const DefaultLocationConfirmModal = ({ pending, onAnswer }: {
    pending: DefaultLocationConfirmState | null;
    onAnswer: (value: boolean | null) => void;
}) => (
    <Modal
        show={pending !== null}
        onHide={() => onAnswer(null)}
        centered
        backdrop="static"
        className="mes-clean-modal"
        style={{ zIndex: 1100 }}
    >
        <Modal.Header closeButton className="mes-modal-header">
            <Modal.Title className="mes-modal-title">デフォルト入庫棚番の登録</Modal.Title>
        </Modal.Header>
        <Modal.Body className="mes-modal-body">
            <p className="mb-2">
                品番「{pending?.partNumber}」のデフォルト入庫棚番が未登録です。
            </p>
            <p className="mb-0">
                今回の棚番「<strong>{pending?.location}</strong>」をデフォルト入庫棚番として登録しますか？
            </p>
        </Modal.Body>
        <Modal.Footer className="mes-modal-footer">
            <Button variant="outline-secondary" onClick={() => onAnswer(false)}>
                登録しないで入庫
            </Button>
            <Button variant="primary" onClick={() => onAnswer(true)} autoFocus>
                登録して入庫
            </Button>
        </Modal.Footer>
    </Modal>
);

export default DefaultLocationConfirmModal;
