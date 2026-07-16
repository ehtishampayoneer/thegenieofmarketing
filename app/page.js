// The root now redirects on the SERVER before anything renders — so the old V1
// scan page never flashes. Signed-in users go to the Operator home; everyone
// else to login. (The old public scan landing is retired; onboarding is /welcome.)

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  let signedIn = false;
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    signedIn = !!user;
  } catch {}
  redirect(signedIn ? "/today" : "/login");
}
