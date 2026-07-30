import { redirect } from "next/navigation";

export default function AdminMatriceDiplomatiquePage() {
  redirect("/admin/regles?domaine=diplomatie");
}
