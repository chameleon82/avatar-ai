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
    motionPositionBase = new Map();
    listening = false;
    nextSaccadeAt = 0;
    saccade = {yaw: 0, pitch: 0};
    saccadeTarget = {yaw: 0, pitch: 0};
    expressionTarget = {emotion: 'neutral', intensity: 0};
    expression = {emotion: 'neutral', intensity: 0};
    gestureTarget = {type: 'none', intensity: 0};
    gesture = {type: 'none', intensity: 0};
    bodyTarget = {shoulderLift: 0, posture: 0};
    body = {shoulderLift: 0, posture: 0};
    handTarget = {leftArmLift: 0, rightArmLift: 0, leftArmSide: 0, rightArmSide: 0, leftForearmBend: 0, rightForearmBend: 0, leftHandTwist: 0, rightHandTwist: 0, fingerCurl: 0, fingerSpread: 0, leftFingerCurl: 0, rightFingerCurl: 0, leftFingerSpread: 0, rightFingerSpread: 0, gesture: 'none', fingerGesture: 'neutral'};
    hand = {leftArmLift: 0, rightArmLift: 0, leftArmSide: 0, rightArmSide: 0, leftForearmBend: 0, rightForearmBend: 0, leftHandTwist: 0, rightHandTwist: 0, leftFingerCurl: 0, rightFingerCurl: 0, leftFingerSpread: 0, rightFingerSpread: 0};
    fingerNodes = {left: {}, right: {}};
    fingerTarget = {leftFingerCurl: 0, rightFingerCurl: 0, leftFingerSpread: 0, rightFingerSpread: 0, gesture: 'neutral'};
    fingers = {leftFingerCurl: 0, rightFingerCurl: 0, leftFingerSpread: 0, rightFingerSpread: 0};
    bodyNodes = {};
    morphMeshes = [];
    expressionMorphs = [];
    facialMorphs = {browLift: [], browFurrow: [], eyelid: []};
    facialTarget = {browLift: 0, browFurrow: 0, eyelidClose: 0};
    facial = {browLift: 0, browFurrow: 0, eyelidClose: 0};
    breathingTime = Math.random() * 10;

    constructor(modelUrl, {debug = false} = {}) {
        this.modelUrl = modelUrl;
        this.debug = !!debug;
        this.debugIssues = new Set();
        this.debugLastReportAt = 0;
        this.clock  = new THREE.Clock();
        this.scene = new THREE.Scene();

        this.camera = new THREE.PerspectiveCamera(6, window.innerWidth / window.innerHeight, 0.01, 100);
        this.baseCameraFov = this.camera.fov;
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
                    // Prefer the upper torso bone when several Ready Player Me spine bones exist; Spine2 produces a visible chest/posture change.
                    if (!clz.bodyNodes.spine && /(spine|chest|upper.?body)/.test(nodeName)) clz.bodyNodes.spine = child;
                    if (/spine2|upper.?chest/.test(nodeName)) clz.bodyNodes.spine = child;
                    if (!clz.bodyNodes.leftShoulder && /(left|l)_?shoulder/.test(nodeName)) clz.bodyNodes.leftShoulder = child;
                    if (!clz.bodyNodes.rightShoulder && /(right|r)_?shoulder/.test(nodeName)) clz.bodyNodes.rightShoulder = child;
                    if (!clz.bodyNodes.leftArm && /(left|l)_?arm$/.test(nodeName)) clz.bodyNodes.leftArm = child;
                    if (!clz.bodyNodes.rightArm && /(right|r)_?arm$/.test(nodeName)) clz.bodyNodes.rightArm = child;
                    if (!clz.bodyNodes.leftForeArm && /(left|l)_?fore.?arm/.test(nodeName)) clz.bodyNodes.leftForeArm = child;
                    if (!clz.bodyNodes.rightForeArm && /(right|r)_?fore.?arm/.test(nodeName)) clz.bodyNodes.rightForeArm = child;
                    if (!clz.bodyNodes.leftHand && /(left|l)_?hand$/.test(nodeName)) clz.bodyNodes.leftHand = child;
                    if (!clz.bodyNodes.rightHand && /(right|r)_?hand$/.test(nodeName)) clz.bodyNodes.rightHand = child;
                    const fingerMatch = nodeName.match(/^(?:wolf3d_)?(left|right)_?hand_?(thumb|index|middle|ring|pinky|little)([1-3])$/);
                    if (fingerMatch) {
                        const side = fingerMatch[1];
                        const digit = fingerMatch[2] === 'little' ? 'pinky' : fingerMatch[2];
                        clz.fingerNodes[side][digit] ||= [];
                        clz.fingerNodes[side][digit][Number(fingerMatch[3]) - 1] = child;
                    }
                    if (child.morphTargetDictionary && child.morphTargetInfluences) {
                        clz.morphMeshes.push(child);
                        for (const name of Object.keys(child.morphTargetDictionary)) {
                            const lower = name.toLowerCase();
                            const entry = {mesh: child, name, index: child.morphTargetDictionary[name]};
                            if (/brow|eyebrow|browouter|browinner/.test(lower)) {
                                if (/down|frown|compress|furrow/.test(lower)) clz.facialMorphs.browFurrow.push(entry);
                                else clz.facialMorphs.browLift.push(entry);
                            } else if (/blink|eye.?close|lid.?close|squint/.test(lower)) {
                                clz.facialMorphs.eyelid.push(entry);
                            } else if (!/viseme|mouthsmile/.test(lower) && /smile|happy|joy|sad|frown|angry|surprise/.test(lower)) {
                                clz.expressionMorphs.push(entry);
                            }
                        }
                    }

                    if (child.name === 'Wolf3D_Avatar') {
                        clz.wolfAvatar = child;
                        clz.wolfAvatar.morphTargetInfluences[clz.wolfAvatar.morphTargetDictionary.mouthSmile] = 0.3
                    }
                });
                clz.captureMotionBases();
                clz.debugLog('avatar rig detected', clz.getDebugReport());
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
        this.animateFacialRig();
        this.animateBody();
        this.renderer.render(this.scene, this.camera);
    }

    setZoom = (zoom = 1) => {
        // A larger zoom value narrows the field of view and makes the avatar larger.
        const normalizedZoom = THREE.MathUtils.clamp(Number(zoom) || 1, 0.5, 2.5);
        this.camera.fov = this.baseCameraFov / normalizedZoom;
        this.camera.updateProjectionMatrix();
        this.debugLog('zoom applied', {zoom: normalizedZoom, fov: this.camera.fov});
    };

    setDebug(enabled) {
        this.debug = !!enabled;
        return this.debug;
    }

    debugLog(message, details) {
        if (this.debug) console.debug('[avatar debug]', message, details || '');
    }

    debugIssue(key, message, details) {
        if (!this.debug || this.debugIssues.has(key)) return;
        this.debugIssues.add(key);
        console.warn('[avatar debug] ' + message, details || '');
    }

    getDebugReport() {
        const nodeName = (node) => node ? node.name : null;
        return {
            modelUrl: this.modelUrl,
            nodes: {head: nodeName(this.head), leftEye: nodeName(this.leftEye), rightEye: nodeName(this.rightEye), spine: nodeName(this.bodyNodes.spine), neck: nodeName(this.bodyNodes.neck), leftShoulder: nodeName(this.bodyNodes.leftShoulder), rightShoulder: nodeName(this.bodyNodes.rightShoulder), leftArm: nodeName(this.bodyNodes.leftArm), rightArm: nodeName(this.bodyNodes.rightArm), leftForeArm: nodeName(this.bodyNodes.leftForeArm), rightForeArm: nodeName(this.bodyNodes.rightForeArm), leftHand: nodeName(this.bodyNodes.leftHand), rightHand: nodeName(this.bodyNodes.rightHand)},
            morphs: {meshes: this.morphMeshes.length, browLift: this.facialMorphs.browLift.map((entry) => entry.name), browFurrow: this.facialMorphs.browFurrow.map((entry) => entry.name), eyelid: this.facialMorphs.eyelid.map((entry) => entry.name), expressions: this.expressionMorphs.map((entry) => entry.name)},
            fingers: Object.fromEntries(
                ['left', 'right'].map((side) => [
                    side,
                    Object.fromEntries(
                        Object.entries(this.fingerNodes[side]).map(([digit, nodes]) => [
                            digit,
                            nodes.filter(Boolean).map((node) => node.name),
                        ]),
                    ),
                ]),
            ),
            motion: {...this.motionTarget},
            body: {...this.bodyTarget},
            hands: {...this.handTarget},
        };
    }

    // Compact runtime telemetry for AI calibration. Coordinates are world-space.
    getPoseSnapshot() {
        if (this.avatar) this.avatar.updateMatrixWorld(true);
        const keys = ['head', 'neck', 'spine', 'leftShoulder', 'rightShoulder', 'leftArm', 'rightArm', 'leftForeArm', 'rightForeArm', 'leftHand', 'rightHand'];
        const point = (key) => {
            const node = key === 'head' ? this.head : key === 'neck' ? this.bodyNodes.neck : key === 'spine' ? this.bodyNodes.spine : this.bodyNodes[key];
            if (!node) return null;
            const position = new THREE.Vector3();
            const quaternion = new THREE.Quaternion();
            node.getWorldPosition(position);
            node.getWorldQuaternion(quaternion);
            const rotation = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ');
            return {name: node.name, position: {x: Number(position.x.toFixed(3)), y: Number(position.y.toFixed(3)), z: Number(position.z.toFixed(3))}, rotationDeg: {x: Number(THREE.MathUtils.radToDeg(rotation.x).toFixed(1)), y: Number(THREE.MathUtils.radToDeg(rotation.y).toFixed(1)), z: Number(THREE.MathUtils.radToDeg(rotation.z).toFixed(1))}};
        };
        const joints = Object.fromEntries(keys.map((key) => [key, point(key)]));
        const leftWrist = joints.leftHand?.position;
        const rightWrist = joints.rightHand?.position;
        const wristDelta = leftWrist && rightWrist ? {screenRight: Number((rightWrist.x - leftWrist.x).toFixed(3)), vertical: Number((rightWrist.y - leftWrist.y).toFixed(3)), depth: Number((rightWrist.z - leftWrist.z).toFixed(3))} : null;
        return {coordinateSystem: 'world coordinates: x=viewer screen-right, y=up, z=depth toward camera', detectedNodes: this.getDebugReport().nodes, joints, wristDelta, requested: {motion: {...this.motionTarget}, body: {...this.bodyTarget}, hands: {...this.handTarget}}, applied: {motion: {...this.motion}, body: {...this.body}, hands: {...this.hand}}, morphs: this.getDebugReport().morphs};
    }

    captureMotionBases() {
        for (const node of [this.head, this.leftEye, this.rightEye, this.bodyNodes.neck, this.bodyNodes.spine, this.bodyNodes.leftShoulder, this.bodyNodes.rightShoulder, this.bodyNodes.leftArm, this.bodyNodes.rightArm, this.bodyNodes.leftForeArm, this.bodyNodes.rightForeArm, this.bodyNodes.leftHand, this.bodyNodes.rightHand, ...Object.values(this.fingerNodes).flatMap((side) => Object.values(side).flatMap((nodes) => nodes || []))]) {
            if (node) {
                this.motionBase.set(node, node.rotation.clone());
                this.motionPositionBase.set(node, node.position.clone());
            }
        }
    }

    // Apply small, bounded AI cues on top of the current animation. Values are degrees.
    setMotion({headYaw = 0, headPitch = 0, headRoll = 0, eyeYaw = 0, eyePitch = 0, leftArmLift = 0, rightArmLift = 0, leftArmSide = 0, rightArmSide = 0, leftForearmBend = 0, rightForearmBend = 0, leftHandTwist = 0, rightHandTwist = 0, leftFingerCurl = 0, rightFingerCurl = 0, leftFingerSpread = 0, rightFingerSpread = 0, fingerGesture = 'neutral', handGesture = 'none'} = {}) {
        const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
        const allowedHandGestures = new Set(['none', 'open', 'wave', 'point', 'raise', 'shrug', 'talk']);
        const allowedFingerGestures = new Set(['neutral', 'open', 'fist', 'point', 'peace']);
        this.motionTarget = {
            headYaw: THREE.MathUtils.degToRad(clamp(headYaw, -18, 18)), headPitch: THREE.MathUtils.degToRad(clamp(headPitch, -12, 12)), headRoll: THREE.MathUtils.degToRad(clamp(headRoll, -10, 10)), eyeYaw: THREE.MathUtils.degToRad(clamp(eyeYaw, -24, 24)), eyePitch: THREE.MathUtils.degToRad(clamp(eyePitch, -14, 14)),
        };
        const allowedGesture = allowedHandGestures.has(String(handGesture).toLowerCase()) ? String(handGesture).toLowerCase() : 'none';
        const safeFingerGesture = allowedFingerGestures.has(String(fingerGesture).toLowerCase()) ? String(fingerGesture).toLowerCase() : 'neutral';
        const fingerPreset = {neutral: {}, open: {leftFingerCurl: -0.35, rightFingerCurl: -0.35, leftFingerSpread: 0.35, rightFingerSpread: 0.35}, fist: {leftFingerCurl: 1, rightFingerCurl: 1, leftFingerSpread: 0, rightFingerSpread: 0}, point: {leftFingerCurl: 0.85, rightFingerCurl: 0.85, leftFingerSpread: 0, rightFingerSpread: 0}, peace: {leftFingerCurl: 0.7, rightFingerCurl: 0.7, leftFingerSpread: 0.15, rightFingerSpread: 0.15}}[safeFingerGesture];
        const explicitFingerValues = [leftFingerCurl, rightFingerCurl, leftFingerSpread, rightFingerSpread].some((value) => Math.abs(Number(value) || 0) > 0.001);
        const fingerValues = explicitFingerValues ? {leftFingerCurl, rightFingerCurl, leftFingerSpread, rightFingerSpread} : {
            leftFingerCurl: fingerPreset.leftFingerCurl || 0, rightFingerCurl: fingerPreset.rightFingerCurl || 0, leftFingerSpread: fingerPreset.leftFingerSpread || 0, rightFingerSpread: fingerPreset.rightFingerSpread || 0,
        };
        this.handTarget = {
            leftArmLift: clamp(leftArmLift, -1, 1), rightArmLift: clamp(rightArmLift, -1, 1), leftArmSide: clamp(leftArmSide, -1, 1), rightArmSide: clamp(rightArmSide, -1, 1), leftForearmBend: clamp(leftForearmBend, -1, 1), rightForearmBend: clamp(rightForearmBend, -1, 1), leftHandTwist: clamp(leftHandTwist, -1, 1), rightHandTwist: clamp(rightHandTwist, -1, 1),
            leftFingerCurl: clamp(fingerValues.leftFingerCurl, -1, 1), rightFingerCurl: clamp(fingerValues.rightFingerCurl, -1, 1), leftFingerSpread: clamp(fingerValues.leftFingerSpread, -1, 1), rightFingerSpread: clamp(fingerValues.rightFingerSpread, -1, 1), gesture: allowedGesture, fingerGesture: safeFingerGesture,
        };
        this.motionLastUpdate = performance.now();
        this.debugLog('movement requested', {requested: {headYaw, headPitch, headRoll, eyeYaw, eyePitch, leftArmLift, rightArmLift, leftArmSide, rightArmSide, leftForearmBend, rightForearmBend, leftHandTwist, rightHandTwist, leftFingerCurl, rightFingerCurl, leftFingerSpread, rightFingerSpread, fingerGesture, handGesture}, configured: this.getDebugReport().nodes});
        if ((leftFingerCurl || rightFingerCurl || leftFingerSpread || rightFingerSpread || safeFingerGesture !== 'neutral') && !Object.values(this.fingerNodes).some((side) => Object.values(side).some((nodes) => nodes?.length))) this.debugIssue('missing-finger-bones', 'Finger movement requested, but no finger bones were detected.', this.getDebugReport().fingers);
        if (this.debug) console.debug('[avatar debug] movement pose', this.getPoseSnapshot());
    }

    setHandAdjustments({leftArmLift = 0, rightArmLift = 0, leftArmSide = 0, rightArmSide = 0, leftForearmBend = 0, rightForearmBend = 0, leftHandTwist = 0, rightHandTwist = 0, leftFingerCurl = 0, rightFingerCurl = 0, leftFingerSpread = 0, rightFingerSpread = 0, fingerGesture = 'neutral', handGesture = 'none'} = {}) {
        this.setMotion({headYaw: THREE.MathUtils.radToDeg(this.motionTarget.headYaw), headPitch: THREE.MathUtils.radToDeg(this.motionTarget.headPitch), headRoll: THREE.MathUtils.radToDeg(this.motionTarget.headRoll), eyeYaw: THREE.MathUtils.radToDeg(this.motionTarget.eyeYaw), eyePitch: THREE.MathUtils.radToDeg(this.motionTarget.eyePitch), leftArmLift, rightArmLift, leftArmSide, rightArmSide, leftForearmBend, rightForearmBend, leftHandTwist, rightHandTwist, leftFingerCurl, rightFingerCurl, leftFingerSpread, rightFingerSpread, fingerGesture, handGesture});
        this.debugLog('manual hand adjustments', {...this.handTarget});
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
        const normalizedEmotion = String(emotion).toLowerCase();
        const safeEmotion = allowed.has(normalizedEmotion) ? normalizedEmotion : 'neutral';
        const safeIntensity = Math.max(0, Math.min(1, Number(intensity) || 0));
        this.expressionTarget = {emotion: safeEmotion, intensity: safeIntensity};
        const facialCues = {
            neutral: {browLift: 0, browFurrow: 0, eyelidClose: 0},
            happy: {browLift: 0.12, browFurrow: 0, eyelidClose: 0.08},
            sad: {browLift: 0.18, browFurrow: 0, eyelidClose: 0.12},
            angry: {browLift: 0, browFurrow: 0.75, eyelidClose: 0.08},
            surprised: {browLift: 0.95, browFurrow: 0, eyelidClose: 0},
            confused: {browLift: 0.35, browFurrow: 0.25, eyelidClose: 0.04},
        };
        this.facialTarget = Object.fromEntries(
            Object.entries(facialCues[safeEmotion]).map(([key, value]) => [key, value * safeIntensity])
        );
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
            surprised: ['surprise'], confused: [], neutral: []
        }[this.expression.emotion] || [];
        for (const entry of this.expressionMorphs) {
            const matches = keywords.some(keyword => entry.name.toLowerCase().includes(keyword));
            const target = matches ? this.expression.intensity : 0;
            entry.mesh.morphTargetInfluences[entry.index] += (target - entry.mesh.morphTargetInfluences[entry.index]) * blend;
        }
    }

    setBodyMotion({shoulderLift = 0, posture = 0} = {}) {
        const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
        this.bodyTarget = {
            shoulderLift: clamp(shoulderLift, -1, 1),
            posture: clamp(posture, -1, 1),
        };
        this.debugLog('body movement requested', {requested: {...this.bodyTarget}, configured: {spine: this.bodyNodes.spine?.name, leftShoulder: this.bodyNodes.leftShoulder?.name, rightShoulder: this.bodyNodes.rightShoulder?.name}});
        if (posture && !this.bodyNodes.spine) this.debugIssue('missing-spine', 'Posture movement requested, but no spine bone was detected.');
        if (shoulderLift && (!this.bodyNodes.leftShoulder || !this.bodyNodes.rightShoulder)) this.debugIssue('missing-shoulders', 'Shoulder movement requested, but one or both shoulder bones were not detected.', {leftShoulder: this.bodyNodes.leftShoulder?.name, rightShoulder: this.bodyNodes.rightShoulder?.name});
    }

    animateFacialRig() {
        const blend = 0.10;
        for (const key of Object.keys(this.facial)) {
            this.facial[key] += (this.facialTarget[key] - this.facial[key]) * blend;
        }
        const applyMorphs = (entries, value) => {
            for (const entry of entries) {
                const current = entry.mesh.morphTargetInfluences[entry.index] || 0;
                entry.mesh.morphTargetInfluences[entry.index] += (value - current) * blend;
            }
        };
        applyMorphs(this.facialMorphs.browLift, this.facial.browLift);
        applyMorphs(this.facialMorphs.browFurrow, this.facial.browFurrow);
        const blink = Math.max(0, Math.min(1, this.eyeBlinkProgress));
        applyMorphs(this.facialMorphs.eyelid, Math.max(this.facial.eyelidClose, blink));
    }

    animateBody() {
        const now = performance.now();
        const dt = Math.min(0.1, Math.max(0.001, (now - (this.bodyFrameTime || now)) / 1000));
        this.bodyFrameTime = now;
        this.breathingTime += dt;
        const baseSpine = this.motionBase.get(this.bodyNodes.spine);
        this.body.shoulderLift += (this.bodyTarget.shoulderLift - this.body.shoulderLift) * (1 - Math.exp(-dt * 5));
        this.body.posture += (this.bodyTarget.posture - this.body.posture) * (1 - Math.exp(-dt * 4));
        if (this.bodyNodes.spine && baseSpine) {
            // Use a visible but bounded range: the previous 2–5° cue was effectively invisible at this camera distance.
            this.bodyNodes.spine.rotation.x = baseSpine.x + this.body.posture * THREE.MathUtils.degToRad(10) + Math.sin(this.breathingTime * 1.7) * 0.008;
        } else if (this.body.posture) {
            this.debugIssue('body-spine-not-applied', 'Posture is active but could not be applied to a captured spine rotation base.');
        }
        // A shrug is a direct local-Y lift of each clavicle/shoulder bone. Unlike
        // rotating the shoulder, this moves the shoulder and its arm chain visibly
        // up or down without twisting the arm inward or outward. Keep the existing
        // shoulder-Y rotation exclusively for the arm side sweep.
        const shoulderLiftOffset = this.body.shoulderLift * 0.075;
        for (const key of ['leftShoulder', 'rightShoulder']) {
            const node = this.bodyNodes[key];
            const base = this.motionBase.get(node);
            const basePosition = this.motionPositionBase.get(node);
            if (node && base && basePosition) {
                const side = key === 'leftShoulder' ? this.hand.leftArmSide : this.hand.rightArmSide;
                const sideRotation = side * THREE.MathUtils.degToRad(58);
                node.rotation.set(base.x, base.y + sideRotation, base.z);
                node.position.copy(basePosition);
                node.position.y += shoulderLiftOffset;
            } else if (this.body.shoulderLift || this.hand.leftArmSide || this.hand.rightArmSide) {
                this.debugIssue(key + '-not-applied', 'Shoulder movement is active but could not be applied to ' + key + '.');
            }
        }
        this.hand.leftArmLift += (this.handTarget.leftArmLift - this.hand.leftArmLift) * (1 - Math.exp(-dt * 5));
        this.hand.rightArmLift += (this.handTarget.rightArmLift - this.hand.rightArmLift) * (1 - Math.exp(-dt * 5));
        this.hand.leftArmSide += (this.handTarget.leftArmSide - this.hand.leftArmSide) * (1 - Math.exp(-dt * 5));
        this.hand.rightArmSide += (this.handTarget.rightArmSide - this.hand.rightArmSide) * (1 - Math.exp(-dt * 5));
        this.hand.leftForearmBend += (this.handTarget.leftForearmBend - this.hand.leftForearmBend) * (1 - Math.exp(-dt * 6));
        this.hand.rightForearmBend += (this.handTarget.rightForearmBend - this.hand.rightForearmBend) * (1 - Math.exp(-dt * 6));
        this.hand.leftHandTwist += (this.handTarget.leftHandTwist - this.hand.leftHandTwist) * (1 - Math.exp(-dt * 6));
        this.hand.rightHandTwist += (this.handTarget.rightHandTwist - this.hand.rightHandTwist) * (1 - Math.exp(-dt * 6));
        for (const key of ['leftFingerCurl', 'rightFingerCurl', 'leftFingerSpread', 'rightFingerSpread']) {
            this.hand[key] += (this.handTarget[key] - this.hand[key]) * (1 - Math.exp(-dt * 7));
        }
        const applyHandRotation = (key, x, y, z) => {
            const node = this.bodyNodes[key];
            const base = this.motionBase.get(node);
            if (node && base) node.rotation.set(base.x + x, base.y + y, base.z + z);
            else if (this.handTarget[key] || this.handTarget.gesture !== 'none') this.debugIssue(key + '-not-applied', 'Hand movement is active but could not be applied to ' + key + '.');
        };
        const wave = this.handTarget.gesture === 'wave' ? Math.sin(this.motionTime * 5) * 0.25 : 0;
        const talk = this.handTarget.gesture === 'talk' ? Math.sin(this.motionTime * 3.5) * 0.12 : 0;
        const armOverheadAngle = THREE.MathUtils.degToRad(138);
        const leftArmRaise = this.hand.leftArmLift * armOverheadAngle;
        const rightArmRaise = -this.hand.rightArmLift * armOverheadAngle;
        // Side movement is applied to the shoulder Y axis above. Do not add it
        // to the upper-arm Z axis: that would make side and lift identical.
        applyHandRotation('leftArm', this.hand.leftArmLift * 0.10, 0, leftArmRaise - this.hand.leftArmLift * 0.08);
        applyHandRotation('rightArm', this.hand.rightArmLift * 0.10, 0, rightArmRaise + this.hand.rightArmLift * 0.08);
        applyHandRotation('leftForeArm', this.hand.leftForearmBend * 0.9 + talk, 0, 0);
        applyHandRotation('rightForeArm', this.hand.rightForearmBend * 0.9 + talk, 0, 0);
        applyHandRotation('leftHand', 0, this.hand.leftHandTwist * 0.45 + wave, 0);
        applyHandRotation('rightHand', 0, this.hand.rightHandTwist * 0.45 - wave, 0);
        const applyFingerPose = (side, curl, spread, fingerGesture) => {
            const digits = this.fingerNodes[side];
            for (const [digit, nodes] of Object.entries(digits)) {
                let digitCurl = curl;
                if (fingerGesture === 'point') digitCurl = digit === 'index' ? -0.35 : 0.85;
                if (fingerGesture === 'peace') digitCurl = (digit === 'index' || digit === 'middle') ? -0.35 : 0.7;
                (nodes || []).forEach((node, segment) => {
                    const base = this.motionBase.get(node);
                    if (!node || !base) return;
                    const digitSpread = digit === 'thumb' ? spread * 0.45 : spread * (digit === 'index' ? 0.55 : digit === 'pinky' ? -0.55 : 0.15);
                    node.rotation.set(base.x + digitCurl * THREE.MathUtils.degToRad(42), base.y, base.z + (segment === 0 ? digitSpread * THREE.MathUtils.degToRad(18) : 0));
                });
            }
        };
        applyFingerPose('left', this.hand.leftFingerCurl, this.hand.leftFingerSpread, this.handTarget.fingerGesture);
        applyFingerPose('right', this.hand.rightFingerCurl, this.hand.rightFingerSpread, this.handTarget.fingerGesture);
        if (this.debug && this.handTarget.gesture !== 'none' && now - this.debugLastReportAt > 1000) {
            this.debugLastReportAt = now;
            this.debugLog('hand movement applied', {gesture: this.handTarget.gesture, values: {...this.hand}, nodes: this.getDebugReport().nodes});
        }
        if (this.debug && (this.bodyTarget.shoulderLift || this.bodyTarget.posture) && now - this.debugLastReportAt > 1000) {
            this.debugLastReportAt = now;
            this.debugLog('body movement applied', {values: {...this.body}, nodes: this.getDebugReport().nodes});
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