import type { StageId } from "./stageData"; // type-only import for verbatimModuleSyntax

// 2×3の区画 index（0..5）
function cellIndex(x: number, y: number, w: number, h: number): number {
  const col = x < w / 2 ? 0 : 1; // 0 or 1
  const row = y < h / 3 ? 0 : y < (2 * h) / 3 ? 1 : 2; // 0,1,2
  return row * 2 + col;
}

export class Seg7Tracker {
  private prevCell: number | null = null;
  // 7本の線（仮）をON/OFFで持つ
  private seg = [false, false, false, false, false, false, false];
  private w: number;
  private h: number;

  constructor(w: number, h: number) {
    // Parameter properties are disallowed by erasableSyntaxOnly.
    this.w = w;
    this.h = h;
  }

  reset() {
    this.prevCell = null;
    this.seg = [false, false, false, false, false, false, false];
  }

  // プレイヤー位置を入れる。数字が確定したら StageId を返す（まだ仮）
  update(x: number, y: number): StageId | null {
    const c = cellIndex(x, y, this.w, this.h);
    if (this.prevCell === null) {
      this.prevCell = c;
      return null;
    }
    if (c !== this.prevCell) {
      // どの境界を越えたかを7本にマッピング（仮ルール）
      this.markSegment(this.prevCell, c);
      this.prevCell = c;

      const n = this.decode(); // 0..9 or null
      if (n !== null) return String(n) as StageId;
    }
    return null;
  }

  // 仮：セル移動のパターンに応じて「どれか1本をON」
  private markSegment(from: number, to: number) {
    const diff = to - from;

    // 左右移動（同じ行で col が変わる）→ seg[0]
    if (Math.abs(diff) === 1 && Math.floor(from / 2) === Math.floor(to / 2)) {
      this.seg[0] = true;
      return;
    }

    // 上下移動（同じ列で row が変わる）→ seg[1]
    if (Math.abs(diff) === 2 && from % 2 === to % 2) {
      this.seg[1] = true;
      return;
    }

    // それ以外はとりあえず seg[2]
    this.seg[2] = true;
  }

  // 仮：本番は7セグの正しい対応表を入れる
  private decode(): number | null {
    // 例：seg[0]とseg[1]がONなら「7」にする（仮）
    if (this.seg[0] && this.seg[1]) return 7;
    return null;
  }

  getDebugText(stage: StageId) {
    const on = this.seg.map((b) => (b ? "1" : "0")).join("");
    return `Stage: ${stage}\ncell:${this.prevCell}\nseg:${on}\n(※ decode は仮)`;
  }
}
