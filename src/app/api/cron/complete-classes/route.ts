import { NextResponse } from 'next/server';
import { autoCompletePassedClasses } from '@/lib/queries/class-auto-completion';

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');

    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const count = await autoCompletePassedClasses();

    return NextResponse.json({
      success: true,
      completed: count,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Cron complete-classes error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
