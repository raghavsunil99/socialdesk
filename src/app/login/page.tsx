import { redirect } from "next/navigation";
import { getUser, userCount } from "@/lib/auth";
import { AuthForm } from "@/components/AuthForm";

export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (userCount() === 0) redirect("/setup");
  if (await getUser()) redirect("/analytics");
  return <AuthForm mode="login" next={(await searchParams).next} />;
}
