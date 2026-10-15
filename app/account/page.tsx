import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, toUserInfo } from "@/app/lib/auth";
import { PERMISSIONS, ROLE_INFO, homePathFor } from "@/app/lib/permissions";
import { MIN_PASSWORD_LENGTH } from "@/app/lib/password";
import { PageHeader, PageShell, Card } from "@/app/components/ui/page-shell";
import ChangePasswordForm, { SignOutInstead } from "./change-password-form";

export const metadata: Metadata = { title: "My account" };

export default async function AccountPage() {
    const user = await getCurrentUser();
    if (!user) redirect("/login");
    const info = toUserInfo(user);

    return (
        <PageShell>
            <PageHeader
                title={user.mustChangePassword ? "Choose a new password" : "My account"}
                description={user.mustChangePassword
                    ? "Your password was set by an administrator. Choose your own password to start using the system."
                    : "Your details, what your role allows, and your password."}
            />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                <div className="lg:col-span-5">
                    <Card title="Change password" description={`At least ${MIN_PASSWORD_LENGTH} characters, with letters and numbers. Other devices you are signed in on will be signed out.`}>
                        <ChangePasswordForm required={user.mustChangePassword} homePath={homePathFor(user.role)} minLength={MIN_PASSWORD_LENGTH} />
                        {user.mustChangePassword && <SignOutInstead />}
                    </Card>
                </div>

                {!user.mustChangePassword && (
                    <div className="lg:col-span-7 space-y-8">
                        <Card title="Profile">
                            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                                <div><dt className="text-xs font-bold uppercase tracking-wider text-slate-500">Name</dt><dd className="mt-1 font-semibold text-white">{user.name}</dd></div>
                                <div><dt className="text-xs font-bold uppercase tracking-wider text-slate-500">Username</dt><dd className="mt-1 font-mono text-slate-200">{user.username}</dd></div>
                                <div><dt className="text-xs font-bold uppercase tracking-wider text-slate-500">Email</dt><dd className="mt-1 text-slate-200">{user.email ?? "—"}</dd></div>
                                <div><dt className="text-xs font-bold uppercase tracking-wider text-slate-500">Role</dt><dd className="mt-1 font-semibold text-white">{ROLE_INFO[user.role].label}</dd></div>
                            </dl>
                            <p className="mt-4 text-xs text-slate-400">{ROLE_INFO[user.role].description} Ask an administrator if you need a different role.</p>
                        </Card>

                        <Card title="What you can do">
                            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                                {info.permissions.map((permission) => (
                                    <li key={permission} className="flex items-start gap-2 text-slate-300">
                                        <span className="mt-0.5 text-emerald-400" aria-hidden>✓</span>
                                        {PERMISSIONS[permission]}
                                    </li>
                                ))}
                            </ul>
                        </Card>
                    </div>
                )}
            </div>
        </PageShell>
    );
}
