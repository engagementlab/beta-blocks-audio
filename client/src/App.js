import React from 'react';
import './App.css';

import Recorder from './Recorder';
import Speaker from './Speaker';

function App() {

  return (
    <div className="App">

      <div id="record">
        <Recorder />
      </div>

      <Speaker />

    </div>
  );
}

export default App;
