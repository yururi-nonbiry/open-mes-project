import React, { useState, useEffect } from 'react';

const MobileHeader = ({ onMenuClick, isMenuOpen }) => {
  // Initialize theme from localStorage or default to system preference (or 'dark' if no preference)
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) return savedTheme;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.setAttribute('data-theme', 'dark');
    } else {
      root.setAttribute('data-theme', 'light');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  return (
    <div className="mobile-header-bar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span className="mobile-header-title">モバイルアプリ</span>
        <button 
          onClick={toggleTheme} 
          className="theme-toggle" 
          aria-label="テーマ切り替え"
          style={{
            background: 'none',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            padding: '5px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {theme === 'light' ? (
            // Moon icon for Light mode (to switch to Dark)
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>
          ) : (
            // Sun icon for Dark mode (to switch to Light)
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5"></circle>
              <line x1="12" y1="1" x2="12" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="23"></line>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
              <line x1="1" y1="12" x2="3" y2="12"></line>
              <line x1="21" y1="12" x2="23" y2="12"></line>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
            </svg>
          )}
        </button>
      </div>
      <button
        id="hamburger-menu-button"
        className="hamburger-button"
        aria-label="メニューを開閉する"
        aria-expanded={isMenuOpen}
        aria-controls="mobile-navigation-panel"
        onClick={onMenuClick}
      >
        <span className="hamburger-icon-bar"></span>
        <span className="hamburger-icon-bar"></span>
        <span className="hamburger-icon-bar"></span>
      </button>
    </div>
  );
};

export default MobileHeader;