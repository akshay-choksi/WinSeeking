import { getSargePrimaryNickname } from "@/lib/sarge-nicknames";

/** Display label for a golfer — street name when pref is on and known. */
export function formatGolferDisplayName(
  realName: string,
  streetNames: boolean,
): string {
  if (!streetNames) return realName;
  return getSargePrimaryNickname(realName) ?? realName;
}
