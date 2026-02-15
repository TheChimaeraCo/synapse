export { auth, signIn, signOut, handlers } from "../auth";

export async function getSession() {
  const { auth } = await import("../auth");
  return auth();
}

export function getSessionUser(session: any) {
  if (!session?.user) return null;
  return {
    userId: session.user.userId as string,
    role: session.user.role as string,
    gatewayId: session.user.gatewayId as string,
    email: session.user.email as string,
    name: session.user.name as string | undefined,
  };
}
