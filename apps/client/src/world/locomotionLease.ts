import type { LocomotionProfile } from '@tentenv/sdk'
/** Renewed leases may overlap a pending teleport; only use a lease valid at its destination. */
export function applicableLease(lease: {profile:LocomotionProfile;expires:number}|null, now:number, destination?:number[]): LocomotionProfile|null {
  if(!lease || lease.expires<=now)return null
  const p=lease.profile
  if(destination && !destination.every((v,i)=>v>=p.min[i]-.15&&v<=p.max[i]+.15))return null
  return p
}
