import React from 'react';
import './App.css';

function App() {
  return (
    <div className="App">
        <header className="App-header">
          <div className="top-bar">
            <a id="site-title" href="/" data-animation-role="header-element">william brodhead</a>
            <nav>
              <button onClick={() => { window.location.href="/"; }}>home</button>
              <button onClick={() => { console.log('You clicked About!') }}>about</button>
            </nav>
          </div>
          <div className="centered-content">
            <div className="hero-section">
              {/* other content */}
            </div>
          </div>
        </header>
    </div>
  );
} export default App;