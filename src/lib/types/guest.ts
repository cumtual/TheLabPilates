export type GuestOrigin = 'user' | 'admin';

export type EnrollmentStatus =
  | 'pending'
  | 'attended'
  | 'absent'
  | 'late_cancelled'
  | 'cancelled';

export interface GuestEligibilityResult {
  eligible: boolean;
  creditsAvailable: number;
  reason?: string;
}

export interface GuestEnrollment {
  id: string;
  openClassId: string;
  guestName: string;
  origin: GuestOrigin;
  registeredById: string;
  status: EnrollmentStatus;
  createdAt: Date;
}

export interface GuestCredit {
  id: string;
  userId: string;
  userSubscriptionId: string;
  creditsUsed: number;
  guestEnrollmentId: string | null;
  createdAt: Date;
}
