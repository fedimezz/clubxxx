import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  findPlan: vi.fn(),
  updateMany: vi.fn(),
  createManyAndReturn: vi.fn(),
  deleteManyBookings: vi.fn(),
  deleteManySessions: vi.fn(),
  deleteManyPlans: vi.fn(),
  publishNotifications: vi.fn(),
  sendPushToUsers: vi.fn(),
  afterTasks: [] as Array<() => Promise<unknown> | unknown>,
}));

vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/prisma", () => ({
  default: {
    weeklyPlan: { findFirst: mocks.findPlan },
    $transaction: (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        userSession: {
          updateMany: mocks.updateMany,
          deleteMany: mocks.deleteManyBookings,
        },
        notification: { createManyAndReturn: mocks.createManyAndReturn },
        session: { deleteMany: mocks.deleteManySessions },
        weeklyPlan: { deleteMany: mocks.deleteManyPlans },
      }),
  },
}));
vi.mock("@/lib/notify", () => ({
  notifyAllMembers: vi.fn(),
  publishNotifications: mocks.publishNotifications,
}));
vi.mock("@/lib/push", () => ({ sendPushToUsers: mocks.sendPushToUsers }));
vi.mock("@/lib/after", () => ({
  runAfter: (task: () => Promise<unknown> | unknown) => mocks.afterTasks.push(task),
}));
vi.mock("@/lib/permissions", () => ({ hasPermission: vi.fn().mockResolvedValue(true) }));

const { DELETE } = await import("../route");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.afterTasks.length = 0;
  mocks.requireAdmin.mockResolvedValue({
    ok: true,
    user: { id: "admin-a", clubId: "club-a", role: "OWNER" },
  });
  mocks.findPlan.mockResolvedValue({
    id: "plan-a",
    clubId: "club-a",
    weekStart: new Date("2026-11-23T00:00:00.000Z"),
    sessions: [{
      userSessions: [{ id: "booking-a", userId: "member-a" }],
    }],
  });
  mocks.createManyAndReturn.mockResolvedValue([
    { id: "notification-a", userId: "member-a", clubId: "club-a", title: "Planning annulé" },
  ]);
});

describe("DELETE /api/admin/schedule/plan/[id]", () => {
  it("persists the cancellation notice and publishes it to the live notification stream", async () => {
    const request = new NextRequest("https://club-a.example.test/api/admin/schedule/plan/plan-a", {
      method: "DELETE",
    });

    const response = await DELETE(request, { params: Promise.resolve({ id: "plan-a" }) });
    expect(response.status).toBe(200);
    expect(mocks.findPlan).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "plan-a", clubId: "club-a" },
    }));
    expect(mocks.createManyAndReturn).toHaveBeenCalledOnce();
    expect(mocks.afterTasks).toHaveLength(1);

    await mocks.afterTasks[0]();
    expect(mocks.publishNotifications).toHaveBeenCalledWith([
      expect.objectContaining({ id: "notification-a", userId: "member-a" }),
    ]);
    expect(mocks.sendPushToUsers).toHaveBeenCalledWith(
      "club-a",
      ["member-a"],
      expect.objectContaining({ title: "Planning annulé" })
    );
  });
});
