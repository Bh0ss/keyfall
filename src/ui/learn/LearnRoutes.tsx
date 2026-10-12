import { nextUnit, unitStatus } from '../../learn/unlocks';
import { UNITS, getLesson, getUnit } from '../../learn/units';
import { getDb } from '../../storage/db';
import { listProgress, loadReviewQueue } from '../../storage/learn';
import { AppLayout } from '../AppLayout';
import { useActiveProfile } from '../profileStore';
import { useAsync } from '../useAsync';
import { LearnPath } from './LearnPath';
import { LessonRunner } from './LessonRunner';
import { UnitDetail } from './UnitDetail';

/** Learn path, unit detail and lesson runner. Loaded on demand because VexFlow is large. */
export default function LearnRoutes({ unitId, lessonId }: { unitId?: string; lessonId?: string }) {
  const profile = useActiveProfile();
  const data = useAsync(async () => {
    const db = getDb();
    const [rows, queue] = await Promise.all([listProgress(db, profile.id), loadReviewQueue(db, profile.id)]);
    return { rows, queue };
  }, `${profile.id}:${unitId ?? ''}:${lessonId ?? ''}`);

  if (!data) return <div className="shell" data-testid="learn-loading" />;
  const progress = new Map(data.rows.map((r) => [r.unitId, r]));
  const passed = new Set(data.rows.filter((r) => r.passed).map((r) => r.unitId));
  const unit = (unitId ? getUnit(unitId) : undefined) ?? nextUnit(passed) ?? UNITS[UNITS.length - 1]!;
  const status = unitStatus(unit, passed);
  const lesson = lessonId ? getLesson(unit, lessonId) : undefined;
  const path = <LearnPath passed={passed} progress={progress} activeId={unit.id} />;

  if (lesson && (status === 'open' || status === 'passed')) {
    return (
      <div className="learn-frame learn-focus" data-testid="learn-lesson">
        {path}
        <LessonRunner key={`${profile.id}:${unit.id}:${lesson.id}`} unit={unit} lesson={lesson} profileId={profile.id} queue={data.queue} />
      </div>
    );
  }
  return (
    <AppLayout active="learn">
      <div className="learn-frame" data-testid="learn-screen">
        {path}
        <UnitDetail unit={unit} status={status} progress={progress.get(unit.id)} level={profile.level} />
      </div>
    </AppLayout>
  );
}
