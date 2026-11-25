import { beforeEach, describe, expect, it, vi } from "vitest";

const userFindFirst = vi.fn();
const userCreate = vi.fn();
const transaction = vi.fn();
const sendInvitation = vi.fn();
const tx = { user: { findFirst: (...args: unknown[]) => userFindFirst(...args), create: (...args: unknown[]) => userCreate(...args) } };

vi.mock("@/lib/prisma", () => ({
  default: { $transaction: (...args: unknown[]) => transaction(...args) },
}));
vi.mock("@/lib/invitation", () => ({
  newInvitation: () => ({ token: "secret-token", tokenHash: "token-hash", expiry: new Date("2026-12-01T00:00:00Z") }),
  sendInvitation: (...args: unknown[]) => sendInvitation(...args),
}));

const { createInvitedCoachAccount } = await import("@/lib/coach-account");

const input = {
  clubId: "club_A",
  name: "Coach",
  email: "  COACH@example.test ",
  phone: null,
  inviter: { id: "owner", name: "Owner" },
  requestUrl: "https://club-a.example.test/api/admin/coaches",
};

beforeEach(() => {
  vi.clearAllMocks();
  userFindFirst.mockResolvedValue(null);
  userCreate.mockResolvedValue({ id: "coach-user" });
  transaction.mockImplementation((callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
  sendInvitation.mockResolvedValue(true);
});

describe("createInvitedCoachAccount", () => {
  it("creates the coach profile in the same transaction as the invited login, then emails", async () => {
    const operations: string[] = [];
    const result = await createInvitedCoachAccount(input, async (client, userId) => {
      operations.push("profile");
      expect(client).toBe(tx);
      expect(userId).toBe("coach-user");
      return { id: "coach-profile", userId };
    });

    expect(result).toMatchObject({
      ok: true,
      userId: "coach-user",
      invitationSent: true,
      coach: { id: "coach-profile", userId: "coach-user" },
    });
    expect(transaction).toHaveBeenCalledOnce();
    expect(userFindFirst).toHaveBeenCalledWith({
      where: { clubId: "club_A", email: "coach@example.test" },
      select: { id: true },
    });
    expect(operations).toEqual(["profile"]);
    expect(sendInvitation).toHaveBeenCalledOnce();
  });

  it("does not create or email a second account when the email already exists", async () => {
    userFindFirst.mockResolvedValue({ id: "existing" });
    const persistCoach = vi.fn();

    const result = await createInvitedCoachAccount(input, persistCoach);

    expect(result).toEqual({ ok: false, status: 409, error: "Cet email est déjà utilisé" });
    expect(userCreate).not.toHaveBeenCalled();
    expect(persistCoach).not.toHaveBeenCalled();
    expect(sendInvitation).not.toHaveBeenCalled();
  });

  it("does not send an invitation if the coach profile cannot be persisted", async () => {
    await expect(createInvitedCoachAccount(input, async () => {
      throw new Error("profile write failed");
    })).rejects.toThrow("profile write failed");

    expect(sendInvitation).not.toHaveBeenCalled();
  });
});
