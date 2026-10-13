import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({session:vi.fn(), bearer:vi.fn()}));
vi.mock('next-auth/next', () => ({getServerSession:mocks.session}));
vi.mock('@/lib/auth', () => ({authOptions:{}}));
vi.mock('@/lib/library', () => ({userFromLauncherBearer:mocks.bearer}));
import { requireDeveloperOrAdminSession } from './developerAccess';

describe('developer workspace authentication', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.session.mockResolvedValue(null); mocks.bearer.mockResolvedValue(null); });
  it('accepts a validated launcher identity without changing its role',async () => {
    mocks.bearer.mockResolvedValue({_id:'launcher-user',username:'Tester',role:'user'});
    const result = await requireDeveloperOrAdminSession(new Request('https://playbound.club/api/developer/games'));
    expect(result.user?.id).toBe('launcher-user');
    expect(result.user?.role).toBe('user');
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it('preserves browser-session authentication',async () => {
    mocks.session.mockResolvedValue({user:{id:'browser-user',role:'developer'}});
    expect((await requireDeveloperOrAdminSession()).user?.id).toBe('browser-user');
  });
  it('rejects anonymous requests',async () => {
    expect((await requireDeveloperOrAdminSession(new Request('https://playbound.club/api/developer/games'))).error?.status).toBe(401);
  });
});
