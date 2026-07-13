import { redirect } from "next/navigation";

// V1 scan detail → the one Operator home.
export default function ScanRedirect() {
  redirect("/today");
}
