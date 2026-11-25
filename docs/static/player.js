'use strict';
const $ = id => document.getElementById(id);
const ui = Object.fromEntries(['library','notice','status','phrase','pinyin','translation','phase','progress','elapsed','remaining','play','stop','completed','rounds','active-count','settings','reset','minutes','count','speed','speed-value','pause','pause-value','shuffle'].map(id=>[id,$(id)]));
const audio = new Audio();
try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
const playHTML = ui.play.innerHTML;
audio.preload = 'auto';
let phrases = [], session = null;
const defaults = {minutes:60,count:20,mode:'zh',speed:80,pause:3,repeat:2,shuffle:true};

// Independent optional music; never route speech through Web Audio.
const music = new Audio();
music.loop = true;
music.preload = 'none';
const musicUI = {toggle:$('music-toggle'), volume:$('music-volume'), value:$('music-value'), status:$('music-status'), hint:$('music-hint')};
let musicAvailable = false, musicEnabled = false, musicVolume = 15;
let musicContext = null, musicGain = null, musicSource = null, musicGeneration = 0, musicError = '';
let nativeMusicVolume = false;
try { music.volume = .15; nativeMusicVolume = Math.abs(music.volume - .15) < .01; } catch {}
try { const stored = JSON.parse(localStorage.getItem('mandarin-loop-music-v1') || '{}'); musicEnabled = stored.enabled === true; if(typeof stored.volume === 'number' && Number.isFinite(stored.volume)) musicVolume = Math.max(0,Math.min(100,Math.round(stored.volume))); } catch {}
function saveMusic(){try{localStorage.setItem('mandarin-loop-music-v1',JSON.stringify({enabled:musicEnabled,volume:musicVolume}));}catch{}}
function updateMusicUI(){
    musicUI.toggle.disabled = !musicAvailable;
    musicUI.volume.disabled = !musicAvailable;
    musicUI.toggle.setAttribute('aria-pressed',String(musicAvailable && musicEnabled));
    musicUI.toggle.textContent = musicEnabled && musicAvailable ? 'Disattiva' : 'Attiva';
    musicUI.volume.value = musicVolume;
    musicUI.value.textContent = musicVolume + '%';
    musicUI.status.textContent = !musicAvailable ? 'Aggiungi song.mp3 alla cartella del progetto' : musicError || (!musicEnabled ? 'Disattivata' : !session ? 'Si avvia con Play' : session.pausedAt !== null ? 'In pausa' : music.paused ? 'Pronta…' : 'In riproduzione · Loop');
    musicUI.hint.hidden = !musicAvailable || nativeMusicVolume;
    musicUI.hint.textContent = 'Volume gestito tramite Web Audio. Su iPhone la musica in background potrebbe interrompersi.';
}
function setMusicVolume(){
    if(nativeMusicVolume) music.volume = musicVolume / 100;
    if(musicGain) musicGain.gain.value = musicVolume / 100;
    saveMusic(); updateMusicUI();
}
function pauseMusic(reset=false){
    ++musicGeneration;
    music.pause();
    if(reset){try{music.currentTime=0;}catch{}}
    updateMusicUI();
}
function failMusic(message){
    pauseMusic(); musicEnabled=false; musicError=message; saveMusic(); updateMusicUI();
}
function syncMusic(){
    if(!musicAvailable || !musicEnabled || !session || session.pausedAt!==null){pauseMusic();return;}
    musicError='';
    const generation=++musicGeneration;
    try {
        let resumed=Promise.resolve();
        if(!nativeMusicVolume){
            // Create/resume synchronously inside Play or the music button gesture.
            if(!musicContext){
                const Context=window.AudioContext || window.webkitAudioContext;
                if(!Context) throw new Error('Volume separato non supportato');
                musicContext=new Context();
                musicGain=musicContext.createGain();
                musicGain.gain.value=musicVolume/100;
                musicSource=musicContext.createMediaElementSource(music);
                musicSource.connect(musicGain); musicGain.connect(musicContext.destination);
            }
            if(musicContext.state!=='running') resumed=musicContext.resume();
        }
        setMusicVolume();
        const started=music.play();
        Promise.all([resumed,started]).then(()=>{if(generation===musicGeneration)updateMusicUI();}).catch(()=>{if(generation===musicGeneration)failMusic('Musica non avviata. Premi Attiva per riprovare.');});
    } catch(e) { if(generation===musicGeneration)failMusic('Musica non disponibile: '+e.message); }
}
function configureMusic(available){
    musicAvailable=available===true;
    if(musicAvailable) music.src='./song.mp3';
    updateMusicUI();
}
musicUI.toggle.addEventListener('click',()=>{if(!musicAvailable)return;musicEnabled=!musicEnabled;musicError='';saveMusic();syncMusic();});
musicUI.volume.addEventListener('input',()=>{musicVolume=Number(musicUI.volume.value);setMusicVolume();});
music.addEventListener('playing',updateMusicUI);
music.addEventListener('pause',updateMusicUI);
music.addEventListener('error',()=>{if(musicAvailable)failMusic('Impossibile leggere song.mp3.');});
updateMusicUI();

function readSettings(){return {minutes:Number(ui.minutes.value),count:Number(ui.count.value),mode:document.querySelector('input[name="mode"]:checked').value,speed:Number(ui.speed.value),pause:Number(ui.pause.value),repeat:Number(document.querySelector('input[name="repeat"]:checked').value),shuffle:ui.shuffle.checked};}
function applySettings(s){ui.minutes.value=Math.min(180,Math.max(1,Number(s.minutes)||60));ui.count.value=String(Math.min(phrases.length,Math.max(1,Number(s.count)||20)));for(const name of ['mode','repeat']){const match=[...document.querySelectorAll(`input[name="${name}"]`)].find(x=>x.value===String(s[name]));if(match)match.checked=true;}ui.speed.value=s.speed;ui.pause.value=s.pause;ui.shuffle.checked=Boolean(s.shuffle);updateSettings();}
function updateSettings(){ui['speed-value'].textContent=ui.speed.value+'%';ui['pause-value'].textContent=ui.pause.value+' s';if(!session){ui.remaining.textContent=formatTime((Number(ui.minutes.value)||0)*60)+' rimanenti';ui['active-count'].textContent=Number(ui.count.value)||'—';}try{localStorage.setItem('mandarin-loop-v1',JSON.stringify(readSettings()));}catch{}}
function formatTime(seconds){const n=Math.max(0,Math.floor(seconds));return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
function notice(message){ui.notice.textContent=message||'';ui.notice.hidden=!message;}
function shuffle(list){const out=[...list];for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}
function showPhrase(p){ui.phrase.textContent=p.chinese;ui.pinyin.textContent=p.pinyin;ui.translation.textContent=p.italian;}
function setLocked(running){ui.play.innerHTML=playHTML;ui.settings.disabled=running;ui.reset.disabled=running;ui.play.disabled=running||!phrases.length;ui.stop.disabled=!running;}
function setProgress(seconds,total){const fraction=Math.min(1,Math.max(0,seconds/total));ui.elapsed.textContent=formatTime(seconds);ui.remaining.textContent=formatTime(Math.ceil(Math.max(0,total-seconds)))+' rimanenti';ui.progress.style.width=(fraction*100)+'%';ui.progress.parentElement.setAttribute('aria-valuenow',String(Math.round(fraction*100)));}
function finish(s, reason, message=''){if(session!==s)return;session=null;pauseMusic(true);mediaState('none');clearInterval(s.tick);clearTimeout(s.deadlineTimer);s.controller.abort();audio.pause();audio.removeAttribute('src');audio.load();document.body.classList.remove('speaking');setLocked(false);if(reason==='done')setProgress(s.total,s.total);ui.status.textContent=reason==='done'?'Completata':reason==='error'?'Errore':'Fermata';ui.phase.textContent=reason==='done'?'Sessione completata!':reason==='error'?'Riproduzione interrotta':'Premi Play per una nuova sessione';if(message)notice(message);}
function alive(s){return session===s&&!s.controller.signal.aborted;}
// One persistent media element; even pauses are actual audio clips.
function mediaState(state){try{if(navigator.mediaSession)navigator.mediaSession.playbackState=state;}catch{}}
function elapsed(s){return ((s.pausedAt ?? performance.now())-s.started)/1000;}
function pauseSession(){const s=session;if(!s||s.pausedAt!==null)return;s.pausedAt=performance.now();clearTimeout(s.deadlineTimer);audio.pause();pauseMusic();mediaState('paused');ui.status.textContent='In pausa';ui.play.disabled=false;ui.play.textContent='Riprendi';document.body.classList.remove('speaking');}
function resumeSession(){const s=session;if(!s||s.pausedAt===null)return;s.started+=performance.now()-s.pausedAt;s.pausedAt=null;ui.play.innerHTML=playHTML;ui.play.disabled=true;ui.status.textContent='In ascolto';mediaState('playing');scheduleDeadline(s);syncMusic();audio.play().catch(e=>{if(alive(s))finish(s,'error','Impossibile riprendere: '+e.message);});}
function scheduleDeadline(s){clearTimeout(s.deadlineTimer);s.deadlineTimer=setTimeout(()=>{if(alive(s)&&s.pausedAt===null)finish(s,'done');},Math.max(0,(s.total-elapsed(s))*1000));}
function setupMedia(){if(!navigator.mediaSession)return;const handlers={play:()=>{if(session)resumeSession();},pause:pauseSession,stop:()=>{if(session){setProgress(elapsed(session),session.total);finish(session,'stop');}}};for(const [key,handler] of Object.entries(handlers)){try{navigator.mediaSession.setActionHandler(key,handler);}catch{}}}
function metadata(p){try{if(navigator.mediaSession&&typeof MediaMetadata!=='undefined')navigator.mediaSession.metadata=new MediaMetadata({title:p.chinese+' · '+p.italian,artist:'Mandarin Loop',album:'Sessione di ascolto'});}catch{}}
function playClip(s,src,rate,label,isSpeech){if(!alive(s))return Promise.resolve(false);if(elapsed(s)>=s.total){finish(s,'done');return Promise.resolve(false);}ui.phase.textContent=label;return new Promise((resolve,reject)=>{let settled=false;const signal=s.controller.signal;const cleanup=()=>{audio.removeEventListener('ended',ended);audio.removeEventListener('error',error);audio.removeEventListener('playing',playing);signal.removeEventListener('abort',abort);};const done=(ok,err)=>{if(settled)return;settled=true;cleanup();document.body.classList.remove('speaking');err?reject(err):resolve(ok);};const ended=()=>done(alive(s));const error=()=>done(false,new Error('Impossibile riprodurre: '+src));const abort=()=>{audio.pause();done(false);};const playing=()=>{if(alive(s)&&isSpeech)document.body.classList.add('speaking');};audio.addEventListener('ended',ended);audio.addEventListener('error',error);audio.addEventListener('playing',playing);signal.addEventListener('abort',abort,{once:true});audio.src=src;audio.playbackRate=rate;audio.preservesPitch=true;audio.webkitPreservesPitch=true;try{audio.play().catch(e=>{if(!alive(s))done(false);else if(s.pausedAt===null)done(false,new Error(e.name==='NotAllowedError'?'Il browser ha bloccato il passaggio audio. Riapri la pagina e premi Play.':'Errore audio: '+e.message));});}catch(e){done(false,e);}});}
function wait(s,seconds,label){if(seconds===0)return Promise.resolve(alive(s));return playClip(s,`./static/silence/${seconds}.mp3`,1,label,false);}
function speak(s,p,language,label){return playClip(s,p.audio[language],language==='chinese'?s.config.speed/80:1,label,true);}
setupMedia();
// The timer is not responsible for changing audio tracks; timeupdate is a fallback
// for the session deadline when background timers are throttled.
audio.addEventListener('timeupdate',()=>{if(session&&session.pausedAt===null&&elapsed(session)>=session.total)finish(session,'done');});
function steps(config){const chineseFirst=config.mode==='zh'||(config.mode==='mix'&&Math.random()<.5);const out=[];if(chineseFirst){out.push(['chinese','Ascolta il mandarino'],['pause','Prova a ricordare il significato'],['italian','Ascolta la traduzione']);for(let i=1;i<config.repeat;i++)out.push(['pause','Prova a ripetere in cinese'],['chinese',`Mandarino · ripetizione ${i+1}/${config.repeat}`]);}else{out.push(['italian','Ascolta la frase italiana'],['pause','Prova a dirlo in cinese'],['chinese','Ascolta il mandarino']);for(let i=1;i<config.repeat;i++)out.push(['pause','Prova a ripetere in cinese'],['chinese',`Mandarino · ripetizione ${i+1}/${config.repeat}`]);}return out;}
async function run(s){try{let previous=null;while(alive(s)){const queue=s.config.shuffle?shuffle(s.pool):[...s.pool];if(queue.length>1&&queue[0].id===previous&&s.config.shuffle)[queue[0],queue[1]]=[queue[1],queue[0]];for(const p of queue){if(!alive(s))return;showPhrase(p);metadata(p);for(const [type,label] of steps(s.config)){const ok=type==='pause'?await wait(s,s.config.pause,label):await speak(s,p,type,label);if(!ok)return;}if(!alive(s))return;s.completed++;ui.completed.textContent=s.completed;previous=p.id;if(!await wait(s,1,'Prossima frase…'))return;}s.rounds++;ui.rounds.textContent=s.rounds;}}catch(e){if(alive(s))finish(s,'error',e.message);}}
function start(){if(session){resumeSession();return;}if(!phrases.length)return;const config=readSettings();if(!Number.isInteger(config.minutes)||config.minutes<1||config.minutes>180){notice('Inserisci una durata intera da 1 a 180 minuti.');ui.minutes.focus();return;}if(!Number.isInteger(config.count)||config.count<1||config.count>phrases.length){notice('Seleziona un numero di frasi valido.');return;}notice('');const pool=(config.shuffle?shuffle(phrases):phrases).slice(0,config.count);const total=config.minutes*60;const s={config,pool,total,started:performance.now(),pausedAt:null,controller:new AbortController(),completed:0,rounds:0};session=s;ui.completed.textContent='0';ui.rounds.textContent='0';ui['active-count'].textContent=pool.length;ui.status.textContent='In ascolto';setLocked(true);mediaState('playing');setProgress(0,total);s.tick=setInterval(()=>{if(!alive(s))return;const t=elapsed(s);if(t>=total)finish(s,'done');else setProgress(t,total);},200);scheduleDeadline(s);run(s);syncMusic();}
ui.play.addEventListener('click',start);ui.stop.addEventListener('click',()=>{if(session){setProgress(elapsed(session),session.total);finish(session,'stop');}});ui.settings.addEventListener('input',updateSettings);ui.settings.addEventListener('change',updateSettings);ui.reset.addEventListener('click',()=>applySettings(defaults));
async function load(){try{const response=await fetch('./library.json',{cache:'no-cache'});const data=await response.json();if(!response.ok)throw new Error(data.error||'Errore caricamento');phrases=data.phrases;configureMusic(data.music);ui.library.textContent=`${phrases.length} frasi disponibili`;ui.count.replaceChildren();for(let i=1;i<=phrases.length;i++){const opt=document.createElement('option');opt.value=i;opt.textContent=i===1?'1 frase':`${i} frasi`;if(i===phrases.length)opt.textContent+=' · Tutte';ui.count.append(opt);}if(data.missing.length)notice(`Audio mancanti per ${data.missing.length} frasi (ID: ${data.missing.join(', ')}). Avvia generate_audio.py e ricarica la pagina.`);if(!phrases.length){ui.status.textContent='Nessun audio';if(!data.missing.length)notice('Nessuna frase disponibile nel JSON.');return;}let saved={};try{saved=JSON.parse(localStorage.getItem('mandarin-loop-v1')||'{}');}catch{}applySettings({...defaults,...saved});showPhrase(phrases[0]);setLocked(false);}catch(e){ui.library.textContent='Libreria non disponibile';ui.status.textContent='Errore';notice(e.message);}}
load();
