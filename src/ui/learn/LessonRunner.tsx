import type { LessonDef, Unit } from '../../learn/units';
import type { ReviewEntry } from '../../learn/review';
import { MiniSongRunner } from './MiniSongRunner';
import { PromptRunner } from './PromptRunner';
import { RhythmRunner } from './RhythmRunner';

export interface RunnerProps {
  unit: Unit;
  lesson: LessonDef;
  profileId: string;
  queue: ReadonlyMap<number, ReviewEntry>;
}

export function LessonRunner(props: RunnerProps) {
  switch (props.lesson.kind) {
    case 'mini-song':
      return <MiniSongRunner {...props} />;
    case 'rhythm-tap':
      return <RhythmRunner {...props} />;
    default:
      return <PromptRunner {...props} />;
  }
}
