class Avatar {

    currentViseme = "sil"
    eyeBlinkProgress = 0;
    blinkSpeed = 0.2;
    blinkingDirection = 1;
    lastBlinkTime = 0;
    blinkCooldown = 5000;
    isSleep = true


    constructor(modelUrl) {

        this.clock  = new THREE.Clock();
        this.fbxLoader = new THREE.FBXLoader(); // Loader for FBX

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(15, window.innerWidth / window.innerHeight, 0.01, 100);
        this.camera.position.set(0, 0, 2);
        //this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 10);
        //this.camera.position.set(0, 0, 5);

        this.renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});

        const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
        directionalLight.position.set(100, 100, 100).normalize();
        this.scene.add(directionalLight);

        const controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;

        const loader = new THREE.GLTFLoader();
        const clz = this

        this.isAnimationsLoaded = false; // Flag to check if animations are loaded

        // https://demo.readyplayer.me/avatar?id=67bd3923758ea27bb2ef2f37
        loader.load(
            modelUrl,
            function (gltf) {
                clz.avatar = gltf.scene;
                clz.avatar.position.set(0, -1.7, 0);
                //clz.avatar.position.set(0, 0, 0);
                clz.scene.add(clz.avatar);
                clz.mouthMesh = clz.avatar.getObjectByName('Mouth'); // Assuming this is the mouth mesh
                clz.avatar.traverse(function (child) {
                    if (child.isMesh) {
                        console.log(child.name, child.position, child.scale);
                    }
                    if (child.name.toLowerCase() === "head") clz.head = child;
                    if (child.name.toLowerCase() === "lefteye") clz.leftEye = child;

                    if (child.name.toLowerCase() === "righteye") clz.rightEye = child;

                    if (child.name === 'Wolf3D_Avatar') {
                        console.log(child)
                        clz.wolfAvatar = child;
                        clz.wolfAvatar.morphTargetInfluences[clz.wolfAvatar.morphTargetDictionary.mouthSmile] = 0.3
                    }
                });

                if (clz.leftEye && clz.rightEye) {
                    console.info('Left and Right eyes found!');
                }

                // https://docs.readyplayer.me/ready-player-me/integration-guides/unity/animations/ready-player-me-animation-library
                // https://github.com/readyplayerme/animation-library/tree/master?tab=readme-ov-file#tutorials
                clz.loadAnimations(clz.avatar, "./src/assets/F_Standing_Idle_001.fbx");

            },
            undefined,
            function (error) {
                console.error('Error loading GLB file:', error);
            }
        );
        this.lastTime = 0;  // Store last frame time
        this.animate();
    }

    loadAnimations(avatar, animationUrl) {
        const clz = this;
        this.fbxLoader.load(animationUrl, function (fbxAnimation) {
            const animations = fbxAnimation.animations;
            if (animations && animations.length > 0) {
                // Initialize the mixer with the avatar model
                clz.mixer = new THREE.AnimationMixer(avatar);

                animations.forEach((clip) => {
                    const action = clz.mixer.clipAction(clip);
                    action.play();
                });

                // Set the flag to true when animations are loaded
                clz.isAnimationsLoaded = true;
            } else {
                console.warn("No animations found in the FBX file.");
            }
        });
    }

    animate() {
        const clz = this
        requestAnimationFrame(function () {
            clz.animate()
        });

        this.animateMouthSmoothly();
        this.animateEyes()

        if (this.isAnimationsLoaded && this.mixer) {
           // this.mixer.update(this.clock.getDelta()); // FIX
        }


        this.renderer.render(this.scene, this.camera);

    }

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