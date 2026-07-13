import { redirect } from "next/navigation";

// V1 setup wizard → the one first-run experience.
export default function SetupRedirect() {
  redirect("/welcome");
}
