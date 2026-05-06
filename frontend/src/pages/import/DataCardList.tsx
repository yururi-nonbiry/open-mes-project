import React from 'react';
import { Row, Col, Card, Button } from 'react-bootstrap';

interface CardInfo {
    id: string;
    title: string;
    icon: string;
    description: string;
}

interface DataCardListProps {
    title: string;
    cards: CardInfo[];
    onRegister: (id: string) => void;
    onList: (id: string) => void;
}

const DataCardList: React.FC<DataCardListProps> = ({ title, cards, onRegister, onList }) => {
    return (
        <>
            <h3 className={title === '業務データ' ? 'mt-5' : ''}>{title}</h3>
            <Row>
                {cards.map(card => (
                    <Col key={card.id} md={4} className="mb-4">
                        <Card className="h-100 shadow-sm border-0">
                            <Card.Body className="d-flex flex-column">
                                <div className="d-flex align-items-center mb-3">
                                    <span className="fs-2 me-3">{card.icon}</span>
                                    <Card.Title className="mb-0 fw-bold">{card.title}</Card.Title>
                                </div>
                                <Card.Text className="flex-grow-1 text-muted small">{card.description}</Card.Text>
                                <div className="d-grid gap-2 mt-3">
                                    <Button variant="outline-primary" size="sm" onClick={() => onRegister(card.id)}>新規作成</Button>
                                    <Button variant="outline-secondary" size="sm" onClick={() => onList(card.id)}>一覧表示</Button>
                                </div>
                            </Card.Body>
                        </Card>
                    </Col>
                ))}
            </Row>
        </>
    );
};

export default DataCardList;
