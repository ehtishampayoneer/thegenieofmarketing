import { redirect } from "next/navigation";

// V1 duplicate → the one Conversations surface.
export default function StoriesRedirect() {
  redirect("/conversations");
}
