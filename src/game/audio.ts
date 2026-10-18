export type SfxName = 'collect' | 'bonus' | 'hit' | 'dash' | 'event' | 'tick' | 'go' | 'gameover' | 'win' | 'boom' | 'ignite' | 'drop' | 'nearMiss' | 'click';

/** Tiny synthesized sound kit — no audio assets required. */
class SoundKit {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  /** Must be called from a user gesture so browsers allow audio. */
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, filterFreq: number) {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(this.master!);
    src.start();
  }

  play(name: SfxName) {
    if (this.muted || !this.ctx || !this.master || this.ctx.state !== 'running') return;
    switch (name) {
      case 'collect': this.tone(660, 0.09, 'square', 0.12, 1320); break;
      case 'bonus': [880, 1100, 1320].forEach((f, i) => this.tone(f, 0.08, 'square', 0.1, undefined, i * 0.05)); break;
      case 'hit': this.tone(220, 0.35, 'sawtooth', 0.25, 50); this.noise(0.25, 0.3, 1200); break;
      case 'dash': this.noise(0.14, 0.18, 3000); break;
      case 'event': this.tone(520, 0.16, 'square', 0.14); this.tone(390, 0.22, 'square', 0.14, undefined, 0.18); break;
      case 'tick': this.tone(440, 0.1, 'triangle', 0.2); break;
      case 'go': this.tone(880, 0.25, 'triangle', 0.22, 1760); break;
      case 'gameover': [440, 330, 220].forEach((f, i) => this.tone(f, 0.25, 'sawtooth', 0.15, undefined, i * 0.18)); break;
      case 'win': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.2, 'square', 0.12, undefined, i * 0.1)); break;
      case 'boom': this.noise(0.3, 0.25, 600); this.tone(120, 0.25, 'sine', 0.3, 40); break;
      case 'ignite': this.noise(0.4, 0.12, 900); break;
      case 'drop': this.tone(1400, 0.06, 'sine', 0.05, 900); break;
      case 'nearMiss': this.tone(1200, 0.07, 'triangle', 0.08, 1600); break;
      case 'click': this.tone(700, 0.05, 'square', 0.08); break;
    }
  }
}

export const sound = new SoundKit();
