/**
 * Web Audio API synthesizer for playing real notification chimes.
 */
export function playNotificationSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    
    const context = new AudioContextClass();
    
    // Play a delightful high-to-mid double bell chime
    const playTone = (time: number, freq: number, duration: number) => {
      const osc = context.createOscillator();
      const gain = context.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);
      
      gain.gain.setValueAtTime(0.3, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
      
      osc.connect(gain);
      gain.connect(context.destination);
      
      osc.start(time);
      osc.stop(time + duration);
    };

    // Double chime effect
    const now = context.currentTime;
    playTone(now, 830.61, 0.4); // G#5
    playTone(now + 0.15, 1046.50, 0.5); // C6
  } catch (err) {
    console.warn("Audio Context blocked or unsupported:", err);
  }
}
