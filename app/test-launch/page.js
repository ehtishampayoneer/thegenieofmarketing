import { redirect } from "next/navigation";

// The launch test moved into "Your team" (the Test something tab): it is the same
// crowd, so it belongs in the same place. Existing links — Proof Sprint, Market
// testing, anything the owner bookmarked — keep working through here.
export default function TestLaunchRedirect({ searchParams }) {
  const q = new URLSearchParams({ tab: "test", ...(searchParams || {}) }).toString();
  redirect(`/team?${q}`);
}
