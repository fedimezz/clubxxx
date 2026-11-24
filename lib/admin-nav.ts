import {
  LayoutDashboard,
  Users,
  UserCog,
  CalendarDays,
  BookOpen,
  CreditCard,
  Tag,
  Newspaper,
  Bell,
  FileBarChart,
  Wallet,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface AdminTab {
  name: string;
  href: string;
  ownerOnly?: boolean;
}

export interface AdminGroup {
  id: string;
  name: string;
  icon: LucideIcon;
  tabs: AdminTab[];
}

const ADMIN_GROUPS: AdminGroup[] = [
  {
    id: "overview",
    name: "Vue d'ensemble",
    icon: LayoutDashboard,
    tabs: [
      { name: "Tableau de bord", href: "/admin" },
      { name: "Rapports", href: "/admin/reports" },
      { name: "Journal d'activité", href: "/admin/logs", ownerOnly: true },
    ],
  },
  {
    id: "members",
    name: "Membres",
    icon: Users,
    tabs: [{ name: "Membres", href: "/admin/members" }],
  },
  {
    id: "team",
    name: "Équipe",
    icon: UserCog,
    tabs: [
      { name: "Coachs", href: "/admin/staff/coaches" },
      { name: "Administrateurs", href: "/admin/staff", ownerOnly: true },
      { name: "Rôles & permissions", href: "/admin/roles", ownerOnly: true },
    ],
  },
  {
    id: "activity",
    name: "Activité",
    icon: CalendarDays,
    tabs: [
      { name: "Planning", href: "/admin/schedule" },
      { name: "Réservations", href: "/admin/bookings" },
      { name: "Annonces", href: "/admin/news" },
      { name: "Notifications", href: "/admin/notifications" },
    ],
  },
  {
    id: "memberships",
    name: "Adhésions",
    icon: CreditCard,
    tabs: [
      { name: "Abonnements", href: "/admin/subscriptions" },
      { name: "Offres & tarifs", href: "/admin/plans", ownerOnly: true },
      { name: "Promotions", href: "/admin/promotions", ownerOnly: true },
    ],
  },
  {
    id: "billing",
    name: "Facturation",
    icon: Wallet,
    tabs: [{ name: "Facturation & plan SaaS", href: "/admin/billing", ownerOnly: true }],
  },
  {
    id: "site",
    name: "Site & club",
    icon: Settings,
    tabs: [
      { name: "Paramètres du club", href: "/admin/settings" },
      { name: "Apparence", href: "/admin/appearance", ownerOnly: true },
      { name: "Assistant du site", href: "/admin/website-setup", ownerOnly: true },
      { name: "Services & domaine", href: "/admin/services", ownerOnly: true },
      { name: "Demandes de thème", href: "/admin/theme-requests", ownerOnly: true },
    ],
  },
];

export function tabActive(pathname: string, tab: AdminTab): boolean {
  return tab.href === "/admin" ? pathname === "/admin" : pathname.startsWith(tab.href);
}

export function visibleGroups(role: "ADMIN" | "OWNER"): AdminGroup[] {
  return ADMIN_GROUPS
    .map((group) => ({
      ...group,
      tabs: group.tabs.filter((tab) => role === "OWNER" || !tab.ownerOnly),
    }))
    .filter((group) => group.tabs.length > 0);
}

export function groupForPath(pathname: string, role: "ADMIN" | "OWNER"): AdminGroup | null {
  return visibleGroups(role).find((group) =>
    group.tabs.some((tab) => tabActive(pathname, tab))
  ) ?? null;
}
