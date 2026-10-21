const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const scoreElement = document.getElementById("score");
const statusElement = document.getElementById("status");
const livesElement = document.getElementById("lives");
const gameOverElement = document.getElementById("gameOver");
const finalScoreElement = document.getElementById("finalScore");
const playerImg = document.getElementById("playerCharacter");
const restartButton = document.getElementById("restartButton");
const playAgainButton = document.getElementById("playAgainButton");

const TOTAL_OBJETOS = 25;
const REBOTE = 0.86;
const VIDAS_MAX = 5;
const INVULNERABLE_MS = 1500; // tiempo sin recibir daño después de un golpe
const RUTAS_IMAGENES = [
  "assets/zombi.svg",
  "assets/cultista.svg",
  "assets/cuervo.svg",
  "assets/parasito.svg"
];
const imagenes = RUTAS_IMAGENES.map(src => {
  const img = new Image();
  img.src = src;
  return img;
});

let ancho = 800, alto = 500, eliminadas = 0, ultimoTiempo = 0;
let objetos = [], impactos = [], audioContext = null;
let ultimoChoque = 0;
let vidas = VIDAS_MAX, invulnerableHasta = 0, juegoTerminado = false;

// Música de fondo: se reproduce en bucle con un elemento de audio
const musica = new Audio("assets/musica.wav");
musica.loop = true;
musica.volume = 0.22;
musica.preload = "auto";
let musicaActiva = false;

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
function ajustarCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  ancho = Math.max(320, rect.width);
  alto = Math.max(320, rect.height);
  canvas.width = Math.round(ancho * dpr);
  canvas.height = Math.round(alto * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  objetos.forEach(o => {
    o.x = clamp(o.x, o.r, ancho-o.r);
    o.y = clamp(o.y, o.r, alto-o.r);
  });
}
window.addEventListener("resize", ajustarCanvas);

// Zona de golpe del personaje (solo el cuerpo visible, no toda la imagen)
function hitboxJugador() {
  const c = canvas.getBoundingClientRect();
  const p = playerImg.getBoundingClientRect();
  return {
    x: p.left - c.left + p.width * 0.06,
    y: p.top - c.top + p.height * 0.25,
    w: p.width * 0.28,
    h: p.height * 0.75
  };
}

// Distancia entre el centro del círculo y el rectángulo del personaje
function tocaAlJugador(o, margen = 0) {
  const hb = hitboxJugador();
  const cx = clamp(o.x, hb.x, hb.x + hb.w);
  const cy = clamp(o.y, hb.y, hb.y + hb.h);
  return Math.hypot(o.x - cx, o.y - cy) < o.r * 0.85 + margen;
}

class Objeto {
  constructor(tipo) {
    this.tipo = tipo;
    this.reiniciar(true);
  }
  colocarSeguro() {
    // Elige una posición aleatoria que no caiga encima del personaje
    for (let intento = 0; intento < 15; intento++) {
      this.x = this.r + Math.random() * Math.max(1, ancho - this.r*2);
      this.y = this.r + Math.random() * Math.max(1, alto - this.r*2);
      if (!tocaAlJugador(this, 70)) break;
    }
    this.centroX = this.x;
    this.centroY = this.y;
  }
  reiniciar(inicial = false) {
    this.r = 20 + Math.random() * 15;
    this.colocarSeguro();
    this.velocidad = 1.1 + Math.random() * 2.2;
    this.angulo = Math.random() * Math.PI * 2;
    this.vx = (Math.random() - .5) * this.velocidad * 2;
    this.vy = (Math.random() - .5) * this.velocidad * 2;
    this.direccion = Math.floor(Math.random() * 4);
    this.fase = Math.random() * Math.PI * 2;
    this.radioOrbita = 18 + Math.random() * 32;
    this.tiempoVida = 0;
    this.giro = (Math.random() - .5) * .04;
    this.rotacion = Math.random() * Math.PI * 2;
    if (!inicial) {
      // El objeto reaparece con otra dirección y posición aleatoria.
      this.direccion = Math.floor(Math.random() * 4);
    }
  }
  actualizar(paso, tiempo) {
    this.tiempoVida += paso;
    const v = this.velocidad * paso;
    // Cuatro patrones: arriba, abajo, diagonal y circular.
    if (this.direccion === 0) { // arriba
      this.y -= v * 1.25;
      this.x += Math.sin(this.tiempoVida * .06 + this.fase) * .55 * paso;
    } else if (this.direccion === 1) { // abajo
      this.y += v * 1.25;
      this.x += Math.cos(this.tiempoVida * .05 + this.fase) * .55 * paso;
    } else if (this.direccion === 2) { // diagonal
      this.x += this.vx * paso;
      this.y += this.vy * paso;
    } else { // circular
      this.fase += .035 * paso;
      this.x = this.centroX + Math.cos(this.fase) * this.radioOrbita;
      this.y = this.centroY + Math.sin(this.fase) * this.radioOrbita;
    }
    this.rotacion += this.giro * paso;

    // Rebote contra los límites del canvas.
    if (this.x < this.r) { this.x = this.r; this.vx = Math.abs(this.vx); this.direccion = 2; }
    if (this.x > ancho-this.r) { this.x = ancho-this.r; this.vx = -Math.abs(this.vx); this.direccion = 2; }
    if (this.y < this.r) { this.y = this.r; this.vy = Math.abs(this.vy); if(this.direccion !== 3) this.direccion = 2; }
    if (this.y > alto-this.r) { this.y = alto-this.r; this.vy = -Math.abs(this.vy); if(this.direccion !== 3) this.direccion = 2; }

    // Si permanece mucho tiempo en una zona, desaparece y reaparece.
    if (this.tiempoVida > 700 + Math.random()*400) this.reiniciar();
    // Actualizar centro orbital lentamente para que el patrón circule por el escenario.
    if (this.direccion === 3) {
      this.centroX += Math.sin(tiempo*.0004 + this.fase) * .15 * paso;
      this.centroY += Math.cos(tiempo*.0003 + this.fase) * .15 * paso;
      this.centroX = clamp(this.centroX, this.r+this.radioOrbita, ancho-this.r-this.radioOrbita);
      this.centroY = clamp(this.centroY, this.r+this.radioOrbita, alto-this.r-this.radioOrbita);
    }
  }
  dibujar() {
    const img = imagenes[this.tipo];
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotacion);
    if (img.complete && img.naturalWidth) {
      const ratio = img.naturalWidth / img.naturalHeight;
      const w = this.r*2, h = w/ratio;
      ctx.shadowColor = ["#c8b4ff","#ff9b37","#a78bfa","#f5e7cb"][this.tipo];
      ctx.shadowBlur = 12;
      ctx.drawImage(img, -w/2, -h/2, w, h);
    } else {
      ctx.fillStyle = "#e8d9ff";
      ctx.beginPath(); ctx.arc(0,0,this.r,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }
  contiene(x,y) { return Math.hypot(x-this.x,y-this.y) <= this.r*1.15; }
}

function generarObjetos() {
  objetos = [];
  for (let i=0; i<TOTAL_OBJETOS; i++) objetos.push(new Objeto(i % imagenes.length));
  // Evita que todos nazcan en el mismo lugar.
  objetos.forEach((o,i) => {
    o.colocarSeguro();
    if(i%4===0) o.direccion=0;
    else if(i%4===1) o.direccion=1;
    else if(i%4===2) o.direccion=2;
    else o.direccion=3;
  });
}

function detectarColisiones() {
  for(let i=0;i<objetos.length;i++){
    for(let j=i+1;j<objetos.length;j++){
      const a=objetos[i], b=objetos[j];
      let dx=b.x-a.x, dy=b.y-a.y;
      let distancia=Math.hypot(dx,dy);
      const minDist=a.r+b.r;
      if(distancia>0 && distancia<minDist){
        const nx=dx/distancia, ny=dy/distancia;
        // Separación para evitar que queden superpuestos.
        const overlap=(minDist-distancia)/2;
        a.x-=nx*overlap; a.y-=ny*overlap;
        b.x+=nx*overlap; b.y+=ny*overlap;
        // Intercambio de componentes de velocidad en la dirección del choque.
        const va=a.vx*nx+a.vy*ny;
        const vb=b.vx*nx+b.vy*ny;
        const impulse=(vb-va)*REBOTE;
        a.vx+=impulse*nx; a.vy+=impulse*ny;
        b.vx-=impulse*nx; b.vy-=impulse*ny;
        a.direccion=2; b.direccion=2;
        impactos.push({x:(a.x+b.x)/2,y:(a.y+b.y)/2,vida:0,radio:8});
        if(performance.now()-ultimoChoque>120){
          reproducirChoque();
          ultimoChoque=performance.now();
        }
      }
    }
  }
}
function dibujarImpactos(paso){
  impactos.forEach(p=>{p.vida+=paso; p.radio+=1.5*paso;});
  impactos=impactos.filter(p=>p.vida<15);
  impactos.forEach(p=>{
    const alpha=1-p.vida/15;
    ctx.save(); ctx.globalAlpha=alpha; ctx.strokeStyle="#ffd36b"; ctx.lineWidth=3;
    ctx.beginPath(); ctx.arc(p.x,p.y,p.radio,0,Math.PI*2); ctx.stroke();
    for(let k=0;k<6;k++){
      const a=k*Math.PI/3;
      ctx.beginPath(); ctx.moveTo(p.x+Math.cos(a)*p.radio*.6,p.y+Math.sin(a)*p.radio*.6);
      ctx.lineTo(p.x+Math.cos(a)*(p.radio+9),p.y+Math.sin(a)*(p.radio+9)); ctx.stroke();
    }
    ctx.restore();
  });
}
function reproducirChoque(){
  if(!audioContext || audioContext.state!=="running") return;
  const osc=audioContext.createOscillator(), gain=audioContext.createGain();
  osc.type="triangle"; osc.frequency.setValueAtTime(520,audioContext.currentTime);
  osc.frequency.exponentialRampToValueAtTime(150,audioContext.currentTime+.09);
  gain.gain.setValueAtTime(.045,audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+.1);
  osc.connect(gain); gain.connect(audioContext.destination); osc.start(); osc.stop(audioContext.currentTime+.11);
}

function reproducirDanio(){
  if(!audioContext || audioContext.state!=="running") return;
  const osc=audioContext.createOscillator(), gain=audioContext.createGain();
  osc.type="sawtooth"; osc.frequency.setValueAtTime(320,audioContext.currentTime);
  osc.frequency.exponentialRampToValueAtTime(70,audioContext.currentTime+.28);
  gain.gain.setValueAtTime(.08,audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+.3);
  osc.connect(gain); gain.connect(audioContext.destination); osc.start(); osc.stop(audioContext.currentTime+.31);
}

// ----- Vidas -----
function dibujarVidas(){
  livesElement.textContent = "❤️".repeat(vidas) + "🖤".repeat(VIDAS_MAX - vidas);
}

function terminarJuego(){
  juegoTerminado = true;
  finalScoreElement.textContent = eliminadas;
  gameOverElement.hidden = false;
  statusElement.textContent = "Te quedaste sin vidas. ¡Intenta de nuevo!";
}

function revisarGolpes(tiempo){
  if(juegoTerminado || tiempo < invulnerableHasta) return;
  for(const o of objetos){
    if(tocaAlJugador(o)){
      vidas--;
      invulnerableHasta = tiempo + INVULNERABLE_MS;
      impactos.push({x:o.x,y:o.y,vida:0,radio:14});
      o.reiniciar();
      reproducirDanio();
      dibujarVidas();
      if(vidas <= 0) terminarJuego();
      else statusElement.textContent = `¡Te golpearon! Te quedan ${vidas} ${vidas===1?"vida":"vidas"}.`;
      break;
    }
  }
}

canvas.addEventListener("pointerdown", event => {
  if(juegoTerminado) return;
  const rect=canvas.getBoundingClientRect();
  const x=event.clientX-rect.left, y=event.clientY-rect.top;
  for(let i=objetos.length-1;i>=0;i--){
    if(objetos[i].contiene(x,y)){
      eliminadas++;
      scoreElement.textContent=eliminadas;
      impactos.push({x:objetos[i].x,y:objetos[i].y,vida:0,radio:12});
      objetos[i].reiniciar();
      statusElement.textContent="¡Atrapado! La criatura reapareció en otra zona.";
      break;
    }
  }
});

function animar(tiempo){
  ctx.clearRect(0,0,ancho,alto);
  const delta=ultimoTiempo===0?16.67:Math.min(tiempo-ultimoTiempo,40);
  ultimoTiempo=tiempo;
  const paso=delta/16.67;
  if(!juegoTerminado){
    objetos.forEach(o=>o.actualizar(paso,tiempo));
    detectarColisiones();
    revisarGolpes(tiempo);
  }
  objetos.forEach(o=>o.dibujar());
  // El personaje parpadea mientras es invulnerable
  playerImg.style.opacity = (tiempo < invulnerableHasta && Math.floor(tiempo/100)%2) ? ".35" : "1";
  dibujarImpactos(paso);
  requestAnimationFrame(animar);
}

// ----- Música constante -----
// Los navegadores bloquean el audio hasta que el usuario interactúa con la página.
// Se intenta iniciar sola y, si la bloquean, arranca con el primer clic, toque o tecla.
async function desbloquearAudio(){
  try{
    if(!audioContext) audioContext=new (window.AudioContext||window.webkitAudioContext)();
    if(audioContext.state==="suspended") await audioContext.resume();
  }catch(error){ console.warn("Audio no disponible aún:", error); }
}
async function iniciarMusica(){
  try{
    await musica.play();
    musicaActiva=true;
  }catch(error){
    musicaActiva=false; // bloqueada: se reintenta en el siguiente gesto
  }
}
const EVENTOS_GESTO=["pointerdown","keydown","touchstart"];
async function alPrimerGesto(){
  await desbloquearAudio();
  if(!musicaActiva) await iniciarMusica();
  if(musicaActiva && audioContext && audioContext.state==="running"){
    EVENTOS_GESTO.forEach(e=>window.removeEventListener(e,alPrimerGesto));
  }
}
EVENTOS_GESTO.forEach(e=>window.addEventListener(e,alPrimerGesto,{passive:true}));
iniciarMusica(); // intento automático al cargar

function reiniciarJuego(){
  eliminadas=0; scoreElement.textContent="0"; impactos=[];
  vidas=VIDAS_MAX; invulnerableHasta=0; juegoTerminado=false;
  gameOverElement.hidden=true;
  dibujarVidas();
  generarObjetos();
  statusElement.textContent="Juego reiniciado. ¡Atrapa las criaturas y no dejes que te toquen!";
}
restartButton.addEventListener("click", reiniciarJuego);
playAgainButton.addEventListener("click", reiniciarJuego);

function iniciar(){
  dibujarVidas();
  ajustarCanvas();
  generarObjetos();
  requestAnimationFrame(animar);
}
if(imagenes.every(img=>img.complete && img.naturalWidth)) iniciar();
else {
  let cargadas=0;
  imagenes.forEach(img=>{
    const listo=()=>{cargadas++; if(cargadas===imagenes.length) iniciar();};
    img.onload=listo; img.onerror=()=>{statusElement.textContent="Error al cargar una imagen del juego."; listo();};
  });
}