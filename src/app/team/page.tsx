import { currentBrand } from "@/lib/brand";
import { ROLE_INFO, ROLES } from "@/lib/auth";
import { members } from "@/lib/team";
import { TeamManager } from "./TeamManager";

export const dynamic = "force-dynamic";

export default async function Team() {
  const brand = await currentBrand();
  return (
    <TeamManager
      key={brand.id}
      brandName={brand.name}
      me={{ id: brand.user.id, name: brand.user.name, email: brand.user.email }}
      isOwner={brand.role === "owner"}
      members={members(brand.id)}
      roles={ROLES.map((r) => ({ role: r, info: ROLE_INFO[r] })).reverse()}
    />
  );
}
