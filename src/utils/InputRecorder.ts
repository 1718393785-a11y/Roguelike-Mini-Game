export type InputEventRecord =
  | { frame: number; type: 'keydown' | 'keyup'; key: string }
  | { frame: number; type: 'mousemove' | 'click'; x: number; y: number };

export interface InputPlaybackTarget {
  keys: Record<string, boolean>;
  mouseX: number;
  mouseY: number;
  click?(x: number, y: number): void;
}

export class InputRecorder {
  private readonly events: InputEventRecord[] = [];
  private playbackIndex = 0;

  record(event: InputEventRecord): void {
    this.events.push(event);
  }

  export(): InputEventRecord[] {
    return [...this.events];
  }

  resetPlayback(): void {
    this.playbackIndex = 0;
  }

  playback(frame: number, records: readonly InputEventRecord[], target: InputPlaybackTarget): void {
    while (this.playbackIndex < records.length && records[this.playbackIndex].frame <= frame) {
      const event = records[this.playbackIndex++];
      switch (event.type) {
        case 'keydown':
          target.keys[event.key] = true;
          break;
        case 'keyup':
          target.keys[event.key] = false;
          break;
        case 'mousemove':
          target.mouseX = event.x;
          target.mouseY = event.y;
          break;
        case 'click':
          target.mouseX = event.x;
          target.mouseY = event.y;
          target.click?.(event.x, event.y);
          break;
      }
    }
  }
}
