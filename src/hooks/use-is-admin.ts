import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/** True when profiles.is_admin for the signed-in user (own-row SELECT). */
export function useIsAdmin() {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setIsAdmin(false);
        } else {
          setIsAdmin(data?.is_admin === true);
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id, authLoading]);

  return { isAdmin, loading: authLoading || loading };
}
