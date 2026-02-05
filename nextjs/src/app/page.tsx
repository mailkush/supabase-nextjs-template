"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSPAClient } from "@/lib/supabase/client";

export default function RootRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    const run = async () => {
      const supabase = createSPAClient();

      const { data } = await supabase.auth.getSession();

      if (data?.session) {
        router.replace("/dashboard");
      } else {
        router.replace("/auth/login");
      }
    };

    run();
  }, [router]);

  return (
    <main
      style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        opacity: 0.7,
      }}
    >
      Loading…
    </main>
  );
}
