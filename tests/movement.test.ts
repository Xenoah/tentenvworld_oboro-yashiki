import {test} from 'node:test'
import assert from 'node:assert/strict'
import { applicableLease } from '../apps/client/src/world/locomotionLease.ts'
import type { LocomotionProfile } from '@tentenv/sdk'
const water:LocomotionProfile={mode:'swim',min:[-17.6,-2.95,-21.6],max:[-10.4,.2,-14.4]}
const ceiling:LocomotionProfile={mode:'surface',up:[0,-1,0],min:[11,5.78,-23.5],max:[19,5.78,-16]}
test('teleport from water to vault cannot inherit water clamps',()=>{
 assert.equal(applicableLease({profile:water,expires:500},100,[-2,1,-17]),null)
 assert.equal(applicableLease({profile:water,expires:500},100,[-14,-2.7,-17]),water)
})
test('wall to ceiling uses new valid profile atomically, rescue drops it',()=>{
 assert.equal(applicableLease({profile:ceiling,expires:500},100,[14,5.78,-19]),ceiling)
 assert.equal(applicableLease({profile:ceiling,expires:500},100,[0,.1,13]),null)
})
test('expired or removed movement lease restores ordinary gravity',()=>{
 assert.equal(applicableLease({profile:water,expires:100},101),null)
 assert.equal(applicableLease(null,100),null)
})
