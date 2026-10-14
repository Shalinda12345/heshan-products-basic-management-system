import { redirect } from "next/navigation";
import { getCurrentUser } from "@/app/lib/auth";
import { canOpenPage } from "@/app/lib/permissions";

const PAGES = ["/admin/products", "/admin/users", "/admin/activity"];

// /admin opens the first management page the user's role allows
export default async function ManageIndex() {
    const user = await getCurrentUser();
    if (!user) redirect("/login");
    redirect(PAGES.find((path) => canOpenPage(user.role, path)) ?? "/forbidden");
}
