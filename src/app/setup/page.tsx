import { redirect } from "next/navigation";
import { userCount } from "@/lib/auth";
import { AuthForm } from "@/components/AuthForm";

export const dynamic = "force-dynamic";

export default function Setup() {
  if (userCount() > 0) redirect("/login");
  return <AuthForm mode="setup" />;
}
