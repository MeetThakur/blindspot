import { describe, expect, it } from 'vitest';
import { BarricadeSettingsPatchSchema, BattleshipSettingsPatchSchema } from '@whoami/shared';

// A patch must only carry the fields the client sent; omitted fields must stay untouched.
describe('settings patch schemas', () => {
  it('battleship: toggling extraShotOnHit does not touch the turn timer', () => {
    expect(BattleshipSettingsPatchSchema.parse({ extraShotOnHit: true })).toEqual({ extraShotOnHit: true });
  });

  it('battleship: changing the timer does not touch extraShotOnHit', () => {
    expect(BattleshipSettingsPatchSchema.parse({ turnTimeoutSec: 45 })).toEqual({ turnTimeoutSec: 45 });
  });

  it('barricade: changing the timer does not reset the grid size', () => {
    expect(BarricadeSettingsPatchSchema.parse({ turnTimeoutSec: 60 })).toEqual({ turnTimeoutSec: 60 });
  });
});
