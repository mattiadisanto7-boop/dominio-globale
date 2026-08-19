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

  private noise(
    delay: number,
    duration: number,
    volume = 0.12,
    frequency = 760,
    type: BiquadFilterType = "bandpass",
    q = 0.65,
  ) {
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
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
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
        this.tone(58, 0, .46, .28, "sawtooth", 36);
        this.tone(91, .025, .34, .18, "triangle", 48);
        [0, .085, .17, .255].forEach((delay, index) => {
          this.noise(delay, .055, .09 - index * .01, 1850, "highpass", .85);
          this.tone(310 - index * 18, delay, .065, .075, "square", 165);
        });
        this.noise(.22, .25, .1, 175, "lowpass", .5);
        break;
      case "dice":
        [0, .07, .14, .21, .29, .38, .48].forEach((delay, index) => {
          this.noise(delay, 0.065, 0.12 - index * 0.008);
          this.tone(190 + index * 31, delay, 0.045, 0.07, "square", 120 + index * 19);
        });
        break;
      case "battle":
        this.noise(0, .08, .24, 1700, "highpass", .75);
        this.noise(.025, .52, .26, 145, "lowpass", .45);
        this.tone(82, 0, .48, .34, "sawtooth", 31);
        this.noise(.2, .07, .15, 2100, "highpass", .8);
        this.noise(.225, .38, .17, 125, "lowpass", .45);
        this.tone(69, .2, .39, .25, "triangle", 29);
        break;
      case "conquest":
        this.noise(0, .34, .13, 135, "lowpass", .5);
        this.tone(72, 0, .36, .24, "sawtooth", 34);
        [392, 523, 659, 784].forEach((frequency, index) => this.tone(frequency, .16 + index * .105, .42, .14, "triangle", frequency * 1.03));
        break;
      case "fortify":
        this.tone(64, 0, .4, .2, "sawtooth", 42);
        [0, .1, .2].forEach((delay) => this.noise(delay, .05, .06, 1500, "highpass", .8));
        this.tone(170, .08, .3, .12, "triangle", 390);
        break;
      case "cards":
        [523, 659, 784, 1047].forEach((frequency, index) => this.tone(frequency, index * .075, .42, .1, "sine", frequency));
        break;
      case "turn":
        this.tone(262, 0, .3, .14, "sawtooth", 262);
        this.tone(392, .11, .36, .15, "sawtooth", 392);
        this.tone(523, .24, .46, .13, "triangle", 523);
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
