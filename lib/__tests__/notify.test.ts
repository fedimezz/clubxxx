import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  broadcastToUser: vi.fn(),
  sendPushToUsers: vi.fn(),
  afterTasks: [] as Array<() => Promise<unknown> | unknown>,
}));

vi.mock("@/lib/prisma", () => ({
  default: { notification: { create: mocks.create } },
}));
vi.mock("@/lib/sse", () => ({ broadcastToUser: mocks.broadcastToUser }));
vi.mock("@/lib/push", () => ({ sendPushToUsers: mocks.sendPushToUsers }));
vi.mock("@/lib/after", () => ({
  runAfter: (task: () => Promise<unknown> | unknown) => mocks.afterTasks.push(task),
}));

const { notifyUsers } = await import("../notify");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.afterTasks.length = 0;
  mocks.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: `notification-${data.userId}`,
    ...data,
  }));
  mocks.broadcastToUser.mockResolvedValue(undefined);
  mocks.sendPushToUsers.mockResolvedValue({ attempted: 0, accepted: 0, rejected: 0, deactivated: 0 });
});

describe("notifyUsers", () => {
  it("creates and publishes one notification per distinct recipient", async () => {
    const input = { title: "Test", message: "Body", type: "INFO" };

    const created = await notifyUsers("club-a", ["user-a", "user-a", "user-b"], input);

    expect(created.map((item) => item.userId)).toEqual(["user-a", "user-b"]);
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.broadcastToUser).toHaveBeenCalledTimes(2);
    expect(mocks.broadcastToUser).toHaveBeenCalledWith(
      "user-a",
      "notification",
      expect.objectContaining({ id: "notification-user-a" })
    );
    expect(mocks.afterTasks).toHaveLength(1);

    await mocks.afterTasks[0]();
    expect(mocks.sendPushToUsers).toHaveBeenCalledWith("club-a", ["user-a", "user-b"], {
      title: "Test",
      body: "Body",
      data: { type: "INFO" },
    });
  });

  it("does not create or deliver anything for an empty recipient list", async () => {
    expect(await notifyUsers("club-a", [], { title: "Test", message: "Body", type: "INFO" })).toEqual([]);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.broadcastToUser).not.toHaveBeenCalled();
    expect(mocks.afterTasks).toHaveLength(0);
  });
});
