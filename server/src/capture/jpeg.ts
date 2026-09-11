// Parse JPEG marker lengths, including APP payloads containing FF D9 and scan byte stuffing.
// Buffer allocation is fixed; every byte is examined a bounded number of times.
export class JpegParser {
  private buffer: Buffer;
  private length = 0;
  private position = 2;
  private inside = false;
  private entropy = false;
  private previousFF = false;
  constructor(
    private onFrame: (frame: Buffer) => void,
    private maxSize = 5 * 1024 * 1024,
  ) {
    this.buffer = Buffer.allocUnsafe(maxSize);
  }
  push(chunk: Buffer) {
    for (const byte of chunk) {
      if (!this.inside) {
        if (this.previousFF && byte === 0xd8) {
          this.inside = true;
          this.length = 2;
          this.position = 2;
          this.entropy = false;
          this.buffer[0] = 0xff;
          this.buffer[1] = 0xd8;
          this.previousFF = false;
        } else this.previousFF = byte === 0xff;
        continue;
      }
      if (this.length >= this.maxSize)
        throw new Error("JPEG supera il limite consentito");
      this.buffer[this.length++] = byte;
      this.parse();
    }
  }
  private parse() {
    while (this.position < this.length) {
      if (this.entropy && this.buffer[this.position] !== 0xff) {
        this.position++;
        continue;
      }
      if (this.buffer[this.position] !== 0xff)
        throw new Error("JPEG non valido");
      if (this.position + 1 >= this.length) return;
      const marker = this.buffer[this.position + 1];
      if (marker === 0xff) {
        this.position++;
        continue;
      }
      if (
        this.entropy &&
        (marker === 0 || (marker >= 0xd0 && marker <= 0xd7))
      ) {
        this.position += 2;
        continue;
      }
      if (marker === 0xd9) {
        this.onFrame(Buffer.from(this.buffer.subarray(0, this.position + 2)));
        this.inside = false;
        this.length = 0;
        this.position = 2;
        this.entropy = false;
        return;
      }
      if (marker === 0xd8 || marker === 0)
        throw new Error("Marker JPEG non valido");
      if (marker === 1 || (marker >= 0xd0 && marker <= 0xd7)) {
        this.position += 2;
        continue;
      }
      if (this.position + 3 >= this.length) return;
      const size = this.buffer.readUInt16BE(this.position + 2);
      if (size < 2) throw new Error("Segmento JPEG non valido");
      const end = this.position + 2 + size;
      if (end > this.maxSize) throw new Error("Segmento JPEG troppo grande");
      if (end > this.length) return;
      this.entropy = marker === 0xda;
      this.position = end;
    }
  }
}
