import { describe, expect, it } from 'vitest';
import { OBJECTIVE_CHOICES, objectiveFor } from '../objectiveChoices';
import { SHIP_CHOICES } from '../shipClasses';

describe('the menu choices', () => {
  it('offers every objective, standard first', () => {
    expect(OBJECTIVE_CHOICES).toEqual(['standard', 'survive', 'salvage', 'merchant', 'ambush']);
  });

  it('turns a choice into an objective, none for a standard battle', () => {
    expect(objectiveFor('standard')).toBeUndefined();
    expect(objectiveFor('merchant')).toMatchObject({ kind: 'merchant', turns: 12 });
    expect(objectiveFor('ambush')).toEqual({ kind: 'ambush', turns: 14 });
  });

  it('never lists the merchants ship among the ships to sail', () => {
    expect(SHIP_CHOICES).toEqual(['sloop', 'brigantine', 'galleon']);
  });
});
