import { describe, it, expect } from 'vitest';
import { fspl, pathLoss, FSPL_CONST_M_MHZ, FSPL_CONST_FT_MHZ, antennaGain, angleOff, noiseFloor, phyRate, mcsForSnr, linkEstimate } from '../../src/core/rf.js';
import { ftToM } from '../../src/core/units.js';

describe('free-space path loss', () => {
  it('uses −27.55 dB for meters/MHz and −37.87 dB for feet/MHz', () => {
    expect(FSPL_CONST_M_MHZ).toBeCloseTo(-27.55, 2);
    expect(FSPL_CONST_FT_MHZ).toBeCloseTo(-37.87, 2);
  });

  it('matches the hand-worked example: 30 ft at 5180 MHz = 65.96 dB', () => {
    const byMeters = fspl(ftToM(30), 5180);
    const byFeetFormula = 20 * Math.log10(30) + 20 * Math.log10(5180) + FSPL_CONST_FT_MHZ;
    expect(byMeters).toBeCloseTo(65.96, 2);
    expect(byFeetFormula).toBeCloseTo(byMeters, 6);
  });

  it('shows the v1 bug was 10.32 dB', () => {
    const v1 = 20 * Math.log10(30) + 20 * Math.log10(5180) - 27.55;
    expect(v1 - fspl(ftToM(30), 5180)).toBeCloseTo(10.32, 2);
  });

  it('gives 40.05 dB at 1 m on 2400 MHz', () => {
    expect(fspl(1, 2400)).toBeCloseTo(40.05, 2);
  });

  it('never returns infinite or NaN at zero distance', () => {
    const v = fspl(0, 5180);
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBeCloseTo(fspl(0.1, 5180), 9);
  });

  it('log-distance with n = 2 equals free space, n = 3 adds 10 dB per decade beyond 1 m', () => {
    expect(pathLoss(10, 5000, 2)).toBeCloseTo(fspl(10, 5000), 9);
    expect(pathLoss(10, 5000, 3) - fspl(10, 5000)).toBeCloseTo(10, 6);
    expect(pathLoss(0.5, 5000, 3)).toBeCloseTo(fspl(0.5, 5000), 9);
  });

  it('RSSI = Tx + gain − FSPL for the worked example: −38.96 dBm', () => {
    const rssi = 23 + 4 - fspl(ftToM(30), 5180);
    expect(rssi).toBeCloseTo(-38.96, 2);
  });
});

describe('antenna patterns', () => {
  const dir = { pattern: 'directional', gain: 10, beamwidth: 60, frontToBack: 20 };
  it('omni gain is constant', () => {
    expect(antennaGain({ pattern: 'omni', gain: 4 }, 123, 0)).toBe(4);
  });
  it('directional is at peak on boresight and −3 dB at half the beamwidth', () => {
    expect(antennaGain(dir, 90, 90)).toBe(10);
    expect(antennaGain(dir, 120, 90)).toBeCloseTo(10 - 3, 6);
  });
  it('floors at the front-to-back ratio behind the antenna', () => {
    expect(antennaGain(dir, 270, 90)).toBeCloseTo(-10, 6);
  });
  it('handles negative and wrapped angles (v1 bug)', () => {
    expect(angleOff(-90, 270)).toBe(0);
    expect(angleOff(359, 1)).toBe(2);
    expect(antennaGain(dir, -90, 270)).toBe(10);
  });
});

describe('noise, MCS and PHY rates', () => {
  it('thermal noise floor', () => {
    expect(noiseFloor(20, 6)).toBeCloseTo(-94.99, 1);
    expect(noiseFloor(80, 6)).toBeCloseTo(-88.97, 1);
  });
  it('computes standard PHY rates from first principles', () => {
    expect(phyRate(6, 80, 11, 2)).toBeCloseTo(1201, 0);
    expect(phyRate(6, 20, 11, 1)).toBeCloseTo(143.4, 1);
    expect(phyRate(5, 80, 9, 1)).toBeCloseTo(433.3, 1);
    expect(phyRate(4, 40, 7, 1)).toBeCloseTo(150, 1);
    expect(phyRate(7, 320, 13, 2)).toBeCloseTo(5764.7, 0);
  });
  it('picks the highest MCS whose threshold is met and caps by generation', () => {
    expect(mcsForSnr(4, 6)).toBe(-1);
    expect(mcsForSnr(26, 6)).toBe(7);
    expect(mcsForSnr(60, 5)).toBe(9);
    expect(mcsForSnr(60, 7)).toBe(13);
  });
  it('limits a link by the weaker side', () => {
    const l = linkEstimate({ snr: 50, apGen: 7, apNss: 4, apWidth: 160, clientGen: 6, clientNss: 2, clientMaxWidth: 80, efficiency: 0.65 });
    expect(l.gen).toBe(6);
    expect(l.nss).toBe(2);
    expect(l.width).toBe(80);
    expect(l.phy).toBeCloseTo(1201, 0);
    expect(l.throughput).toBeCloseTo(1201 * 0.65, 0);
  });
});
