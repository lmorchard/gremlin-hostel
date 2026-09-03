export interface MarkovData {
  n: number;
  max: number;
  ngrams: Record<string, string[]>;
  beginnings: string[];
}

export class MarkovGeneratorWord {
  n: number;
  max: number;
  ngrams: Record<string, string[]>;
  beginnings: string[];

  constructor(n: number = 1, max: number = 9) {
    this.n = n;
    this.max = max;
    this.ngrams = {};
    this.beginnings = [];
  }

  fromData(data: MarkovData): void {
    this.n = data.n;
    this.max = data.max;
    this.ngrams = data.ngrams || {};
    this.beginnings = data.beginnings || [];
  }

  fromJSON(jsonStr: string): void {
    const data: MarkovData = JSON.parse(jsonStr);
    this.fromData(data);
  }

  private pickRandom<T>(arr: T[]): T | undefined {
    if (arr.length === 0) return undefined;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  generate(): string {
    if (this.beginnings.length === 0) return 'In the constellation of Cygnus...';

    let current = this.pickRandom(this.beginnings);
    if (!current) return 'Closer to the heart.';

    const output: string[] = current.trim().split(/\s+/);

    for (let i = 0; i < this.max; i++) {
      const possibleNext = this.ngrams[current];
      if (possibleNext && possibleNext.length > 0) {
        const next = this.pickRandom(possibleNext);
        if (!next) break;
        output.push(next);
        current = output.slice(output.length - this.n, output.length).join(' ');
      } else {
        break;
      }
    }

    return output.join(' ');
  }
}
