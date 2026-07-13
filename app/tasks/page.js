import { redirect } from "next/navigation";

// V1 duplicate (Content/Outreach daily ritual) → the one Approvals queue.
export default function TasksRedirect() {
  redirect("/approvals");
}
