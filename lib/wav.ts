export function toneWav(seconds = 1.4, freq = 392) {
  const sampleRate = 8000;
  const n = Math.floor(sampleRate * seconds);
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i += 1) {
    const env = Math.min(1, i / 180) * Math.min(1, (n - i) / 500);
    const sample = Math.sin((2 * Math.PI * freq * i) / sampleRate) * 0.25 * env;
    data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.floor(sample * 32767))), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
