import { redirect } from "next/navigation";

// V1 standalone chat → the Operator home (delegation lives in the app shell).
export default function ChatRedirect() {
  redirect("/today");
}
