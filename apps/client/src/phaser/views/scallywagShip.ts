import type Phaser from 'phaser';
import {
  HULL_LAYOUT,
  SAIL_COLOURS,
  cannonFrameName,
  hullFrameName,
  sailFrameName,
  ScallywagKeys,
  type HullSize,
  type HullState,
  type SailKind,
} from '../assets/scallywag';

/**
 * What a ship class looks like: which hull, how many sails and where they sit
 * (pixels along the ship, negative towards the stern, from the hull's centre),
 * and which cannon sprite its guns use.
 */
export interface ShipLook {
  readonly size: HullSize;
  readonly sails: ReadonlyArray<{ readonly kind: SailKind; readonly y: number }>;
  readonly cannonType: number;
}

export const SHIP_LOOKS: Readonly<Record<string, ShipLook>> = {
  sloop: { size: 'small', sails: [{ kind: 'billowLarge', y: -2 }], cannonType: 1 },
  brigantine: { size: 'medium', sails: [{ kind: 'billowLarge', y: -8 }], cannonType: 2 },
  galleon: {
    size: 'large',
    sails: [
      { kind: 'flatLarge', y: -34 },
      { kind: 'billowLarge', y: -22 },
    ],
    cannonType: 2,
  },
};

/** The look of a ship class, falling back to the sloop for one it does not know. */
export function lookOf(shipTypeId: string): ShipLook {
  return SHIP_LOOKS[shipTypeId] ?? SHIP_LOOKS.sloop;
}

/** Pixels between neighbouring cannon sprites on the deck (looks only; every cannon fires from the ship's tile). */
const CANNON_SPACING = 24;

/** Every shift of up to two pixels that keeps within a rounded disc (20 of them). */
const OUTLINE_OFFSETS: ReadonlyArray<readonly [number, number]> = [-2, -1, 0, 1, 2].flatMap((dx) =>
  [-2, -1, 0, 1, 2]
    .filter((dy) => (dx !== 0 || dy !== 0) && dx * dx + dy * dy <= 5)
    .map((dy) => [dx, dy] as const),
);

/** The pixel size of one board cell, for the corner marks around a ship. */
const CELL = 64;

export interface ScallywagShipSpec {
  readonly look: ShipLook;
  /** 0 to 4, or 'grey' for a wreck. */
  readonly hullColour: number | 'grey';
  /** 0 to 5, an index into `SAIL_COLOURS`. */
  readonly sailColour: number;
  readonly state: HullState;
  /** Cannons on each side. */
  readonly cannons: number;
}

export interface ScallywagShipOptions {
  /** Mark the corners of the cell the ship sails in (its logical footprint). */
  readonly showCell?: boolean;
  /** Colour of a two-pixel outline round the hull, or null for none. */
  readonly outline?: number | null;
}

/**
 * A ship built from Scallywag parts: the hull for its size and state, sails in
 * the team's colour, and one cannon sprite per mount on each side. The
 * container is centred on the hull's own middle, so the cell the ship sails in
 * lines up with it, and it faces south (bow down) at rotation 0.
 *
 * The container carries three hooks for the animator: `flash` (a hit),
 * `onDestroyed` (break the hull) and, through `setScallywagHull`, damage steps.
 */
export function createScallywagShip(
  scene: Phaser.Scene,
  spec: ScallywagShipSpec,
  x = 0,
  y = 0,
  options: ScallywagShipOptions = {},
): Phaser.GameObjects.Container {
  const layout = HULL_LAYOUT[spec.look.size];
  const container = scene.add.container(x, y);

  if (options.showCell) {
    // Four small corner marks, not a box: enough to read the footprint, nothing to mistake for terrain.
    const marks = scene.add.graphics();
    marks.lineStyle(1, 0xffffff, 0.55);
    const half = CELL / 2;
    const tick = 7;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        marks.lineBetween(sx * half, sy * half, sx * (half - tick), sy * half);
        marks.lineBetween(sx * half, sy * half, sx * half, sy * (half - tick));
      }
    }
    container.add(marks);
  }

  // The outline is the hull drawn again, in one flat colour, shifted by every
  // offset within two pixels (a rounded disc, so corners are filled), underneath
  // the hull itself. Two pixels survive an uneven camera zoom far better than one.
  const outline: Phaser.GameObjects.Image[] = [];
  if (options.outline !== undefined && options.outline !== null) {
    for (const [dx, dy] of OUTLINE_OFFSETS) {
      outline.push(
        scene.add
          .image(dx, dy, ScallywagKeys.ships, hullFrameName(spec.look.size, spec.hullColour, spec.state))
          .setOrigin(0.5, layout.centreY)
          .setTintFill(options.outline),
      );
    }
    container.add(outline);
  }

  const hull = scene.add
    .image(0, 0, ScallywagKeys.ships, hullFrameName(spec.look.size, spec.hullColour, spec.state))
    .setOrigin(0.5, layout.centreY);
  container.add(hull);

  const parts: Phaser.GameObjects.Image[] = [];
  const sailColour = SAIL_COLOURS[spec.sailColour % SAIL_COLOURS.length];
  for (const sail of spec.look.sails) {
    parts.push(
      scene.add
        .image(0, sail.y, ScallywagKeys.ships, sailFrameName(sailColour, sail.kind))
        .setOrigin(0.5, 0.5),
    );
  }

  // The ship's right side is screen-left when it faces south; the cannon art
  // points left, so the other side mirrors it.
  const edge = layout.w / 2 - 7;
  for (let i = 0; i < spec.cannons; i += 1) {
    const along = (i - (spec.cannons - 1) / 2) * CANNON_SPACING;
    for (const side of [-1, 1]) {
      parts.push(
        scene.add
          .image(side * edge, along, ScallywagKeys.ships, cannonFrameName(spec.look.cannonType))
          .setOrigin(0.5, 0.5)
          .setFlipX(side === 1),
      );
    }
  }
  container.add(parts);

  container.setData('hull', hull);
  container.setData('outline', outline);
  container.setData('parts', parts);
  container.setData('size', spec.look.size);
  container.setData('colour', spec.hullColour);
  container.setData('state', spec.state);
  setScallywagHull(container, spec.state);

  container.setData('flash', () => {
    const images = [hull, ...parts];
    for (const image of images) {
      image.setTintFill(0xffffff);
    }
    scene.time.delayedCall(90, () => {
      for (const image of images) {
        image.clearTint();
      }
    });
  });
  container.setData('onDestroyed', () => setScallywagHull(container, 'split'));

  return container;
}

/** Shows the hull picture for a state; a broken hull loses its sails and guns. */
export function setScallywagHull(container: Phaser.GameObjects.Container, state: HullState): void {
  const hull = container.getData('hull') as Phaser.GameObjects.Image | undefined;
  const parts = container.getData('parts') as Phaser.GameObjects.Image[] | undefined;
  const size = container.getData('size') as HullSize | undefined;
  const colour = container.getData('colour') as number | 'grey' | undefined;
  if (!hull || !parts || !size || colour === undefined) {
    return;
  }
  container.setData('state', state);
  const frame = hullFrameName(size, colour, state);
  hull.setFrame(frame);
  for (const edge of (container.getData('outline') as Phaser.GameObjects.Image[] | undefined) ?? []) {
    edge.setFrame(frame);
  }
  for (const part of parts) {
    part.setVisible(state !== 'split');
  }
}
