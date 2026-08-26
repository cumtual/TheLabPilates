import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EnrollWithGuestSection } from './EnrollWithGuestSection';
import { formatFriendlyDate, formatRelativeDate } from '@/lib/utils/date';
import { getClassDisplayName } from '@/lib/utils/class-type';

export interface ClassItem {
  id: string;
  classDate: Date | string;
  classType: string | null;
  customName?: string | null;
  capacity: number | null;
  enrolledCount: number;
  coachName: string | null;
}

export interface ClassListProps {
  classes: ClassItem[];
}

export function ClassList({ classes }: ClassListProps) {
  if (classes.length === 0) {
    return (
      <Card>
        <p className="font-body text-sm text-outline text-center py-4">
          No hay clases disponibles en este momento.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {classes.map((classItem) => {
        const spotsLeft = (classItem.capacity ?? 0) - classItem.enrolledCount;
        const relative = formatRelativeDate(classItem.classDate);

        return (
          <Card key={classItem.id}>
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <h3 className="font-body text-base font-semibold text-on-surface">
                    {getClassDisplayName(classItem.classType, classItem.customName)}
                  </h3>
                  <p className="font-body text-sm text-outline capitalize">
                    {formatFriendlyDate(classItem.classDate)}
                  </p>
                  {relative && (
                    <p className="font-body text-xs text-primary font-medium">
                      {relative}
                    </p>
                  )}
                </div>
                <Badge variant={spotsLeft > 3 ? 'active' : 'pending'}>
                  {spotsLeft} {spotsLeft === 1 ? 'lugar' : 'lugares'}
                </Badge>
              </div>

              {classItem.coachName && (
                <p className="font-body text-sm text-on-surface-variant">
                  Coach: {classItem.coachName}
                </p>
              )}

              <div className="flex items-center justify-between">
                <p className="font-body text-xs text-outline">
                  Capacidad: {classItem.enrolledCount}/{classItem.capacity ?? 0}
                </p>
              </div>

              <EnrollWithGuestSection classId={classItem.id} />
            </div>
          </Card>
        );
      })}
    </div>
  );
}
