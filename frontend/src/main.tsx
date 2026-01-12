import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Import Bootstrap CSS and JS
import 'bootstrap/dist/css/bootstrap.min.css';

// Import custom styles and the main App component
import './index.css';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
