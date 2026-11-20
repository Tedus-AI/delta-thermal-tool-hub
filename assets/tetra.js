/* Delta 3D mark: a regular tetrahedron with filleted edges, the Delta mark on
   each face, spinning about the vertical axis through its apex. The mark is
   drawn analytically in the fragment shader (ring + disc fitted to
   assets/hub-mark.png), so it stays smooth at any size and can be lit with
   keyboard-style RGB effects in the Delta colours.

   Classic script (works from file:// too); three.js is loaded on demand.
     DeltaTetra.mount(canvas, { radius, period, mode, pitch, distance })
       -> Promise<{ setRadius, setPeriod, setMode, setYaw, setPitch, state }>
   Modes: "static" (white), "wave" (流光), "breathe" (呼吸), "comet" (追光). */
(function () {
  const THREE_URL =
    "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js";
  const MODES = { static: 0, wave: 1, breathe: 2, comet: 3 };
  const BLUE = "#0a84d8";
  let threePromise = null;
  const loadThree = () => (threePromise ||= import(THREE_URL));

  // ---- geometry: rounded regular tetrahedron, edge length 1 --------------
  function buildGeometry(THREE, r) {
    const L = 1,
      H = Math.sqrt(2 / 3) * L,
      R0 = L / Math.sqrt(3),
      INR = L / (2 * Math.sqrt(6));
    const outer = [new THREE.Vector3(0, (3 * H) / 4, 0)];
    for (let i = 0; i < 3; i++) {
      const t = ((i * 2 - 1) * Math.PI) / 3;
      outer.push(new THREE.Vector3(R0 * Math.sin(t), -H / 4, R0 * Math.cos(t)));
    }
    // first index = the corner the mark's apex points to
    const FACES = [
      [0, 1, 2],
      [0, 2, 3],
      [0, 3, 1],
      [1, 3, 2],
    ];
    r = Math.max(0, Math.min(r, INR * 0.98));
    const s = (INR - r) / INR;
    const inner = outer.map((v) => v.clone().multiplyScalar(s));
    const normals = FACES.map(([a, b, c]) => {
      const n = new THREE.Vector3()
        .subVectors(outer[b], outer[a])
        .cross(new THREE.Vector3().subVectors(outer[c], outer[a]))
        .normalize();
      return n.dot(outer[a]) < 0 ? n.negate() : n;
    });
    const flat = { pos: [], nor: [], uv: [] },
      round = { pos: [], nor: [] };
    // UV frame: equilateral triangle, apex (0.5, 1), base v = 0
    const LOGO = [
      [0.5, 1],
      [0, 0],
      [1, 0],
    ];
    FACES.forEach(([a, b, c], f) => {
      const n = normals[f];
      const [A, B, C] = [a, b, c].map((i) => outer[i]);
      const v0 = B.clone().sub(A),
        v1 = C.clone().sub(A);
      const d00 = v0.dot(v0),
        d01 = v0.dot(v1),
        d11 = v1.dot(v1),
        den = d00 * d11 - d01 * d01;
      for (const i of [a, b, c]) {
        const p = inner[i].clone().addScaledVector(n, r);
        const v2 = p.clone().sub(A);
        const d20 = v2.dot(v0),
          d21 = v2.dot(v1);
        const wb = (d11 * d20 - d01 * d21) / den,
          wc = (d00 * d21 - d01 * d20) / den,
          wa = 1 - wb - wc;
        flat.pos.push(p.x, p.y, p.z);
        flat.nor.push(n.x, n.y, n.z);
        flat.uv.push(
          wa * LOGO[0][0] + wb * LOGO[1][0] + wc * LOGO[2][0],
          wa * LOGO[0][1] + wb * LOGO[1][1] + wc * LOGO[2][1],
        );
      }
    });
    if (r > 0) {
      const push = (c, n) => {
        round.pos.push(c.x + n.x * r, c.y + n.y * r, c.z + n.z * r);
        round.nor.push(n.x, n.y, n.z);
      };
      const slerp = (n1, n2, t) => {
        const ang = n1.angleTo(n2),
          so = Math.sin(ang);
        return n1
          .clone()
          .multiplyScalar(Math.sin((1 - t) * ang) / so)
          .addScaledVector(n2, Math.sin(t * ang) / so);
      };
      const SEG = 12;
      for (let f1 = 0; f1 < 4; f1++)
        for (let f2 = f1 + 1; f2 < 4; f2++) {
          const [p, q] = FACES[f1]
            .filter((i) => FACES[f2].includes(i))
            .map((i) => inner[i]);
          for (let k = 0; k < SEG; k++) {
            const a = slerp(normals[f1], normals[f2], k / SEG),
              b = slerp(normals[f1], normals[f2], (k + 1) / SEG);
            push(p, a), push(q, a), push(q, b), push(p, a), push(q, b), push(p, b);
          }
        }
      const DIV = 8;
      for (let v = 0; v < 4; v++) {
        const ns = FACES.map((f, i) => (f.includes(v) ? normals[i] : null)).filter(Boolean);
        const P = (i, j) =>
          new THREE.Vector3()
            .addScaledVector(ns[0], DIV - i - j)
            .addScaledVector(ns[1], i)
            .addScaledVector(ns[2], j)
            .normalize();
        for (let i = 0; i < DIV; i++)
          for (let j = 0; j < DIV - i; j++) {
            push(inner[v], P(i, j)), push(inner[v], P(i + 1, j)), push(inner[v], P(i, j + 1));
            if (j < DIV - i - 1)
              push(inner[v], P(i + 1, j)), push(inner[v], P(i + 1, j + 1)), push(inner[v], P(i, j + 1));
          }
      }
    }
    const make = (o, uv) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(o.pos, 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(o.nor, 3));
      if (uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(o.uv, 2));
      return g;
    };
    return { flat: make(flat, true), round: make(round, false) };
  }

  // ---- shader: Delta mark + RGB lighting -----------------------------------
  const MARK_GLSL = /* glsl */ `
    uniform float uTime;
    uniform int uMode;
    vec3 gMarkCol; float gMarkA; float gGlow;
    vec3 dLin(vec3 c) { return pow(c, vec3(2.2)); }
    // Delta blue -> teal -> lime -> white, cyclic
    vec3 dPal(float x) {
      x = fract(x) * 4.0;
      // blue is lifted toward white so it still reads on the blue face
      vec3 c0 = dLin(vec3(0.33, 0.70, 0.95)), c1 = dLin(vec3(0.39, 0.84, 0.84)),
           c2 = dLin(vec3(0.73, 0.92, 0.37)), c3 = vec3(1.0);
      if (x < 1.0) return mix(c0, c1, x);
      if (x < 2.0) return mix(c1, c2, x - 1.0);
      if (x < 3.0) return mix(c2, c3, x - 2.0);
      return mix(c3, c0, x - 3.0);
    }
    void deltaMark(vec2 uv, vec3 face) {
      // uv -> hub-mark.png pixel frame (apex 256,1; base y 383; x 35..476)
      vec2 P = vec2(uv.x * 441.0 + 35.0, (1.0 - uv.y) * 381.92 + 1.0);
      vec2 d0 = P - vec2(237.2, 258.8);
      float cs = cos(-0.75), sn = sin(-0.75);
      vec2 q = vec2(d0.x * cs + d0.y * sn, -d0.x * sn + d0.y * cs);
      float sd = (length(q / vec2(113.9, 67.1)) - 1.0) * sqrt(113.9 * 67.1);
      float a1 = fwidth(sd) * 0.75 + 1e-3;
      float ring = 1.0 - smoothstep(-a1, a1, abs(sd) - 8.25);
      vec2 dc = P - vec2(296.05, 284.85);
      float dd = length(dc) - 51.4;
      float a2 = fwidth(dd) * 0.75 + 1e-3;
      float disc = 1.0 - smoothstep(-a2, a2, dd);
      float ang = atan(q.y / 67.1, q.x / 113.9) / 6.2831853 + 0.5;
      float rd = length(dc) / 51.4;
      float t = uTime;
      vec3 white = vec3(1.0);
      vec3 rc = white, dcol = white; gGlow = 0.0;
      if (uMode == 1) {            // 流光 wave: colours flow around the ring
        rc = dPal(ang - t * 0.12);
        dcol = dPal(0.42 - t * 0.12 + rd * 0.18);
        gGlow = 0.85;
      } else if (uMode == 2) {     // 呼吸 breathe: one colour per breath
        float ph = t / 3.2;
        float b = pow(sin(3.14159 * fract(ph)), 2.0);
        vec3 c = dPal(floor(ph) * 0.25);
        rc = dcol = mix(face * 1.25, c, 0.25 + 0.75 * b);
        gGlow = 0.25 + 0.9 * b;
      } else if (uMode == 3) {     // 追光 comet on the ring + ripples in the disc
        float head = fract(t * 0.28);
        float dist = fract(head - ang);
        float tail = exp(-dist * 5.0);
        vec3 c = dPal(0.75 - min(dist, 1.0) * 0.75);
        rc = mix(mix(face, white, 0.35), c, tail);
        float wave = 0.5 + 0.5 * cos(6.2831853 * (rd * 1.4 - t * 0.7));
        dcol = mix(dPal(0.75 - t * 0.1), dPal(0.25 - t * 0.1), wave);
        gGlow = 0.35 + 0.65 * max(tail * ring, disc * (0.5 + 0.5 * wave));
      }
      gMarkA = max(ring, disc);
      gMarkCol = disc > ring ? dcol : rc;
    }
  `;

  function makeMaterials(THREE, uniforms) {
    const base = {
      color: new THREE.Color(BLUE),
      roughness: 0.42,
      metalness: 0,
      specularIntensity: 0.45,
      side: THREE.DoubleSide,
    };
    // 1x1 white map, only so the face mesh gets a UV varying (vMapUv)
    const px = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    px.needsUpdate = true;
    const face = new THREE.MeshPhysicalMaterial({ ...base, map: px });
    face.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.uTime;
      shader.uniforms.uMode = uniforms.uMode;
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\n" + MARK_GLSL)
        .replace(
          "#include <map_fragment>",
          `#include <map_fragment>
           deltaMark(vMapUv, diffuseColor.rgb);
           diffuseColor.rgb = mix(diffuseColor.rgb, gMarkCol, gMarkA);`,
        )
        .replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
           totalEmissiveRadiance += gMarkCol * gMarkA * gGlow;`,
        );
    };
    const edge = new THREE.MeshPhysicalMaterial(base);
    return { face, edge };
  }

  async function mount(canvas, opts = {}) {
    const THREE = await loadThree();
    const state = {
      radius: opts.radius ?? 0.005,
      period: opts.period ?? 50,
      mode: opts.mode ?? "wave",
      pitch: opts.pitch ?? 0,
      yaw: opts.yaw ?? 0,
      playing: opts.playing ?? true,
    };
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    const scene = new THREE.Scene();
    const key = new THREE.DirectionalLight(0xffffff, 1.3);
    key.position.set(-2, 3, 4);
    const fill = new THREE.DirectionalLight(0xcfefff, 0.5);
    fill.position.set(3, -1, 2);
    scene.add(key, fill, new THREE.HemisphereLight(0xffffff, 0xbfdcea, 0.9));
    // Narrow lens from further away: near-orthographic, so the spin about the
    // vertical apex axis reads straight (a close camera exaggerates the
    // perspective and makes it look like it wobbles).
    const FOV = opts.fov ?? 16;
    const fit = opts.fit ?? 1;
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 40);
    const tilt = new THREE.Group(),
      spin = new THREE.Group();
    tilt.add(spin);
    scene.add(tilt);
    // Frame the front view exactly: with fit = 1 the three (rounded) corners of
    // the front face touch the edge of the round frame. Solved with perspective:
    // apex (0, ya, 0) and base corners (±k/2, yb, zb) must all project onto a
    // circle of radius tan(fov/2)*fit centred on the view axis.
    function frameFront() {
      const H = Math.sqrt(2 / 3);
      const k = (0.75 * H - 2 * state.radius) / (0.75 * H); // corner recession
      const ya = 0.75 * H * k,
        yb = -0.25 * H * k,
        zb = (0.5 / Math.sqrt(3)) * k,
        t = Math.tan((FOV * Math.PI) / 360) * fit;
      const m = ya - t * zb;
      const c = (m * m - 0.25 * k * k - yb * yb) / (2 * (yb - m));
      spin.position.y = c;
      camera.position.set(0, 0, (ya + c) / t);
    }
    const uniforms = { uTime: { value: 0 }, uMode: { value: MODES[state.mode] || 0 } };
    const mats = makeMaterials(THREE, uniforms);
    let meshes = [];
    function rebuild() {
      meshes.forEach((m) => (spin.remove(m), m.geometry.dispose()));
      const g = buildGeometry(THREE, state.radius);
      meshes = [new THREE.Mesh(g.flat, mats.face), new THREE.Mesh(g.round, mats.edge)];
      meshes.forEach((m) => spin.add(m));
    }
    rebuild();
    frameFront();
    function resize() {
      const w = canvas.clientWidth || 1,
        h = canvas.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    new ResizeObserver(resize).observe(canvas);
    let last = null,
      time = 0;
    function frame(now) {
      const dt = last === null ? 0 : Math.min(now - last, 80) / 1000;
      last = now;
      if (state.playing) {
        state.yaw += dt * ((2 * Math.PI) / state.period);
        time += dt;
      }
      uniforms.uTime.value = time;
      spin.rotation.y = state.yaw;
      tilt.rotation.x = state.pitch;
      renderer.render(scene, camera);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    return {
      state,
      setRadius(r) {
        state.radius = r;
        rebuild();
        frameFront();
      },
      setPeriod(s) {
        state.period = s;
      },
      setMode(m) {
        state.mode = m;
        uniforms.uMode.value = MODES[m] || 0;
      },
      setTime(t) {
        time = t;
      },
      setYaw(y) {
        state.yaw = y;
      },
      setPitch(p) {
        state.pitch = p;
      },
    };
  }

  window.DeltaTetra = { mount, MODES: Object.keys(MODES) };
})();
