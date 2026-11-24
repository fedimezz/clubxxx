import { redirect } from "next/navigation";

// The one-time "theme change request" flow was removed: owners change their theme and 3D model
// directly in "Apparence du site". Old links and bookmarks land there.
export default function ThemeRequestsPage() {
  redirect("/admin/appearance");
}
