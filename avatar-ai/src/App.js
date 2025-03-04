import './App.css';

import React from 'react';
import { Avatar } from '@readyplayerme/visage';

function App() {
  const modelSrc = 'https://readyplayerme.github.io/visage/male.glb';

  return (
    <div className="App">
      <header className="App-header">
        <Avatar modelSrc={modelSrc} className="avatar" animationSrc="F_Standing_Idle_001.fbx"/>
      </header>
    </div>
  );
}

export default App;
