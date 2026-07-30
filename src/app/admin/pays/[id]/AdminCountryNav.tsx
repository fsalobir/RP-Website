"use client";

import { useRouter } from "next/navigation";
import {
  AdminSectionNav,
  type AdminSectionNavItem,
} from "@/components/admin/AdminSettingsUi";
import { confirmUnsavedNavigation } from "@/hooks/useUnsavedChangesGuard";

export function AdminCountryNav({
  countryId,
  items,
  activeId,
}: {
  countryId: string;
  items: AdminSectionNavItem[];
  activeId: string;
}) {
  const router = useRouter();

  return (
    <AdminSectionNav
      label="Sections du pays"
      items={items}
      activeId={activeId}
      onSelect={(id) => {
        if (!confirmUnsavedNavigation()) return;
        router.push(`/admin/pays/${countryId}?onglet=${id}`, { scroll: false });
      }}
    />
  );
}
