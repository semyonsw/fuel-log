import { describe, expect, it } from 'vitest';

import {
  emptiestCorner,
  filterJitter,
  haversineM,
  processTrack,
  projectTrack,
  simplifyTrack,
  trackBounds,
  trackDistanceKm,
  type RawFix,
} from './geo';

/**
 * Track math against Yerevan coordinates. Reference distances come from the
 * spherical law of cosines (an independent formula on the same sphere).
 */

const REPUBLIC_SQ = { lat: 40.1777, lon: 44.5126 };
const CASCADE = { lat: 40.1916, lon: 44.5155 };
const WEST = { lat: 40.1475, lon: 44.3958 };

const within = (actual: number, expected: number, pct = 0.5) =>
  expect(Math.abs(actual - expected) / expected).toBeLessThan(pct / 100);

/** A straight drive north from Republic Square, one fix every `stepM` metres. */
function northDrive(n: number, stepM: number, t0 = 0): RawFix[] {
  const dLat = stepM / 111_195;
  return Array.from({ length: n }, (_, i) => ({
    lat: REPUBLIC_SQ.lat + i * dLat,
    lon: REPUBLIC_SQ.lon,
    t: t0 + i * 1000,
    accuracy: 5,
  }));
}

describe('haversineM', () => {
  it('Republic Square → Cascade ≈ 1.565 km', () => {
    within(haversineM(REPUBLIC_SQ, CASCADE), 1565.12);
  });
  it('Republic Square → west Yerevan ≈ 10.48 km', () => {
    within(haversineM(REPUBLIC_SQ, WEST), 10478.03);
  });
  it('is zero for the same point and symmetric', () => {
    expect(haversineM(CASCADE, CASCADE)).toBe(0);
    expect(haversineM(CASCADE, WEST)).toBeCloseTo(haversineM(WEST, CASCADE), 6);
  });
});

describe('filterJitter', () => {
  it('drops fixes worse than 30 m accuracy', () => {
    const fixes = northDrive(5, 50);
    fixes[2].accuracy = 45;
    expect(filterJitter(fixes)).toHaveLength(4);
  });

  it('keeps fixes with unknown accuracy', () => {
    const fixes = northDrive(3, 50).map((f) => ({ ...f, accuracy: null }));
    expect(filterJitter(fixes)).toHaveLength(3);
  });

  it('drops wander while parked: 60 fixes inside 5 m count as one', () => {
    const parked: RawFix[] = Array.from({ length: 60 }, (_, i) => ({
      lat: REPUBLIC_SQ.lat + (i % 2 ? 0.00003 : -0.00003),
      lon: REPUBLIC_SQ.lon,
      t: i * 1000,
      accuracy: 8,
    }));
    expect(filterJitter(parked)).toHaveLength(1);
    expect(trackDistanceKm(filterJitter(parked))).toBe(0);
  });

  it('sorts by time and strips accuracy from what is stored', () => {
    const fixes = northDrive(3, 50).reverse();
    const out = filterJitter(fixes);
    expect(out.map((p) => p.t)).toEqual([0, 1000, 2000]);
    expect(out[0]).not.toHaveProperty('accuracy');
  });
});

describe('simplifyTrack', () => {
  it('reduces a straight line to its two ends', () => {
    const line = filterJitter(northDrive(100, 20));
    const s = simplifyTrack(line);
    expect(s).toHaveLength(2);
    expect(s[0]).toEqual(line[0]);
    expect(s[1]).toEqual(line[line.length - 1]);
  });

  it('keeps a corner', () => {
    const north = filterJitter(northDrive(20, 20));
    const corner = north[north.length - 1];
    const east = Array.from({ length: 20 }, (_, i) => ({
      lat: corner.lat,
      lon: corner.lon + ((i + 1) * 20) / (111_195 * Math.cos((corner.lat * Math.PI) / 180)),
      t: corner.t + (i + 1) * 1000,
    }));
    const s = simplifyTrack([...north, ...east]);
    expect(s).toHaveLength(3);
    expect(s[1]).toEqual(corner);
  });

  it('leaves short tracks alone', () => {
    expect(simplifyTrack([])).toEqual([]);
    const two = filterJitter(northDrive(2, 50));
    expect(simplifyTrack(two)).toEqual(two);
  });
});

describe('processTrack', () => {
  it('measures distance before simplifying, so corners are not cut', () => {
    const { track, distanceKm } = processTrack(northDrive(101, 20));
    expect(distanceKm).toBeCloseTo(2, 2);
    expect(track.length).toBeLessThan(101);
  });
});

describe('trackBounds / projectTrack', () => {
  it('bounds are [west, south, east, north]', () => {
    expect(
      trackBounds([
        { ...REPUBLIC_SQ, t: 0 },
        { ...WEST, t: 1 },
      ]),
    ).toEqual([WEST.lon, WEST.lat, REPUBLIC_SQ.lon, REPUBLIC_SQ.lat]);
    expect(trackBounds([])).toBeUndefined();
  });

  it('fits inside the box with north up', () => {
    const pts = projectTrack(
      [
        { ...REPUBLIC_SQ, t: 0 },
        { ...CASCADE, t: 1 },
      ],
      100,
      50,
    );
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(100);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(50);
    }
    // Cascade is north of the square, so it is drawn higher.
    expect(pts[1].y).toBeLessThan(pts[0].y);
  });

  it('a single point lands in the box', () => {
    const [p] = projectTrack([{ ...CASCADE, t: 0 }], 40, 40);
    expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  });
});

describe('emptiestCorner', () => {
  const W = 120;
  const H = 60;
  it('picks the corner opposite a route hugging one corner', () => {
    // Route in the bottom-left: top-right is empty.
    expect(
      emptiestCorner(
        [
          { x: 5, y: 55 },
          { x: 30, y: 40 },
        ],
        W,
        H,
      ),
    ).toBe('tr');
    // Route in the top-right: bottom-left is empty.
    expect(
      emptiestCorner(
        [
          { x: 115, y: 5 },
          { x: 90, y: 20 },
        ],
        W,
        H,
      ),
    ).toBe('bl');
  });

  it('measures to segments, not only points', () => {
    // A straight diagonal from bottom-left to top-right with no middle points:
    // top-right and bottom-left are on the line, so a remaining corner wins
    // even though its nearest POINT is no farther than theirs.
    const corner = emptiestCorner(
      [
        { x: 0, y: H },
        { x: W, y: 0 },
      ],
      W,
      H,
    );
    expect(['tl', 'br']).toContain(corner);
  });

  it('skips corners in `avoid`', () => {
    const route = [
      { x: 5, y: 55 },
      { x: 30, y: 40 },
    ];
    expect(emptiestCorner(route, W, H, ['tr'])).not.toBe('tr');
    expect(emptiestCorner(route, W, H, ['tr', 'tl', 'br'])).toBe('bl');
  });

  it('defaults to top-right with nothing to avoid', () => {
    expect(emptiestCorner([], W, H)).toBe('tr');
    expect(emptiestCorner([{ x: W / 2, y: H / 2 }], W, H)).toBe('tr');
  });
});
