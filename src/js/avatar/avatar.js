export class Avatar {

    currentViseme = "sil"
    eyeBlinkProgress = 0;
    blinkSpeed = 0.2;
    blinkingDirection = 1;
    lastBlinkTime = 0;
    blinkCooldown = 5000;
    isSleep = true
    mixer;
    motionTarget = {headYaw: 0, headPitch: 0, headRoll: 0, eyeYaw: 0, eyePitch: 0};
    motion = {headYaw: 0, headPitch: 0, headRoll: 0, eyeYaw: 0, eyePitch: 0};
    motionBase = new Map();
    motionLastUpdate = 0;
    motionTime = Math.random() * 10;
    listening = false;
    nextSaccadeAt = 0;
    saccade = {yaw: 0, pitch: 0};
    saccadeTarget = {yaw: 0, pitch: 0};
    expressionTarget = {emotion: 'neutral', intensity: 0};
    expression = {emotion: 'neutral', intensity: 0};
    gestureTarget = {type: 'none', intensity: 0};
    gesture = {type: 'none', intensity: 0};
    bodyNodes = {};
    morphMeshes = [];
    expressionMorphs = [];
    breathingTime = Math.random() * 10;

    constructor(modelUrl) {

        this.clock  = new THREE.Clock();
        this.scene = new THREE.Scene();

        this.camera = new THREE.PerspectiveCamera(6, window.innerWidth / window.innerHeight, 0.01, 100);
        this.camera.position.set(0, 2.0, 5);
        // Keep the avatar slightly below center so the top of the head is not clipped.
        this.camera.lookAt(new THREE.Vector3(0, 1.8, 0));

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
                    const nodeName = child.name.toLowerCase();
                    if (!clz.bodyNodes.neck && /neck/.test(nodeName)) clz.bodyNodes.neck = child;
                    if (!clz.bodyNodes.spine && /(spine|chest|upper.?body)/.test(nodeName)) clz.bodyNodes.spine = child;
                    if (!clz.bodyNodes.leftShoulder && /(left|l)_?shoulder/.test(nodeName)) clz.bodyNodes.leftShoulder = child;
                    if (!clz.bodyNodes.rightShoulder && /(right|r)_?shoulder/.test(nodeName)) clz.bodyNodes.rightShoulder = child;
                    if (child.morphTargetDictionary && child.morphTargetInfluences) {
                        clz.morphMeshes.push(child);
                        for (const name of Object.keys(child.morphTargetDictionary)) {
                            const lower = name.toLowerCase();
                            if (!/viseme|mouthsmile/.test(lower) && /smile|happy|joy|sad|frown|angry|brow|eyebrow|surprise|blink/.test(lower)) {
                                clz.expressionMorphs.push({mesh: child, name, index: child.morphTargetDictionary[name]});
                            }
                        }
                    }

                    if (child.name === 'Wolf3D_Avatar') {
                        clz.wolfAvatar = child;
                        clz.wolfAvatar.morphTargetInfluences[clz.wolfAvatar.morphTargetDictionary.mouthSmile] = 0.3
                    }
                });
                clz.captureMotionBases();
                // Avatar files can use different local origins and scales. Normalize their
                // feet, horizontal center, and height so every selection uses the same frame.
                const bounds = new THREE.Box3().setFromObject(model);
                const size = bounds.getSize(new THREE.Vector3());
                const targetHeight = 2.0;
                if (size.y > 0.001) {
                    const frameScale = targetHeight / size.y;
                    model.scale.setScalar(frameScale);
                }
                const framedBounds = new THREE.Box3().setFromObject(model);
                const framedCenter = framedBounds.getCenter(new THREE.Vector3());
                model.position.set(-framedCenter.x, -framedBounds.min.y, -framedCenter.z);

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
        if (this.disposed) return;
        const clz = this
        requestAnimationFrame(function () {
            clz.animate()
        });

        // update animations
        if (clz.mixer) clz.mixer.update(clz.clock.getDelta());
        this.animateMouthSmoothly();
        this.animateEyes();
        this.animateMotion();
        this.animateExpressions();
        this.animateBody();
        this.renderer.render(this.scene, this.camera);
    }

    captureMotionBases() {
        for (const node of [this.head, this.leftEye, this.rightEye, this.bodyNodes.neck, this.bodyNodes.spine, this.bodyNodes.leftShoulder, this.bodyNodes.rightShoulder]) {
            if (node) this.motionBase.set(node, node.rotation.clone());
        }
    }

    // Apply small, bounded AI cues on top of the current animation. Values are degrees.
    setMotion({headYaw = 0, headPitch = 0, headRoll = 0, eyeYaw = 0, eyePitch = 0} = {}) {
        const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
        this.motionTarget = {
            headYaw: THREE.MathUtils.degToRad(clamp(headYaw, -18, 18)),
            headPitch: THREE.MathUtils.degToRad(clamp(headPitch, -12, 12)),
            headRoll: THREE.MathUtils.degToRad(clamp(headRoll, -10, 10)),
            eyeYaw: THREE.MathUtils.degToRad(clamp(eyeYaw, -24, 24)),
            eyePitch: THREE.MathUtils.degToRad(clamp(eyePitch, -14, 14)),
        };
        this.motionLastUpdate = performance.now();
    }

    setListening(isListening) {
        this.listening = !!isListening;
        if (!this.listening) this.saccadeTarget = {yaw: 0, pitch: 0};
    }

    // Map a normalized camera face position into a virtual MacBook-camera perspective.
    // The 50 cm distance is the neutral viewing distance; horizontal/vertical offsets
    // become smaller, natural head and eye cues rather than a literal screen-space jump.
    setTracking({faceX = 0, faceY = 0, distanceCm = 50, confidence = 1} = {}) {
        const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
        // The webcam image is from the camera's point of view, while avatar yaw
        // is expressed from the avatar's point of view. Invert both axes so a
        // person moving left/right in the MacBook image produces the matching
        // avatar gaze instead of a mirrored reaction.
        const x = clamp(-faceX, -1, 1);
        const y = clamp(faceY, -1, 1);
        const distance = clamp(distanceCm, 25, 150);
        const certainty = clamp(confidence, 0, 1);
        const distanceScale = clamp(50 / distance, 0.8, 1.6);

        // Approximate a MacBook webcam: ~60° horizontal and ~45° vertical FOV.
        // Use a stronger gain than the raw camera angle: the face usually moves
        // only a small fraction of the cropped frame at normal laptop distance.
        const horizontalAngle = Math.atan(x * Math.tan(THREE.MathUtils.degToRad(30)));
        const verticalAngle = Math.atan(y * Math.tan(THREE.MathUtils.degToRad(22.5)));
        this.setMotion({
            headYaw: THREE.MathUtils.radToDeg(horizontalAngle) * 0.95 * distanceScale * certainty,
            // Positive image Y means lower on screen; negative pitch means down.
            headPitch: -THREE.MathUtils.radToDeg(verticalAngle) * 0.85 * distanceScale * certainty,
            headRoll: 0,
            eyeYaw: THREE.MathUtils.radToDeg(horizontalAngle) * 1.45 * distanceScale * certainty,
            eyePitch: -THREE.MathUtils.radToDeg(verticalAngle) * 1.25 * distanceScale * certainty,
        });
    }

    setExpression({emotion = 'neutral', intensity = 0} = {}) {
        const allowed = new Set(['neutral', 'happy', 'sad', 'angry', 'surprised', 'confused']);
        this.expressionTarget = {
            emotion: allowed.has(String(emotion).toLowerCase()) ? String(emotion).toLowerCase() : 'neutral',
            intensity: Math.max(0, Math.min(1, Number(intensity) || 0)),
        };
    }

    setGesture({type = 'none', intensity = 0} = {}) {
        const allowed = new Set(['none', 'nod', 'shake', 'tilt']);
        this.gestureTarget = {
            type: allowed.has(String(type).toLowerCase()) ? String(type).toLowerCase() : 'none',
            intensity: Math.max(0, Math.min(1, Number(intensity) || 0)),
        };
    }

    animateExpressions() {
        const blend = 0.08;
        this.expression.intensity += (this.expressionTarget.intensity - this.expression.intensity) * blend;
        this.expression.emotion = this.expressionTarget.emotion;
        const keywords = {
            happy: ['smile', 'happy', 'joy'], sad: ['sad', 'frown'], angry: ['angry', 'frown'],
            surprised: ['surprise'], confused: ['brow', 'eyebrow'], neutral: []
        }[this.expression.emotion] || [];
        for (const entry of this.expressionMorphs) {
            const matches = keywords.some(keyword => entry.name.toLowerCase().includes(keyword));
            const target = matches ? this.expression.intensity : 0;
            entry.mesh.morphTargetInfluences[entry.index] += (target - entry.mesh.morphTargetInfluences[entry.index]) * blend;
        }
    }

    animateBody() {
        const now = performance.now();
        const dt = Math.min(0.1, Math.max(0.001, (now - (this.bodyFrameTime || now)) / 1000));
        this.bodyFrameTime = now;
        this.breathingTime += dt;
        const baseSpine = this.motionBase.get(this.bodyNodes.spine);
        if (this.bodyNodes.spine && baseSpine) {
            this.bodyNodes.spine.rotation.x = baseSpine.x + Math.sin(this.breathingTime * 1.7) * 0.008;
        }
        const blend = 1 - Math.exp(-dt * 6);
        this.gesture.intensity += (this.gestureTarget.intensity - this.gesture.intensity) * blend;
        this.gesture.type = this.gestureTarget.type;
        const baseNeck = this.motionBase.get(this.bodyNodes.neck);
        if (this.bodyNodes.neck && baseNeck) {
            const nod = this.gesture.type === 'nod' ? Math.sin(this.motionTime * 3) * 0.06 * this.gesture.intensity : 0;
            const shake = this.gesture.type === 'shake' ? Math.sin(this.motionTime * 3) * 0.08 * this.gesture.intensity : 0;
            const tilt = this.gesture.type === 'tilt' ? 0.12 * this.gesture.intensity : 0;
            this.bodyNodes.neck.rotation.set(baseNeck.x + nod, baseNeck.y + shake, baseNeck.z + tilt);
        }
    }

    animateMotion() {
        const now = performance.now();
        const dt = Math.min(0.1, Math.max(0.001, (now - (this.motionFrameTime || now)) / 1000));
        this.motionFrameTime = now;
        this.motionTime += dt;

        // Irregular, low-amplitude eye movements make the avatar feel attentive.
        if (now >= this.nextSaccadeAt) {
            this.saccadeTarget = {
                yaw: (Math.random() - 0.5) * 0.10,
                pitch: (Math.random() - 0.5) * 0.06,
            };
            this.nextSaccadeAt = now + 900 + Math.random() * 2200;
        }
        const saccadeBlend = 1 - Math.exp(-dt * 12);
        this.saccade.yaw += (this.saccadeTarget.yaw - this.saccade.yaw) * saccadeBlend;
        this.saccade.pitch += (this.saccadeTarget.pitch - this.saccade.pitch) * saccadeBlend;

        const idleAmount = now - this.motionLastUpdate > 3500 ? 1 : 0;
        const idle = {
            headYaw: Math.sin(this.motionTime * 0.45) * 0.035 * idleAmount,
            headPitch: Math.sin(this.motionTime * 0.31) * 0.018 * idleAmount,
            headRoll: Math.sin(this.motionTime * 0.37) * 0.012 * idleAmount,
            eyeYaw: Math.sin(this.motionTime * 0.70) * 0.045 * idleAmount,
            eyePitch: Math.sin(this.motionTime * 0.53) * 0.025 * idleAmount,
        };
        const blend = 1 - Math.exp(-dt * 5);
        for (const key of Object.keys(this.motion)) {
            const target = idleAmount ? idle[key] : this.motionTarget[key];
            this.motion[key] += (target - this.motion[key]) * blend;
        }

        // A restrained half-nod while the user is speaking signals listening.
        const nod = this.listening ? Math.sin(this.motionTime * 2.8) * 0.035 : 0;
        const applyRotation = (node, offsets) => {
            const base = this.motionBase.get(node);
            if (!node || !base) return;
            node.rotation.set(base.x + offsets.pitch, base.y + offsets.yaw, base.z + offsets.roll);
        };
        applyRotation(this.head, {
            pitch: this.motion.headPitch + nod,
            yaw: this.motion.headYaw,
            roll: this.motion.headRoll,
        });
        applyRotation(this.leftEye, {
            pitch: this.motion.eyePitch + this.saccade.pitch,
            yaw: this.motion.eyeYaw + this.saccade.yaw,
            roll: 0,
        });
        applyRotation(this.rightEye, {
            pitch: this.motion.eyePitch + this.saccade.pitch,
            yaw: this.motion.eyeYaw + this.saccade.yaw,
            roll: 0,
        });
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
        if (this.wolfAvatar && this.wolfAvatar.morphTargetDictionary && this.wolfAvatar.morphTargetInfluences) {
            // If you want a constant smile, do it via morph targets (not via a non-existent property).
            const smileIndex = this.wolfAvatar.morphTargetDictionary.mouthSmile;
            if (smileIndex !== undefined) {
                this.wolfAvatar.morphTargetInfluences[smileIndex] = 0.3;
            }

            const targetIndex = this.wolfAvatar.morphTargetDictionary['viseme_' + this.currentViseme];

            // Reset all other visemes gradually
            Object.keys(this.wolfAvatar.morphTargetDictionary).forEach((visemeKey) => {
                const index = this.wolfAvatar.morphTargetDictionary[visemeKey];
                if (index !== targetIndex && visemeKey.startsWith("viseme_")) {
                    if (this.wolfAvatar.morphTargetInfluences[index] > 0) {
                        // Slightly faster fade-out makes articulation crisper.
                        this.wolfAvatar.morphTargetInfluences[index] = Math.max(
                            0,
                            this.wolfAvatar.morphTargetInfluences[index] - 0.15
                        );
                    }
                }
            });
            if (targetIndex !== undefined) {
                const vowels = new Set(['aa', 'O', 'E', 'I', 'U']);
                const step = vowels.has(this.currentViseme) ? 0.20 : 0.10;

                if (this.wolfAvatar.morphTargetInfluences[targetIndex] < 1) {
                    this.wolfAvatar.morphTargetInfluences[targetIndex] = Math.min(
                        1,
                        this.wolfAvatar.morphTargetInfluences[targetIndex] + step
                    );
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

    dispose() {
        this.disposed = true;
        if (this.mixer) this.mixer.stopAllAction();
        if (this.renderer) this.renderer.dispose();
    }

}