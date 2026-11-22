import type { User } from '../core/models/user.model';

/**
 * A user as stored by the mock server. Includes the password, which must
 * never be sent to the client; use `toPublicUser` before returning one.
 */
export interface MockUser extends User {
  password: string;
}

/**
 * Shared demo password for every seeded account. This is intentionally public:
 * it only works against the in-browser mock API and protects nothing real.
 */
export const DEMO_PASSWORD = 'password123';

/**
 * In-memory "database". Lives only in the browser tab and resets on page reload.
 * All names use obviously fake values and the reserved example.com domain.
 */
export const db: { users: MockUser[] } = {
  users: [
    {
      id: 'u-sales-1',
      name: 'Sam Sales',
      email: 'sales1@example.com',
      role: 'SALES',
      password: DEMO_PASSWORD,
    },
    {
      id: 'u-sales-2',
      name: 'Sandy Sales',
      email: 'sales2@example.com',
      role: 'SALES',
      password: DEMO_PASSWORD,
    },
    {
      id: 'u-reviewer-1',
      name: 'Riley Reviewer',
      email: 'reviewer1@example.com',
      role: 'REVIEWER',
      password: DEMO_PASSWORD,
    },
    {
      id: 'u-reviewer-2',
      name: 'Robin Reviewer',
      email: 'reviewer2@example.com',
      role: 'REVIEWER',
      password: DEMO_PASSWORD,
    },
    {
      id: 'u-admin-1',
      name: 'Alex Admin',
      email: 'admin@example.com',
      role: 'ADMIN',
      password: DEMO_PASSWORD,
    },
  ],
};

/** Strips server-only fields (the password) before a user leaves the "server". */
export function toPublicUser({ id, name, email, role }: MockUser): User {
  return { id, name, email, role };
}
