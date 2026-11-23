import type { MerchantApplication } from '../core/models/application.model';
import type { User } from '../core/models/user.model';

/**
 * Record-level access rule, enforced by the mock server for every application endpoint:
 * - SALES: only applications they created
 * - REVIEWER: only applications assigned to them
 * - ADMIN: everything
 *
 * One function used by both the list and the detail endpoint, so they can never disagree.
 */
export function canViewApplication(user: User, app: MerchantApplication): boolean {
  switch (user.role) {
    case 'ADMIN':
      return true;
    case 'SALES':
      return app.createdById === user.id;
    case 'REVIEWER':
      return app.assignedReviewerId === user.id;
    default:
      return false; // unknown role: deny (fail closed)
  }
}
