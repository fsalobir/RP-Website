import { WikiAdminClient } from "./WikiAdminClient";
import { fetchWikiPages } from "@/lib/wiki/queries";

export const metadata = {
  title: "Wiki — Administration",
  description: "Édition du wiki public.",
};

export default async function AdminWikiPage() {
  const pages = await fetchWikiPages();
  return <WikiAdminClient initialPages={pages} />;
}
