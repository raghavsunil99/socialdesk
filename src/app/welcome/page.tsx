import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listBrands } from "@/lib/brand";
import { NewBrandForm } from "@/app/brands/BrandsManager";

export const dynamic = "force-dynamic";

// Shown to someone who is logged in but not a member of any brand.
export default async function Welcome() {
  const user = await requireUser();
  if (listBrands(user.id).length > 0) redirect("/analytics");
  return (
    <div className="mx-auto mt-10 max-w-xl space-y-4">
      <h1 className="text-xl font-bold">Welcome, {user.name}</h1>
      <p className="text-sm text-muted-foreground">You&apos;re not on any brand yet. Ask a brand owner to add you on their Team page, or create your own brand below.</p>
      <NewBrandForm />
    </div>
  );
}
