export type GameSound =
  | "ui"
  | "deploy"
  | "dice"
  | "battle"
  | "conquest"
  | "fortify"
  | "cards"
  | "turn"
  | "message"
  | "victory"
  | "error";

class GameSoundEngine {
  private context?: AudioContext;
  private master?: GainNode;
  private muted = false;

  constructor() {
    if (typeof window !== "undefined") this.muted = window.localStorage.getItem("dominio-globale:sound") === "off";
  }

  isMuted() {
    return this.muted;
  }

  setMuted(value: boolean) {
    this.muted = value;
    if (typeof window !== "undefined") window.localStorage.setItem("dominio-globale:sound", value ? "off" : "on");
    if (this.master) this.master.gain.setTargetAtTime(value ? 0 : 0.32, this.context!.currentTime, 0.02);
    if (!value) this.play("ui");
  }

  unlock() {
    if (typeof window === "undefined") return;
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : 0.32;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === "suspended") void this.context.resume();
  }

  private tone(
    frequency: number,
    delay: number,
    duration: number,
    volume = 0.18,
    type: OscillatorType = "sine",
    endFrequency = frequency,
  ) {
    if (!this.context || !this.master) return;
    const start = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.018, duration / 3));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }

  private noise(delay: number, duration: number, volume = 0.12) {
    if (!this.context || !this.master) return;
    const sampleRate = this.context.sampleRate;
    const buffer = this.context.createBuffer(1, Math.max(1, Math.floor(sampleRate * duration)), sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < channel.length; index += 1) {
      channel[index] = (Math.random() * 2 - 1) * (1 - index / channel.length);
    }
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    const start = this.context.currentTime + delay;
    source.buffer = buffer;
    filter.type = "bandpass";
    filter.frequency.value = 760;
    filter.Q.value = 0.65;
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(start);
  }

  play(sound: GameSound) {
    this.unlock();
    if (this.muted || !this.context) return;
    switch (sound) {
      case "ui":
        this.tone(620, 0, 0.055, 0.09, "sine", 790);
        break;
      case "deploy":
        this.tone(112, 0, 0.16, 0.28, "triangle", 68);
        this.tone(420, 0.035, 0.09, 0.08, "sine", 310);
        break;
      case "dice":
        [0, .07, .14, .21, .29, .38, .48].forEach((delay, index) => {
          this.noise(delay, 0.065, 0.12 - index * 0.008);
          this.tone(190 + index * 31, delay, 0.045, 0.07, "square", 120 + index * 19);
        });
        break;
      case "battle":
        this.noise(0, 0.2, 0.22);
        this.tone(96, 0, 0.28, 0.32, "sawtooth", 45);
        this.tone(142, 0.18, 0.2, 0.22, "triangle", 72);
        break;
      case "conquest":
        [392, 494, 587, 784].forEach((frequency, index) => this.tone(frequency, index * .095, .32, .14, "triangle", frequency * 1.04));
        this.noise(.28, .24, .07);
        break;
      case "fortify":
        this.tone(170, 0, .38, .16, "triangle", 460);
        this.tone(255, .06, .3, .08, "sine", 620);
        break;
      case "cards":
        [523, 659, 784, 1047].forEach((frequency, index) => this.tone(frequency, index * .075, .42, .1, "sine", frequency));
        break;
      case "turn":
        this.tone(262, 0, .32, .14, "triangle", 262);
        this.tone(392, .11, .38, .16, "triangle", 392);
        this.tone(523, .24, .48, .13, "triangle", 523);
        break;
      case "message":
        this.tone(880, 0, .11, .1, "sine", 1100);
        this.tone(1175, .09, .16, .08, "sine", 1320);
        break;
      case "victory":
        [262, 330, 392, 523, 659, 784].forEach((frequency, index) => this.tone(frequency, index * .13, .65, .16, "triangle", frequency * 1.01));
        [0.5, .66, .82].forEach((delay) => this.noise(delay, .28, .06));
        break;
      case "error":
        this.tone(180, 0, .18, .2, "sawtooth", 92);
        this.tone(135, .11, .24, .15, "square", 70);
        break;
    }
  }
}

export const gameSound = new GameSoundEngine();
