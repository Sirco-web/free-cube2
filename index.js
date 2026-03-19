// index.js (ES module) - Sirco Engine (compact single-file engine)
// NOTE: Designed to be linked like: <script type="module" src=".../index.js?game=/game.js"></script>

const __engine = (() => {
  // --- Utilities ---
  class Vec2 { constructor(x=0,y=0){this.x=x;this.y=y}
    add(v){this.x+=v.x;this.y+=v.y;return this}
    sub(v){this.x-=v.x;this.y-=v.y;return this}
    mul(s){this.x*=s;this.y*=s;return this}
    clone(){return new Vec2(this.x,this.y)}
  }
  class Vec3 { constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z}
    clone(){return new Vec3(this.x,this.y,this.z)}
  }

  // --- Engine core ---
  // --- Image Processing & Color Keying ---
  class ImageProcessor {
    static async processImage(img, options={}){
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      // Color keying: remove specified colors
      if(options.colorKey){
        const keyR = options.colorKey[0], keyG = options.colorKey[1], keyB = options.colorKey[2];
        const threshold = options.threshold || 10;
        for(let i=0; i<data.length; i+=4){
          const r = data[i], g = data[i+1], b = data[i+2];
          const dist = Math.hypot(r-keyR, g-keyG, b-keyB);
          if(dist < threshold) data[i+3] = 0; // make transparent
        }
      }
      // Greyscale conversion
      if(options.greyscale){
        for(let i=0; i<data.length; i+=4){
          const grey = 0.299*data[i] + 0.587*data[i+1] + 0.114*data[i+2];
          data[i] = data[i+1] = data[i+2] = grey;
        }
      }
      // Color tint
      if(options.tint){
        const tr = options.tint[0], tg = options.tint[1], tb = options.tint[2];
        for(let i=0; i<data.length; i+=4){
          data[i] = Math.min(255, data[i] * tr);
          data[i+1] = Math.min(255, data[i+1] * tg);
          data[i+2] = Math.min(255, data[i+2] * tb);
        }
      }
      ctx.putImageData(imgData, 0, 0);
      const newImg = new Image();
      newImg.src = canvas.toDataURL();
      return newImg;
    }
    static async removeWhiteBackground(img, threshold=5){
      return this.processImage(img, {colorKey: [255,255,255], threshold});
    }
    static async removeColor(img, r, g, b, threshold=10){
      return this.processImage(img, {colorKey: [r,g,b], threshold});
    }
    static toCanvas(img){
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      return c;
    }
  }

  class ResourceLoader {
    constructor(){ this.cache = new Map(); this.textures = new Map(); }
    async fetchText(url){ if(this.cache.has(url)) return this.cache.get(url);
      const r = await fetch(url); const t = await r.text(); this.cache.set(url,t); return t;
    }
    async fetchJSON(url){ if(this.cache.has(url)) return this.cache.get(url);
      const r = await fetch(url); const j = await r.json(); this.cache.set(url,j); return j;
    }
    async loadImage(url, options={}){ 
      const cacheKey = url + JSON.stringify(options);
      if(this.cache.has(cacheKey)) return this.cache.get(cacheKey);
      const img = new Image();
      const p = new Promise((res,rej)=>{ img.onload=()=>res(img); img.onerror=rej; });
      img.src = url; img.crossOrigin = 'anonymous';
      let im = await p;
      if(options.removeWhite) im = await ImageProcessor.removeWhiteBackground(im, options.threshold);
      if(options.removeColor) im = await ImageProcessor.removeColor(im, options.removeColor[0], options.removeColor[1], options.removeColor[2], options.threshold);
      if(options.tint) im = await ImageProcessor.processImage(im, {tint: options.tint});
      this.cache.set(cacheKey, im); 
      return im;
    }
    async loadAudio(url){ if(this.cache.has(url)) return this.cache.get(url);
      const a = new Audio(url); a.preload='auto'; this.cache.set(url,a); return a;
    }
    createGLTexture(gl, img){
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.generateMipmap(gl.TEXTURE_2D);
      return tex;
    }
    // --- ENHANCED ASSET LOADING (added after existing methods) ---
    async loadAssets(assetList, onProgress=null) {
      const results = new Map();
      const total = assetList.length;
      let loaded = 0;
      
      for(const asset of assetList) {
        try {
          let result;
          if(asset.type === 'image') {
            result = await this.loadImage(asset.url, asset.options || {});
          } else if(asset.type === 'audio') {
            result = await this.loadAudio(asset.url);
          } else if(asset.type === 'json') {
            result = await this.fetchJSON(asset.url);
          } else if(asset.type === 'text') {
            result = await this.fetchText(asset.url);
          }
          results.set(asset.name || asset.url, result);
          loaded++;
          if(onProgress) onProgress(loaded, total, asset.url);
        } catch(err) {
          console.warn(`[ResourceLoader] Failed to load ${asset.type} "${asset.url}": ${err.message}`);
          results.set(asset.name || asset.url, null);
          loaded++;
          if(onProgress) onProgress(loaded, total, asset.url, err);
        }
      }
      return results;
    }
    clearCache() { this.cache.clear(); this.textures.clear(); }
    getCacheStats() { return {items: this.cache.size, textures: this.textures.size}; }
  }

  class Input {
    constructor(canvas){
      this.keys = new Set();
      this.mouse = {x:0,y:0,down:false,dx:0,dy:0,wheel:0};
      this.onKeyDown = null; // Callback for key down events
      
      window.addEventListener('keydown', e=>{
        this.keys.add(e.key);
        if(this.onKeyDown) this.onKeyDown(e.key);
      });
      window.addEventListener('keyup', e=>this.keys.delete(e.key));
      canvas.addEventListener('mousemove', e=>{
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (canvas.width/rect.width);
        const y = (e.clientY - rect.top) * (canvas.height/rect.height);
        this.mouse.dx = x - this.mouse.x; this.mouse.dy = y - this.mouse.y;
        this.mouse.x = x; this.mouse.y = y;
      });
      canvas.addEventListener('mousedown', ()=>this.mouse.down=true);
      canvas.addEventListener('mouseup', ()=>this.mouse.down=false);
      canvas.addEventListener('wheel', e=>{ this.mouse.wheel = e.deltaY; });
    }
    isDown(key){ return this.keys.has(key) }
    consumeWheel(){ const w=this.mouse.wheel; this.mouse.wheel=0; return w; }
  }

  // --- Simple ECS ---
  let _nextEntityId = 1;
  class Entity {
    constructor(name='') { this.id = _nextEntityId++; this.name=name; this.components = {}; this._transform = null; }
    add(c){ this.components[c.constructor.name] = c; if(c.constructor.name === 'Transform') { this._transform = c; } return this; }
    get(type){ return this.components[type.name || type]; }
    get transform() { if(!this._transform) { this._transform = new Transform(); this.add(this._transform); } return this._transform; }
  }
  class Scene {
    constructor(){ this.entities = new Map(); }
    create(name){ const e = new Entity(name); this.entities.set(e.id, e); return e; }
    add(e){ this.entities.set(e.id, e); return e; }
    remove(e){ this.entities.delete(e.id); }
    findByName(name){ for(const e of this.entities.values()) if(e.name===name) return e; return null; }
  }

  // --- Transform / components ---
  class Transform { constructor(){ this.pos = new Vec3(); this.rot = new Vec3(); this.scale = new Vec3(1,1,1); this.parent = null; this.children = []; } 
    addChild(child){ this.children.push(child); child.parent = this; return this; }
  }
  class Sprite { 
    constructor(url){ 
      this.url = url; 
      this.img = null; 
      this.w=64; 
      this.h=64; 
      this.layer = 0;
      this.opacity = 1;
      this.flipX = false;
      this.flipY = false;
      this.tint = [1,1,1,1];
      this._gltex = null;
    }
  }
  class SpriteRenderer {
    constructor(options={}){
      this.sprites = [];
      this.sortingOrder = options.sortingOrder || 0;
      this.material = options.material || null;
      this.enabled = true;
    }
    addSprite(sprite){ this.sprites.push({...sprite, renderer: this}); }
  }
  class SpriteLayer {
    constructor(layerId=0){
      this.layerId = layerId;
      this.sprites = [];
      this.visible = true;
    }
    addSprite(sprite, depth=0){ this.sprites.push({sprite, depth}); this.sprites.sort((a,b)=>a.depth-b.depth); }
    clear(){ this.sprites = []; }
  }
  class Canvas2DRenderer {
    constructor(options={}){
      this.drawables = [];
      this.transparency = options.transparency ?? true;
    }
    draw(ctx, item){ ctx.fillStyle = item.color; ctx.fillRect(item.x, item.y, item.w, item.h); }
  }
  class Animator {
    constructor(options={}){
      this.frames = options.frames || [];
      this.frameTime = options.frameTime || 0.1;
      this.currentFrame = 0;
      this.elapsed = 0;
      this.loop = options.loop ?? true;
      this.isPlaying = false;
    }
    play(){ this.isPlaying = true; this.elapsed = 0; this.currentFrame = 0; }
    stop(){ this.isPlaying = false; }
    update(dt){
      if(!this.isPlaying) return;
      this.elapsed += dt;
      if(this.elapsed >= this.frameTime){
        this.elapsed = 0;
        this.currentFrame++;
        if(this.currentFrame >= this.frames.length){
          if(this.loop) this.currentFrame = 0;
          else this.isPlaying = false;
        }
      }
    }
    getCurrentFrame(){ return this.frames[this.currentFrame] || null; }
  }
  class Tilemap {
    constructor(width, height, tileSize=32){
      this.width = width;
      this.height = height;
      this.tileSize = tileSize;
      this.tiles = new Array(width*height).fill(0);
      this.tilesets = new Map();
    }
    setTile(x, y, id){ if(x>=0&&y>=0&&x<this.width&&y<this.height) this.tiles[y*this.width+x] = id; }
    getTile(x, y){ return this.tiles[y*this.width+x] || 0; }
    registerTileset(name, img){ this.tilesets.set(name, img); }
  }
  class Particle {
    constructor(x, y, vx, vy, life=1){
      this.x = x; this.y = y;
      this.vx = vx; this.vy = vy;
      this.life = life;
      this.maxLife = life;
      this.color = [1,1,1,1];
      this.size = 2;
    }
    update(dt){ this.life -= dt; this.x += this.vx*dt; this.y += this.vy*dt; }
    isAlive(){ return this.life > 0; }
  }
  class ParticleEmitter {
    constructor(x, y, options={}){
      this.x = x; this.y = y;
      this.particles = [];
      this.emissionRate = options.emissionRate || 10;
      this.lifetime = options.lifetime || 1;
      this.speed = options.speed || {min: 50, max: 150};
      this.emitTimer = 0;
      this.enabled = true;
    }
    update(dt){
      if(!this.enabled) return;
      this.emitTimer += dt;
      const emitCount = Math.floor(this.emitTimer * this.emissionRate);
      for(let i=0; i<emitCount; i++){
        const angle = Math.random() * Math.PI * 2;
        const speed = this.speed.min + Math.random() * (this.speed.max - this.speed.min);
        const p = new Particle(this.x, this.y, Math.cos(angle)*speed, Math.sin(angle)*speed, this.lifetime);
        this.particles.push(p);
      }
      this.emitTimer -= emitCount / this.emissionRate;
      this.particles = this.particles.filter(p=>{ p.update(dt); return p.isAlive(); });
    }
  }
  class TextRenderer {
    constructor(options={}){
      this.text = options.text || '';
      this.font = options.font || '16px Arial';
      this.color = options.color || '#ffffff';
      this.align = options.align || 'center';
      this.baseline = options.baseline || 'middle';
    }
  }
  class Camera2D { 
    constructor(){ 
      this.x=0; this.y=0; this.zoom=1;
      this.followTarget = null;
      this.followSpeed = 5;
    }
    update(dt){
      if(this.followTarget){
        const tx = this.followTarget.x || this.followTarget.pos?.x || 0;
        const ty = this.followTarget.y || this.followTarget.pos?.y || 0;
        this.x += (tx - this.x) * this.followSpeed * dt;
        this.y += (ty - this.y) * this.followSpeed * dt;
      }
    }
  }
  class PhysicsBody2D { constructor({w=32,h=32,mass=1,isStatic=false}={}){ this.w=w; this.h=h; this.v=new Vec2(); this.mass=mass; this.isStatic=isStatic; this.gravity=500; this.angularVelocity=0; this.torque=0; this.inertia=0 } }

  // --- Physics (very small 2D integrator + AABB collision) ---
  class Physics2D {
    constructor(scene){ this.scene = scene; this.dtAcc=0; }
    step(dt){
      // integrate velocities & positions for entities with PhysicsBody2D and Transform
      for(const e of this.scene.entities.values()){
        const t = e.get(Transform), p = e.get(PhysicsBody2D);
        if(!t || !p) continue;
        if(!p.isStatic){
          p.v.y += p.gravity * dt;
          t.pos.x += p.v.x * dt;
          t.pos.y += p.v.y * dt;
        }
      }
      // simple collision resolution (AABB vs AABB)
      const arr = Array.from(this.scene.entities.values()).filter(e=>e.get(PhysicsBody2D) && e.get(Transform));
      for(let i=0;i<arr.length;i++) for(let j=i+1;j<arr.length;j++){
        const A=arr[i], B=arr[j];
        const ta=A.get(Transform), tb=B.get(Transform), pa=A.get(PhysicsBody2D), pb=B.get(PhysicsBody2D);
        if(pa.isStatic && pb.isStatic) continue;
        const ax1=ta.pos.x - pa.w/2, ax2=ax1+pa.w;
        const ay1=ta.pos.y - pa.h/2, ay2=ay1+pa.h;
        const bx1=tb.pos.x - pb.w/2, bx2=bx1+pb.w;
        const by1=tb.pos.y - pb.h/2, by2=by1+pb.h;
        if(ax1<bx2 && ax2>bx1 && ay1<by2 && ay2>by1){
          // simple push apart along smallest axis
          const ox = Math.min(ax2-bx1, bx2-ax1);
          const oy = Math.min(ay2-by1, by2-ay1);
          if(ox < oy){
            const sign = (ta.pos.x < tb.pos.x) ? -1 : 1;
            if(!pa.isStatic) ta.pos.x -= sign * ox * 0.5;
            if(!pb.isStatic) tb.pos.x += sign * ox * 0.5;
            if(!pa.isStatic) pa.v.x = 0;
            if(!pb.isStatic) pb.v.x = 0;
          } else {
            const sign = (ta.pos.y < tb.pos.y) ? -1 : 1;
            if(!pa.isStatic) ta.pos.y -= sign * oy * 0.5;
            if(!pb.isStatic) tb.pos.y += sign * oy * 0.5;
            if(!pa.isStatic) pa.v.y = 0;
            if(!pb.isStatic) pb.v.y = 0;
          }
        }
      }
    }
  }

  // --- Renderers ---
  class Renderer2D {
    constructor(ctx, resources){
      this.ctx = ctx;  // Can be either WebGL or 2D Canvas context
      this.gl = ctx && ctx.createProgram ? ctx : null;  // Only set gl if it's WebGL
      this.res = resources;
      this.layers = new Map();
      this.spriteBatches = [];
      this.renderQueue = [];
      // Only initialize GL if we have a valid WebGL context
      if(this.gl) {
        this._initGL();
      }
    }
    _initGL(){
      const gl = this.gl;
      const vs = `#version 300 es
      precision highp float;
      layout(location=0) in vec2 aPos;
      layout(location=1) in vec2 aUV;
      layout(location=2) in vec4 aColor;
      layout(location=3) in float aLayer;
      uniform vec2 uResolution;
      uniform vec2 uCamera;
      uniform float uZoom;
      out vec2 vUV;
      out vec4 vColor;
      void main(){
        vec2 p = (aPos - uCamera) * uZoom;
        vec2 ndc = (p / uResolution) * 2.0 - 1.0;
        ndc.y *= -1.0;
        gl_Position = vec4(ndc, aLayer * 0.01, 1.0);
        vUV = aUV;
        vColor = aColor;
      }`;
      const fs = `#version 300 es
      precision mediump float;
      in vec2 vUV;
      in vec4 vColor;
      uniform sampler2D uTex;
      out vec4 outColor;
      void main(){ 
        vec4 texCol = texture(uTex, vUV);
        outColor = texCol * vColor;
        if(outColor.a < 0.01) discard;
      }`;
      const make = (src, type) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s)); return s; };
      const p = gl.createProgram();
      gl.attachShader(p, make(vs, gl.VERTEX_SHADER));
      gl.attachShader(p, make(fs, gl.FRAGMENT_SHADER));
      gl.bindAttribLocation(p,0,'aPos'); gl.bindAttribLocation(p,1,'aUV'); gl.bindAttribLocation(p,2,'aColor'); gl.bindAttribLocation(p,3,'aLayer');
      gl.linkProgram(p); if(!gl.getProgramParameter(p,gl.LINK_STATUS)) console.error(gl.getProgramInfoLog(p));
      this.prog = p;
      this.uResolution = gl.getUniformLocation(p,'uResolution');
      this.uCamera = gl.getUniformLocation(p,'uCamera');
      this.uZoom = gl.getUniformLocation(p,'uZoom');
      this.uTex = gl.getUniformLocation(p,'uTex');
      const quadVerts = new Float32Array([ -0.5,-0.5, 0,1, 0.5,-0.5, 1,1, 0.5,0.5, 1,0, -0.5,0.5, 0,0 ]);
      this.vbo = gl.createBuffer();
      this.vao = gl.createVertexArray();
      gl.bindVertexArray(this.vao); gl.bindBuffer(gl.ARRAY_BUFFER,this.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,2,gl.FLOAT,false,16,0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,2,gl.FLOAT,false,16,8);
      this.indices = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indices);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0,1,2,2,3,0]), gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }
    addLayer(layerId, layer){ this.layers.set(layerId, layer); }
    createLayer(layerId){ const l = new SpriteLayer(layerId); this.layers.set(layerId, l); return l; }
    draw(scene, camera){
      const gl = this.gl;
      gl.useProgram(this.prog);
      gl.uniform2f(this.uResolution, gl.canvas.width, gl.canvas.height);
      gl.uniform2f(this.uCamera, camera.x, camera.y);
      gl.uniform1f(this.uZoom, camera.zoom);
      gl.activeTexture(gl.TEXTURE0); gl.uniform1i(this.uTex, 0);
      gl.bindVertexArray(this.vao);
      const renderItems = [];
      for(const e of scene.entities.values()){
        const spr = e.get(Sprite), t = e.get(Transform);
        if(!spr || !t) continue;
        if(!spr.img && spr.url){
          this.res.loadImage(spr.url).then(img=>{
            spr.img = img;
            spr._gltex = this.res.createGLTexture(gl, img);
            spr.w = img.width; spr.h = img.height;
          }).catch(()=>{});
        }
        renderItems.push({entity: e, sprite: spr, transform: t, layer: spr.layer});
      }
      renderItems.sort((a,b) => a.layer - b.layer || a.transform.pos.y - b.transform.pos.y);
      for(const item of renderItems){
        const {sprite: spr, transform: t} = item;
        if(!spr._gltex){
          if(!this._whiteTex){
            const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,t);
            gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([200,200,200,255]));
            this._whiteTex = t;
          }
          gl.bindTexture(gl.TEXTURE_2D, this._whiteTex);
        } else {
          gl.bindTexture(gl.TEXTURE_2D, spr._gltex);
        }
        const hw = spr.w * t.scale.x; const hh = spr.h * t.scale.y;
        const cx = t.pos.x; const cy = t.pos.y;
        const verts = new Float32Array([
          cx - hw/2, cy - hh/2, spr.flipX ? 1 : 0, spr.flipY ? 0 : 1,
          cx + hw/2, cy - hh/2, spr.flipX ? 0 : 1, spr.flipY ? 0 : 1,
          cx + hw/2, cy + hh/2, spr.flipX ? 0 : 1, spr.flipY ? 1 : 0,
          cx - hw/2, cy + hh/2, spr.flipX ? 1 : 0, spr.flipY ? 1 : 0
        ]);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo); gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
      }
      gl.bindVertexArray(null);
    }
    draw2D(ctx, scene, camera){
      for(const e of scene.entities.values()){
        const spr = e.get(Sprite), t = e.get(Transform), text = e.get(TextRenderer);
        if(spr && spr.img && t){
          const sw = spr.w * t.scale.x;
          const sh = spr.h * t.scale.y;
          const sx = (t.pos.x - camera.x) * camera.zoom;
          const sy = (t.pos.y - camera.y) * camera.zoom;
          ctx.save();
          ctx.globalAlpha = spr.opacity;
          if(spr.flipX) ctx.scale(-1, 1);
          if(spr.flipY) ctx.scale(1, -1);
          ctx.drawImage(spr.img, sx - sw/2, sy - sh/2, sw, sh);
          ctx.restore();
        }
        if(text && t){
          ctx.save();
          ctx.font = text.font;
          ctx.fillStyle = text.color;
          ctx.textAlign = text.align;
          ctx.textBaseline = text.baseline;
          const tx = (t.pos.x - camera.x) * camera.zoom;
          const ty = (t.pos.y - camera.y) * camera.zoom;
          ctx.fillText(text.text, tx, ty);
          ctx.restore();
        }
      }
    }
  }

  // --- Advanced 2D Physics (Box2D-like solver) ---
  class RigidBody2D {
    constructor(options={}){
      this.w = options.w || 32;
      this.h = options.h || 32;
      this.mass = options.mass || 1;
      this.isStatic = options.isStatic || false;
      this.velocity = new Vec2(options.vx || 0, options.vy || 0);
      this.acceleration = new Vec2(0, 0);
      this.angularVelocity = options.angularVelocity || 0;
      this.torque = 0;
      this.rotation = options.rotation || 0;
      this.restitution = options.restitution ?? 0.8;
      this.friction = options.friction ?? 0.3;
      this.gravity = options.gravity ?? 500;
      this.angularDamping = options.angularDamping ?? 0.99;
      this.linearDamping = options.linearDamping ?? 0.99;
      this.inertia = this.isStatic ? Infinity : (this.mass * (this.w * this.w + this.h * this.h)) / 12;
      this.forces = [];
      this.torques = [];
    }
    applyForce(fx, fy){ this.forces.push({x: fx, y: fy}); }
    applyTorque(t){ this.torques.push(t); }
    applyImpulse(ix, iy){ this.velocity.x += ix / this.mass; this.velocity.y += iy / this.mass; }
    getAABB(pos){ return { x1: pos.x - this.w/2, y1: pos.y - this.h/2, x2: pos.x + this.w/2, y2: pos.y + this.h/2 }; }
    clone(){
      return new RigidBody2D({
        w: this.w, h: this.h, mass: this.mass, isStatic: this.isStatic,
        vx: this.velocity.x, vy: this.velocity.y, angularVelocity: this.angularVelocity,
        rotation: this.rotation, restitution: this.restitution, friction: this.friction
      });
    }
  }

  class Physics2DSolver {
    constructor(scene){
      this.scene = scene;
      this.gravity = new Vec2(0, 500);
      this.damping = 0.99;
      this.iterations = 5;
      this.deltaTime = 0;
      this.contacts = [];
    }
    step(dt){
      const bodies = [];
      for(const e of this.scene.entities.values()){
        const t = e.get(Transform);
        const p = e.get(RigidBody2D) || e.get(PhysicsBody2D);
        if(t && p) bodies.push({entity: e, transform: t, body: p});
      }
      // apply forces and gravity
      for(const {body, transform} of bodies){
        if(body.isStatic) continue;
        body.acceleration.x = 0;
        body.acceleration.y = this.gravity.y;
        for(const f of (body.forces || [])){
          body.acceleration.x += f.x / body.mass;
          body.acceleration.y += f.y / body.mass;
        }
        body.velocity.x = (body.velocity?.x || 0) + body.acceleration.x * dt;
        body.velocity.y = (body.velocity?.y || 0) + body.acceleration.y * dt;
        body.velocity.x *= (body.linearDamping ?? this.damping);
        body.velocity.y *= (body.linearDamping ?? this.damping);
        transform.pos.x += body.velocity.x * dt;
        transform.pos.y += body.velocity.y * dt;
        if(body.angularVelocity !== undefined){
          body.angularVelocity = (body.angularVelocity || 0) + (body.torque || 0) / body.inertia * dt;
          body.angularVelocity *= (body.angularDamping ?? 0.99);
          body.rotation = (body.rotation || 0) + body.angularVelocity * dt;
        }
        body.forces = [];
        body.torques = [];
      }
      // collision detection & response (improved)
      this.contacts = [];
      for(let i=0; i<bodies.length; i++) for(let j=i+1; j<bodies.length; j++){
        this._checkCollision(bodies[i], bodies[j]);
      }
      for(let iter=0; iter<this.iterations; iter++){
        for(const contact of this.contacts){
          this._resolveCollision(contact);
        }
      }
    }
    _checkCollision(a, b){
      const aabb_a = a.body.getAABB(a.transform.pos);
      const aabb_b = b.body.getAABB(b.transform.pos);
      if(aabb_a.x1 < aabb_b.x2 && aabb_a.x2 > aabb_b.x1 &&
         aabb_a.y1 < aabb_b.y2 && aabb_a.y2 > aabb_b.y1){
        const contact = {
          entities: [a, b],
          normal: {x: 0, y: 1},
          depth: 0
        };
        this.contacts.push(contact);
      }
    }
    _resolveCollision(contact){
      const [a, b] = contact.entities;
      if(a.body.isStatic && b.body.isStatic) return;
      const dx = b.transform.pos.x - a.transform.pos.x;
      const dy = b.transform.pos.y - a.transform.pos.y;
      const dist = Math.hypot(dx, dy) || 0.01;
      contact.normal.x = dx / dist;
      contact.normal.y = dy / dist;
      const relVel = {
        x: (b.body.velocity?.x || 0) - (a.body.velocity?.x || 0),
        y: (b.body.velocity?.y || 0) - (a.body.velocity?.y || 0)
      };
      const velAlongNormal = relVel.x * contact.normal.x + relVel.y * contact.normal.y;
      if(velAlongNormal >= 0) return;
      const restitution = Math.min(a.body.restitution, b.body.restitution);
      const invMassA = a.body.isStatic ? 0 : 1 / a.body.mass;
      const invMassB = b.body.isStatic ? 0 : 1 / b.body.mass;
      const impulseMag = -(1 + restitution) * velAlongNormal / (invMassA + invMassB);
      const impulse = {
        x: impulseMag * contact.normal.x,
        y: impulseMag * contact.normal.y
      };
      if(!a.body.isStatic){
        a.body.velocity.x -= impulse.x * invMassA;
        a.body.velocity.y -= impulse.y * invMassA;
      }
      if(!b.body.isStatic){
        b.body.velocity.x += impulse.x * invMassB;
        b.body.velocity.y += impulse.y * invMassB;
      }
    }
  }

  // --- 3D Physics (Cannon.js wrapper) ---
  class Physics3DWorld {
    constructor(gravity={x:0, y:-9.82, z:0}){
      this.gravity = gravity;
      this.bodies = new Map();
      this.constraints = [];
      this.bodies3d = [];
    }
    addBody(entity, shape, mass=1, pos=null){
      const body = { entity, mass, shape, position: pos || {x:0, y:0, z:0}, velocity: {x:0, y:0, z:0}, forces: [], isStatic: mass === 0 };
      this.bodies.set(entity.id, body);
      this.bodies3d.push(body);
      return body;
    }
    step(dt){
      for(const body of this.bodies3d){
        if(body.isStatic) continue;
        body.velocity.y += this.gravity.y * dt;
        body.position.x += body.velocity.x * dt;
        body.position.y += body.velocity.y * dt;
        body.position.z += body.velocity.z * dt;
        for(const f of body.forces){
          body.velocity.x += (f.x / body.mass) * dt;
          body.velocity.y += (f.y / body.mass) * dt;
          body.velocity.z += (f.z / body.mass) * dt;
        }
        body.forces = [];
      }
    }
  }

  // --- 3D Renderer with GLTF support ---
  class Mesh {
    constructor(name='mesh'){ this.name=name; this.vertices=[]; this.indices=[]; this.uv=[]; this.normals=[]; }
  }
  class Material {
    constructor(options={}){
      this.name = options.name || 'material';
      this.color = options.color || [1,1,1,1];
      this.roughness = options.roughness ?? 0.8;
      this.metalMask = options.metalMask ?? 0;
      this.emissive = options.emissive || [0,0,0];
      this.map = options.map || null;
      this.normalMap = options.normalMap || null;
    }
  }
  class Renderer3DPBR {
    constructor(gl){
      this.gl = gl;
      this.meshCache = new Map();
      this.materialCache = new Map();
      this._initShaders();
    }
    _initShaders(){
      const gl = this.gl;
      const vs = `#version 300 es
      precision highp float;
      layout(location=0) in vec3 position;
      layout(location=1) in vec3 normal;
      layout(location=2) in vec2 uv;
      uniform mat4 uModel;
      uniform mat4 uView;
      uniform mat4 uProj;
      out vec3 vPos, vNorm;
      out vec2 vUV;
      void main(){
        vPos = (uModel * vec4(position,1.0)).xyz;
        vNorm = normalize((uModel * vec4(normal,0.0)).xyz);
        vUV = uv;
        gl_Position = uProj * uView * vec4(vPos, 1.0);
      }`;
      const fs = `#version 300 es
      precision highp float;
      in vec3 vPos, vNorm;
      in vec2 vUV;
      uniform vec3 uColor;
      uniform float uRoughness;
      uniform sampler2D uAlbedo;
      out vec4 outColor;
      void main(){
        vec3 normal = normalize(vNorm);
        vec3 lightDir = normalize(vec3(1.0,2.0,1.0));
        float diffuse = max(dot(normal, lightDir), 0.0);
        vec3 col = texture(uAlbedo, vUV).rgb * uColor;
        outColor = vec4(col * (0.3 + 0.7*diffuse), 1.0);
      }`;
      const makeShader=(src,type)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);return s;};
      this.prog = gl.createProgram();
      gl.attachShader(this.prog, makeShader(vs, gl.VERTEX_SHADER));
      gl.attachShader(this.prog, makeShader(fs, gl.FRAGMENT_SHADER));
      gl.linkProgram(this.prog);
      this.uniforms = {
        model: gl.getUniformLocation(this.prog, 'uModel'),
        view: gl.getUniformLocation(this.prog, 'uView'),
        proj: gl.getUniformLocation(this.prog, 'uProj'),
        color: gl.getUniformLocation(this.prog, 'uColor'),
        roughness: gl.getUniformLocation(this.prog, 'uRoughness'),
      };
    }
    async loadGLTF(url, loader){
      // Ultra-simplified GLTF loader (real impl would parse JSON+buffers)
      // For now, create a simple cube mesh
      const mesh = new Mesh('model');
      mesh.vertices = [
        -1,-1,-1, 1,-1,-1, 1,1,-1, -1,1,-1,
        -1,-1,1, 1,-1,1, 1,1,1, -1,1,1
      ];
      mesh.indices = [0,1,2,2,3,0,4,6,5,4,7,6,0,4,5,5,1,0,2,6,7,7,3,2,0,3,7,7,4,0,1,5,6,6,2,1];
      mesh.normals = [0,0,-1,0,0,1,0,-1,0,0,1,0,-1,0,0,1,0,0].reduce((a,v,i)=>i%3===0?[...a,v,v,v]:[...a],[]); 
      mesh.uv = new Array(mesh.vertices.length/3).fill(0).flatMap((_,i)=>[i%2,Math.floor(i/2)%2]);
      this.meshCache.set(url, mesh);
      return mesh;
    }
    draw(scene, camera3d){
      const gl = this.gl;
      gl.useProgram(this.prog);
      // Set camera matrices (simplified)
      const view = new Float32Array(16);
      const proj = new Float32Array(16);
      this._identityMatrix(view);
      this._perspectiveMatrix(proj, 45, gl.canvas.width/gl.canvas.height, 0.1, 1000);
      gl.uniformMatrix4fv(this.uniforms.view, false, view);
      gl.uniformMatrix4fv(this.uniforms.proj, false, proj);
      for(const e of scene.entities.values()){
        const t = e.get(Transform);
        const m = e.get(Mesh);
        if(!t || !m) continue;
        const model = new Float32Array(16);
        this._identityMatrix(model);
        gl.uniformMatrix4fv(this.uniforms.model, false, model);
        gl.uniform3f(this.uniforms.color, 1, 1, 1);
      }
    }
    _identityMatrix(m){ for(let i=0;i<16;i++) m[i]=(i%5===0)?1:0; }
    _perspectiveMatrix(out,fov,aspect,near,far){
      const f=1/Math.tan(fov*Math.PI/360);for(let i=0;i<16;i++)out[i]=0;
      out[0]=f/aspect;out[5]=f;out[10]=(far+near)/(near-far);out[11]=-1;out[14]=2*far*near/(near-far);
    }
  }

  // --- Plugin System ---
  class PluginManager {
    constructor(engine){
      this.engine = engine;
      this.plugins = new Map();
      this.modules = new Map();
    }
    register(name, plugin){
      this.plugins.set(name, plugin);
      if(plugin.install) plugin.install(this.engine);
      return this;
    }
    async loadModule(name, url){
      const mod = await import(url);
      this.modules.set(name, mod.default || mod);
      return this.modules.get(name);
    }
    get(name){ return this.plugins.get(name) || this.modules.get(name); }
    unload(name){ this.plugins.delete(name); this.modules.delete(name); }
  }

  // --- Multiplayer State Snapshotting ---
  class NetworkSnapshot {
    constructor(){
      this.frame = 0;
      this.entities = {};
      this.timestamp = performance.now();
    }
    captureState(scene){
      for(const e of scene.entities.values()){
        const t = e.get(Transform);
        if(t) this.entities[e.id] = {
          pos: {x:t.pos.x, y:t.pos.y, z:t.pos.z},
          rot: {x:t.rot.x, y:t.rot.y, z:t.rot.z},
          scale: {x:t.scale.x, y:t.scale.y, z:t.scale.z}
        };
      }
    }
    restoreState(scene){
      for(const eid in this.entities){
        const e = Array.from(scene.entities.values()).find(en=>en.id==eid);
        if(e){
          const t = e.get(Transform);
          if(t) Object.assign(t.pos, this.entities[eid].pos);
        }
      }
    }
  }

  class RollbackManager {
    constructor(maxSnapshots=60){
      this.snapshots = [];
      this.maxSnapshots = maxSnapshots;
      this.frame = 0;
    }
    captureSnapshot(scene){
      const snap = new NetworkSnapshot();
      snap.frame = this.frame++;
      snap.captureState(scene);
      this.snapshots.push(snap);
      if(this.snapshots.length > this.maxSnapshots) this.snapshots.shift();
      return snap;
    }
    rollbackToFrame(scene, frameNum){
      const snap = this.snapshots.find(s=>s.frame===frameNum);
      if(snap) snap.restoreState(scene);
    }
    getLatestSnapshot(){ return this.snapshots[this.snapshots.length-1] || null; }
  }

  // --- Prefab / Scene System (Unity-like) ---
  class Prefab {
    constructor(name, template){
      this.name = name;
      this.template = template; // { components: {...}, children: [...] }
    }
    static fromJSON(json){
      return new Prefab(json.name, json.template);
    }
    toJSON(){
      return { name: this.name, template: this.template };
    }
    instantiate(scene, parent=null){
      const entity = scene.create(this.template.name || this.name);
      if(parent) parent.add(entity);
      for(const compData of (this.template.components || [])){
        const CompClass = window[compData.type] || (eval(compData.type));
        if(CompClass) entity.add(new CompClass(compData.data));
      }
      for(const childPrefabData of (this.template.children || [])){
        const childPrefab = Prefab.fromJSON(childPrefabData);
        childPrefab.instantiate(scene, entity);
      }
      return entity;
    }
  }

  class SceneManager {
    constructor(engine){
      this.engine = engine;
      this.scenes = new Map();
      this.currentScene = null;
      this.assetImporter = new AssetImporter(engine);
    }
    createScene(name){
      const s = new Scene();
      this.scenes.set(name, s);
      return s;
    }
    loadScene(name, callback){
      if(this.scenes.has(name)){
        this.currentScene = this.scenes.get(name);
        if(callback) callback(this.currentScene);
        return this.currentScene;
      }
      return null;
    }
    async loadFromJSON(sceneJson){
      const scene = this.createScene(sceneJson.name);
      for(const entityData of (sceneJson.entities || [])){
        const e = scene.create(entityData.name);
        for(const comp of (entityData.components || [])){
          const CompClass = window[comp.type];
          if(CompClass){
            const instance = new CompClass(comp.data);
            e.add(instance);
          }
        }
      }
      return scene;
    }
    async importFromUnity(unityJsonUrl){
      const json = await this.engine.resources.fetchJSON(unityJsonUrl);
      return this.loadFromJSON(json);
    }
    saveSceneToJSON(scene){
      const entities = [];
      for(const e of scene.entities.values()){
        const comps = [];
        for(const compName in e.components){
          comps.push({type: compName, data: e.components[compName]});
        }
        entities.push({name: e.name, components: comps});
      }
      return {name: scene.name || 'Scene', entities};
    }
  }

  class AssetImporter {
    constructor(engine){
      this.engine = engine;
      this.importedAssets = new Map();
    }
    async importUnityPackage(url){
      // Parse unity package manifest and load assets
      const manifest = await this.engine.resources.fetchJSON(url);
      const assets = new Map();
      for(const asset of (manifest.assets || [])){
        if(asset.type === 'Texture2D'){
          assets.set(asset.name, await this.engine.resources.loadImage(asset.path));
        } else if(asset.type === 'Model' || asset.type === 'Mesh'){
          const meshData = await this.engine.resources.fetchJSON(asset.path);
          assets.set(asset.name, meshData);
        }
      }
      return assets;
    }
    createSpriteFromUnityTexture(texture, spriteData){
      const spr = new Sprite(texture);
      spr.w = spriteData.width || texture.width;
      spr.h = spriteData.height || texture.height;
      return spr;
    }
  }

  class AudioManager {
    constructor(res){ 
      this.res = res; 
      this.sfx = new Map(); 
      this.background = null;
    }
    async play(url, opts={loop:false,volume:1}){
      const a = await this.res.loadAudio(url);
      a.loop = opts.loop; a.volume = opts.volume ?? 1; a.currentTime = 0; a.play();
      return a;
    }
    playBackground(url, volume=1){
      this.background = new Audio(url);
      this.background.loop = true;
      this.background.volume = volume;
      this.background.play();
      return this.background;
    }
    stopBackground(){
      if(this.background) this.background.pause();
    }
  }

  // --- ADVANCED UTILITIES FOR BEGINNERS & EXPERTS ---
  
  // Debug & Error Handler
  class Debug {
    static assert(condition, message) {
      if (!condition) throw new Error(`Assertion failed: ${message}`);
    }
    static log(msg, tag = 'DEBUG') { console.log(`[${tag}] ${msg}`); }
    static warn(msg) { console.warn(`⚠️ ${msg}`); }
    static error(msg) { console.error(`❌ ${msg}`); }
    static validateEntity(entity) {
      if (!entity || !entity.get) {
        Debug.error('Invalid entity! Must have .get() method');
        return false;
      }
      return true;
    }
    static validateNumber(val, name) {
      if (typeof val !== 'number' || isNaN(val)) {
        Debug.warn(`${name} is not a valid number: ${val}`);
        return false;
      }
      return true;
    }
  }
  
  // Simple Event System
  class EventBus {
    constructor() { this.events = new Map(); }
    on(event, callback) {
      if (!this.events.has(event)) this.events.set(event, []);
      this.events.get(event).push(callback);
    }
    off(event, callback) {
      if (!this.events.has(event)) return;
      this.events.set(event, this.events.get(event).filter(cb => cb !== callback));
    }
    emit(event, data) {
      if (!this.events.has(event)) return;
      for (const callback of this.events.get(event)) {
        try { callback(data); } catch(e) { Debug.error(`Event handler error: ${e.message}`); }
      }
    }
  }
  
  // Timer & Scheduling System
  class Timer {
    constructor(duration, callback, loop = false) {
      this.duration = duration;
      this.elapsed = 0;
      this.callback = callback;
      this.loop = loop;
      this.active = true;
    }
    update(dt) {
      if (!this.active) return false;
      this.elapsed += dt;
      if (this.elapsed >= this.duration) {
        this.callback();
        if (this.loop) { this.elapsed = 0; return true; }
        this.active = false;
        return false;
      }
      return true;
    }
    stop() { this.active = false; }
    restart() { this.elapsed = 0; this.active = true; }
  }
  
  // Tween/Interpolation System
  class Tween {
    constructor(obj, props, duration) {
      this.obj = obj;
      this.props = props;
      this.duration = duration;
      this.elapsed = 0;
      this.start = {};
      Object.keys(props).forEach(k => this.start[k] = obj[k]);
    }
    update(dt) {
      this.elapsed += dt;
      const t = Math.min(1, this.elapsed / this.duration);
      Object.keys(this.props).forEach(k => {
        const diff = this.props[k] - this.start[k];
        this.obj[k] = this.start[k] + diff * t;
      });
      return t < 1;
    }
  }
  
  // Math Utilities
  class Math2D {
    static lerp(a, b, t) { return a + (b - a) * t; }
    static clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }
    static distance(x1, y1, x2, y2) { const dx = x2 - x1, dy = y2 - y1; return Math.sqrt(dx*dx + dy*dy); }
    static angle(x1, y1, x2, y2) { return Math.atan2(y2 - y1, x2 - x1); }
    static randomRange(min, max) { return min + Math.random() * (max - min); }
    static randomInt(min, max) { return Math.floor(min + Math.random() * (max - min + 1)); }
    static normalize(x, y) { const len = Math.sqrt(x*x + y*y); return len > 0 ? [x/len, y/len] : [0, 0]; }
    static dot(x1, y1, x2, y2) { return x1*x2 + y1*y2; }
  }
  
  // Color Utilities
  class ColorUtil {
    static hexToRgb(hex) {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : [255, 255, 255];
    }
    static rgbToHex(r, g, b) { return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join(''); }
    static lerp(c1, c2, t) {
      return [
        Math.round(c1[0] + (c2[0] - c1[0]) * t),
        Math.round(c1[1] + (c2[1] - c1[1]) * t),
        Math.round(c1[2] + (c2[2] - c1[2]) * t)
      ];
    }
  }
  
  // State Machine
  class StateMachine {
    constructor(initialState) {
      this.state = initialState;
      this.states = new Map();
      this.transitions = new Map();
    }
    addState(name, onEnter, onUpdate, onExit) {
      this.states.set(name, { onEnter, onUpdate, onExit });
    }
    setState(name) {
      const old = this.state;
      this.state = name;
      if (old && this.states.get(old)?.onExit) this.states.get(old).onExit();
      if (this.states.get(name)?.onEnter) this.states.get(name).onEnter();
    }
    update(dt) {
      if (this.states.get(this.state)?.onUpdate) this.states.get(this.state).onUpdate(dt);
    }
  }
  
  // Object Pool for Performance
  class ObjectPool {
    constructor(factory, reset, initialSize = 10) {
      this.factory = factory;
      this.reset = reset;
      this.available = [];
      this.inUse = new Set();
      for (let i = 0; i < initialSize; i++) {
        this.available.push(factory());
      }
    }
    get() {
      let obj = this.available.pop();
      if (!obj) obj = this.factory();
      this.inUse.add(obj);
      return obj;
    }
    return(obj) {
      if (this.inUse.has(obj)) {
        this.inUse.delete(obj);
        this.reset(obj);
        this.available.push(obj);
      }
    }
    releaseAll() {
      for (const obj of this.inUse) {
        this.reset(obj);
        this.available.push(obj);
      }
      this.inUse.clear();
    }
  }
  
  // Data Persistence
  class Storage {
    static set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch(e) { Debug.warn(`Storage set failed: ${e.message}`); }
    }
    static get(key, defaultValue = null) {
      try { const val = localStorage.getItem(key); return val ? JSON.parse(val) : defaultValue; } catch(e) { return defaultValue; }
    }
    static remove(key) { localStorage.removeItem(key); }
    static clear() { localStorage.clear(); }
  }
  
  // Input Helper - Easy button mapping
  class InputHelper {
    constructor(input) {
      this.input = input;
      this.buttonMap = new Map();
      this.virtualButtons = new Map();
    }
    mapButton(name, keys) {
      this.buttonMap.set(name, Array.isArray(keys) ? keys : [keys]);
    }
    isPressed(name) {
      const keys = this.buttonMap.get(name);
      if (!keys) return false;
      return keys.some(key => this.input.isKeyDown(key));
    }
    onPress(name, callback) {
      const keys = this.buttonMap.get(name);
      if (!keys) return;
      keys.forEach(key => this.input.on(key, callback));
    }
  }
  
  // Performance Monitor
  class PerfMonitor {
    constructor() {
      this.frameCount = 0;
      this.fps = 60;
      this.lastTime = Date.now();
      this.maxFrameTime = 0;
    }
    update(dt) {
      this.frameCount++;
      const now = Date.now();
      if (now - this.lastTime >= 1000) {
        this.fps = this.frameCount;
        this.frameCount = 0;
        this.lastTime = now;
      }
      this.maxFrameTime = Math.max(this.maxFrameTime, dt * 1000);
    }
    getStats() {
      return { fps: this.fps, maxFrameTime: this.maxFrameTime.toFixed(2) + 'ms' };
    }
  }
  
  // Collision Query System
  class CollisionQuery {
    static getEntitiesAtPoint(scene, x, y) {
      const results = [];
      for (const entity of scene.entities.values()) {
        const sprite = entity.get(SpriteRenderer);
        if (sprite && entity.transform) {
          const ex = entity.transform.x, ey = entity.transform.y;
          if (x >= ex && x < ex + sprite.width && y >= ey && y < ey + sprite.height) {
            results.push(entity);
          }
        }
      }
      return results;
    }
    static getNearbyEntities(scene, x, y, radius) {
      const results = [];
      for (const entity of scene.entities.values()) {
        if (entity.transform) {
          const dx = entity.transform.x - x;
          const dy = entity.transform.y - y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist <= radius) results.push({ entity, distance: dist });
        }
      }
      return results.sort((a, b) => a.distance - b.distance);
    }
  }
  
  // Debug Drawing System
  class DebugDraw {
    constructor(ctx) { this.ctx = ctx; this.enabled = false; }
    enable() { this.enabled = true; }
    disable() { this.enabled = false; }
    circle(x, y, radius, color = '#00ff00') {
      if (!this.enabled || !this.ctx) return;
      this.ctx.strokeStyle = color;
      this.ctx.beginPath();
      this.ctx.arc(x, y, radius, 0, Math.PI * 2);
      this.ctx.stroke();
    }
    rect(x, y, w, h, color = '#00ff00') {
      if (!this.enabled || !this.ctx) return;
      this.ctx.strokeStyle = color;
      this.ctx.strokeRect(x, y, w, h);
    }
    line(x1, y1, x2, y2, color = '#00ff00') {
      if (!this.enabled || !this.ctx) return;
      this.ctx.strokeStyle = color;
      this.ctx.beginPath();
      this.ctx.moveTo(x1, y1);
      this.ctx.lineTo(x2, y2);
      this.ctx.stroke();
    }
  }

  // --- Game Development Utilities ---
  class Room {
    constructor(name, width, height) {
      this.name = name;
      this.width = width;
      this.height = height;
      this.npcs = [];
      this.items = [];
      this.doors = [];
      this.bgColor = '#1a1a2e';
    }
    addNPC(npc) { this.npcs.push(npc); }
    addItem(item) { this.items.push(item); }
    addDoor(x, y, width, height, targetRoom, targetX, targetY) {
      this.doors.push({x, y, width, height, targetRoom, targetX, targetY });
    }
    getNPCAt(x, y, range = 50) {
      return this.npcs.find(npc => Math.hypot(npc.x - x, npc.y - y) < range);
    }
    getItemAt(x, y, range = 50) {
      return this.items.find(item => Math.hypot(item.x - x, item.y - y) < range);
    }
    getDoorAt(x, y) {
      return this.doors.find(d => x > d.x && x < d.x + d.width && y > d.y && y < d.y + d.height);
    }
  }

  class NPC {
    constructor(name, x, y, color = '#ff6b6b') {
      this.name = name;
      this.x = x;
      this.y = y;
      this.color = color;
      this.size = 30;
      this.dialogues = [];
      this.currentDialogue = 0;
      this.hasDialogue = false;
    }
    addDialogue(text, options = []) {
      this.dialogues.push({ text, options });
      this.hasDialogue = true;
    }
    getDialogue() {
      if (this.currentDialogue >= this.dialogues.length) this.currentDialogue = 0;
      return this.dialogues[this.currentDialogue] || null;
    }
    nextDialogue() {
      this.currentDialogue++;
      if (this.currentDialogue >= this.dialogues.length) this.currentDialogue = 0;
    }
  }

  class GameItem {
    constructor(name, x, y, type = 'object') {
      this.name = name;
      this.x = x;
      this.y = y;
      this.type = type;
      this.size = 40;
      this.color = '#4ecdc4';
      this.canInteract = true;
    }
  }

  class Player {
    constructor(x, y, width = 25, height = 40) {
      this.x = x;
      this.y = y;
      this.width = width;
      this.height = height;
      this.vx = 0;
      this.vy = 0;
      this.speed = 150;
      this.color = '#ffd93d';
      this.isMoving = false;
      this.direction = 'down';
    }
    update(dt, room) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      // Keep in bounds
      this.x = Math.max(0, Math.min(this.x, room.width - this.width));
      this.y = Math.max(0, Math.min(this.y, room.height - this.height));
      this.isMoving = Math.abs(this.vx) > 0 || Math.abs(this.vy) > 0;
    }
    moveLeft() { this.vx = -this.speed; this.direction = 'left'; }
    moveRight() { this.vx = this.speed; this.direction = 'right'; }
    moveUp() { this.vy = -this.speed; this.direction = 'up'; }
    moveDown() { this.vy = this.speed; this.direction = 'down'; }
    stop() { this.vx = 0; this.vy = 0; }
  }

  class DialogueUI {
    constructor(canvasWidth) {
      this.isActive = false;
      this.currentText = '';
      this.options = [];
      this.selectedOption = 0;
      this.canvasWidth = canvasWidth;
      this.boxHeight = 120;
      this.boxY = canvasWidth - this.boxHeight - 20;
    }
    show(text, options = []) {
      this.isActive = true;
      this.currentText = text;
      this.options = options;
      this.selectedOption = 0;
    }
    hide() {
      this.isActive = false;
      this.currentText = '';
      this.options = [];
    }
    selectNext() {
      this.selectedOption = (this.selectedOption + 1) % this.options.length;
    }
    selectPrev() {
      if (this.selectedOption > 0) this.selectedOption--;
    }
  }

  class DrawingUtils {
    static drawRoom(ctx, room, player) {
      ctx.fillStyle = room.bgColor;
      ctx.fillRect(0, 0, room.width, room.height);
      
      // Draw ground line (Mario-style)
      const groundY = room.height * 0.75;
      ctx.fillStyle = '#3d2817';
      ctx.fillRect(0, groundY, room.width, room.height - groundY);
      ctx.strokeStyle = '#654321';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, groundY);
      ctx.lineTo(room.width, groundY);
      ctx.stroke();
      
      // Draw grass/ground pattern
      ctx.fillStyle = '#2d5016';
      for (let x = 0; x < room.width; x += 20) {
        ctx.fillRect(x, groundY - 8, 10, 4);
      }
      
      // Draw doors
      room.doors.forEach(door => {
        DrawingUtils.drawDoor(ctx, door);
      });
      
      // Draw items
      room.items.forEach(item => DrawingUtils.drawItem(ctx, item));
      
      // Draw NPCs
      room.npcs.forEach(npc => DrawingUtils.drawNPC(ctx, npc));
      
      // Draw player
      DrawingUtils.drawCharacter(ctx, player);
    }
    
    static drawDoor(ctx, door) {
      // Wood door with frame
      ctx.fillStyle = '#6B4423';
      ctx.fillRect(door.x, door.y, door.width, door.height);
      
      // Door frame
      ctx.strokeStyle = '#3D2817';
      ctx.lineWidth = 4;
      ctx.strokeRect(door.x, door.y, door.width, door.height);
      
      // Door handle
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.arc(door.x + door.width - 20, door.y + door.height / 2, 6, 0, Math.PI * 2);
      ctx.fill();
      
      // Door panels
      ctx.strokeStyle = '#3D2817';
      ctx.lineWidth = 2;
      ctx.strokeRect(door.x + 5, door.y + 5, door.width - 10, door.height / 2 - 5);
      ctx.strokeRect(door.x + 5, door.y + door.height / 2, door.width - 10, door.height / 2 - 5);
    }
    
    static drawCharacter(ctx, player) {
      ctx.save();
      ctx.translate(player.x + player.width/2, player.y);
      
      // Head
      ctx.fillStyle = '#FFB6C1';
      ctx.beginPath();
      ctx.arc(0, 12, 10, 0, Math.PI * 2);
      ctx.fill();
      
      // Eyes
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(-4, 10, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(4, 10, 2.5, 0, Math.PI * 2);
      ctx.fill();
      
      // Body (shirt)
      ctx.fillStyle = '#FF6347';
      ctx.fillRect(-8, 22, 16, 12);
      
      // Legs
      ctx.fillStyle = '#4169E1';
      ctx.fillRect(-4, 34, 4, 8);
      ctx.fillRect(0, 34, 4, 8);
      
      // Shoes
      ctx.fillStyle = '#654321';
      ctx.fillRect(-5, 42, 5, 4);
      ctx.fillRect(0, 42, 5, 4);
      
      ctx.restore();
    }
    
    static drawNPC(ctx, npc) {
      ctx.save();
      ctx.translate(npc.x, npc.y);
      
      // Head
      ctx.fillStyle = npc.color || '#8B4513';
      ctx.beginPath();
      ctx.arc(0, 12, 10, 0, Math.PI * 2);
      ctx.fill();
      
      // Eyes
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(-4, 10, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(4, 10, 2, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(-4, 10, 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(4, 10, 1, 0, Math.PI * 2);
      ctx.fill();
      
      // Mouth
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 16, 3, 0, Math.PI);
      ctx.stroke();
      
      // Body
      ctx.fillStyle = '#2F4F4F';
      ctx.fillRect(-8, 22, 16, 12);
      
      // Legs
      ctx.fillStyle = '#000';
      ctx.fillRect(-4, 34, 4, 8);
      ctx.fillRect(0, 34, 4, 8);
      
      // Shoes
      ctx.fillStyle = '#654321';
      ctx.fillRect(-5, 42, 5, 4);
      ctx.fillRect(0, 42, 5, 4);
      
      // Name label
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(npc.name, 0, -5);
      
      ctx.restore();
    }
    
    static drawItem(ctx, item) {
      ctx.save();
      ctx.translate(item.x, item.y);
      
      if (item.type === 'bed') {
        // Bed frame
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(-40, 0, 80, 12);
        ctx.fillRect(-42, 0, 4, 35);
        ctx.fillRect(38, 0, 4, 35);
        
        // Mattress
        ctx.fillStyle = '#DC143C';
        ctx.fillRect(-38, 12, 76, 20);
        
        // Pillow
        ctx.fillStyle = '#FFF8DC';
        ctx.fillRect(-30, 8, 25, 12);
        
        // Mattress shading
        ctx.strokeStyle = '#8B0000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-38, 22);
        ctx.lineTo(38, 22);
        ctx.stroke();
        
      } else if (item.type === 'desk') {
        // Desk surface
        ctx.fillStyle = '#8B6914';
        ctx.fillRect(-35, 0, 70, 8);
        
        // Desk legs
        ctx.fillStyle = '#654321';
        ctx.fillRect(-30, 8, 6, 30);
        ctx.fillRect(24, 8, 6, 30);
        
        // Paper on desk
        ctx.fillStyle = '#FFF';
        ctx.fillRect(-20, -5, 25, 15);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.strokeRect(-20, -5, 25, 15);
        
        // Pen
        ctx.strokeStyle = '#FF0000';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(8, -8);
        ctx.lineTo(15, 5);
        ctx.stroke();
        
      } else if (item.type === 'notebook') {
        // Notebook cover
        ctx.fillStyle = '#FFF';
        ctx.fillRect(-20, -15, 40, 35);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.strokeRect(-20, -15, 40, 35);
        
        // Lines on notebook
        ctx.strokeStyle = '#0000FF';
        ctx.lineWidth = 1;
        for (let y = -10; y < 15; y += 6) {
          ctx.beginPath();
          ctx.moveTo(-15, y);
          ctx.lineTo(15, y);
          ctx.stroke();
        }
        
      } else if (item.type === 'fence') {
        // Fence posts
        ctx.fillStyle = '#6B4423';
        ctx.fillRect(-50, -80, 10, 160);
        ctx.fillRect(40, -80, 10, 160);
        
        // Horizontal rails
        ctx.strokeStyle = '#654321';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(-50, -60);
        ctx.lineTo(50, -60);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(-50, 0);
        ctx.lineTo(50, 0);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(-50, 60);
        ctx.lineTo(50, 60);
        ctx.stroke();
        
        // Chicken wire pattern
        ctx.strokeStyle = '#888888';
        ctx.lineWidth = 1;
        for (let x = -45; x < 50; x += 8) {
          for (let y = -75; y < 80; y += 8) {
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        
        // Wire connecting holes
        ctx.strokeStyle = '#999999';
        ctx.lineWidth = 0.5;
        for (let x = -45; x < 50; x += 8) {
          for (let y = -75; y < 80; y += 8) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + 8, y);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x, y + 8);
            ctx.stroke();
          }
        }
        
      } else if (item.type === 'object') {
        // Generic building/object
        ctx.fillStyle = item.color || '#654321';
        ctx.fillRect(-item.size/2, -item.size/2, item.size, item.size);
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.strokeRect(-item.size/2, -item.size/2, item.size, item.size);
        
        // Windows if it's a building
        if (item.name && item.name.includes('Building')) {
          ctx.fillStyle = '#87CEEB';
          ctx.fillRect(-item.size/2 + 5, -item.size/2 + 5, item.size/3, item.size/3);
          ctx.fillRect(item.size/4, -item.size/2 + 5, item.size/3, item.size/3);
        }
      }
      
      ctx.restore();
    }
  }

    // --- Engine class ---
  class Engine {
    constructor(){
      // Engine version and info
      this.version = '2.0.0';
      this.name = 'Sirco Game Engine';
      this.debugConsoleEnabled = true; // Flag to enable/disable debug console
      console.log(`🎮 ${this.name} v${this.version} Initializing...`);
      console.log('⚙️ Engine Features: Physics, Particles, Audio, Animation, Debug Console, ECS, Storage, Events');
      
      this.resources = new ResourceLoader();
      this.scene = new Scene();
      this.sceneManager = new SceneManager(this);
      this._last = performance.now();
      
      // Use existing canvas or create one
      this.canvas = document.getElementById('gameCanvas');
      console.log('🖼️ Canvas lookup:', this.canvas ? 'Found existing' : 'Creating new');
      if (!this.canvas) {
        this.canvas = document.createElement('canvas');
        this.canvas.style.position = 'fixed'; 
        this.canvas.style.left='0'; 
        this.canvas.style.top='0'; 
        this.canvas.style.width='100%'; 
        this.canvas.style.height='100%'; 
        this.canvas.style.zIndex='999';
        document.body.appendChild(this.canvas);
      }
      
      // Setup debug console first
      this._setupDebugConsole();
      
      // Always get 2D context for drawing
      this.ctx2d = this.canvas.getContext('2d', { willReadFrequently: false });
      if (!this.ctx2d) {
        console.error('❌ Failed to get 2D canvas context!');
        this.ctx2d = null;
      } else {
        console.log('✅ 2D Canvas Context obtained');
        console.log('📐 Canvas dimensions:', this.canvas.width, 'x', this.canvas.height);
        console.log('🖥️ Device pixel ratio:', window.devicePixelRatio);
        console.log('📍 Canvas position:', this.canvas.style.position, this.canvas.style.zIndex);
      }
      
      // Try WebGL (optional, for advanced use)
      try {
        this.gl = this.canvas.getContext('webgl2', {antialias:true}) || this.canvas.getContext('webgl', {antialias:true});
      } catch(e) { }
      this.input = new Input(this.canvas);
      this.camera = new Camera2D();
      // Only use 2D canvas for rendering (skip WebGL complications)
      this.renderer2D = new Renderer2D(this.ctx2d, this.resources);
      this.renderer3D = this.gl ? new Renderer3DPBR(this.gl) : null;
      this.physics = new Physics2D(this.scene);
      this.physics2DSolver = new Physics2DSolver(this.scene);
      this.physics3D = new Physics3DWorld();
      this.audio = new AudioManager(this.resources);
      // NEW BEGINNER & ADVANCED UTILITIES
      this.events = new EventBus();
      this.debug = Debug;
      this.math = Math2D;
      this.color = ColorUtil;
      this.storage = Storage;
      this.timers = [];
      this.tweens = [];
      this.inputHelper = new InputHelper(this.input);
      this.perfMonitor = new PerfMonitor();
      this.collision = CollisionQuery;
      this.debugDraw = new DebugDraw(this.ctx2d);
      this.plugins = new PluginManager(this);
      this.rollback = new RollbackManager();
      this.particles = [];
      this.running = false;
      this._onFrame = (t)=>this._frame(t);
      
      // Initialize command system
      this.commands = new CommandSystem(this);
      this._registerBuiltInCommands();
      console.log('✅ Command System initialized');
      
      // Initialize debug console
      this.debugConsole = null; // Lazy created in _setupDebugConsole
      
      window.addEventListener('resize', ()=>this._onResize()); this._onResize();
      
      console.log(`✨ ${this.name} v${this.version} Ready!`);
    }
    
    _registerBuiltInCommands() {
      this.commands.register('help', () => this.commands.listCommands().join('\n'), 'Show all available commands');
      this.commands.register('clear', () => { this.debugConsole?.logs?.splice(0); return 'Console cleared'; }, 'Clear debug console');
      this.commands.register('canvas-info', () => `Canvas: ${this.canvas.width}x${this.canvas.height}`, 'Show canvas info');
      this.commands.register('fps', () => `FPS: ${this.perfMonitor.fps}`, 'Show current FPS');
      this.commands.register('entities', () => `Entities: ${this.scene.entities.size}`, 'Show entity count');
      this.commands.register('disable-console', () => { this.debugConsoleEnabled = false; console.log('🔒 Debug console disabled. Try pressing Ctrl+Shift+Alt+Z'); return 'Debug console disabled (try opening it for notification)'; }, 'Disable debug console');
      this.commands.register('enable-console', () => { this.debugConsoleEnabled = true; console.log('🔓 Debug console enabled!'); return 'Debug console enabled'; }, 'Enable debug console');
      this.commands.register('disable-storage', () => { this.disableDebugFeatures('storage'); return 'Storage viewer disabled'; }, 'Disable storage viewer');
      this.commands.register('disable-debug', () => { this.debugConsoleEnabled = false; this.disableDebugFeatures('all'); return 'All debug features disabled'; }, 'Disable all debug features');
      this.commands.register('goto', (scene) => { 
        if (!scene) return '❌ Usage: goto sceneName (e.g., goto credits)';
        if (this.game && typeof this.game.gotoScene === 'function') {
          this.game.gotoScene(scene);
          return `✅ Navigating to scene: ${scene}`;
        }
        return '⚠️ Game does not support scene navigation';
      }, 'Go to a scene/screen (goto sceneName)');
      this.commands.register('splash', (duration) => {
        const d = parseInt(duration) || 2500;
        this.showSplashScreen(d);
        return `✅ Showing splash screen for ${d}ms`;
      }, 'Show splash screen (splash [duration_ms])');
    }
    
    disableDebugFeatures(type = 'all') {
      console.log(`🔒 Disabling debug features: ${type}`);
      if (type === 'all' || type === 'console') {
        const consoleEl = document.getElementById('sirco_debug_menu_console');
        if (consoleEl) consoleEl.style.display = 'none';
      }
      if (type === 'all' || type === 'storage') {
        const devtools = document.getElementById('sirco-devtools');
        if (devtools) devtools.style.display = 'none';
      }
    }
    
    enableDebugFeatures(type = 'all') {
      console.log(`🔓 Enabling debug features: ${type}`);
      if (type === 'all' || type === 'console') {
        const consoleEl = document.getElementById('sirco_debug_menu_console');
        if (consoleEl) consoleEl.style.display = 'flex';
      }
      if (type === 'all' || type === 'storage') {
        const devtools = document.getElementById('sirco-devtools');
        if (devtools) devtools.style.display = 'block';
      }
    }
    
    showSplashScreen(duration = 2500, customContent = null) {
      const splash = document.getElementById('sirco_splash_screen') || document.createElement('div');
      splash.id = 'sirco_splash_screen';
      splash.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(135deg, #000000 0%, #1a1a2e 100%);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 100000;
        opacity: 1;
        transition: opacity 1s ease-out;
        font-family: 'Courier New', monospace;
        color: #00ff00;
      `;
      
      if (customContent) {
        splash.innerHTML = customContent;
      } else {
        splash.innerHTML = `
          <div style="text-align: center;">
            <h1 style="font-size: 48px; margin: 0 0 20px 0; text-shadow: 0 0 20px #00ff00;">🎮 Sirco</h1>
            <div style="font-size: 18px; color: #0f0; margin: 20px 0; letter-spacing: 2px;">GAME ENGINE</div>
            <div style="font-size: 14px; color: #888; margin-top: 40px;">Loading...</div>
            <div style="margin-top: 30px; width: 200px; height: 4px; background: rgba(0, 255, 0, 0.2); border-radius: 2px; overflow: hidden;">
              <div style="height: 100%; background: #00ff00; width: 0%; animation: progress 2s ease-in-out infinite;"></div>
            </div>
            <style>
              @keyframes progress {
                0% { width: 0%; }
                50% { width: 80%; }
                100% { width: 100%; }
              }
            </style>
          </div>
        `;
      }
      
      document.body.appendChild(splash);
      
      setTimeout(() => {
        splash.style.opacity = '0';
        setTimeout(() => {
          splash.remove();
          console.log('✨ Splash screen faded out');
        }, 1000);
      }, duration);
      
      console.log(`🎬 Splash screen shown for ${duration}ms`);
    }
    
    showDebugNotification(message, type = 'info') {
      const notif = document.createElement('div');
      notif.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        background: ${type === 'disabled' ? 'rgba(255, 50, 50, 0.9)' : 'rgba(0, 255, 0, 0.9)'};
        color: ${type === 'disabled' ? '#fff' : '#000'};
        border: 2px solid ${type === 'disabled' ? '#ff0000' : '#00ff00'};
        border-radius: 5px;
        font-family: 'Courier New', monospace;
        z-index: 100001;
        font-size: 13px;
        font-weight: bold;
        animation: popIn 0.3s ease-out;
      `;
      notif.innerHTML = message;
      document.body.appendChild(notif);
      
      const style = document.createElement('style');
      style.textContent = `
        @keyframes popIn {
          from { transform: translateY(-20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `;
      document.head.appendChild(style);
      
      setTimeout(() => notif.remove(), 3000);
    }
    _setupDebugConsole(){
      // Inject super simple CSS
      const style = document.createElement('style');
      style.id = 'sirco_debug_menu_styles';
      style.textContent = `
        #sirco_debug_menu_console {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          width: 100%;
          height: 300px;
          background: rgba(10, 10, 20, 0.95);
          border-top: 2px solid #00ff00;
          color: #0f0;
          font-family: 'Courier New', monospace;
          z-index: 99999;
          display: none;
          flex-direction: column;
        }
        #sirco_debug_menu_console.sirco_debug_menu_active { display: flex; }
        #sirco_debug_menu_header { padding: 5px 10px; border-bottom: 1px solid #00ff00; background: rgba(0, 30, 0, 0.8); display: flex; align-items: center; gap: 5px; flex-shrink: 0; }
        #sirco_debug_menu_header h3 { color: #00ff00; font-size: 12px; font-weight: bold; flex: 1; margin: 0; padding: 0; }
        #sirco_debug_menu_header span { color: #888; font-size: 10px; margin: 0; padding: 0; }
        #sirco_debug_menu_header button { all: revert; padding: 3px 6px; font-size: 9px; background: rgba(0, 255, 0, 0.2); border: 1px solid #00ff00; color: #0f0; cursor: pointer; font-family: 'Courier New', monospace; white-space: nowrap; flex-shrink: 0; margin: 0; }
        #sirco_debug_menu_header button:hover { background: rgba(0, 255, 0, 0.4); }
        #sirco_debug_menu_output { flex: 1; overflow-y: auto; padding: 5px 10px; font-size: 11px; line-height: 1.3; background: rgba(0, 0, 0, 0.5); white-space: pre-wrap; word-wrap: break-word; margin: 0; }
        #sirco_debug_menu_input { padding: 5px 10px; border-top: 1px solid #00ff00; background: rgba(0, 20, 0, 0.9); display: flex; gap: 3px; flex-shrink: 0; align-items: center; justify-content: stretch; }
        #sirco_debug_menu_cmd_input { flex: 1; background: rgba(0, 10, 0, 0.9); border: 1px solid #00ff00; color: #0f0; padding: 3px 6px; font-family: 'Courier New', monospace; font-size: 10px; margin: 0; all: revert; }
        #sirco_debug_menu_cmd_input::placeholder { color: #666; }
        #sirco_debug_menu_cmd_exec { all: revert; padding: 3px 6px; font-size: 9px; background: rgba(0, 255, 0, 0.2); border: 1px solid #00ff00; color: #0f0; cursor: pointer; font-family: 'Courier New', monospace; white-space: nowrap; flex-shrink: 0; margin: 0; }
        #sirco_debug_menu_cmd_exec:hover { background: rgba(0, 255, 0, 0.4); }
        .sirco_debug_menu_log { color: #0f0; }
        .sirco_debug_menu_log_warn { color: #ff0; }
        .sirco_debug_menu_log_error { color: #f00; }
        .sirco_debug_menu_log_info { color: #0af; }
        .sirco_debug_menu_log_command { color: #f0f; }
        .sirco_debug_menu_log_result { color: #0ff; }
      `;
      document.head.appendChild(style);
      
      // Inject HTML
      const consoleHtml = document.createElement('div');
      consoleHtml.id = 'sirco_debug_menu_console';
      consoleHtml.innerHTML = `
        <div id="sirco_debug_menu_header">
          <h3>🐛 Debug Console</h3>
          <span>Ctrl+Shift+Alt+Z</span>
          <button class="sirco_debug_menu_button" id="sirco_debug_menu_copy_all">Copy All</button>
          <button class="sirco_debug_menu_button" id="sirco_debug_menu_copy_logs">Copy Logs</button>
          <button class="sirco_debug_menu_button" id="sirco_debug_menu_close">✕</button>
        </div>
        <div class="sirco_debug_menu_output" id="sirco_debug_menu_output"></div>
        <div class="sirco_debug_menu_input">
          <input type="text" id="sirco_debug_menu_cmd_input" placeholder="Type command (help for list)...">
          <button class="sirco_debug_menu_button" id="sirco_debug_menu_cmd_exec">Execute</button>
        </div>
      `;
      document.body.appendChild(consoleHtml);
      
      // Setup console capture
      const debugConsole = {
        output: document.getElementById('sirco_debug_menu_output'),
        logs: [],
        maxLines: 500,
        isAtBottom: true,
        log(message, type = 'log') {
          const timestamp = new Date().toLocaleTimeString();
          const prefix = type === 'log' ? '[LOG]' : type === 'warn' ? '[WARN]' : type === 'error' ? '[ERROR]' : '[INFO]';
          const entry = `${timestamp} ${prefix} ${message}`;
          this.logs.push({ text: entry, type });
          if (this.logs.length > this.maxLines) { this.logs.shift(); }
          this.render();
        },
        render() {
          this.output.innerHTML = this.logs.map(log => `<div class="sirco_debug_menu_log sirco_debug_menu_log_${log.type}">${this.escapeHtml(log.text)}</div>`).join('');
          // Only auto-scroll if user is at bottom
          if (this.isAtBottom) {
            this.output.scrollTop = this.output.scrollHeight;
          }
        },
        safeStringify(obj, depth = 0, maxDepth = 2) {
          if (depth > maxDepth) return '[...]';
          if (obj === null) return 'null';
          if (obj === undefined) return 'undefined';
          if (typeof obj === 'string') return obj;
          if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj);
          if (obj instanceof Error) return `${obj.name}: ${obj.message}`;
          if (obj instanceof Array) return `[${obj.length} items]`;
          if (typeof obj === 'object') return `{${Object.getOwnPropertyNames(obj).slice(0,3).join(', ')}}`;
          return String(obj);
        },
        escapeHtml(text) {
          const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
          return String(text).replace(/[&<>"']/g, m => map[m]);
        }
      };
      
      // Store debug console reference
      this.debugConsole = debugConsole;
      
      const originalLog = console.log;
      const originalWarn = console.warn;
      const originalError = console.error;
      
      console.log = function(...args) {
        originalLog.apply(console, args);
        debugConsole.log(args.map(a => typeof a === 'string' ? a : debugConsole.safeStringify(a)).join(' '), 'log');
      };
      
      console.warn = function(...args) {
        originalWarn.apply(console, args);
        debugConsole.log(args.map(a => typeof a === 'string' ? a : debugConsole.safeStringify(a)).join(' '), 'warn');
      };
      
      console.error = function(...args) {
        originalError.apply(console, args);
        debugConsole.log(args.map(a => typeof a === 'string' ? a : debugConsole.safeStringify(a)).join(' '), 'error');
      };
      
      window.addEventListener('error', (event) => {
        debugConsole.log(`Uncaught Error: ${event.message} at ${event.filename}:${event.lineno}`, 'error');
      });
      
      // Track scroll position to avoid auto-scroll if user scrolled up
      document.getElementById('sirco_debug_menu_output').addEventListener('scroll', (e) => {
        const isAtBottom = e.target.scrollHeight - e.target.scrollTop - e.target.clientHeight < 5;
        debugConsole.isAtBottom = isAtBottom;
      });
      
      // Copy console buttons
      document.getElementById('sirco_debug_menu_copy_all').addEventListener('click', () => {
        const text = debugConsole.logs.map(log => log.text).join('\n');
        navigator.clipboard.writeText(text).then(() => {
          console.log('✅ Copied entire console to clipboard');
        });
      });
      
      document.getElementById('sirco_debug_menu_copy_logs').addEventListener('click', () => {
        const text = debugConsole.logs.map(log => log.text).join('\n');
        navigator.clipboard.writeText(text).then(() => {
          console.log('✅ Copied logs to clipboard');
        });
      });
      
      document.getElementById('sirco_debug_menu_close').addEventListener('click', () => {
        document.getElementById('sirco_debug_menu_console').classList.remove('sirco_debug_menu_active');
      });
      
      // Command execution
      const cmdInput = document.getElementById('sirco_debug_menu_cmd_input');
      const cmdExecBtn = document.getElementById('sirco_debug_menu_cmd_exec');
      const thisEngine = this;
      
      cmdExecBtn.addEventListener('click', () => {
        if (cmdInput.value.trim()) {
          const result = thisEngine.commands.execute(cmdInput.value);
          console.log(`> ${cmdInput.value}`);
          if (result !== null && result !== undefined) {
            console.log(`${result}`);
          }
          cmdInput.value = '';
          cmdInput.focus();
        }
      });
      
      cmdInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          cmdExecBtn.click();
        }
      });
      
      document.addEventListener('keydown', (event) => {
        if (event.ctrlKey && event.shiftKey && event.altKey && event.code === 'KeyZ') {
          event.preventDefault();
          if (!this.debugConsoleEnabled) {
            this.showDebugNotification('🔒 Debug console is DISABLED', 'disabled');
            console.warn('🔒 Debug console is disabled. Use: enable-console');
            return;
          }
          document.getElementById('sirco_debug_menu_console').classList.toggle('sirco_debug_menu_active');
          cmdInput.focus();
        }
      });
      
      console.log('🎮 Sirco Engine Debug Console Ready - Press Ctrl+Shift+Alt+Z to toggle');
      console.log('🔙 Press ESC to return to menu');
    }
    _onResize(){ 
      const dpr = Math.max(1, window.devicePixelRatio || 1); 
      this.canvas.width = Math.floor(innerWidth * dpr); 
      this.canvas.height = Math.floor(innerHeight * dpr); 
      if(this.gl) this.gl.viewport(0,0,this.canvas.width,this.canvas.height);
      console.log(`📐 Canvas resized to: ${this.canvas.width}x${this.canvas.height}`);
    }
    
    // Center content on canvas and detect overflow
    centerContent(x, y, width, height) {
      const cx = (this.canvas.width - width) / 2;
      const cy = (this.canvas.height - height) / 2;
      
      // Check for overflow
      const overflowData = {
        x: cx,
        y: cy,
        width,
        height,
        overflowLeft: cx < 0,
        overflowRight: cx + width > this.canvas.width,
        overflowTop: cy < 0,
        overflowBottom: cy + height > this.canvas.height,
        totalOverflow: 0
      };
      
      if (overflowData.overflowLeft) {
        overflowData.totalOverflow += Math.abs(cx);
        console.warn(`⚠️ [Canvas] Content overflows LEFT by ${Math.abs(cx)}px`);
      }
      if (overflowData.overflowRight) {
        const rightOverflow = cx + width - this.canvas.width;
        overflowData.totalOverflow += rightOverflow;
        console.warn(`⚠️ [Canvas] Content overflows RIGHT by ${rightOverflow}px`);
      }
      if (overflowData.overflowTop) {
        overflowData.totalOverflow += Math.abs(cy);
        console.warn(`⚠️ [Canvas] Content overflows TOP by ${Math.abs(cy)}px`);
      }
      if (overflowData.overflowBottom) {
        const bottomOverflow = cy + height - this.canvas.height;
        overflowData.totalOverflow += bottomOverflow;
        console.warn(`⚠️ [Canvas] Content overflows BOTTOM by ${bottomOverflow}px`);
      }
      
      if (overflowData.totalOverflow === 0) {
        console.log(`✅ [Canvas] Content fits perfectly! Centered at (${cx}, ${cy})`);
      }
      
      return overflowData;
    }
    
    // Fit content to canvas keeping aspect ratio
    fitToCanvas(contentAspect) {
      const canvasAspect = this.canvas.width / this.canvas.height;
      let fitWidth, fitHeight;
      
      if (canvasAspect > contentAspect) {
        fitHeight = this.canvas.height;
        fitWidth = fitHeight * contentAspect;
      } else {
        fitWidth = this.canvas.width;
        fitHeight = fitWidth / contentAspect;
      }
      
      const x = (this.canvas.width - fitWidth) / 2;
      const y = (this.canvas.height - fitHeight) / 2;
      
      console.log(`📏 [Canvas] Fitted content: ${fitWidth}x${fitHeight} at (${x}, ${y})`);
      
      return { x, y, width: fitWidth, height: fitHeight };
    }
    start(gameModule){
      // gameModule is default export function(engine) { return { start, update, render } } or a class
      const renderMode = this.ctx2d ? '📊 Canvas 2D' : (this.gl ? '🎮 WebGL' : '❌ No Renderer');
      console.log(`✅ Sirco Engine Started | ${renderMode} | ${this.canvas.width}x${this.canvas.height}`);
      console.log(`📋 Canvas Element:`, this.canvas);
      console.log(`🎨 Rendering Context (ctx2d):`, this.ctx2d);
      console.log(`🎮 Game Module:`, gameModule);
      this.game = gameModule && (typeof gameModule === 'function' ? gameModule(this) : gameModule);
      console.log(`✨ Game Instance Created:`, this.game);
      console.log(`📍 Game has .start():`, !!(this.game && this.game.start));
      console.log(`📍 Game has .update():`, !!(this.game && this.game.update));
      console.log(`📍 Game has .render():`, !!(this.game && this.game.render));
      if(this.game && this.game.start) {
        console.log('🚀 Calling game.start()...');
        this.game.start();
        console.log('✅ game.start() completed');
      }
      this.running = true; 
      this._last = performance.now(); 
      console.log('🎬 Starting game loop with requestAnimationFrame');
      requestAnimationFrame(this._onFrame);
    }
    // ===== BEGINNER-FRIENDLY CONVENIENCE METHODS =====
    setTimeout(callback, delay) {
      const timer = new Timer(delay, callback, false);
      this.timers.push(timer);
      return timer;
    }
    setInterval(callback, delay) {
      const timer = new Timer(delay, callback, true);
      this.timers.push(timer);
      return timer;
    }
    animate(obj, props, duration) {
      const tween = new Tween(obj, props, duration);
      this.tweens.push(tween);
      return tween;
    }
    createEntity(name = 'entity') {
      const e = new Entity(name);
      this.scene.add(e);
      return e;
    }
    createSprite(x, y, imageFile, width = 64, height = 64) {
      const e = this.createEntity();
      e.transform.x = x;
      e.transform.y = y;
      e.add(new SpriteRenderer(imageFile, width, height));
      return e;
    }
    tellAt(text, x, y, duration = 2) {
      const e = this.createEntity('text-' + Date.now());
      e.transform.x = x;
      e.transform.y = y;
      e.add(new TextRenderer(text, { fontSize: 16, color: '#fff' }));
      this.setTimeout(() => this.scene.remove(e), duration);
      return e;
    }
    findEntitiesAt(x, y) {
      return this.collision.getEntitiesAtPoint(this.scene, x, y);
    }
    findNearby(x, y, radius) {
      return this.collision.getNearbyEntities(this.scene, x, y, radius);
    }
    tell(text) {
      console.log(`[GAME] ${text}`);
    }
    warn(text) {
      console.warn(`[GAME] ${text}`);
    }
    error(text) {
      console.error(`[GAME] ${text}`);
    }
    _frame(now){
      const dt = Math.min(0.05, (now - this._last)/1000); this._last = now;
      try {
        // perf monitoring
        this.perfMonitor.update(dt);
        // user update
        if(this.game && this.game.update) this.game.update(dt);
        // update timers
        this.timers = this.timers.filter(t => t.update(dt));
        // update tweens
        this.tweens = this.tweens.filter(t => t.update(dt));
        // update camera
        this.camera.update(dt);
        // update particles
        this.particles = this.particles.filter(p=>{ p.update(dt); return p.isAlive(); });
        for(const e of this.scene.entities.values()){
          const anim = e.get(Animator);
          if(anim) anim.update(dt);
          const emitter = e.get(ParticleEmitter);
          if(emitter){
            emitter.update(dt);
            this.particles.push(...emitter.particles);
          }
        }
        // physics
        this.physics.step(dt);
        this.physics2DSolver.step(dt);
        this.physics3D.step(dt);
        // clear and render with 2D canvas
        if(this.ctx2d){
          const ctx=this.ctx2d; 
          ctx.fillStyle='#000000'; 
          ctx.fillRect(0,0,this.canvas.width,this.canvas.height);
          this.renderer2D.draw2D(ctx, this.scene, this.camera);
          // render particles
          ctx.fillStyle='rgba(255,255,255,0.8)';
          for(const p of this.particles){
            const px = (p.x - this.camera.x) * this.camera.zoom;
            const py = (p.y - this.camera.y) * this.camera.zoom;
            ctx.fillRect(px-p.size/2, py-p.size/2, p.size, p.size);
          }
        } else if(this.gl){
          const gl=this.gl; gl.clearColor(0,0,0,1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
          this.renderer2D.draw(this.scene, this.camera);
        }
        // Render game on top
        if(this.game && this.game.render) {
          try {
            this.game.render(dt);
          } catch(gameRenderErr) {
            console.error('❌ Game render() threw error:', gameRenderErr?.message);
            console.error('Stack:', gameRenderErr?.stack);
          }
        }
      } catch(err){ console.error('❌ Engine frame error', err?.message || String(err)); if(err?.stack) console.error('Stack:', err.stack); }
      if(this.running) requestAnimationFrame(this._onFrame);
    }
    stop(){ this.running=false; }
    // convenience API
    createEntity(name){ return this.scene.create(name); }
    find(name){ return this.scene.findByName(name); }
    playSound(url, opts){ return this.audio.play(url, opts); }
    createPrefab(name, template){ return new Prefab(name, template); }
    instantiatePrefab(prefab, parent=null){ return prefab.instantiate(this.scene, parent); }
  }

  // --- Developer Tools: View/Edit Storage ---
  function openDevTools() {
    const devPanel = document.getElementById('sirco-devtools') || document.createElement('div');
    devPanel.id = 'sirco-devtools';
    devPanel.style.cssText = `
      position: fixed; bottom: 0; right: 0; width: 600px; max-height: 400px;
      background: #1a1a1a; border: 2px solid #ffd700; color: #fff;
      font-family: monospace; font-size: 11px; z-index: 999999;
      overflow-y: auto; box-shadow: 0 0 20px rgba(0,0,0,0.8);
    `;
    
    const header = document.createElement('div');
    header.style.cssText = `
      background: #ffd700; color: #000; padding: 5px 10px;
      font-weight: bold; display: flex; justify-content: space-between; align-items: center;
    `;
    header.innerHTML = `
      <span>🔧 Sirco Developer Tools</span>
      <button id="devtools-close" style="background: #ff5555; color: white; border: none; padding: 3px 8px; cursor: pointer;">X</button>
    `;
    
    const content = document.createElement('div');
    content.style.padding = '10px';
    
    const tabs = document.createElement('div');
    tabs.style.cssText = 'margin-bottom: 10px; border-bottom: 1px solid #666;';
    tabs.innerHTML = `
      <button class="devtab" data-tab="storage" style="background: #667eea; color: white; border: 1px solid #ffd700; padding: 5px 10px; cursor: pointer; margin-right: 5px;">💾 Storage</button>
      <button class="devtab" data-tab="cookies" style="background: #667eea; color: white; border: 1px solid #ffd700; padding: 5px 10px; cursor: pointer; margin-right: 5px;">🍪 Cookies</button>
      <button class="devtab" data-tab="cache" style="background: #667eea; color: white; border: 1px solid #ffd700; padding: 5px 10px; cursor: pointer;">💿 Cache</button>
      <button id="devtools-refresh" style="background: #4caf50; color: white; border: 1px solid #ffd700; padding: 5px 10px; cursor: pointer; margin-left: 10px; float: right;">🔄 Refresh</button>
    `;
    
    const display = document.createElement('div');
    display.style.cssText = 'max-height: 300px; overflow-y: auto; background: #0a0a0a; padding: 8px; border: 1px solid #444;';
    
    function showTab(tabName) {
      let content = '';
      if (tabName === 'storage') {
        content += '<strong>localStorage:</strong><br>';
        if (localStorage.length === 0) {
          content += '(empty)<br>';
        } else {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            const value = localStorage.getItem(key);
            content += `<div style="margin: 5px 0; background: #1a1a1a; padding: 5px; border-left: 2px solid #667eea;">
              <strong style="color: #ffd700;">${key}:</strong><br>
              <textarea id="edit-${key}" style="width: 100%; height: 60px; background: #0a0a0a; color: #0f0; border: 1px solid #666; padding: 3px; font-family: monospace;">${value}</textarea><br>
              <button onclick="localStorage.setItem('${key}', document.getElementById('edit-${key}').value); alert('Saved!');" style="background: #4caf50; color: white; border: none; padding: 3px 8px; cursor: pointer;">Save</button>
              <button onclick="localStorage.removeItem('${key}'); location.reload();" style="background: #ff5555; color: white; border: none; padding: 3px 8px; cursor: pointer;">Delete</button>
            </div>`;
          }
        }
      } else if (tabName === 'cookies') {
        content += '<strong>Cookies:</strong><br>';
        if (document.cookie === '') {
          content += '(none)<br>';
        } else {
          document.cookie.split(';').forEach(cookie => {
            const [key, value] = cookie.trim().split('=');
            content += `<div style="margin: 5px 0; background: #1a1a1a; padding: 5px; border-left: 2px solid #ff6b6b;">
              ${key}: ${value}<br>
            </div>`;
          });
        }
      } else if (tabName === 'cache') {
        content += '<strong>IndexedDB & Cache API:</strong><br>';
        content += '<p style="color: #aaa;">Use browser DevTools (F12) → Application → Storage for full Cache API details.</p>';
        content += '<p>Quick actions:<br>';
        content += '• <strong>Clear all localStorage:</strong> <button onclick="localStorage.clear(); location.reload();" style="background: #ff5555; padding: 3px 8px; cursor: pointer;">CLEAR</button><br>';
        content += '• <strong>Clear all cookies:</strong> <button onclick="document.cookie.split(\';\').forEach(c => document.cookie = c.split(\'=\')[0] + \'=; expires=Thu, 01 Jan 1970 00:00:00 UTC;\'); location.reload();" style="background: #ff5555; padding: 3px 8px; cursor: pointer;">CLEAR</button><br>';
        content += '</p>';
      }
      display.innerHTML = content;
    }
    
    // Tab switching
    tabs.querySelectorAll('.devtab').forEach(btn => {
      btn.addEventListener('click', () => {
        tabs.querySelectorAll('.devtab').forEach(b => b.style.background = '#667eea');
        btn.style.background = '#4caf50';
        showTab(btn.dataset.tab);
      });
    });
    
    // Refresh button
    document.addEventListener('click', (e) => {
      if (e.target.id === 'devtools-refresh') {
        showTab(document.querySelector('.devtab[style*="rgb(76, 175, 80)"]')?.dataset.tab || 'storage');
      }
    });
    
    // Close button
    document.addEventListener('click', (e) => {
      if (e.target.id === 'devtools-close') {
        devPanel.remove();
      }
    });
    
    content.appendChild(tabs);
    content.appendChild(display);
    devPanel.appendChild(header);
    devPanel.appendChild(content);
    document.body.appendChild(devPanel);
    
    // Show storage tab by default
    showTab('storage');
  }
  
  window.SircoDevTools = openDevTools; // Expose to console

  // --- Game Tree System (for narrative/branching games) ---
  class GameTree {
    constructor(name, nodes = {}) {
      this.name = name;
      this.nodes = nodes;
      this.currentNode = null;
      this.history = [];
      console.log(`[GameTree] Created tree: ${name} with ${Object.keys(nodes).length} nodes`);
    }
    addNode(id, node) {
      if (this.nodes[id]) {
        console.warn(`[GameTree] Node ${id} already exists, overwriting`);
      }
      this.nodes[id] = node;
    }
    getNode(id) {
      if (!this.nodes[id]) {
        console.error(`[GameTree] Node ${id} not found!`);
        return null;
      }
      return this.nodes[id];
    }
    visit(id) {
      const node = this.getNode(id);
      if (!node) return null;
      this.currentNode = id;
      this.history.push(id);
      console.log(`[GameTree] Visited node: ${id}`);
      return node;
    }
    hasNode(id) {
      return !!this.nodes[id];
    }
    getChoices(id) {
      const node = this.getNode(id);
      return node?.choices || [];
    }
    getHistory() {
      return [...this.history];
    }
  }

  // --- Avatar Drawing System (procedural character generation) ---
  class AvatarRenderer {
    static drawHead(ctx, x, y, size, options = {}) {
      const scale = size / 100;
      ctx.save();
      ctx.translate(x, y);
      
      // Skin tone
      ctx.fillStyle = options.skinTone || '#f4a460';
      ctx.beginPath();
      ctx.arc(0, 0, 40 * scale, 0, Math.PI * 2);
      ctx.fill();
      
      // Eyes
      ctx.fillStyle = options.eyeColor || '#333';
      const eyeDist = 15 * scale;
      const eyeY = -10 * scale;
      ctx.beginPath();
      ctx.arc(-eyeDist, eyeY, 5 * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(eyeDist, eyeY, 5 * scale, 0, Math.PI * 2);
      ctx.fill();
      
      // Pupils
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(-eyeDist, eyeY, 2 * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(eyeDist, eyeY, 2 * scale, 0, Math.PI * 2);
      ctx.fill();
      
      // Mouth
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2 * scale;
      ctx.beginPath();
      ctx.arc(0, 15 * scale, 10 * scale, 0, Math.PI);
      ctx.stroke();
      
      // Hair
      ctx.fillStyle = options.hairColor || '#8b4513';
      ctx.beginPath();
      ctx.arc(0, -30 * scale, 40 * scale, 0, Math.PI);
      ctx.fill();
      
      ctx.restore();
    }
    
    static drawBody(ctx, x, y, size, options = {}) {
      const scale = size / 100;
      ctx.save();
      ctx.translate(x, y);
      
      // Torso
      ctx.fillStyle = options.shirtColor || '#0066cc';
      ctx.fillRect(-30 * scale, -20 * scale, 60 * scale, 50 * scale);
      
      // Arms
      ctx.fillStyle = options.armColor || '#f4a460';
      ctx.fillRect(-35 * scale, -10 * scale, 10 * scale, 60 * scale);
      ctx.fillRect(25 * scale, -10 * scale, 10 * scale, 60 * scale);
      
      // Legs
      ctx.fillStyle = options.pantsColor || '#333';
      ctx.fillRect(-15 * scale, 30 * scale, 12 * scale, 40 * scale);
      ctx.fillRect(3 * scale, 30 * scale, 12 * scale, 40 * scale);
      
      // Feet
      ctx.fillStyle = '#333';
      ctx.fillRect(-15 * scale, 70 * scale, 12 * scale, 8 * scale);
      ctx.fillRect(3 * scale, 70 * scale, 12 * scale, 8 * scale);
      
      ctx.restore();
    }
    
    static drawCharacter(ctx, x, y, size = 100, options = {}) {
      this.drawBody(ctx, x, y + 50, size, options);
      this.drawHead(ctx, x, y - 20, size, options);
    }
    
    static generateRandomAvatar(options = {}) {
      const skinTones = ['#f4a460', '#daa520', '#cd853f', '#8b4513'];
      const hairColors = ['#000', '#8b4513', '#ff0000', '#ffd700'];
      const eyeColors = ['#333', '#006400', '#8b0000', '#4169e1'];
      const shirtColors = ['#0066cc', '#ff0000', '#00aa00', '#ff6600'];
      
      return {
        skinTone: options.skinTone || skinTones[Math.floor(Math.random() * skinTones.length)],
        hairColor: options.hairColor || hairColors[Math.floor(Math.random() * hairColors.length)],
        eyeColor: options.eyeColor || eyeColors[Math.floor(Math.random() * eyeColors.length)],
        shirtColor: options.shirtColor || shirtColors[Math.floor(Math.random() * shirtColors.length)]
      };
    }
  }

  // --- Command System ---
  class CommandSystem {
    constructor(engine) {
      this.engine = engine;
      this.commands = new Map();
      this.history = [];
      this.maxHistory = 100;
      console.log('[CommandSystem] Initialized');
    }
    
    register(name, callback, description = '') {
      if (this.commands.has(name)) {
        console.warn(`[CommandSystem] Command '${name}' already exists, overwriting`);
      }
      this.commands.set(name, { callback, description, name });
      console.log(`[CommandSystem] Registered command: ${name}`);
    }
    
    execute(commandStr) {
      const parts = commandStr.trim().split(/\s+/);
      const cmdName = parts[0];
      const args = parts.slice(1);
      
      if (!this.commands.has(cmdName)) {
        console.error(`[CommandSystem] Unknown command: ${cmdName}`);
        return null;
      }
      
      const cmd = this.commands.get(cmdName);
      try {
        this.history.push(commandStr);
        if (this.history.length > this.maxHistory) this.history.shift();
        console.log(`[CommandSystem] Executing: ${commandStr}`);
        return cmd.callback(...args);
      } catch (e) {
        console.error(`[CommandSystem] Error executing ${cmdName}: ${e.message}`);
        return null;
      }
    }
    
    listCommands() {
      return Array.from(this.commands.values()).map(c => `${c.name} - ${c.description}`);
    }
    
    getHistory() {
      return [...this.history];
    }
  }

  // --- Enhanced Debug Console with Command Execution ---
  class DebugConsole {
    constructor(engine) {
      this.engine = engine;
      this.enabled = true;
      this.visible = false;
      this.logs = [];
      this.maxLogs = 500;
      this.commands = {
        'help': () => Array.from(engine.commands.commands.keys()).join(', '),
        'clear': () => { this.logs = []; this.updateDisplay(); return 'Console cleared'; },
        'canvas-info': () => `Canvas: ${engine.canvas.width}x${engine.canvas.height}`,
        'fps': () => `FPS: ${Math.round(1/engine.dt)}`,
        'entities': () => `Entities: ${engine.scene.entities.size}`,
        'disable-storage': () => { this.showStorageViewer = false; return 'Storage viewer disabled'; },
        'enable-storage': () => { this.showStorageViewer = true; return 'Storage viewer enabled'; }
      };
      console.log('[DebugConsole] Initialized');
    }
    
    log(msg, type = 'log') {
      if (!this.enabled) return;
      const timestamp = new Date().toLocaleTimeString();
      this.logs.push({ text: msg, type, timestamp });
      if (this.logs.length > this.maxLogs) this.logs.shift();
      if (this.visible) this.updateDisplay();
    }
    
    updateDisplay() {
      const console = document.getElementById('sirco_debug_menu_console');
      if (!console) return;
      console.innerHTML = this.logs.map(log => 
        `<div class="sirco_debug_menu_log sirco_debug_menu_log_${log.type}">[${log.timestamp}] ${log.text}</div>`
      ).join('');
      console.scrollTop = console.scrollHeight;
    }
    
    executeUserCommand(cmdStr) {
      const result = this.engine.commands.execute(cmdStr);
      this.log(`> ${cmdStr}`, 'command');
      if (result !== null) {
        this.log(`${result}`, 'result');
      }
    }
  }

  // --- bootstrap logic: find game path from import.meta.url query param ---
  return { 
    Engine, ResourceLoader, Vec2, Vec3, Transform, Sprite, PhysicsBody2D, Camera2D, Scene, Entity,
    RigidBody2D, Physics2DSolver, Physics3DWorld, Mesh, Material, Renderer3DPBR,
    PluginManager, NetworkSnapshot, RollbackManager, AudioManager, Input,
    ImageProcessor, SpriteRenderer, SpriteLayer, Animator, Tilemap, Particle, ParticleEmitter, TextRenderer,
    Prefab, SceneManager, AssetImporter, Renderer2D, Canvas2DRenderer,
    GameTree, AvatarRenderer, CommandSystem, DebugConsole,
    Room, NPC, GameItem, Player, DialogueUI, DrawingUtils
  };
})();

// expose to global for debugging
window.SircoEngine = __engine;

// Auto-init: create instance and import game module from query param
(async function bootstrap(){
  try {
    console.log('🎮 Sirco Engine Bootstrap Starting...');
    const moduleUrl = new URL(import.meta.url);
    console.log('📍 Engine module URL:', moduleUrl.href);
    const gamePath = moduleUrl.searchParams.get('game') || './game.js';
    console.log('🎯 Game path from query:', gamePath);
    const engineInstance = new __engine.Engine();
    console.log('✨ Engine instance created');
    window.Sirco = engineInstance; // global handle: Sirco
    
    // Helper function to try importing a path
    async function tryImportGame(path) {
      const base = moduleUrl.origin + moduleUrl.pathname.replace(/\/[^\/]*$/,'/');
      const resolved = (path.startsWith('http')||path.startsWith('/')) ? new URL(path, moduleUrl).href : new URL(path, base).href;
      console.log(`🔗 Trying game path: ${resolved}`);
      try {
        const m = await import(resolved);
        console.log(`✅ Successfully imported game from: ${resolved}`);
        return m.default || m;
      } catch(e) {
        console.warn(`⚠️ Failed to load game from ${resolved}: ${e.message}`);
        return null;
      }
    }
    
    // Try multiple game paths
    let gameExport = null;
    const pathsToTry = [];
    
    if (gamePath && gamePath !== './game.js' && gamePath !== '/game.js') {
      pathsToTry.push(gamePath);
    }
    pathsToTry.push('./game.js', '/game.js');
    
    for (const path of pathsToTry) {
      gameExport = await tryImportGame(path);
      if (gameExport) break;
    }
    
    if (gameExport) {
      console.log('📦 Game module imported:', gameExport);
      console.log('🎮 Game default export:', typeof gameExport);
      engineInstance.start(gameExport);
    } else {
      console.warn('⚠️ Sirco Engine: Could not load game module from any path');
      console.info('💡 Tip: Ensure your game file exists at ./game.js or /game.js');
    }
    
    // Keyboard shortcut for dev tools (Ctrl+Shift+D)
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        window.SircoDevTools();
      }
    });
    console.log('💡 Tip: Press Ctrl+Shift+D to open Developer Tools');
    console.log('🐛 Tip: Press Ctrl+Shift+Alt+Z to toggle Debug Console');
    
  } catch(err){ 
    console.error('💥 Sirco Engine bootstrap failed:', err?.message || String(err));
    console.error('Stack:', err?.stack || 'No stack trace');
    console.error('Full error:', err);
  }
})();