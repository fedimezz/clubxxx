// lib/coach-account.ts
//
// Creates the login account of a coach the way every other staff account is created:
// NO password chosen by the owner. The account is inactive until the coach opens the
// emailed link (/user/accept-invitation) and sets their own password.
import prisma from "@/lib/prisma";
import { newInvitation, sendInvitation } from "@/lib/invitation";
import type { Prisma } from "@prisma/client";

export type CoachAccountResult<T = unknown> =
  | { ok: true; userId: string; invitationSent: boolean; coach: T }
  | { ok: false; status: number; error: string };

export async function createInvitedCoachAccount<T>(
  input: {
    clubId: string;
    name: string;
    email: string;
    phone?: string | null;
    inviter: { id: string; name: string };
    requestUrl: string;
  },
  persistCoach: (tx: Prisma.TransactionClient, userId: string) => Promise<T>
): Promise<CoachAccountResult<T>> {
  const email = input.email.trim().toLowerCase();

  const invitation = newInvitation();
  const created = await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findFirst({
      where: { clubId: input.clubId, email },
      select: { id: true },
    });
    if (existing) return null;

    const user = await tx.user.create({
      data: {
        clubId: input.clubId,
        name: input.name,
        email,
        phone: input.phone || null,
        password: null,
        role: "COACH",
        isActive: false,
        emailVerified: null,
        invitedBy: input.inviter.id,
        invitationToken: invitation.tokenHash,
        invitationExpiry: invitation.expiry,
      },
      select: { id: true },
    });
    const coach = await persistCoach(tx, user.id);
    return { user, coach };
  });
  if (!created) return { ok: false, status: 409, error: "Cet email est déjà utilisé" };

  const invitationSent = await sendInvitation({
    clubId: input.clubId,
    invitee: { email, role: "COACH" },
    inviterName: input.inviter.name,
    token: invitation.token,
    devFallbackOrigin: new URL(input.requestUrl).origin,
  });

  return { ok: true, userId: created.user.id, invitationSent, coach: created.coach };
}
