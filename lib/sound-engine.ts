export type GameSound =
  | "ui"
  | "deploy"
  | "dice"
  | "battle"
  | "conquest"
  | "continent"
  | "sdadata"
  | "fortify"
  | "cards"
  | "turn"
  | "yourTurn"
  | "message"
  | "victory"
  | "risiko"
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
        [0, .12, .24].forEach((delay) => this.tone(118, delay, .055, .13, "square", 72));
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
        [0, .19, .38].forEach((delay) => {
          this.noise(delay, .16, .14, 155, "lowpass", .48);
          this.tone(92, delay, .2, .16, "sawtooth", 41);
        });
        [392, 523, 659, 784].forEach((frequency, index) => this.tone(frequency, .16 + index * .105, .42, .14, "triangle", frequency * 1.03));
        break;
      case "continent":
        [0, .18, .36, .62].forEach((delay, index) => {
          this.noise(delay, .42, .2 - index * .02, 105 + index * 18, "lowpass", .42);
          this.tone(70 + index * 9, delay, .4, .22, "sawtooth", 29);
        });
        [196, 247, 294, 392, 494, 587, 784].forEach((frequency, index) => this.tone(frequency, .42 + index * .13, .72, .15, index < 3 ? "sawtooth" : "triangle", frequency * 1.015));
        [0, .26, .52, .78, 1.04].forEach((delay) => this.noise(delay, .12, .085, 1950, "highpass", .85));
        break;
      case "sdadata":
        [0, .08, .17, .27, .39, .53].forEach((delay, index) => {
          this.noise(delay, .075, .13 - index * .008, 820 + index * 120, "bandpass", .72);
          this.tone(155 + index * 21, delay, .06, .085, "square", 105 + index * 12);
        });
        this.tone(294, .62, .42, .12, "triangle", 392);
        break;
      case "fortify":
        this.tone(64, 0, .4, .2, "sawtooth", 42);
        [0, .09, .18, .27, .36].forEach((delay, index) => {
          this.noise(delay, .045, .075, 1500 + index * 90, "highpass", .8);
          this.tone(142 - index * 5, delay, .055, .08, "square", 86);
        });
        this.tone(170, .08, .3, .12, "triangle", 390);
        break;
      case "cards":
        [523, 659, 784, 1047].forEach((frequency, index) => this.tone(frequency, index * .075, .42, .1, "sine", frequency));
        break;
      case "turn":
        this.noise(0, .055, .07, 1450, "highpass", .9);
        this.tone(110, 0, .16, .12, "square", 84);
        this.tone(165, .11, .2, .1, "square", 124);
        break;
      case "yourTurn":
        [392, 523, 659, 523, 784].forEach((frequency, index) => {
          this.tone(frequency, index * .14, .36, .17, "sawtooth", frequency * 1.01);
          if (index < 4) this.noise(index * .14, .045, .075, 1750, "highpass", .92);
        });
        [0, .18, .36, .54].forEach((delay) => this.tone(92, delay, .08, .13, "square", 58));
        break;
      case "message":
        this.tone(880, 0, .11, .1, "sine", 1100);
        this.tone(1175, .09, .16, .08, "sine", 1320);
        break;
      case "victory":
        [262, 330, 392, 523, 659, 784].forEach((frequency, index) => this.tone(frequency, index * .13, .65, .16, "triangle", frequency * 1.01));
        [0.5, .66, .82].forEach((delay) => this.noise(delay, .28, .06));
        break;
      case "risiko":
        [0, .22, .44].forEach((delay, index) => {
          this.noise(delay, .58, .25 - index * .035, 92 + index * 22, "lowpass", .4);
          this.tone(62 + index * 12, delay, .52, .27, "sawtooth", 27);
        });
        [196, 262, 330, 392, 523, 659, 784, 1047].forEach((frequency, index) => {
          this.tone(frequency, .36 + index * .115, .82, .18, index < 4 ? "sawtooth" : "triangle", frequency * 1.02);
        });
        [1.05, 1.2, 1.35, 1.5].forEach((delay) => this.noise(delay, .12, .085, 2100, "highpass", .9));
        break;
      case "error":
        this.tone(180, 0, .18, .2, "sawtooth", 92);
        this.tone(135, .11, .24, .15, "square", 70);
        break;
    }
  }
}

export const gameSound = new GameSoundEngine();
