import './App.css';

import React, { useRef, useState } from 'react';
import {Avatar} from '@readyplayerme/visage';
import {useVisemeLipSync} from './hooks/useVisemeLipSync';
//import { Avatar } from "./components/Avatar";

function App() {
    const modelSrc = 'https://readyplayerme.github.io/visage/male.glb';
//
    //const p = AvatarProps.onLoaded()
    //const avatarRef = useRef(null);
    //const {currentViseme, setViseme} = useVisemeLipSync();

    const avatarRef = useRef(null);
   // const [avatarInstance, setAvatarInstance] = useState(null);

    const emo = {
        browInnerUp: 0.3,
        mouthShrugUpper: 0.3,
        mouthSmileLeft: 0.4,  // Value between 0 and 1
        mouthSmileRight: 0.2,  // Value between 0 and 1
    }

    const avatar =  (<Avatar
        ref={avatarRef}
        modelSrc={modelSrc}
        className="avatar"
        animationSrc="F_Standing_Idle_001.fbx"
        emotion={emo}
        shadows
        onLoaded={( ) => {
           // emo.mouthSmileLeft = 0
            //var x = 0.1
            // window.setInterval(function () {
            //     // console.log(emo.mouthSmileLeft)
            //     // if (emo.mouthSmileLeft === 0) {
            //     //     x += 0.1
            //     // } else if (emo.mouthSmileLeft === 1) {
            //     //     x -= 0.1
            //     // }
            //     emo.mouthSmileLeft = 1;
            //
            // }, 1000)


           // useVisemeLipSync
            //console.log("Avatar Loaded:", instance);
          //  setAvatarInstance(instance); // Store the loaded instance
        }}//

        //materialConfig={setViseme()}
    />)



    return (
        <div className="App">
            <header className="App-header">
                {avatar}
            </header>
        </div>
    );
}

export default App;
