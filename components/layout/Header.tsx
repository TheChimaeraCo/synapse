"use client";

import { ReactNode } from "react";
import { useSession, signOut } from "next-auth/react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Settings, LogOut } from "lucide-react";
import Link from "next/link";
import { NotificationBell } from "./NotificationBell";

export function Header({
  title,
  children,
}: {
  title?: string;
  children?: ReactNode;
}) {
  const { data: session } = useSession();
  const user = session?.user;
  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
    : user?.email?.[0]?.toUpperCase() || "?";

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-white/[0.1] px-4 md:px-6 bg-[linear-gradient(180deg,rgba(8,22,35,0.88),rgba(8,22,35,0.62))] backdrop-blur-2xl">
      <div className="flex items-center gap-3">
        {children ? <div className="rounded-lg bg-white/[0.04] border border-white/[0.08] p-1">{children}</div> : null}
        {title && <h1 className="text-lg font-semibold text-zinc-100 tracking-tight">{title}</h1>}
      </div>

      <div className="flex items-center gap-3">
        <NotificationBell />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring">
              <Avatar className="h-8 w-8 ring-1 ring-cyan-300/25">
                <AvatarFallback className="bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 text-cyan-100 text-xs font-medium">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <div className="px-3 py-2">
              <p className="text-sm font-medium text-zinc-200">{user?.name || "User"}</p>
              <p className="text-xs text-zinc-500">{user?.email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex items-center gap-2 text-red-400"
            >
              <LogOut className="h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
