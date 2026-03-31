import silverWing from '../../music/Silver_Wing_Above_the_Crags.mp3';
import beyondTheRidge from '../../music/Beyond_The_Ridge.mp3';

const CROSSFADE_MS  = 1000; // overlap window — outgoing fades out, incoming fades in simultaneously
const FADE_IN_MS    = 1000; // initial fade-in on game start
const TARGET_VOLUME = 0.3;  // background music level (0–1)

export class MusicManager {
  private tracks: [HTMLAudioElement, HTMLAudioElement];
  private activeIdx = 0;          // which track is currently the "lead"
  private crossfading = false;    // guard: only one crossfade at a time
  private stopped = false;

  // Per-track fade intervals so both can run independently
  private fadeIntervals: [ReturnType<typeof setInterval> | null, ReturnType<typeof setInterval> | null] = [null, null];
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.tracks = [new Audio(silverWing), new Audio(beyondTheRidge)];
    for (const t of this.tracks) {
      t.loop = false;
      t.volume = 0;
    }
  }

  /** Begin playback — 1-second fade in on the first track, then seamless loop */
  start() {
    this.stopped = false;
    this.activeIdx = 0;
    this.crossfading = false;

    const lead = this.tracks[0];
    lead.currentTime = 0;
    lead.volume = 0;
    lead.play().catch(() => {
      // Autoplay blocked — resume on first interaction
      const resume = () => {
        lead.play().catch(() => {});
      };
      document.addEventListener('keydown', resume, { once: true });
      document.addEventListener('click',   resume, { once: true });
    });

    this.rampVolume(0, TARGET_VOLUME, FADE_IN_MS);

    // Poll every 200 ms — trigger crossfade when active track is ~1 s from ending
    this.pollInterval = setInterval(() => {
      if (this.stopped || this.crossfading) return;
      const lead = this.tracks[this.activeIdx];
      if (!lead.duration || isNaN(lead.duration)) return;

      const remaining = (lead.duration - lead.currentTime) * 1000; // ms
      if (remaining <= CROSSFADE_MS + 50) {  // 50 ms scheduling buffer
        this.crossfade();
      }
    }, 200);
  }

  /** Fade out and stop everything */
  stop() {
    this.stopped = true;
    if (this.pollInterval !== null) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.rampVolume(0, 0, CROSSFADE_MS);
    this.rampVolume(1, 0, CROSSFADE_MS, () => {
      for (const t of this.tracks) { t.pause(); t.currentTime = 0; }
    });
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private crossfade() {
    this.crossfading = true;
    const outIdx = this.activeIdx;
    const inIdx  = 1 - this.activeIdx;
    this.activeIdx = inIdx;

    const incoming = this.tracks[inIdx];
    incoming.currentTime = 0;
    incoming.volume = 0;
    incoming.play().catch(() => {});

    // Both fades run simultaneously over the same 1-second window
    this.rampVolume(inIdx,  TARGET_VOLUME, CROSSFADE_MS);
    this.rampVolume(outIdx, 0, CROSSFADE_MS, () => {
      this.tracks[outIdx].pause();
      this.crossfading = false;
    });
  }

  /**
   * Smoothly ramp track[idx].volume to `target` over `ms` milliseconds.
   * Cancels any existing ramp on that track first.
   */
  private rampVolume(idx: number, target: number, ms: number, onDone?: () => void) {
    if (this.fadeIntervals[idx] !== null) {
      clearInterval(this.fadeIntervals[idx]!);
      this.fadeIntervals[idx] = null;
    }

    const audio = this.tracks[idx];
    const steps  = Math.max(1, Math.round(ms / 16)); // ~60 fps steps
    const step_ms = ms / steps;
    const start  = audio.volume;
    const delta  = (target - start) / steps;
    let n = 0;

    this.fadeIntervals[idx] = setInterval(() => {
      n++;
      audio.volume = Math.min(1, Math.max(0, start + delta * n));
      if (n >= steps) {
        clearInterval(this.fadeIntervals[idx]!);
        this.fadeIntervals[idx] = null;
        audio.volume = target;
        onDone?.();
      }
    }, step_ms);
  }
}
