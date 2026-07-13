import { redirect } from "next/navigation";

// V1 action detail → the one Approvals queue.
export default function ActionRedirect() {
  redirect("/approvals");
}
