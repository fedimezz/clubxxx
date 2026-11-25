import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireCoachMock = vi.fn();
const hasCoachPermissionMock = vi.fn();
const coachFindFirst = vi.fn();
const sessionFindFirst = vi.fn();
const bookingFindFirst = vi.fn();
const settingsFindUnique = vi.fn();
const memberFindFirst = vi.fn();
const executeRaw = vi.fn();
const attendanceFindFirst = vi.fn();
const attendanceCreate = vi.fn();
const attendanceDeleteMany = vi.fn();
const logActionMock = vi.fn();

const tx = {
  $executeRaw: (...args: unknown[]) => executeRaw(...args),
  attendance: {
    findFirst: (...args: unknown[]) => attendanceFindFirst(...args),
    create: (...args: unknown[]) => attendanceCreate(...args),
    deleteMany: (...args: unknown[]) => attendanceDeleteMany(...args),
  },
};

vi.mock("@/lib/auth", () => ({
  requireCoach: (...args: unknown[]) => requireCoachMock(...args),
}));
vi.mock("@/lib/permissions", () => ({
  hasCoachPermission: (...args: unknown[]) => hasCoachPermissionMock(...args),
}));
vi.mock("@/lib/activity-log", () => ({ logAction: (...args: unknown[]) => logActionMock(...args) }));
vi.mock("@/lib/prisma", () => ({
  default: {
    coach: { findFirst: (...args: unknown[]) => coachFindFirst(...args) },
    session: { findFirst: (...args: unknown[]) => sessionFindFirst(...args) },
    userSession: { findFirst: (...args: unknown[]) => bookingFindFirst(...args) },
    gymSettings: { findUnique: (...args: unknown[]) => settingsFindUnique(...args) },
    user: { findFirst: (...args: unknown[]) => memberFindFirst(...args) },
    $transaction: (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  },
}));

const { POST } = await import("../attendance/route");

const sessionId = "ckxyzsession000000000000001";
const userId = "ckxyzmember000000000000001";
const request = (body: unknown = { sessionId, userId }) =>
  new NextRequest("https://club-a.example.test/api/dashboard/coach/attendance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-23T23:30:00.000Z"));
  vi.clearAllMocks();
  requireCoachMock.mockResolvedValue({
    ok: true,
    user: { id: "coach-user", name: "Coach", clubId: "club_A", role: "COACH" },
  });
  hasCoachPermissionMock.mockResolvedValue(true);
  coachFindFirst.mockResolvedValue({ id: "coach-profile" });
  sessionFindFirst.mockResolvedValue({ id: sessionId, coachId: "coach-profile", activity: "YOGA" });
  bookingFindFirst.mockResolvedValue({ id: "booking" });
  settingsFindUnique.mockResolvedValue({ timezone: "Africa/Tunis" });
  memberFindFirst.mockResolvedValue({ name: "Member" });
  executeRaw.mockResolvedValue(1);
  attendanceFindFirst.mockResolvedValue(null);
  attendanceCreate.mockResolvedValue({ id: "attendance" });
  attendanceDeleteMany.mockResolvedValue({ count: 1 });
});

afterEach(() => vi.useRealTimers());

describe("POST /api/dashboard/coach/attendance", () => {
  it("scopes the booking to the authenticated club and serializes check-ins for the local day", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(bookingFindFirst).toHaveBeenCalledWith({
      where: { sessionId, userId, clubId: "club_A", isCancelled: false },
    });
    expect(attendanceFindFirst).toHaveBeenCalledWith({
      where: {
        clubId: "club_A",
        sessionId,
        userId,
        checkInTime: { gte: new Date("2026-11-23T23:00:00.000Z") },
      },
      select: { id: true },
    });
    expect(executeRaw).toHaveBeenCalledOnce();
    expect(attendanceCreate).toHaveBeenCalledWith({
      data: { userId, sessionId, clubId: "club_A", createdBy: "coach-user" },
    });
    expect(await response.json()).toEqual({ checkedIn: true });
  });

  it("does not create another attendance when the member is already checked in", async () => {
    attendanceFindFirst.mockResolvedValue({ id: "existing" });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(attendanceCreate).not.toHaveBeenCalled();
    expect(logActionMock).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ checkedIn: true });
  });

  it("undoes only this club's check-in for the club-local day", async () => {
    const response = await POST(request({ sessionId, userId, undo: true }));

    expect(response.status).toBe(200);
    expect(attendanceDeleteMany).toHaveBeenCalledWith({
      where: {
        clubId: "club_A",
        sessionId,
        userId,
        checkInTime: { gte: new Date("2026-11-23T23:00:00.000Z") },
      },
    });
    expect(await response.json()).toEqual({ checkedIn: false });
  });
});
