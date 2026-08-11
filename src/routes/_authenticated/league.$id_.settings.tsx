import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Copy, Loader2, RefreshCw, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { SurfacePanel } from "@/components/surface-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { initialsFromName } from "@/lib/profile";

export const Route = createFileRoute("/_authenticated/league/$id_/settings")({
  component: LeagueSettingsPage,
});

type LeagueRow = {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
};

type MemberRow = {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
};

function randInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function LeagueSettingsPage() {
  const { id: leagueId } = Route.useParams();
  const { user } = useAuth();
  const router = useRouter();

  const [league, setLeague] = useState<LeagueRow | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [nameDraft, setNameDraft] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [kickingId, setKickingId] = useState<string | null>(null);

  const isCreator = Boolean(user && league && league.created_by === user.id);

  async function load() {
    setLoading(true);
    const { data: leagueData, error: leagueError } = await supabase
      .from("leagues")
      .select("id, name, invite_code, created_by")
      .eq("id", leagueId)
      .maybeSingle();

    if (leagueError || !leagueData) {
      toast.error("Could not load league settings", {
        description: leagueError?.message ?? "League not found",
      });
      setLeague(null);
      setMembers([]);
      setLoading(false);
      return;
    }

    setLeague(leagueData);
    setNameDraft(leagueData.name);

    const { data: memberships, error: memberError } = await supabase
      .from("league_members")
      .select("user_id")
      .eq("league_id", leagueId);

    if (memberError) {
      toast.error("Could not load members", { description: memberError.message });
      setMembers([]);
      setLoading(false);
      return;
    }

    const userIds = (memberships ?? []).map((m) => m.user_id);
    if (userIds.length === 0) {
      setMembers([]);
      setLoading(false);
      return;
    }

    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url")
      .in("id", userIds);

    if (profileError) {
      toast.error("Could not load member profiles", { description: profileError.message });
      setMembers(userIds.map((user_id) => ({ user_id, full_name: null, avatar_url: null })));
      setLoading(false);
      return;
    }

    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
    setMembers(
      userIds.map((user_id) => {
        const p = byId.get(user_id);
        return {
          user_id,
          full_name: p?.full_name ?? null,
          avatar_url: p?.avatar_url ?? null,
        };
      }),
    );
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId]);

  async function renameLeague() {
    if (!league || !isCreator) return;
    const name = nameDraft.trim();
    if (!name) {
      toast.error("League name is required");
      return;
    }
    if (name === league.name) return;

    setRenaming(true);
    const { error } = await supabase.from("leagues").update({ name }).eq("id", leagueId);
    setRenaming(false);
    if (error) {
      toast.error("Could not rename league", { description: error.message });
      return;
    }
    setLeague({ ...league, name });
    toast.success("League renamed");
  }

  async function regenerateInvite() {
    if (!league || !isCreator) return;
    setRegenerating(true);
    const invite_code = randInviteCode();
    const { error } = await supabase.from("leagues").update({ invite_code }).eq("id", leagueId);
    setRegenerating(false);
    if (error) {
      toast.error("Could not regenerate invite", { description: error.message });
      return;
    }
    setLeague({ ...league, invite_code });
    toast.success("Invite code regenerated", { description: invite_code });
  }

  async function copyInvite() {
    if (!league?.invite_code) return;
    try {
      await navigator.clipboard.writeText(league.invite_code);
      toast.success("Invite code copied");
    } catch {
      toast.error("Could not copy invite code");
    }
  }

  async function leaveLeague() {
    if (!user) return;
    setLeaving(true);
    const { error } = await supabase
      .from("league_members")
      .delete()
      .eq("league_id", leagueId)
      .eq("user_id", user.id);
    setLeaving(false);
    if (error) {
      toast.error("Could not leave league", { description: error.message });
      return;
    }
    toast.success("Left league");
    void router.navigate({ to: "/" });
  }

  async function kickMember(userId: string) {
    setKickingId(userId);
    const { error } = await supabase.rpc("kick_league_member", {
      _league_id: leagueId,
      _user_id: userId,
    });
    setKickingId(null);
    if (error) {
      toast.error("Could not kick member", { description: error.message });
      return;
    }
    setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    toast.success("Member removed");
  }

  async function deleteLeague() {
    if (!isCreator) return;
    setDeleting(true);
    const { error } = await supabase.from("leagues").delete().eq("id", leagueId);
    setDeleting(false);
    if (error) {
      toast.error("Could not delete league", { description: error.message });
      return;
    }
    toast.success("League deleted");
    void router.navigate({ to: "/" });
  }

  return (
    <div className="space-y-6">
      <Link
        to="/league/$id"
        params={{ id: leagueId }}
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to league
      </Link>

      <PageHeader
        eyebrow="Settings"
        title={league?.name ?? "League settings"}
        description={
          isCreator
            ? "Manage membership, invite code, and league details."
            : "Leave this league or view membership."
        }
      />

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : !league ? (
        <SurfacePanel bodyClassName="px-5 py-8 text-center text-sm text-muted-foreground">
          This league isn&apos;t available on your account.
        </SurfacePanel>
      ) : (
        <>
          {isCreator ? (
            <SurfacePanel title="League details" bodyClassName="space-y-5 px-5 py-5">
              <div className="space-y-2">
                <Label htmlFor="league-name">Name</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="league-name"
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    maxLength={80}
                    className="sm:max-w-md"
                  />
                  <Button
                    type="button"
                    onClick={() => void renameLeague()}
                    disabled={renaming || nameDraft.trim() === league.name || !nameDraft.trim()}
                  >
                    {renaming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Save name
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Invite code</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void copyInvite()}
                    className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 font-mono text-sm text-foreground transition hover:border-primary/40 hover:text-primary"
                  >
                    {league.invite_code}
                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void regenerateInvite()}
                    disabled={regenerating}
                  >
                    {regenerating ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    Regenerate
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Regenerating invalidates the old code immediately.
                </p>
              </div>
            </SurfacePanel>
          ) : null}

          <SurfacePanel
            title="Members"
            meta={`${members.length}`}
            bodyClassName="divide-y divide-border/80"
          >
            {members.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">No members yet.</p>
            ) : (
              members.map((member) => {
                const isYou = member.user_id === user?.id;
                const isLeagueCreator = member.user_id === league.created_by;
                const canKick = isCreator && !isYou;
                const label = member.full_name?.trim() || (isYou ? "You" : "Member");

                return (
                  <div
                    key={member.user_id}
                    className="flex items-center justify-between gap-3 px-5 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar className="h-8 w-8 border border-border/60">
                        {member.avatar_url ? (
                          <AvatarImage src={member.avatar_url} alt="" />
                        ) : null}
                        <AvatarFallback className="bg-navy text-[10px] font-semibold text-navy-foreground">
                          {initialsFromName(member.full_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {label}
                          {isYou ? (
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                              you
                            </span>
                          ) : null}
                        </p>
                        {isLeagueCreator ? (
                          <p className="text-xs text-muted-foreground">Commissioner</p>
                        ) : null}
                      </div>
                    </div>

                    {canKick ? (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={kickingId === member.user_id}
                          >
                            {kickingId === member.user_id ? (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <UserMinus className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            Kick
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Kick {label}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              They&apos;ll lose access to this league. They can rejoin with the
                              invite code.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => void kickMember(member.user_id)}>
                              Kick member
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    ) : null}
                  </div>
                );
              })
            )}
          </SurfacePanel>

          <SurfacePanel title="Danger zone" bodyClassName="space-y-4 px-5 py-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Leave league</p>
                <p className="text-xs text-muted-foreground">
                  Remove yourself from this league. You can rejoin with an invite code.
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="outline" disabled={leaving}>
                    {leaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Leave
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Leave {league.name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      You&apos;ll need the invite code to come back.
                      {isCreator
                        ? " As commissioner, consider deleting the league instead if you want it gone for everyone."
                        : null}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void leaveLeague()}>
                      Leave league
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            {isCreator ? (
              <div className="flex flex-col gap-3 border-t border-border/80 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Delete league</p>
                  <p className="text-xs text-muted-foreground">
                    Permanently delete this league and all related lineups.
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="destructive" disabled={deleting}>
                      {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {league.name}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This cannot be undone. All members, lineups, and standings for this league
                        will be removed.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => void deleteLeague()}
                      >
                        Delete league
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ) : null}
          </SurfacePanel>
        </>
      )}
    </div>
  );
}
