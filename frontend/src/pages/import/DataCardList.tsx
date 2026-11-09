import React from 'react';
import { Row, Col, Card, Button } from 'react-bootstrap';
import { DataCardItem } from '../../config/dataImportConfigs';
import { NavIcon } from '../../config/navigationConfig';

interface DataCardListProps {
    title: string;
    cards: DataCardItem[];
    onRegister: (id: string) => void;
    onList: (id: string) => void;
}

const DataCardList: React.FC<DataCardListProps> = ({ title, cards, onRegister, onList }) => {
    const isBusiness = title === '業務データ';
    return (
        <div className="data-card-section mb-4">
            <div className="data-card-section-header">
                <span className="data-card-section-icon">
                    <NavIcon name={isBusiness ? 'plan' : 'master'} size={18} />
                </span>
                <h3 className="mb-0">{title}</h3>
                <span className="data-card-section-badge">{cards.length} 項目</span>
            </div>
            <Row className="g-3">
                {cards.map(card => (
                    <Col key={card.id} md={4}>
                        <Card className="h-100 data-mgmt-card">
                            <Card.Body className="d-flex flex-column p-3">
                                <div className="d-flex align-items-center justify-content-between mb-2">
                                    <div className="d-flex align-items-center gap-2">
                                        <span className="data-mgmt-icon-box">
                                            <NavIcon name={card.icon} size={20} />
                                        </span>
                                        <Card.Title className="mb-0 fw-bold fs-6">{card.title}</Card.Title>
                                    </div>
                                    {card.tag && (
                                        <span className="data-mgmt-tag">{card.tag}</span>
                                    )}
                                </div>
                                <Card.Text className="flex-grow-1 text-muted small mb-3">
                                    {card.description}
                                </Card.Text>
                                <div className="d-flex gap-2 mt-auto">
                                    <Button
                                        variant="primary"
                                        size="sm"
                                        className="flex-grow-1 fw-bold"
                                        onClick={() => onRegister(card.id)}
                                    >
                                        ＋ 新規作成
                                    </Button>
                                    <Button
                                        variant="outline-secondary"
                                        size="sm"
                                        className="flex-grow-1 fw-bold"
                                        onClick={() => onList(card.id)}
                                    >
                                        一覧表示
                                    </Button>
                                </div>
                            </Card.Body>
                        </Card>
                    </Col>
                ))}
            </Row>
        </div>
    );
};

export default DataCardList;
