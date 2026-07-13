import { redirect } from "next/navigation";

// V1 home → the one Operator home.
export default function DashboardRedirect() {
  redirect("/today");
}
