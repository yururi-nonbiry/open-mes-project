
import React, { useState, useEffect } from 'react';
import Modal from './Modal';

interface VersionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const VersionModal: React.FC<VersionModalProps> = ({ isOpen, onClose }) => {
  const [version, setVersion] = useState('0.0.0');
  const credit = '© Open MES Project. since 2025';

  useEffect(() => {
    if (isOpen) {
      fetch('/api/base/info/')
        .then((res) => {
          if (res.ok) {
            return res.json();
          }
          throw new Error('Network response was not ok');
        })
        .then((data) => {
          if (data && data.version) {
            setVersion(data.version);
          }
        })
        .catch((err) => {
          console.error('Failed to fetch app version:', err);
        });
    }
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="version-modal-content">
        <h2>バージョン情報</h2>
        <p><strong>現場Navi</strong></p>
        <p>Version: {version}</p>
        <hr />
        <p className="credit">{credit}</p>
      </div>
    </Modal>
  );
};

export default VersionModal;