class Avatar {

    currentViseme = "sil"
    eyeBlinkProgress = 0;
    blinkSpeed = 0.2;
    blinkingDirection = 1;
    lastBlinkTime = 0;
    blinkCooldown = 5000;
    isSleep = true
    mixer;

    constructor(modelUrl) {

        this.clock  = new THREE.Clock();
        this.scene = new THREE.Scene();

        this.camera = new THREE.PerspectiveCamera(6, window.innerWidth / window.innerHeight, 0.01, 100);
        this.camera.position.set(0, 2.0, 5);
        this.camera.lookAt(new THREE.Vector3(0, 1.6, 0));

        this.renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
        // Enable shadows in the renderer
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows

        //this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;
        this.renderer.antialias = true; // Enable anti-aliasing

        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Soft shadows


        // https://github.com/readyplayerme/visage/blob/0eafdd9c4c10db079de2656c3eb59212a2fb7f63/src/components/Exhibit/Exhibit.component.tsx#L92
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
        this.scene.add(ambientLight);

        // //SpotLight for more focused highlights
        const spotlight = new THREE.SpotLight(0x88ccff, 1.5); // Soft blueish tint
        spotlight.position.set(10, 10, 10); // Position above and slightly in front
        spotlight.angle = 0.15; // Narrow focus
        spotlight.penumbra = 1; // Soft edges
        spotlight.decay = 2; // Natural light falloff
        spotlight.distance = 10; // Limit range
        spotlight.castShadow = true; // Enable shadows
        spotlight.shadow.bias = -0.003; // Reduce shadow artifacts

        spotlight.shadow.mapSize.width = 2048;
        spotlight.shadow.mapSize.height = 2048;
        spotlight.shadow.radius = 5; // Softer edges
        this.scene.add(spotlight);

        const coolFillLight = new THREE.HemisphereLight(0x88ccff, 0x080820, 0.5); // Sky blue & dark blue
        this.scene.add(coolFillLight);

     //  const controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
     //  controls.enableDamping = true;
     //  controls.dampingFactor = 0.05;

        const loader = new THREE.GLTFLoader();
        const clz = this

        // https://demo.readyplayer.me/avatar?id=67bd3923758ea27bb2ef2f37
        loader.load(
            modelUrl,
            function (gltf) {

                const model = gltf.scene;
                clz.avatar = model;
                clz.mouthMesh = model.getObjectByName('Mouth'); // Assuming this is the mouth mesh
                clz.avatar.traverse(function (child) {
                    if (child.isMesh) {
                       // console.log(child.name, child.position, child.scale);
                    }
                    if (child.name.toLowerCase() === "head") clz.head = child;
                    if (child.name.toLowerCase() === "lefteye") clz.leftEye = child;
                    if (child.name.toLowerCase() === "righteye") clz.rightEye = child;

                    if (child.name === 'Wolf3D_Avatar') {
                        clz.wolfAvatar = child;
                        clz.wolfAvatar.morphTargetInfluences[clz.wolfAvatar.morphTargetDictionary.mouthSmile] = 0.3
                    }
                });
                model.position.set(0, 0, 0);
                model.scale.set(1, 1, 1);

                model.traverse((child) => {
                    if (child.isMesh && child.material.map) {
                        child.material.map.minFilter = THREE.LinearMipMapLinearFilter;
                        child.material.map.magFilter = THREE.LinearFilter;
                        child.material.needsUpdate = true;
                    }
                });

                model.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                        child.material.flatShading = false; // Ensure smooth shading
                        child.material.needsUpdate = true;
                    }
                });

                clz.scene.add(model);



                const fbxLoader = new THREE.FBXLoader();
                fbxLoader.load('./src/assets/F_Standing_Idle_001.fbx', (fbx) => {
                    clz.mixer = new THREE.AnimationMixer(model);
                    const clip = fbx.animations[0]
                    const tracks = clip.tracks;
                    const validTracks = tracks.filter(track => {
                        return  !track.name.includes("Hips.position")
                    });

                    const filteredClip = new THREE.AnimationClip('FilteredAnimation', -1, validTracks);
                    const action = clz.mixer.clipAction(filteredClip)
                    action.play(); // Start the animation

                });
                // https://docs.readyplayer.me/ready-player-me/integration-guides/unity/animations/ready-player-me-animation-library
                // https://github.com/readyplayerme/animation-library/tree/master?tab=readme-ov-file#tutorials
            },
            undefined,
            function (error) {
                console.error('Error loading GLB file:', error);
            }
        );
        this.animate();
    }


    animate() {
        const clz = this
        requestAnimationFrame(function () {
            clz.animate()
        });

        // update animations
        if (clz.mixer) clz.mixer.update(clz.clock.getDelta());
        this.animateMouthSmoothly();
        this.animateEyes()
        this.renderer.render(this.scene, this.camera);
    }

    // blink eyes, or close if disconected
    animateEyes() {
        if (this.isSleep && this.leftEye && this.rightEye) {
            this.leftEye.scale.y = this.rightEye.scale.y = 0.0;
            return;
        }
        let currentTime = Date.now();
        if (currentTime - this.lastBlinkTime >= this.blinkCooldown) {
            if (this.leftEye && this.rightEye) {
                this.eyeBlinkProgress += this.blinkSpeed * this.blinkingDirection;
                if (this.eyeBlinkProgress >= 1) this.blinkingDirection = -1;
                if (this.eyeBlinkProgress <= 0) {
                    this.blinkingDirection = 1;
                    this.lastBlinkTime = currentTime;
                }
                this.leftEye.scale.y = this.rightEye.scale.y = Math.max(0.0, 1 - this.eyeBlinkProgress);
            }
        }
    }

    // animate speech
    animateMouthSmoothly() {
        if (this.wolfAvatar && this.wolfAvatar.morphTargetDictionary) {
            this.wolfAvatar.mouthSmileLeft = 1
            const targetIndex = this.wolfAvatar.morphTargetDictionary['viseme_' + this.currentViseme];
            // Reset all other visemes gradually
            Object.keys(this.wolfAvatar.morphTargetDictionary).forEach((visemeKey) => {
                const index = this.wolfAvatar.morphTargetDictionary[visemeKey];
                if (index !== targetIndex && visemeKey.startsWith("viseme_")) {
                    if (this.wolfAvatar.morphTargetInfluences[index] > 0) {
                        this.wolfAvatar.morphTargetInfluences[index] = Math.max(0, this.wolfAvatar.morphTargetInfluences[index] - 0.1); // Fade-out
                    }
                }
            });
            if (targetIndex !== undefined) {
                if (this.wolfAvatar.morphTargetInfluences[targetIndex] < 1) {
                    this.wolfAvatar.morphTargetInfluences[targetIndex] = Math.min(1, this.wolfAvatar.morphTargetInfluences[targetIndex] + 0.1); // Fade-in
                }
            }
        }
    }

    // set to animate lips with provided viseme
    setViseme(viseme) {
        if (['CH', 'DD', 'E', 'FF', 'I', 'O', 'PP', 'RR', 'SS', 'TH', 'U', 'aa', 'kk', 'nn'].includes(viseme))
            this.currentViseme = viseme
        else
            this.currentViseme = 'sil'
    }

    setSleep(bool) {
        this.isSleep = bool
    }

}