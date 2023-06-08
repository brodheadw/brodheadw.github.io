import logo from './logo.svg';
import './App.css';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>William Brodhead</h1>
        <nav>
          <button onClick={() => { console.log('You clicked Home!') }}>Home</button>
          <button onClick={() => { console.log('You clicked About!') }}>About</button>
        </nav>
      </header>
    </div>
  );
}

export default App;
